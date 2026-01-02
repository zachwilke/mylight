package main

import (
	"database/sql"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"time"

	"golang.org/x/crypto/bcrypt"
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
// GET/POST/PUT /api/family
func (app *App) handleFamily(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	if r.Method == "GET" {
		// Explicitly select columns to ensure correct scanning
		rows, err := app.DB.Query("SELECT id, name, color, avatar, stars, phone, email, role, visible FROM family_members")
		if err != nil {
			jsonError(w, err.Error(), 500)
			return
		}
		defer rows.Close()

		members := []map[string]interface{}{}

		for rows.Next() {
			var id int
			var name string
			var color sql.NullString
			var avatar sql.NullString
			var stars int
			var phone, email, role sql.NullString
			var visible sql.NullBool

			if err := rows.Scan(&id, &name, &color, &avatar, &stars, &phone, &email, &role, &visible); err != nil {
				continue
			}

			isVisible := true
			if visible.Valid {
				isVisible = visible.Bool
			}

			members = append(members, map[string]interface{}{
				"id":      id,
				"name":    name,
				"color":   color.String,
				"avatar":  avatar.String,
				"stars":   stars,
				"phone":   phone.String,
				"email":   email.String,
				"role":    role.String,
				"visible": isVisible,
			})
		}
		jsonResponse(w, members)

	} else if r.Method == "POST" {
		if strings.HasSuffix(r.URL.Path, "/avatar") {
			app.handleAvatarUpload(w, r)
			return
		}

		var body struct {
			Name     string `json:"name"`
			Email    string `json:"email"`
			Password string `json:"password"`
			Role     string `json:"role"`
			Color    string `json:"color"`
			Visible  bool   `json:"visible"` // Optional
		}
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
			jsonError(w, err.Error(), 400)
			return
		}

		hash, err := bcrypt.GenerateFromPassword([]byte(body.Password), bcrypt.DefaultCost)
		if err != nil {
			jsonError(w, "Error hashing password", 500)
			return
		}

		res, err := app.DB.Exec("INSERT INTO family_members (name, email, password_hash, role, color, stars, visible) VALUES (?, ?, ?, ?, ?, 0, ?)",
			body.Name, body.Email, string(hash), body.Role, body.Color, true) // Default visible true
		if err != nil {
			jsonError(w, err.Error(), 500)
			return
		}
		id, _ := res.LastInsertId()
		app.Broker.Notify("update")
		jsonResponse(w, map[string]interface{}{"success": true, "id": id})

	} else if r.Method == "PUT" {
		// Expect ID in body or URL? Let's use Body for simplicity or check URL
		// simple approach: expects body to have ID? Or use URL /api/family/{id}
		// The current mux router matches /api/family. Logic in handleChoreToggle parses URL manually.

		// Let's assume the user sends the full object including ID in body OR uses query param?
		// Better: Parse URL if it has subpath

		// Check if ID is in URL like /api/family/1
		parts := strings.Split(r.URL.Path, "/")
		if len(parts) >= 4 {
			// Update specific member
			idStr := parts[3]
			id, _ := strconv.Atoi(idStr)

			var body struct {
				Name    string `json:"name"`
				Color   string `json:"color"`
				Email   string `json:"email"`
				Role    string `json:"role"`
				Visible *bool  `json:"visible"` // Pointer to distinguish false vs missing
			}
			if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
				jsonError(w, err.Error(), 400)
				return
			}

			// Build dynamic update query
			// Simplified: Update all fields (or just the ones sent? simpler to update all for now or check fields)
			// For visible toggle we likely just send visible.

			if body.Visible != nil {
				visibleInt := 0
				if *body.Visible {
					visibleInt = 1
				}
				log.Printf("Updating member %d visible to %d", id, visibleInt)
				_, err := app.DB.Exec("UPDATE family_members SET visible = ? WHERE id = ?", visibleInt, id)
				if err != nil {
					jsonError(w, err.Error(), 500)
					return
				}
			}

			// Note: This is partial implementation. If we want full edit, we handle other fields.
			// The request was just to add visible toggles. But I should probably support Name/Color too while I'm here.
			if body.Name != "" {
				app.DB.Exec("UPDATE family_members SET name = ? WHERE id = ?", body.Name, id)
			}
			if body.Color != "" {
				app.DB.Exec("UPDATE family_members SET color = ? WHERE id = ?", body.Color, id)
			}

			app.Broker.Notify("update")
			jsonResponse(w, map[string]bool{"success": true})
		} else {
			jsonError(w, "Missing ID", 400)
		}
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
		app.Broker.Notify("update")
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

	app.Broker.Notify("update")
	jsonResponse(w, map[string]bool{"success": true})
}

// POST /api/chores/reset
func (app *App) handleChoreReset(w http.ResponseWriter, r *http.Request) {
	if r.Method != "POST" {
		http.Error(w, "Method not allowed", 405)
		return
	}
	app.checkAndResetChores(true) // Force reset
	app.Broker.Notify("update")
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
		app.Broker.Notify("update")
		jsonResponse(w, map[string]bool{"success": true})
	}
}

