package main

import (
	"fmt"
	"log"
	"mylight/store"
	"net/http"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"sync"

	"github.com/robfig/cron/v3"
	"github.com/rs/cors"
	_ "modernc.org/sqlite"
)

// Config holds runtime configuration sourced from environment variables.
type Config struct {
	Port           string
	UploadsDir     string
	DbPath         string
	AllowedOrigins []string
}

func loadConfig() Config {
	dataDir := getEnv("DATA_DIR", "..")
	port := ":" + getEnv("PORT", "3000")

	rawOrigins := getEnv("ALLOWED_ORIGINS", "*")
	var origins []string
	for _, o := range strings.Split(rawOrigins, ",") {
		o = strings.TrimSpace(o)
		if o != "" {
			origins = append(origins, o)
		}
	}
	if len(origins) == 0 {
		origins = []string{"*"}
	}

	return Config{
		Port:           port,
		UploadsDir:     filepath.Join(dataDir, "uploads"),
		DbPath:         filepath.Join(dataDir, "mylight.db"),
		AllowedOrigins: origins,
	}
}

func getEnv(key, fallback string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return fallback
}

// App holds the application state
type App struct {
	Store  *store.Store
	Cron   *cron.Cron
	Broker *Broker
	Config Config
	mu     sync.Mutex
}

// Broker manages SSE connections
type Broker struct {
	notifier       chan string
	newClients     chan chan string
	closingClients chan chan string
	clients        map[chan string]bool
}

func NewBroker() *Broker {
	return &Broker{
		notifier:       make(chan string, 1),
		newClients:     make(chan chan string),
		closingClients: make(chan chan string),
		clients:        make(map[chan string]bool),
	}
}

func (b *Broker) Start() {
	for {
		select {
		case s := <-b.newClients:
			b.clients[s] = true
			log.Printf("Client added. %d registered clients", len(b.clients))
		case s := <-b.closingClients:
			delete(b.clients, s)
			log.Printf("Removed client. %d registered clients", len(b.clients))
		case event := <-b.notifier:
			for clientMessageChan := range b.clients {
				clientMessageChan <- event
			}
		}
	}
}

func (b *Broker) Notify(msg string) {
	b.notifier <- msg
}

func (b *Broker) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	flusher, ok := w.(http.Flusher)
	if !ok {
		http.Error(w, "Streaming unsupported!", http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "text/event-stream")
	w.Header().Set("Cache-Control", "no-cache")
	w.Header().Set("Connection", "keep-alive")
	w.Header().Set("Access-Control-Allow-Origin", "*")

	messageChan := make(chan string)
	b.newClients <- messageChan

	defer func() {
		b.closingClients <- messageChan
	}()

	notify := r.Context().Done()

	for {
		select {
		case <-notify:
			return
		case msg := <-messageChan:
			fmt.Fprintf(w, "data: %s\n\n", msg)
			flusher.Flush()
		}
	}
}

