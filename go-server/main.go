package main

import (
	"context"
	"errors"
	"flag"
	"fmt"
	"log"
	"mylight/store"
	"net"
	"net/http"
	"os"
	"os/signal"
	"path/filepath"
	"strconv"
	"strings"
	"sync"
	"syscall"
	"time"
	_ "time/tzdata"

	"github.com/robfig/cron/v3"
	_ "modernc.org/sqlite"
)

// Config holds runtime configuration sourced from environment variables.
type Config struct {
	Port       string
	UploadsDir string
	DbPath     string
}

func loadConfig() Config {
	defaultDataDir := "./data"
	// Preserve the historical database location for source checkouts.
	if _, err := os.Stat("go.mod"); err == nil {
		defaultDataDir = "../data"
		if _, err := os.Stat("../mylight.db"); err == nil {
			defaultDataDir = ".."
		}
	} else if _, err := os.Stat("mylight.db"); err == nil {
		defaultDataDir = "."
	}
	dataDir := getEnv("DATA_DIR", defaultDataDir)
	port := net.JoinHostPort(getEnv("LISTEN_HOST", ""), getEnv("PORT", "3000"))

	return Config{
		Port:       port,
		UploadsDir: filepath.Join(dataDir, "uploads"),
		DbPath:     filepath.Join(dataDir, "mylight.db"),
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
	Store        *store.Store
	Cron         *cron.Cron
	Broker       *Broker
	Config       Config
	mu           sync.Mutex
	loginLimits  authLimiter
	calendarSync sync.Mutex
	Remote       *remoteAccess
	Google       *googleConnection
}

// Broker manages SSE connections
type Broker struct {
	mu      sync.Mutex
	clients map[chan string]bool
}

func NewBroker() *Broker {
	return &Broker{
		clients: make(map[chan string]bool),
	}
}

func (b *Broker) Notify(msg string) {
	b.mu.Lock()
	defer b.mu.Unlock()
	for client := range b.clients {
		select {
		case client <- msg:
		default:
		}
	}
}

func (b *Broker) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	b.serve(w, r, func() bool { return true })
}