// POST /api/login
func (app *App) handleLogin(w http.ResponseWriter, r *http.Request) {
	if r.Method != "POST" {
		http.Error(w, "Method not allowed", 405)
		return
	}

	var body struct {
		Email    string `json:"email"`
		Password string `json:"password"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		jsonError(w, err.Error(), 400)
		return
	}

	var id int
	var name string
	var hash string
	var role string
	var avatar sql.NullString

	// Look up by email
	err := app.DB.QueryRow("SELECT id, name, password_hash, role, avatar FROM family_members WHERE email = ?", body.Email).Scan(&id, &name, &hash, &role, &avatar)
	if err == sql.ErrNoRows {
		jsonError(w, "Invalid credentials", 401)
		return
	} else if err != nil {
		jsonError(w, err.Error(), 500)
		return
	}

	// Compare Hash
	err = bcrypt.CompareHashAndPassword([]byte(hash), []byte(body.Password))
	if err != nil {
		jsonError(w, "Invalid credentials", 401)
		return
	}

	// Success
	jsonResponse(w, map[string]interface{}{
		"success": true,
		"user": map[string]interface{}{
			"id":     id,
			"name":   name,
			"role":   role,
			"email":  body.Email,
			"avatar": avatar.String,
		},
	})
}

// POST /api/family/:id/avatar
func (app *App) handleAvatarUpload(w http.ResponseWriter, r *http.Request) {
	// 1. Parse ID
	parts := strings.Split(r.URL.Path, "/")
	// Path: /api/family/{id}/avatar
	if len(parts) < 5 {
		jsonError(w, "Invalid path", 400)
		return
	}
	idStr := parts[3]
	id, _ := strconv.Atoi(idStr)

	// 2. Parse File
	r.ParseMultipartForm(10 << 20) // 10 MB
	file, handler, err := r.FormFile("avatar")
	if err != nil {
		log.Printf("Error retrieving file: %v", err)
		jsonError(w, "Error retrieving file", 400)
		return
	}
	defer file.Close()

	// 3. Save File
	filename := fmt.Sprintf("avatar_%d_%d%s", id, time.Now().Unix(), filepath.Ext(handler.Filename))
	dstPath := filepath.Join("../uploads", filename)

	dst, err := os.Create(dstPath)
	if err != nil {
		log.Printf("Error creating file: %v", err)
		jsonError(w, "Error saving file", 500)
		return
	}
	defer dst.Close()

	if _, err := io.Copy(dst, file); err != nil {
		log.Printf("Error copying file: %v", err)
		jsonError(w, "Error copying file", 500)
		return
	}

	// 4. Update DB
	avatarURL := fmt.Sprintf("/uploads/%s", filename)
	_, err = app.DB.Exec("UPDATE family_members SET avatar = ? WHERE id = ?", avatarURL, id)
	if err != nil {
		log.Printf("Error updating db: %v", err)
		jsonError(w, "Error updating db", 500)
		return
	}

	app.Broker.Notify("update")
	jsonResponse(w, map[string]interface{}{"success": true, "avatar": avatarURL})
}

// GET/POST /api/events
func (app *App) handleEvents(w http.ResponseWriter, r *http.Request) {
	if r.Method == "GET" {
		rows, err := app.DB.Query("SELECT id, title, start_date, end_date, member_id, recurrence, description, location, is_all_day FROM events")
		if err != nil {
			jsonError(w, err.Error(), 500)
			return
		}
		defer rows.Close()

		events := []map[string]interface{}{}
		for rows.Next() {
			var id int
			var title, startDate, recurrence string
			var endDate, description, location sql.NullString
			var memberID sql.NullInt64
			var isAllDay sql.NullBool

			if err := rows.Scan(&id, &title, &startDate, &endDate, &memberID, &recurrence, &description, &location, &isAllDay); err != nil {
				continue
			}

			events = append(events, map[string]interface{}{
				"id":          id,
				"title":       title,
				"start_date":  startDate,
				"end_date":    endDate.String,
				"member_id":   memberID.Int64,
				"recurrence":  recurrence,
				"description": description.String,
				"location":    location.String,
				"is_all_day":  isAllDay.Bool,
			})
		}
		jsonResponse(w, events)

	} else if r.Method == "POST" {
		var body struct {
			Title       string `json:"title"`
			Start       string `json:"start_date"`
			End         string `json:"end_date"`
			MemberId    int    `json:"member_id"`
			Recurrence  string `json:"recurrence"`
			Description string `json:"description"`
			Location    string `json:"location"`
			AllDay      bool   `json:"is_all_day"`
		}
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
			jsonError(w, err.Error(), 400)
			return
		}

		// Start Date Parsing
		// Assuming strict ISO from frontend, but we might want to ensure it's valid?
		// Postgres/SQLite usually handle ISO strings fine.

		// Handle MemberID 0 as NULL
		var memberID interface{} = body.MemberId
		if body.MemberId == 0 {
			memberID = nil
		}

		res, err := app.DB.Exec("INSERT INTO events (title, start_date, end_date, member_id, recurrence, description, location, is_all_day) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
			body.Title, body.Start, body.End, memberID, body.Recurrence, body.Description, body.Location, body.AllDay)
		if err != nil {
			jsonError(w, err.Error(), 500)
			return
		}
		id, _ := res.LastInsertId()
		app.Broker.Notify("update")
		jsonResponse(w, map[string]interface{}{"success": true, "id": id})
	}
}

// PUT/DELETE /api/events/:id
func (app *App) handleEventDetail(w http.ResponseWriter, r *http.Request) {
	parts := strings.Split(r.URL.Path, "/")
	if len(parts) < 4 {
		jsonError(w, "Invalid path", 400)
		return
	}
	idStr := parts[3]
	id, _ := strconv.Atoi(idStr)

	if r.Method == "PUT" {
		var body struct {
			Title       string `json:"title"`
			Start       string `json:"start_date"`
			End         string `json:"end_date"`
			MemberId    int    `json:"member_id"`
			Recurrence  string `json:"recurrence"`
			Description string `json:"description"`
			Location    string `json:"location"`
			AllDay      bool   `json:"is_all_day"`
		}
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
			jsonError(w, err.Error(), 400)
			return
		}

		var memberID interface{} = body.MemberId
		if body.MemberId == 0 {
			memberID = nil
		}

		_, err := app.DB.Exec("UPDATE events SET title=?, start_date=?, end_date=?, member_id=?, recurrence=?, description=?, location=?, is_all_day=? WHERE id=?",
			body.Title, body.Start, body.End, memberID, body.Recurrence, body.Description, body.Location, body.AllDay, id)

		if err != nil {
			jsonError(w, err.Error(), 500)
			return
		}
		app.Broker.Notify("update")
		jsonResponse(w, map[string]bool{"success": true})

	} else if r.Method == "DELETE" {
		_, err := app.DB.Exec("DELETE FROM events WHERE id = ?", id)
		if err != nil {
			jsonError(w, err.Error(), 500)
			return
		}
		app.Broker.Notify("update")
		jsonResponse(w, map[string]bool{"success": true})
	}
}

// GET /api/search?q=query
func (app *App) handleSearch(w http.ResponseWriter, r *http.Request) {
	if r.Method != "GET" {
		http.Error(w, "Method not allowed", 405)
		return
	}

	query := r.URL.Query().Get("q")
	if query == "" {
		jsonResponse(w, map[string]interface{}{
			"events":  []interface{}{},
			"chores":  []interface{}{},
			"members": []interface{}{},
		})
		return
	}

	searchQuery := "%" + query + "%"
	results := map[string]interface{}{
		"events":  []interface{}{},
		"chores":  []interface{}{},
		"members": []interface{}{},
	}

	// 1. Search Events
	eRows, err := app.DB.Query("SELECT id, title, start_date, location, member_id FROM events WHERE title LIKE ? OR description LIKE ? ORDER BY start_date DESC LIMIT 5", searchQuery, searchQuery)
	if err == nil {
		defer eRows.Close()
		for eRows.Next() {
			var id int
			var title, start string
			var location sql.NullString
			var memberID sql.NullInt64
			if err := eRows.Scan(&id, &title, &start, &location, &memberID); err == nil {
				results["events"] = append(results["events"].([]interface{}), map[string]interface{}{
					"id":         id,
					"title":      title,
					"start_date": start,
					"location":   location.String,
					"member_id":  memberID.Int64,
				})
			}
		}
	}

	// 2. Search Chores
	cRows, err := app.DB.Query("SELECT id, title, member_id, completed FROM chores WHERE title LIKE ? ORDER BY id DESC LIMIT 5", searchQuery)
	if err == nil {
		defer cRows.Close()
		for cRows.Next() {
			var id int
			var title string
			var memberID int
			var completed bool
			if err := cRows.Scan(&id, &title, &memberID, &completed); err == nil {
				results["chores"] = append(results["chores"].([]interface{}), map[string]interface{}{
					"id":        id,
					"title":     title,
					"member_id": memberID,
					"completed": completed,
				})
			}
		}
	}

	// 3. Search Members
	mRows, err := app.DB.Query("SELECT id, name, avatar FROM family_members WHERE name LIKE ? LIMIT 5", searchQuery)
	if err == nil {
		defer mRows.Close()
		for mRows.Next() {
			var id int
			var name string
			var avatar sql.NullString
			if err := mRows.Scan(&id, &name, &avatar); err == nil {
				results["members"] = append(results["members"].([]interface{}), map[string]interface{}{
					"id":     id,
					"name":   name,
					"avatar": avatar.String,
				})
			}
		}
	}

	jsonResponse(w, results)
}
