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
	// One connection keeps PRAGMAs consistent and serializes household writes.
	db.SetMaxOpenConns(1)
	db.SetMaxIdleConns(1)
	success := false
	defer func() {
		if !success {
			db.Close()
		}
	}()
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
	if _, err := db.Exec("PRAGMA foreign_keys = ON"); err != nil {
		return nil, err
	}
	success = true

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

	// Upgrade legacy databases by inspecting each column, never swallowing errors.
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
		var table, column string
		if _, err := fmt.Sscanf(m, "ALTER TABLE %s ADD COLUMN %s", &table, &column); err != nil {
			return err
		}
		rows, err := db.Query("PRAGMA table_info(" + table + ")")
		if err != nil {
			return err
		}
		found := false
		for rows.Next() {
			var cid, notnull, pk int
			var name, kind string
			var def interface{}
			if err := rows.Scan(&cid, &name, &kind, &notnull, &def, &pk); err != nil {
				rows.Close()
				return err
			}
			if name == column {
				found = true
			}
		}
		err = rows.Err()
		rows.Close()
		if err != nil {
			return err
		}
		if !found {
			if _, err := db.Exec(m); err != nil {
				return fmt.Errorf("migration %s: %w", m, err)
			}
		}
	}
	_, err = db.Exec(`
	CREATE TABLE IF NOT EXISTS sessions (token_hash TEXT PRIMARY KEY, member_id INTEGER NOT NULL REFERENCES family_members(id) ON DELETE CASCADE, expires_at INTEGER NOT NULL);
	CREATE TABLE IF NOT EXISTS lists (id INTEGER PRIMARY KEY AUTOINCREMENT, title TEXT NOT NULL, icon TEXT NOT NULL DEFAULT 'list');
	CREATE TABLE IF NOT EXISTS list_items (id INTEGER PRIMARY KEY AUTOINCREMENT, list_id INTEGER NOT NULL REFERENCES lists(id) ON DELETE CASCADE, text TEXT NOT NULL, completed BOOLEAN NOT NULL DEFAULT 0);
	CREATE TABLE IF NOT EXISTS schema_migrations (version INTEGER PRIMARY KEY, applied_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
	INSERT OR IGNORE INTO schema_migrations(version) VALUES (1);
	UPDATE family_members SET role='admin' WHERE id=(SELECT MIN(id) FROM family_members WHERE password_hash IS NOT NULL AND password_hash != '') AND NOT EXISTS (SELECT 1 FROM family_members WHERE role='admin');
	CREATE INDEX IF NOT EXISTS sessions_expiry ON sessions(expires_at);
	CREATE INDEX IF NOT EXISTS events_start ON events(start_date);
	`)
	if err != nil {
		return err
	}
	if err := migrateCalendarSources(db); err != nil {
		return err
	}
	if err := migrateCalendarValidators(db); err != nil {
		return err
	}
	if err := migrateDevices(db); err != nil {
		return err
	}
	if err := migrateEventMembers(db); err != nil {
		return err
	}
	if err := migrateEventVersions(db); err != nil {
		return err
	}
	if err := migrateEventTimezones(db); err != nil {
		return err
	}
	if err := migrateEventExceptions(db); err != nil {
		return err
	}
	if err := migrateGoogleCalendars(db); err != nil {
		return err
	}
	return migrateGoogleJobs(db)
}

func migrateEventTimezones(db *sql.DB) error {
	tx, err := db.Begin()
	if err != nil {
		return err
	}
	defer tx.Rollback()
	var applied int
	if err := tx.QueryRow("SELECT count(*) FROM schema_migrations WHERE version=7").Scan(&applied); err != nil {
		return err
	}
	if applied > 0 {
		return tx.Commit()
	}
	// Empty preserves legacy fixed-UTC recurrence rather than guessing a zone.
	if _, err := tx.Exec(`ALTER TABLE events ADD COLUMN timezone TEXT NOT NULL DEFAULT '';
		INSERT INTO schema_migrations(version) VALUES(7);`); err != nil {
		return err
	}
	return tx.Commit()
}

func migrateEventVersions(db *sql.DB) error {
	tx, err := db.Begin()
	if err != nil {
		return err
	}
	defer tx.Rollback()
	var applied int
	if err := tx.QueryRow("SELECT count(*) FROM schema_migrations WHERE version=6").Scan(&applied); err != nil {
		return err
	}
	if applied > 0 {
		return tx.Commit()
	}
	if _, err := tx.Exec(`ALTER TABLE events ADD COLUMN version INTEGER NOT NULL DEFAULT 1;
		INSERT INTO schema_migrations(version) VALUES(6);`); err != nil {
		return err
	}
	return tx.Commit()
}

func migrateEventMembers(db *sql.DB) error {
	tx, err := db.Begin()
	if err != nil {
		return err
	}
	defer tx.Rollback()
	var applied int
	if err := tx.QueryRow("SELECT count(*) FROM schema_migrations WHERE version=5").Scan(&applied); err != nil {
		return err
	}
	if applied > 0 {
		return tx.Commit()
	}
	_, err = tx.Exec(`CREATE TABLE event_members (
		event_id INTEGER NOT NULL REFERENCES events(id) ON DELETE CASCADE,
		member_id INTEGER NOT NULL REFERENCES family_members(id) ON DELETE CASCADE,
		PRIMARY KEY(event_id,member_id)
	);
	CREATE INDEX event_members_member ON event_members(member_id);
	INSERT INTO event_members(event_id,member_id)
		SELECT e.id,e.member_id FROM events e JOIN family_members f ON f.id=e.member_id;
	INSERT INTO schema_migrations(version) VALUES(5);`)
	if err != nil {
		return err
	}
	return tx.Commit()
}