func main() {
	cfg := loadConfig()

	// 1. Setup Directories
	if err := os.MkdirAll(cfg.UploadsDir, 0755); err != nil {
		log.Fatal("Failed to create uploads dir:", err)
	}

	// 2. Initialize Store
	s, err := store.NewStore(cfg.DbPath)
	if err != nil {
		log.Fatal("Failed to init Store:", err)
	}
	defer s.Close()

	broker := NewBroker()
	go broker.Start()

	app := &App{
		Store:  s,
		Cron:   cron.New(),
		Broker: broker,
		Config: cfg,
	}

	// 3. Start Scheduler
	app.Cron.Start()
	defer app.Cron.Stop()

	// Safety Net: Check every 15 minutes in case the machine was sleeping
	_, err = app.Cron.AddFunc("@every 15m", func() {
		app.checkAndResetChores(false)
	})
	if err != nil {
		log.Printf("[Cron] Failed to schedule safety net: %v", err)
	}

	// 4. Initialize Config/Schedule
	app.loadConfigAndSchedule()

	// 5. Setup Router
	mux := http.NewServeMux()

	// Static Files (Uploads)
	mux.Handle("/uploads/", http.StripPrefix("/uploads/", http.FileServer(http.Dir(cfg.UploadsDir))))

	// Serve React Frontend (SPA)
	distDir := getEnv("DIST_DIR", "./dist")
	frontendFS := http.FileServer(http.Dir(distDir))
	mux.Handle("/", http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		path := filepath.Join(distDir, r.URL.Path)
		if info, err := os.Stat(path); err == nil && !info.IsDir() {
			frontendFS.ServeHTTP(w, r)
			return
		}
		http.ServeFile(w, r, filepath.Join(distDir, "index.html"))
	}))

	// API Routes
	mux.HandleFunc("/api/family", app.handleFamily)
	mux.HandleFunc("/api/family/", app.handleFamily) // Handle /api/family/{id}
	mux.HandleFunc("/api/settings", app.handleSettings)
	mux.HandleFunc("/api/chores", app.handleChores)
	mux.HandleFunc("/api/chores/", app.handleChoreToggle) // Handle /api/chores/{id}/toggle
	mux.HandleFunc("/api/chores/reset", app.handleChoreReset)
	mux.HandleFunc("/api/history", app.handleHistory)
	mux.HandleFunc("/api/events", app.handleEvents)
	mux.HandleFunc("/api/events/", app.handleEventDetail)
	mux.HandleFunc("/api/search", app.handleSearch)
	mux.HandleFunc("/api/login", app.handleLogin)
	mux.HandleFunc("/api/updates", app.Broker.ServeHTTP)
	mux.HandleFunc("/api/meals", app.handleMeals)
	mux.HandleFunc("/api/photos", app.handlePhotos)

	// CORS
	corsOrigins := cfg.AllowedOrigins
	if len(corsOrigins) == 1 && corsOrigins[0] == "*" {
		corsOrigins = []string{"*"}
	}
	c := cors.New(cors.Options{
		AllowedOrigins:   corsOrigins,
		AllowedMethods:   []string{"GET", "POST", "PUT", "DELETE", "OPTIONS"},
		AllowedHeaders:   []string{"*"},
		AllowCredentials: len(corsOrigins) > 1 || corsOrigins[0] != "*",
	})

	handler := c.Handler(mux)

	log.Printf("Server running on http://localhost%s", cfg.Port)
	log.Printf("Data dir: %s", getEnv("DATA_DIR", ".."))
	if err := http.ListenAndServe(cfg.Port, handler); err != nil {
		log.Fatal(err)
	}
}

func (app *App) loadConfigAndSchedule() {
	// Load reset time from settings
	resetTime, err := app.Store.GetSetting("chore_reset_time")
	if err != nil {
		log.Printf("Using default reset time: %v", err)
	}
	if resetTime == "" {
		resetTime = "00:00"
	}

	app.rescheduleReset(resetTime)

	// Default check on startup
	app.checkAndResetChores(false)
}

func (app *App) checkAndResetChores(force bool) {
	app.mu.Lock()
	defer app.mu.Unlock()

	// Using store logic
	if err := app.Store.ResetChores(force); err != nil {
		log.Printf("Error checking/resetting chores: %v", err)
	}
}

// RescheduleReset handles the cron job update
func (app *App) rescheduleReset(timeStr string) {
	app.mu.Lock()
	defer app.mu.Unlock()

	// Clear existing jobs (simplification: we assume only one cron job for now)
	elements := app.Cron.Entries()
	for _, e := range elements {
		app.Cron.Remove(e.ID)
	}

	// timeStr format: "HH:MM"
	parts := strings.Split(timeStr, ":")
	if len(parts) != 2 {
		log.Printf("Invalid time format: %s", timeStr)
		return
	}
	hour, _ := strconv.Atoi(parts[0])
	minute, _ := strconv.Atoi(parts[1])

	// Cron: minute hour * * *
	spec := fmt.Sprintf("%d %d * * *", minute, hour)
	log.Printf("[Cron] Scheduling reset for %s (%s)", timeStr, spec)

	_, err := app.Cron.AddFunc(spec, func() {
		app.checkAndResetChores(false)
	})
	if err != nil {
		log.Printf("[Cron] Failed to schedule: %v", err)
	}
}
