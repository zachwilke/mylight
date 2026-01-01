package main

import (
	"database/sql"
	"fmt"
	"log"
	"net/http"
	"os"
	"strconv"
	"strings"
	"sync"
	"time"

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
	DB   *sql.DB
	Cron *cron.Cron
	mu   sync.Mutex
}

func main() {
	// 1. Setup Directories
	if err := os.MkdirAll(UploadsDir, 0755); err != nil {
		log.Fatal("Failed to create uploads dir:", err)
	}

	// 2. Initialize DB
	db, err := initDB(DbPath)
	if err != nil {
		log.Fatal("Failed to init DB:", err)
	}
	defer db.Close()

	app := &App{
		DB:   db,
		Cron: cron.New(),
	}

	// 3. Start Scheduler
	app.Cron.Start()
	defer app.Cron.Stop()

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
	mux.HandleFunc("/api/login", app.handleLogin)

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

func initDB(path string) (*sql.DB, error) {
	db, err := sql.Open("sqlite", path)
	if err != nil {
		return nil, err
	}
	if err := db.Ping(); err != nil {
		return nil, err
	}

	// Initialize Schema
	schema := `
	CREATE TABLE IF NOT EXISTS family_members (
		id INTEGER PRIMARY KEY AUTOINCREMENT,
		name TEXT NOT NULL,
		color TEXT,
		avatar TEXT,
		stars INTEGER DEFAULT 0,
		phone TEXT,
		email TEXT UNIQUE,
		password_hash TEXT,
		role TEXT DEFAULT 'user'
	);
	CREATE TABLE IF NOT EXISTS chores (
		id INTEGER PRIMARY KEY AUTOINCREMENT,
		title TEXT NOT NULL,
		member_id INTEGER,
		time_of_day TEXT,
		completed BOOLEAN DEFAULT 0,
		FOREIGN KEY(member_id) REFERENCES family_members(id)
	);
	CREATE TABLE IF NOT EXISTS chore_completions (
		id INTEGER PRIMARY KEY AUTOINCREMENT,
		chore_id INTEGER,
		member_id INTEGER,
		completed_at DATETIME DEFAULT CURRENT_TIMESTAMP,
		FOREIGN KEY(chore_id) REFERENCES chores(id),
		FOREIGN KEY(member_id) REFERENCES family_members(id)
	);
	CREATE TABLE IF NOT EXISTS settings (
		key TEXT PRIMARY KEY,
		value TEXT
	);
	CREATE TABLE IF NOT EXISTS meals (
		id INTEGER PRIMARY KEY AUTOINCREMENT,
		title TEXT,
		date TEXT,
		type TEXT,
		color TEXT
	);
	CREATE TABLE IF NOT EXISTS events (
		id INTEGER PRIMARY KEY AUTOINCREMENT,
		title TEXT,
		start_date TEXT,
		member_id INTEGER,
		recurrence TEXT
	);
	CREATE TABLE IF NOT EXISTS calendar_subscriptions (
		url TEXT PRIMARY KEY,
		color TEXT
	);
	CREATE TABLE IF NOT EXISTS photos (
		id INTEGER PRIMARY KEY AUTOINCREMENT,
		url TEXT,
		uploaded_at DATETIME DEFAULT CURRENT_TIMESTAMP
	);
	`
	_, err = db.Exec(schema)
	if err != nil {
		return nil, err
	}

	// Migrations for new Event fields (simplistic approach: try add, ignore error)
	migrations := []string{
		"ALTER TABLE events ADD COLUMN end_date TEXT;",
		"ALTER TABLE events ADD COLUMN description TEXT;",
		"ALTER TABLE events ADD COLUMN location TEXT;",
		"ALTER TABLE events ADD COLUMN is_all_day BOOLEAN DEFAULT 0;",
		// Auth migrations
		"ALTER TABLE family_members ADD COLUMN email TEXT;",
		"ALTER TABLE family_members ADD COLUMN password_hash TEXT;",
		"ALTER TABLE family_members ADD COLUMN role TEXT DEFAULT 'user';",
		"ALTER TABLE family_members ADD COLUMN visible BOOLEAN DEFAULT 1;",
	}
	for _, m := range migrations {
		db.Exec(m) // Ignore errors (like duplicate column)
	}

	return db, nil
}

func (app *App) loadConfigAndSchedule() {
	// Load reset time from settings
	var resetTime string
	err := app.DB.QueryRow("SELECT value FROM settings WHERE key = 'chore_reset_time'").Scan(&resetTime)
	if err != nil && err != sql.ErrNoRows {
		log.Printf("Failed to load reset time: %v", err)
	}
	if resetTime == "" {
		resetTime = "00:00"
	}

	app.rescheduleReset(resetTime)

	// Default check on startup
	app.checkAndResetChores()
}

func (app *App) checkAndResetChores() {
	app.mu.Lock()
	defer app.mu.Unlock()

	today := time.Now().Format("2006-01-02")
	log.Printf("[Chore Reset] Checking reset for %s", today)

	var lastReset string
	err := app.DB.QueryRow("SELECT value FROM settings WHERE key = 'last_chore_reset'").Scan(&lastReset)
	if err != nil && err != sql.ErrNoRows {
		log.Printf("Error checking last reset: %v", err)
		return
	}

	if lastReset != today {
		log.Println("[Chore Reset] Performing reset...")
		_, err := app.DB.Exec("UPDATE chores SET completed = 0")
		if err != nil {
			log.Printf("Error resetting chores: %v", err)
			return
		}
		_, err = app.DB.Exec("INSERT OR REPLACE INTO settings (key, value) VALUES ('last_chore_reset', ?)", today)
		if err != nil {
			log.Printf("Error updating last reset date: %v", err)
		}
		log.Println("[Chore Reset] Reset complete.")
	} else {
		log.Println("[Chore Reset] Already reset for today.")
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
		app.checkAndResetChores()
	})
	if err != nil {
		log.Printf("[Cron] Failed to schedule: %v", err)
	}
}
