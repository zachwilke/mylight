const express = require('express');
const cors = require('cors');
const db = require('./db.cjs');
const multer = require('multer');
const path = require('path');
const ical = require('node-ical');
const cron = require('node-cron');

const fs = require('fs');

const app = express();
const PORT = 3000;

// Ensure uploads directory exists
const UPLOADS_DIR = path.join(__dirname, '../uploads');
if (!fs.existsSync(UPLOADS_DIR)) {
    fs.mkdirSync(UPLOADS_DIR);
}

app.use(cors());
app.use(express.json());
app.use('/uploads', express.static(UPLOADS_DIR));

// Serve static files from the React app
app.use(express.static(path.join(__dirname, '../dist')));

// Multer Config
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, UPLOADS_DIR);
    },
    filename: (req, file, cb) => {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, file.fieldname + '-' + uniqueSuffix + path.extname(file.originalname));
    }
});
const upload = multer({ storage: storage });

// Get all family members
app.get('/api/family', (req, res) => {
    db.all("SELECT * FROM family_members", [], (err, members) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(members);
    });
});

app.post('/api/family', (req, res) => {
    const { name, color, phone } = req.body;
    db.run("INSERT INTO family_members (name, color, phone) VALUES (?, ?, ?)", [name, color, phone], function (err) {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ id: this.lastID, name, color, phone });
    });
});

app.put('/api/family/:id', (req, res) => {
    const { name, color, phone } = req.body;
    db.run("UPDATE family_members SET name = ?, color = ?, phone = ? WHERE id = ?", [name, color, phone, req.params.id], function (err) {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ success: true });
    });
});

app.post('/api/family/:id/avatar', upload.single('avatar'), (req, res) => {
    if (!req.file) return res.status(400).json({ error: "No file uploaded" });

    const avatarUrl = `/uploads/${req.file.filename}`;
    db.run("UPDATE family_members SET avatar = ? WHERE id = ?", [avatarUrl, req.params.id], function (err) {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ success: true, avatar: avatarUrl });
    });
});

app.delete('/api/family/:id', (req, res) => {
    const { id } = req.params;
    // Delete related data first
    db.serialize(() => {
        db.run("DELETE FROM chores WHERE member_id = ?", [id]);
        db.run("DELETE FROM events WHERE member_id = ?", [id]);
        db.run("DELETE FROM family_members WHERE id = ?", [id], function (err) {
            if (err) return res.status(500).json({ error: err.message });
            res.json({ success: true });
        });
    });
});

// Settings
app.get('/api/settings', (req, res) => {
    db.all("SELECT * FROM settings", [], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        const settings = {};
        rows.forEach(row => settings[row.key] = row.value);
        res.json(settings);
    });
});

app.post('/api/settings', (req, res) => {
    const { key, value } = req.body;
    db.run("INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)", [key, value], function (err) {
        if (err) return res.status(500).json({ error: err.message });

        // Dynamic scheduling check
        if (key === 'chore_reset_time') {
            scheduleResetTask(value);
        }

        res.json({ success: true });
    });
});

// Chores
app.get('/api/chores', (req, res) => {
    // 1. Get all family members first to ensure everyone is included
    db.all("SELECT * FROM family_members", [], (err, members) => {
        if (err) return res.status(500).json({ error: err.message });

        // 2. Get all chores
        db.all("SELECT * FROM chores", [], (err, chores) => {
            if (err) return res.status(500).json({ error: err.message });

            const choresByMember = {};

            // Initialize all members with empty arrays
            members.forEach(m => {
                choresByMember[m.name] = [];
            });

            // Distribute chores
            chores.forEach(chore => {
                const member = members.find(m => m.id === chore.member_id);
                if (member) {
                    choresByMember[member.name].push({
                        ...chore,
                        member_name: member.name // Keep consistency
                    });
                }
            });

            res.json(choresByMember);
        });
    });
});

app.post('/api/chores', (req, res) => {
    const { title, member_id, time_of_day } = req.body;
    db.run("INSERT INTO chores (title, member_id, time_of_day, completed) VALUES (?, ?, ?, 0)", [title, member_id, time_of_day], function (err) {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ id: this.lastID, title, member_id, time_of_day, completed: 0 });
    });
});

app.delete('/api/chores/:id', (req, res) => {
    const { id } = req.params;
    db.run("DELETE FROM chores WHERE id = ?", [id], function (err) {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ success: true });
    });
});

