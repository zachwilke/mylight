package main

import (
	"database/sql"
	"encoding/json"
	"net/http"
	"strconv"
	"strings"
)

// -- Helpers --

func jsonResponse(w http.ResponseWriter, data interface{}) {
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(data)
}

func jsonError(w http.ResponseWriter, err string, code int) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(code)
	json.NewEncoder(w).Encode(map[string]string{"error": err})
}

// -- Handlers --

// GET /api/family
func (app *App) handleFamily(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	if r.Method == "GET" {
		rows, err := app.DB.Query("SELECT * FROM family_members")
		if err != nil {
			jsonError(w, err.Error(), 500)
			return
		}
		defer rows.Close()

		var members []map[string]interface{}
		for rows.Next() {
			var id int
			var name string
			var color sql.NullString
			var avatar sql.NullString
			var stars int
			var phone sql.NullString
			if err := rows.Scan(&id, &name, &color, &avatar, &stars, &phone); err != nil {
				continue
			}
			members = append(members, map[string]interface{}{
				"id":     id,
				"name":   name,
				"color":  color.String,
				"avatar": avatar.String,
				"stars":  stars,
				"phone":  phone.String,
			})
		}
		jsonResponse(w, members)
	}
}

// GET /api/chores
func (app *App) handleChores(w http.ResponseWriter, r *http.Request) {
	if r.Method == "GET" {
		// 1. Get Members
		rows, err := app.DB.Query("SELECT id, name FROM family_members")
		if err != nil {
			jsonError(w, err.Error(), 500)
			return
		}
		defer rows.Close()

		members := make(map[int]string)
		var memberNames []string
		for rows.Next() {
			var id int
			var name string
			rows.Scan(&id, &name)
			members[id] = name
			memberNames = append(memberNames, name)
		}

		// 2. Get Chores
		cRows, err := app.DB.Query("SELECT id, title, member_id, time_of_day, completed FROM chores")
		if err != nil {
			jsonError(w, err.Error(), 500)
			return
		}
		defer cRows.Close()

		choresByMember := make(map[string][]Chore)
		// Init arrays
		for _, name := range memberNames {
			choresByMember[name] = []Chore{}
		}

		for cRows.Next() {
			var c Chore
			if err := cRows.Scan(&c.ID, &c.Title, &c.MemberID, &c.TimeOfDay, &c.Completed); err != nil {
				continue
			}
			if name, ok := members[c.MemberID]; ok {
				c.MemberName = name
				choresByMember[name] = append(choresByMember[name], c)
			}
		}
		jsonResponse(w, choresByMember)
		return
	} else if r.Method == "POST" {
		var c Chore
		if err := json.NewDecoder(r.Body).Decode(&c); err != nil {
			jsonError(w, err.Error(), 400)
			return
		}
		res, err := app.DB.Exec("INSERT INTO chores (title, member_id, time_of_day, completed) VALUES (?, ?, ?, 0)", c.Title, c.MemberID, c.TimeOfDay)
		if err != nil {
			jsonError(w, err.Error(), 500)
			return
		}
		id, _ := res.LastInsertId()
		c.ID = int(id)
		c.Completed = false
		jsonResponse(w, c)
	}
}

// POST /api/chores/:id/toggle
func (app *App) handleChoreToggle(w http.ResponseWriter, r *http.Request) {
	// Extract ID from URL (using a simple strict helper or just splitting path)
	parts := strings.Split(r.URL.Path, "/")
	if len(parts) < 4 {
		jsonError(w, "Invalid path", 400)
		return
	}
	idStr := parts[3] // /api/chores/{id}/toggle
	id, _ := strconv.Atoi(idStr)

	var body struct {
		Completed bool `json:"completed"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		jsonError(w, err.Error(), 400)
		return
	}

	// Transaction
	tx, err := app.DB.Begin()
	if err != nil {
		jsonError(w, err.Error(), 500)
		return
	}
	defer tx.Rollback()

	// Get Chore
	var memberID int
	err = tx.QueryRow("SELECT member_id FROM chores WHERE id = ?", id).Scan(&memberID)
	if err == sql.ErrNoRows {
		jsonError(w, "Chore not found", 404)
		return
	} else if err != nil {
		jsonError(w, err.Error(), 500)
		return
	}

	// Update Chore
	_, err = tx.Exec("UPDATE chores SET completed = ? WHERE id = ?", body.Completed, id)
	if err != nil {
		jsonError(w, err.Error(), 500)
		return
	}

	if body.Completed {
		// Add Star
		_, err = tx.Exec("UPDATE family_members SET stars = stars + 1 WHERE id = ?", memberID)
		if err != nil {
			return
		}
		// Record Completion
		_, err = tx.Exec("INSERT INTO chore_completions (chore_id, member_id) VALUES (?, ?)", id, memberID)
		if err != nil {
			return
		}
	} else {
		// Remove Star
		_, err = tx.Exec("UPDATE family_members SET stars = MAX(0, stars - 1) WHERE id = ?", memberID)
		if err != nil {
			return
		}
		// Remove Last Completion
		_, err = tx.Exec("DELETE FROM chore_completions WHERE id = (SELECT id FROM chore_completions WHERE chore_id = ? AND member_id = ? ORDER BY completed_at DESC LIMIT 1)", id, memberID)
		if err != nil {
			return
		}
	}

	if err := tx.Commit(); err != nil {
		jsonError(w, err.Error(), 500)
		return
	}

	jsonResponse(w, map[string]bool{"success": true})
}

// POST /api/chores/reset
func (app *App) handleChoreReset(w http.ResponseWriter, r *http.Request) {
	if r.Method != "POST" {
		http.Error(w, "Method not allowed", 405)
		return
	}
	app.checkAndResetChores() // Logic in main.go
	json.NewEncoder(w).Encode(map[string]bool{"success": true})
}

// GET/POST /api/settings
func (app *App) handleSettings(w http.ResponseWriter, r *http.Request) {
	if r.Method == "GET" {
		rows, err := app.DB.Query("SELECT key, value FROM settings")
		if err != nil {
			jsonError(w, err.Error(), 500)
			return
		}
		defer rows.Close()
		settings := make(map[string]string)
		for rows.Next() {
			var k, v string
			rows.Scan(&k, &v)
			settings[k] = v
		}
		jsonResponse(w, settings)
	} else if r.Method == "POST" {
		var s Setting
		if err := json.NewDecoder(r.Body).Decode(&s); err != nil {
			jsonError(w, err.Error(), 400)
			return
		}
		_, err := app.DB.Exec("INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)", s.Key, s.Value)
		if err != nil {
			jsonError(w, err.Error(), 500)
			return
		}

		if s.Key == "chore_reset_time" {
			app.rescheduleReset(s.Value) // Logic in main.go
		}
		jsonResponse(w, map[string]bool{"success": true})
	}
}
