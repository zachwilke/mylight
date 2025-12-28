const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const dbPath = path.resolve(__dirname, 'mylight.db');

const db = new sqlite3.Database(dbPath, (err) => {
  if (err) {
    console.error('Error opening database', err.message);
  } else {
    console.log('Connected to the SQLite database.');
    initDb();
    // Migration for recurrence
    db.run("ALTER TABLE events ADD COLUMN recurrence TEXT", () => { });
    // Migration for phone
    db.run("ALTER TABLE family_members ADD COLUMN phone TEXT", () => { });
    // Migration for stars
    db.run("ALTER TABLE family_members ADD COLUMN stars INTEGER DEFAULT 0", () => { });
  }
});

function initDb() {
  db.serialize(() => {
    // Settings
    db.run(`CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT
    )`);

    // Family Members
    db.run(`CREATE TABLE IF NOT EXISTS family_members (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      color TEXT,
      avatar TEXT,
      stars INTEGER DEFAULT 0
    )`);

    // Events
    db.run(`CREATE TABLE IF NOT EXISTS events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      start_date TEXT NOT NULL, 
      member_id INTEGER,
      FOREIGN KEY (member_id) REFERENCES family_members (id)
    )`);

    // Chores
    db.run(`CREATE TABLE IF NOT EXISTS chores (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      time_of_day TEXT, -- 'Morning', 'Evening'
      member_id INTEGER,
      completed BOOLEAN DEFAULT 0,
      FOREIGN KEY (member_id) REFERENCES family_members (id)
    )`);

    // Chore Completions History
    db.run(`CREATE TABLE IF NOT EXISTS chore_completions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      chore_id INTEGER,
      member_id INTEGER,
      completed_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (chore_id) REFERENCES chores (id),
      FOREIGN KEY (member_id) REFERENCES family_members (id)
    )`);

    // Meals
    db.run(`CREATE TABLE IF NOT EXISTS meals (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      day TEXT NOT NULL, -- 'Mon', 'Tue' etc.
      type TEXT NOT NULL, -- 'Breakfast', 'Lunch', 'Dinner'
      color TEXT
    )`);

    // Lists
    db.run(`CREATE TABLE IF NOT EXISTS lists (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      icon TEXT
    )`);

    // List Items
    db.run(`CREATE TABLE IF NOT EXISTS list_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      list_id INTEGER,
      text TEXT NOT NULL,
      completed BOOLEAN DEFAULT 0,
      FOREIGN KEY (list_id) REFERENCES lists (id)
    )`);

    // Seed Data if empty
    db.get("SELECT count(*) as count FROM family_members", (err, row) => {
      if (row.count === 0) {
        console.log("Seeding database...");
        const stmt = db.prepare("INSERT INTO family_members (name, color) VALUES (?, ?)");
        stmt.run("Max", "step-blue");
        stmt.run("Mia", "step-pink");
        stmt.finalize();

        // Seed Family Name
        db.run("INSERT OR IGNORE INTO settings (key, value) VALUES ('family_name', 'The Miller Family')");

        const choreStmt = db.prepare("INSERT INTO chores (title, time_of_day, member_id, completed) VALUES (?, ?, ?, ?)");
        choreStmt.run("Brush Teeth", "Morning", 1, 1);
        choreStmt.run("Make Bed", "Morning", 1, 0);
        choreStmt.run("Brush Teeth", "Morning", 2, 1);
        choreStmt.finalize();

        const mealStmt = db.prepare("INSERT INTO meals (title, day, type, color) VALUES (?, ?, ?, ?)");
        mealStmt.run("Tacos", "Mon", "Dinner", "bg-orange-100 text-orange-800");
        mealStmt.finalize();

        const eventStmt = db.prepare("INSERT INTO events (title, start_date, member_id) VALUES (?, ?, ?)");
        const tomorrow = new Date();
        tomorrow.setDate(tomorrow.getDate() + 1);
        eventStmt.run("Soccer Practice", tomorrow.toISOString(), 1);
        eventStmt.finalize();

        // Seed Lists
        db.run("INSERT INTO lists (title, icon) VALUES ('Groceries', 'shopping-cart')");
        db.run("INSERT INTO lists (title, icon) VALUES ('To Do', 'check-square')");

        // Seed Items for Groceries (Assuming ID 1) -> Using callback to be safe or just run after delay 
        // For simplicity in this sync flow, we'll just run it.
        db.serialize(() => {
          db.run("INSERT INTO list_items (list_id, text, completed) VALUES (1, 'Milk', 0)");
          db.run("INSERT INTO list_items (list_id, text, completed) VALUES (1, 'Eggs', 0)");
        });
      }
    });
    // Photos
    db.run(`CREATE TABLE IF NOT EXISTS photos (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      url TEXT NOT NULL,
      uploaded_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);

    // Calendar Subscriptions
    db.run(`CREATE TABLE IF NOT EXISTS calendar_subscriptions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      url TEXT NOT NULL,
      name TEXT,
      color TEXT
    )`);

  });
}

module.exports = db;