app.post('/api/chores/:id/toggle', (req, res) => {
    const { id } = req.params;
    const { completed } = req.body;

    db.get("SELECT member_id FROM chores WHERE id = ?", [id], (err, chore) => {
        if (err || !chore) return res.status(500).json({ error: err ? err.message : "Chore not found" });

        db.serialize(() => {
            db.run("UPDATE chores SET completed = ? WHERE id = ?", [completed, id]);

            if (completed) {
                // Award 1 star
                db.run("UPDATE family_members SET stars = stars + 1 WHERE id = ?", [chore.member_id]);
                // Record completion
                db.run("INSERT INTO chore_completions (chore_id, member_id) VALUES (?, ?)", [id, chore.member_id]);
            } else {
                // Remove 1 star (if they uncheck it)
                db.run("UPDATE family_members SET stars = MAX(0, stars - 1) WHERE id = ?", [chore.member_id]);
                // Remove last completion record for this chore/member
                db.run("DELETE FROM chore_completions WHERE id = (SELECT id FROM chore_completions WHERE chore_id = ? AND member_id = ? ORDER BY completed_at DESC LIMIT 1)", [id, chore.member_id]);
            }

            res.json({ success: true });
        });
    });
});

// History API
app.get('/api/history', (req, res) => {
    const { period } = req.query; // 'week', 'month', 'year'
    let days = 7;
    if (period === 'month') days = 30;
    if (period === 'year') days = 365;

    const query = `
        SELECT 
            fm.name as member_name,
            DATE(cc.completed_at) as date,
            COUNT(*) as count
        FROM chore_completions cc
        JOIN family_members fm ON cc.member_id = fm.id
        WHERE cc.completed_at >= date('now', '-${days} days')
        GROUP BY member_name, date
        ORDER BY date ASC
    `;

    db.all(query, [], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows);
    });
});

// Meals
app.get('/api/meals', (req, res) => {
    const { start, end } = req.query;
    let query = "SELECT * FROM meals";
    const params = [];

    if (start && end) {
        query += " WHERE date BETWEEN ? AND ?";
        params.push(start, end);
    }

    db.all(query, params, (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows);
    });
});

app.post('/api/meals', (req, res) => {
    const { date, type, title, color } = req.body;

    if (!date || !type) return res.status(400).json({ error: "Date and Type are required" });

    db.get("SELECT id FROM meals WHERE date = ? AND type = ?", [date, type], (err, row) => {
        if (err) return res.status(500).json({ error: err.message });

        if (row) {
            db.run("UPDATE meals SET title = ?, color = ? WHERE id = ?", [title, color, row.id], function (err) {
                if (err) return res.status(500).json({ error: err.message });
                res.json({ success: true, id: row.id, date, type, title, color });
            });
        } else {
            db.run("INSERT INTO meals (date, type, title, color) VALUES (?, ?, ?, ?)", [date, type, title, color || 'bg-sky-blue'], function (err) {
                if (err) return res.status(500).json({ error: err.message });
                res.json({ success: true, id: this.lastID, date, type, title, color: color || 'bg-sky-blue' });
            });
        }
    });
});

app.delete('/api/meals/:id', (req, res) => {
    db.run("DELETE FROM meals WHERE id = ?", [req.params.id], function (err) {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ success: true });
    });
});

// Lists
app.get('/api/lists', (req, res) => {
    db.all("SELECT * FROM lists", [], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows);
    });
});

app.post('/api/lists', (req, res) => {
    const { title, icon } = req.body;
    db.run("INSERT INTO lists (title, icon) VALUES (?, ?)", [title, icon], function (err) {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ id: this.lastID, title, icon });
    });
});

app.get('/api/lists/:id/items', (req, res) => {
    db.all("SELECT * FROM list_items WHERE list_id = ?", [req.params.id], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows);
    });
});

app.post('/api/items', (req, res) => {
    const { list_id, text } = req.body;
    db.run("INSERT INTO list_items (list_id, text) VALUES (?, ?)", [list_id, text], function (err) {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ id: this.lastID, list_id, text, completed: 0 });
    });
});

app.post('/api/items/:id/toggle', (req, res) => {
    const { completed } = req.body;
    db.run("UPDATE list_items SET completed = ? WHERE id = ?", [completed ? 1 : 0, req.params.id], function (err) {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ success: true });
    });
});