func (b *Broker) serve(w http.ResponseWriter, r *http.Request, authorized func() bool) {
	flusher, ok := w.(http.Flusher)
	if !ok {
		http.Error(w, "Streaming unsupported!", http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "text/event-stream")
	w.Header().Set("Cache-Control", "no-cache")
	w.Header().Set("Connection", "keep-alive")
	w.Header().Set("X-Accel-Buffering", "no")
	messageChan := make(chan string, 1)
	b.mu.Lock()
	b.clients[messageChan] = true
	b.mu.Unlock()
	fmt.Fprint(w, ": connected\n\n")
	flusher.Flush()

	defer func() {
		b.mu.Lock()
		delete(b.clients, messageChan)
		b.mu.Unlock()
	}()
	heartbeat := time.NewTicker(20 * time.Second)
	defer heartbeat.Stop()

	notify := r.Context().Done()

	for {
		select {
		case <-notify:
			return
		case <-heartbeat.C:
			http.NewResponseController(w).SetWriteDeadline(time.Now().Add(10 * time.Second))
			if !authorized() {
				fmt.Fprint(w, "event: session-expired\ndata: revoked\n\n")
				flusher.Flush()
				return
			}
			http.NewResponseController(w).SetWriteDeadline(time.Now().Add(10 * time.Second))
			if _, err := fmt.Fprint(w, ": keepalive\n\n"); err != nil {
				return
			}
			flusher.Flush()
		case msg := <-messageChan:
			http.NewResponseController(w).SetWriteDeadline(time.Now().Add(10 * time.Second))
			if !authorized() {
				fmt.Fprint(w, "event: session-expired\ndata: revoked\n\n")
				flusher.Flush()
				return
			}
			http.NewResponseController(w).SetWriteDeadline(time.Now().Add(10 * time.Second))
			if _, err := fmt.Fprintf(w, "data: %s\n\n", msg); err != nil {
				return
			}
			flusher.Flush()
		}
	}
}

func main() {
	if err := run(); err != nil {
		log.Fatal(err)
	}
}
func run() error {
	restore := flag.String("restore", "", "Restore a MyLight backup into DATA_DIR while the server is stopped")
	recover := flag.Bool("recover-owner", false, "Reset the existing owner password locally; server must be stopped")
	passwordFile := flag.String("password-file", "", "Protected local file containing the new recovery password (otherwise prompted without echo)")
	flag.Parse()
	if (*restore != "" && *recover) || (*passwordFile != "" && !*recover) {
		return fmt.Errorf("choose restore or owner recovery; password-file is only for recovery")
	}
	if *recover {
		password, err := readRecoveryPassword(*passwordFile)
		if err != nil {
			return err
		}
		if err := recoverOwner(loadConfig().DbPath, password); err != nil {
			return err
		}
		log.Print("Owner password reset. Existing account sessions, pending pairings, and display credentials were revoked. Household data was preserved.")
		return nil
	}
	if *restore != "" {
		if err := restoreBackup(*restore, os.Getenv("DATA_DIR")); err != nil {
			return err
		}
		log.Println("Backup restored. Start MyLight normally to continue.")
		return nil
	}
	cfg := loadConfig()
	dataLock, err := acquireDataLock(filepath.Dir(cfg.DbPath))
	if err != nil {
		return err
	}
	defer dataLock.Close()
	tailnet, err := tailnetConfigFromEnv(filepath.Dir(cfg.DbPath))
	if err != nil {
		return err
	}
	if tailnet.Only {
		_, port, err := net.SplitHostPort(cfg.Port)
		if err != nil {
			return err
		}
		cfg.Port = net.JoinHostPort("127.0.0.1", port)
	}

	// 1. Setup Directories
	if err := os.MkdirAll(cfg.UploadsDir, 0755); err != nil {
		return fmt.Errorf("create uploads directory: %w", err)
	}

	// 2. Initialize Store
	s, err := store.NewStore(cfg.DbPath)
	if err != nil {
		return fmt.Errorf("initialize database: %w", err)
	}
	defer s.Close()

	broker := NewBroker()

	app := &App{
		Store:  s,
		Cron:   cron.New(),
		Broker: broker,
		Config: cfg,
	}

	app.Google, err = loadGoogleConnection()
	if err != nil {
		return err
	}

	// 3. Start Scheduler
	app.Cron.Start()
	defer app.Cron.Stop()

	// Compare the household's reset boundary once a minute, including after sleep.
	_, err = app.Cron.AddFunc("@every 1m", func() {
		app.checkAndResetChores(false)
	})
	if err != nil {
		log.Printf("[Cron] Failed to schedule safety net: %v", err)
	}

	// 4. Initialize Config/Schedule
	app.loadConfigAndSchedule()
	app.Cron.AddFunc("@every 1m", app.refreshCalendars)
	go app.refreshCalendars()
	remote, err := startRemoteAccess(tailnet)
	if err != nil {
		return err
	}
	app.Remote = remote
	defer remote.Close()
	handler := app.routes()
	server := &http.Server{Addr: cfg.Port, Handler: handler, ReadHeaderTimeout: 10 * time.Second, IdleTimeout: 90 * time.Second}
	privateServer := &http.Server{Handler: privateAccessHandler(handler), ReadHeaderTimeout: 10 * time.Second, IdleTimeout: 90 * time.Second}
	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()
	errorsCh := make(chan error, 2)
	go func() { errorsCh <- server.ListenAndServe() }()
	if remote.listener != nil {
		go func() { errorsCh <- privateServer.Serve(remote.listener) }()
		log.Print("Embedded Tailscale enabled; open Settings → Remote access for connection status.")
	}
	log.Printf("MyLight HTTP listener: %s", cfg.Port)
	var serveErr error
	select {
	case <-ctx.Done():
	case err := <-errorsCh:
		if !errors.Is(err, http.ErrServerClosed) {
			serveErr = fmt.Errorf("MyLight listener stopped: %w", err)
		}
	}
	// Close long-lived SSE connections too, so shutdown does not wait indefinitely.
	server.Close()
	privateServer.Close()
	return serveErr
}

func (app *App) routes() http.Handler {
	cfg := app.Config

	// 5. Setup Router
	mux := http.NewServeMux()

	// Static Files (Uploads)
	mux.Handle("/uploads/", http.StripPrefix("/uploads/", http.FileServer(http.Dir(cfg.UploadsDir))))

	mux.Handle("/", frontendHandler())

	// API Routes
	mux.HandleFunc("/api/family", app.handleFamily)
	mux.HandleFunc("/api/family/", app.handleFamily) // Handle /api/family/{id}
	mux.HandleFunc("/api/settings", app.handleSettings)
	mux.HandleFunc("/api/remote-access", app.handleRemoteAccess)
	mux.HandleFunc("/api/pairing", app.handlePairing)
	mux.HandleFunc("/api/devices", app.handleDevices)
	mux.HandleFunc("/api/devices/", app.handleDevices)
	mux.HandleFunc("/api/device", app.handleDevice)
	mux.HandleFunc("/api/chores", app.handleChores)
	mux.HandleFunc("/api/chores/", app.handleChoreToggle) // Handle /api/chores/{id}/toggle
	mux.HandleFunc("/api/chores/reset", app.handleChoreReset)
	mux.HandleFunc("/api/history", app.handleHistory)
	mux.HandleFunc("/api/events", app.handleEvents)
	mux.HandleFunc("/api/google", app.handleGoogle)
	mux.HandleFunc("/api/google/", app.handleGoogle)
	mux.HandleFunc(googleCallbackPath, app.handleGoogleCallback)
	mux.HandleFunc("/api/calendars", app.handleCalendars)
	mux.HandleFunc("/api/calendars/", app.handleCalendars)
	mux.HandleFunc("/api/events/", app.handleEventDetail)
	mux.HandleFunc("/api/search", app.handleSearch)
	mux.HandleFunc("/api/login", app.handleLogin)
	mux.HandleFunc("/api/setup", app.handleSetup)
	mux.HandleFunc("/api/session", app.handleSession)
	mux.HandleFunc("/api/account/", app.handleAccount)
	mux.HandleFunc("/api/backup", app.handleBackup)
	mux.HandleFunc("/api/updates", app.handleUpdates)
	mux.HandleFunc("/api/meals", app.handleMeals)
	mux.HandleFunc("/api/meals/", app.handleMealDetail)
	mux.HandleFunc("/api/photos", app.handlePhotos)
	mux.HandleFunc("/api/photos/", app.handlePhotoDetail)
	mux.HandleFunc("/api/lists", app.handleLists)
	mux.HandleFunc("/api/lists/", app.handleLists)
	mux.HandleFunc("/api/items", app.handleItems)
	mux.HandleFunc("/api/items/", app.handleItems)
	mux.HandleFunc("/api/", func(w http.ResponseWriter, r *http.Request) { jsonError(w, "API route not found", 404) })
	mux.HandleFunc("/healthz", func(w http.ResponseWriter, r *http.Request) { jsonResponse(w, map[string]string{"status": "ok"}) })
	mux.HandleFunc("/readyz", func(w http.ResponseWriter, r *http.Request) {
		if err := app.Store.DB.PingContext(r.Context()); err != nil {
			jsonError(w, "Database unavailable", 503)
			return
		}
		jsonResponse(w, map[string]string{"status": "ready"})
	})
	return app.security(mux)
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

	// Default check on startup
	app.checkAndResetChores(false)
}

func (app *App) checkAndResetChores(force bool) {
	app.mu.Lock()
	defer app.mu.Unlock()

	// Using store logic
	if err := app.Store.ResetChores(force); err != nil {
		log.Printf("Error checking/resetting chores: %v", err)
	} else {
		app.Broker.Notify("update")
	}
}

// rescheduleReset validates the time used by the periodic boundary check.
func (app *App) rescheduleReset(timeStr string) {
	app.mu.Lock()
	defer app.mu.Unlock()

	// Scheduling uses a fixed boundary check; only validate the stored time here.

	// timeStr format: "HH:MM"
	parts := strings.Split(timeStr, ":")
	if len(parts) != 2 {
		log.Printf("Invalid time format: %s", timeStr)
		return
	}
	hour, err := strconv.Atoi(parts[0])
	if err != nil {
		log.Printf("Invalid hour in time format %q: %v", timeStr, err)
		return
	}
	minute, err := strconv.Atoi(parts[1])
	if err != nil {
		log.Printf("Invalid minute in time format %q: %v", timeStr, err)
		return
	}
	if hour < 0 || hour > 23 || minute < 0 || minute > 59 {
		log.Printf("Time out of range: %s", timeStr)
		return
	}

	log.Printf("[Cron] Validated stored reset time %s for the periodic boundary check", timeStr)

}