func migrateDevices(db *sql.DB) error {
	tx, err := db.Begin()
	if err != nil {
		return err
	}
	defer tx.Rollback()
	var applied int
	if err := tx.QueryRow("SELECT count(*) FROM schema_migrations WHERE version=4").Scan(&applied); err != nil {
		return err
	}
	if applied > 0 {
		return tx.Commit()
	}
	_, err = tx.Exec(`CREATE TABLE paired_devices (
		id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL,
		token_hash TEXT NOT NULL UNIQUE, can_complete_tasks BOOLEAN NOT NULL DEFAULT 0,
		created_at INTEGER NOT NULL, expires_at INTEGER NOT NULL,
		revoked_at INTEGER, preferences TEXT NOT NULL DEFAULT '{}'
	);
	CREATE TABLE pairing_requests (
		token_hash TEXT PRIMARY KEY, code_hash TEXT NOT NULL UNIQUE, expires_at INTEGER NOT NULL
	);
	INSERT INTO schema_migrations(version) VALUES(4);`)
	if err != nil {
		return err
	}
	return tx.Commit()
}

func migrateCalendarValidators(db *sql.DB) error {
	tx, err := db.Begin()
	if err != nil {
		return err
	}
	defer tx.Rollback()
	var applied int
	if err := tx.QueryRow("SELECT count(*) FROM schema_migrations WHERE version=3").Scan(&applied); err != nil {
		return err
	}
	if applied > 0 {
		return tx.Commit()
	}
	_, err = tx.Exec(`ALTER TABLE calendar_sources ADD COLUMN etag TEXT NOT NULL DEFAULT '';
	ALTER TABLE calendar_sources ADD COLUMN last_modified TEXT NOT NULL DEFAULT '';
	ALTER TABLE calendar_sources ADD COLUMN cache_timezone TEXT NOT NULL DEFAULT '';
	INSERT INTO schema_migrations(version) VALUES(3);`)
	if err != nil {
		return err
	}
	return tx.Commit()
}

func migrateCalendarSources(db *sql.DB) error {
	tx, err := db.Begin()
	if err != nil {
		return err
	}
	defer tx.Rollback()
	var applied int
	if err := tx.QueryRow("SELECT count(*) FROM schema_migrations WHERE version=2").Scan(&applied); err != nil {
		return err
	}
	if applied > 0 {
		return tx.Commit()
	}
	_, err = tx.Exec(`CREATE TABLE calendar_sources (
		id INTEGER PRIMARY KEY AUTOINCREMENT, url TEXT NOT NULL UNIQUE,
		name TEXT NOT NULL, color TEXT NOT NULL, events_json TEXT NOT NULL DEFAULT '[]',
		last_sync TEXT NOT NULL DEFAULT '', last_attempt TEXT NOT NULL DEFAULT '',
		last_error TEXT NOT NULL DEFAULT '', range_start TEXT NOT NULL DEFAULT '', range_end TEXT NOT NULL DEFAULT ''
	);
	INSERT OR IGNORE INTO calendar_sources(url,name,color) SELECT url,'Calendar',COALESCE(color,'bg-blue-100 text-blue-800') FROM calendar_subscriptions;
	INSERT INTO schema_migrations(version) VALUES(2);`)
	if err != nil {
		return err
	}
	return tx.Commit()
}

func migrateEventExceptions(db *sql.DB) error {
	tx, err := db.Begin()
	if err != nil {
		return err
	}
	defer tx.Rollback()
	var applied int
	if err := tx.QueryRow("SELECT count(*) FROM schema_migrations WHERE version=8").Scan(&applied); err != nil {
		return err
	}
	if applied > 0 {
		return tx.Commit()
	}
	_, err = tx.Exec(`CREATE TABLE event_exceptions (
  series_id INTEGER NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  recurrence_id TEXT NOT NULL,
  override_event_id INTEGER UNIQUE REFERENCES events(id) ON DELETE SET NULL,
  PRIMARY KEY(series_id,recurrence_id),
  CHECK(series_id != override_event_id)
 );
 INSERT INTO schema_migrations(version) VALUES(8);`)
	if err != nil {
		return err
	}
	return tx.Commit()
}

func migrateGoogleCalendars(db *sql.DB) error {
	tx, err := db.Begin()
	if err != nil {
		return err
	}
	defer tx.Rollback()
	var applied int
	if err := tx.QueryRow("SELECT count(*) FROM schema_migrations WHERE version=9").Scan(&applied); err != nil {
		return err
	}
	if applied > 0 {
		return tx.Commit()
	}
	_, err = tx.Exec(`CREATE TABLE google_accounts (
 id INTEGER PRIMARY KEY AUTOINCREMENT, subject TEXT NOT NULL UNIQUE, token TEXT NOT NULL
 );
 CREATE TABLE google_calendars (
 source_id INTEGER PRIMARY KEY REFERENCES calendar_sources(id) ON DELETE CASCADE,
 account_id INTEGER NOT NULL REFERENCES google_accounts(id), calendar_id TEXT NOT NULL,
 sync_token TEXT NOT NULL DEFAULT '', resources_json TEXT NOT NULL DEFAULT '{}',
 UNIQUE(account_id,calendar_id)
 );
 CREATE TABLE google_oauth_states (
 state_hash TEXT PRIMARY KEY, session_hash TEXT NOT NULL REFERENCES sessions(token_hash) ON DELETE CASCADE,
 nonce_hash TEXT NOT NULL, verifier TEXT NOT NULL, expires_at INTEGER NOT NULL
 );
 INSERT INTO schema_migrations(version) VALUES(9);`)
	if err != nil {
		return err
	}
	return tx.Commit()
}