app.delete('/api/items/:id', (req, res) => {
    db.run("DELETE FROM list_items WHERE id = ?", [req.params.id], function (err) {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ success: true });
    });
});

// Events
// Events & Calendar Sync
app.get('/api/events', async (req, res) => {
    try {
        // 1. Get local events
        const localEvents = await new Promise((resolve, reject) => {
            db.all("SELECT * FROM events", [], (err, rows) => {
                if (err) reject(err);
                else resolve(rows);
            });
        });

        // 2. Get subscriptions
        const subscriptions = await new Promise((resolve, reject) => {
            db.all("SELECT * FROM calendar_subscriptions", [], (err, rows) => {
                if (err) reject(err);
                else resolve(rows);
            });
        });

        // 3. Fetch and parse external calendars
        const externalEventsPromises = subscriptions.map(sub => {
            return new Promise((resolve) => {
                ical.async.fromURL(sub.url, (err, data) => {
                    if (err || !data) {
                        console.error(`Failed to fetch ical ${sub.url}`, err);
                        resolve([]);
                        return;
                    }
                    const events = [];
                    for (let k in data) {
                        const ev = data[k];
                        if (ev.type === 'VEVENT') {
                            events.push({
                                id: `ext-${ev.uid}`,
                                title: ev.summary,
                                start_date: ev.start,
                                end_date: ev.end,
                                member_id: null,
                                color: sub.color || 'bg-gray-200',
                                is_external: true
                            });
                        }
                    }
                    resolve(events);
                });
            });
        });

        const externalEventsArrays = await Promise.all(externalEventsPromises);
        const externalEvents = externalEventsArrays.flat();

        res.json([...localEvents, ...externalEvents]);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Calendar Subscriptions
app.get('/api/calendars', (req, res) => {
    db.all("SELECT * FROM calendar_subscriptions", [], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows);
    });
});

app.post('/api/calendars', (req, res) => {
    const { url, name, color } = req.body;
    db.run("INSERT INTO calendar_subscriptions (url, name, color) VALUES (?, ?, ?)", [url, name, color], function (err) {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ id: this.lastID, url, name, color });
    });
});

app.delete('/api/calendars/:id', (req, res) => {
    db.run("DELETE FROM calendar_subscriptions WHERE id = ?", [req.params.id], function (err) {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ success: true });
    });
});

app.post('/api/events', (req, res) => {
    const { title, date, member_id, recurrence } = req.body;
    db.run("INSERT INTO events (title, start_date, member_id, recurrence) VALUES (?, ?, ?, ?)", [title, date, member_id, recurrence], function (err) {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ id: this.lastID, title, start_date: date, member_id, recurrence });
    });
});

app.put('/api/events/:id', (req, res) => {
    const { title, date, member_id, recurrence } = req.body;
    db.run("UPDATE events SET title = ?, start_date = ?, member_id = ?, recurrence = ? WHERE id = ?",
        [title, date, member_id, recurrence, req.params.id], function (err) {
            if (err) return res.status(500).json({ error: err.message });
            res.json({ success: true });
        });
});

app.delete('/api/events/:id', (req, res) => {
    db.run("DELETE FROM events WHERE id = ?", [req.params.id], function (err) {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ success: true });
    });
});

// Photos
app.get('/api/photos', (req, res) => {
    db.all("SELECT * FROM photos ORDER BY uploaded_at DESC", [], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows);
    });
});

app.post('/api/photos', upload.array('photos', 10), (req, res) => {
    if (!req.files || req.files.length === 0) return res.status(400).json({ error: "No files uploaded" });

    const stmt = db.prepare("INSERT INTO photos (url) VALUES (?)");
    const urls = [];

    db.serialize(() => {
        req.files.forEach(file => {
            const url = `/uploads/${file.filename}`;
            stmt.run(url);
            urls.push(url);
        });
        stmt.finalize((err) => {
            if (err) return res.status(500).json({ error: err.message });
            res.json({ success: true, urls });
        });
    });
});

