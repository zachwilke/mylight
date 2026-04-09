package store

import (
	"database/sql"
	"fmt"
)

type Store struct {
	DB *sql.DB
}

func NewStore(dbPath string) (*Store, error) {
	db, err := sql.Open("sqlite", dbPath)
	if err != nil {
		return nil, err
	}
	if err := db.Ping(); err != nil {
		return nil, err
	}

	// Set busy timeout to 5 seconds to avoid "database is locked" errors
	if _, err := db.Exec("PRAGMA busy_timeout = 5000"); err != nil {
		return nil, fmt.Errorf("set busy_timeout: %w", err)
	}
	// Enable WAL mode for better concurrent read/write performance
	if _, err := db.Exec("PRAGMA journal_mode = WAL"); err != nil {
		return nil, fmt.Errorf("set journal_mode: %w", err)
	}

	if err := initSchema(db); err != nil {
		return nil, err
	}

	return &Store{DB: db}, nil
}

func (s *Store) Close() error {
	return s.DB.Close()
}

func initSchema(db *sql.DB) error {
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
		role TEXT DEFAULT 'user',
		visible BOOLEAN DEFAULT 1
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
		end_date TEXT,
		member_id INTEGER,
		recurrence TEXT,
		description TEXT,
		location TEXT,
		is_all_day BOOLEAN DEFAULT 0
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
	_, err := db.Exec(schema)
	if err != nil {
		return err
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

	return nil
}
