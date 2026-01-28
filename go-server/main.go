package main

import (
	"fmt"
	"log"
	"mylight/store"
	"net/http"
	"os"
	"strconv"
	"strings"
	"sync"

	"github.com/robfig/cron/v3"
	"github.com/rs/cors"
	_ "modernc.org/sqlite"
)

const (
	Port       = ":3000"
	UploadsDir = "../uploads"
	DbPath     = "../mylight.db" // Using root DB
)

// AppState holds the application state
type App struct {
	Store  *store.Store
	Cron   *cron.Cron
	Broker *Broker
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
	// 1. Setup Directories
	if err := os.MkdirAll(UploadsDir, 0755); err != nil {
		log.Fatal("Failed to create uploads dir:", err)
	}

	// 2. Initialize Store
	s, err := store.NewStore(DbPath)
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
	mux.Handle("/uploads/", http.StripPrefix("/uploads/", http.FileServer(http.Dir(UploadsDir))))

	// Serve React Frontend (SPA)
	frontendFS := http.FileServer(http.Dir("../dist"))
	mux.Handle("/", http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		// Check if file exists in dist
		path := "../dist" + r.URL.Path
		if info, err := os.Stat(path); err == nil && !info.IsDir() {
			frontendFS.ServeHTTP(w, r)
			return
		}
		// Otherwise serve index.html for client-side routing
		http.ServeFile(w, r, "../dist/index.html")
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
	c := cors.New(cors.Options{
		AllowedOrigins:   []string{"http://localhost:5173", "http://localhost:3000"}, // Vite & Self
		AllowedMethods:   []string{"GET", "POST", "PUT", "DELETE", "OPTIONS"},
		AllowedHeaders:   []string{"*"},
		AllowCredentials: true,
	})

	handler := c.Handler(mux)

	log.Printf("Server running on http://localhost%s", Port)
	if err := http.ListenAndServe(Port, handler); err != nil {
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