app.delete('/api/photos/:id', (req, res) => {
    db.get("SELECT url FROM photos WHERE id = ?", [req.params.id], (err, row) => {
        if (err) return res.status(500).json({ error: err.message });
        if (!row) return res.status(404).json({ error: "Photo not found" });

        // Try to delete file from disk
        const filePath = path.join(UPLOADS_DIR, path.basename(row.url));
        fs.unlink(filePath, (unlinkErr) => {
            // Ignore error if file doesn't exist, proceed to delete from DB
            db.run("DELETE FROM photos WHERE id = ?", [req.params.id], function (err) {
                if (err) return res.status(500).json({ error: err.message });
                res.json({ success: true });
            });
        });
    });
});

// SMS
// Google Chat
app.post('/api/chat/send', async (req, res) => {
    const { text } = req.body;

    // Fetch webhook from settings
    db.get("SELECT value FROM settings WHERE key = 'google_chat_webhook'", async (err, row) => {
        if (err) {
            console.error("DB Error", err);
            return res.status(500).json({ error: "Failed to fetch settings" });
        }

        const webhookUrl = row ? row.value : null;

        if (!webhookUrl) {
            return res.status(400).json({ error: "Google Chat Webhook URL not configured in Settings." });
        }

        try {
            const chatRes = await fetch(webhookUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ text })
            });

            if (!chatRes.ok) {
                const err = await chatRes.text();
                throw new Error(err);
            }

            const data = await chatRes.json();
            res.json({ success: true, data });
        } catch (error) {
            console.error("Chat Error", error);
            res.status(500).json({ error: error.message });
        }
    });
});

// Chore Reset Logic
let resetTask = null;

const performReset = (cb) => {
    console.log("[Chore Reset] Resetting chores...");
    db.run("UPDATE chores SET completed = 0", [], (updateErr) => {
        if (updateErr) {
            console.error("[Chore Reset] Failed to reset chores", updateErr);
            if (cb) cb(updateErr);
        } else {
            // Use local date (sv-SE locale gives YYYY-MM-DD format)
            const today = new Date().toLocaleDateString('sv-SE');
            console.log("[Chore Reset] Chores reset successfully.");
            db.run("INSERT OR REPLACE INTO settings (key, value) VALUES ('last_chore_reset', ?)", [today], (settingErr) => {
                if (settingErr) console.error("[Chore Reset] Failed to update last reset date", settingErr);
                if (cb) cb(null);
            });
        }
    });
};

const resetChores = () => {
    // Use local date (sv-SE locale gives YYYY-MM-DD format)
    const today = new Date().toLocaleDateString('sv-SE');
    console.log(`[Chore Reset] Attempting reset for ${today}`);

    db.get("SELECT value FROM settings WHERE key = 'last_chore_reset'", (err, row) => {
        if (err) {
            console.error("[Chore Reset] Failed to check last reset date", err);
            return;
        }

        const lastReset = row ? row.value : null;

        if (lastReset !== today) {
            performReset();
        } else {
            console.log("[Chore Reset] Chores already reset for today.");
        }
    });
};

app.post('/api/chores/reset', (req, res) => {
    performReset((err) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ success: true });
    });
});

const scheduleResetTask = (timeStr) => {
    // timeStr format: "HH:MM", default "00:00"
    const time = timeStr || "00:00";
    const [hour, minute] = time.split(':');

    if (resetTask) {
        console.log("[Cron] Stopping existing reset task.");
        resetTask.stop();
    }

    // Cron format: minute hour * * *
    const cronExpression = `${minute} ${hour} * * *`;
    console.log(`[Cron] Scheduling chore reset at ${time} (${cronExpression})`);

    resetTask = cron.schedule(cronExpression, () => {
        console.log("[Cron] Running scheduled chore reset task.");
        resetChores();
    });
};

// Startup: Fetch configured time and schedule
db.get("SELECT value FROM settings WHERE key = 'chore_reset_time'", (err, row) => {
    const configuredTime = row ? row.value : "00:00";
    scheduleResetTask(configuredTime);

    // Also perform immediate check on startup
    resetChores();
});

// The "catchall" handler: for any request that doesn't
// match one above, send back React's index.html file.
app.get(/(.*)/, (req, res) => {
    res.sendFile(path.join(__dirname, '../dist/index.html'));
});

const server = app.listen(PORT, () => {
    console.log(`Server is running on http://localhost:${PORT}`);
});

server.on('error', (error) => {
    console.error('Server error:', error);
});

process.on('uncaughtException', (error) => {
    console.error('Uncaught Exception:', error);
});

process.on('unhandledRejection', (reason, promise) => {
    console.error('Unhandled Rejection at:', promise, 'reason:', reason);
});
