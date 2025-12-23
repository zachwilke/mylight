const express = require('express');
const cors = require('cors');
const db = require('./db.cjs');
const multer = require('multer');
const path = require('path');

const app = express();
const PORT = 3000;

app.use(cors());
app.use(express.json());
app.use('/uploads', express.static('uploads'));

// Multer Config
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, 'uploads/');
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
    const { name, color } = req.body;
    db.run("INSERT INTO family_members (name, color) VALUES (?, ?)", [name, color], function (err) {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ id: this.lastID, name, color });
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
    db.run("UPDATE chores SET completed = ? WHERE id = ?", [completed, id], function (err) {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ success: true, changes: this.changes });
    });
});

// Meals
app.get('/api/meals', (req, res) => {
    db.all("SELECT * FROM meals", [], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });

        // Transform for grid: 'Mon-Dinner': { ... }
        const mealGrid = {};
        rows.forEach(row => {
            const key = `${row.day}-${row.type}`;
            mealGrid[key] = row;
        });
        res.json(mealGrid);
    });
});

app.post('/api/meals', (req, res) => {
    const { day, type, title, color } = req.body;
    db.get("SELECT id FROM meals WHERE day = ? AND type = ?", [day, type], (err, row) => {
        if (err) return res.status(500).json({ error: err.message });

        if (row) {
            db.run("UPDATE meals SET title = ?, color = ? WHERE id = ?", [title, color, row.id], function (err) {
                if (err) return res.status(500).json({ error: err.message });
                res.json({ success: true, id: row.id, day, type, title, color });
            });
        } else {
            db.run("INSERT INTO meals (day, type, title, color) VALUES (?, ?, ?, ?)", [day, type, title, color || 'bg-sky-blue'], function (err) {
                if (err) return res.status(500).json({ error: err.message });
                res.json({ success: true, id: this.lastID, day, type, title, color: color || 'bg-sky-blue' });
            });
        }
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
app.get('/api/events', (req, res) => {
    db.all("SELECT * FROM events", [], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows);
    });
});

app.post('/api/events', (req, res) => {
    const { title, date, member_id } = req.body;
    db.run("INSERT INTO events (title, start_date, member_id) VALUES (?, ?, ?)", [title, date, member_id], function (err) {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ id: this.lastID, title, date, member_id });
    });
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
