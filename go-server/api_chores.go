package main

import (
	"encoding/json"
	"mylight/store"
	"net/http"
	"strconv"
	"strings"
)

// GET /api/chores
func (app *App) handleChores(w http.ResponseWriter, r *http.Request) {
	if r.Method == "GET" {
		chores, err := app.Store.GetChores()
		if err != nil {
			jsonError(w, err.Error(), 500)
			return
		}
		jsonResponse(w, chores)
		return
	}

	if r.Method != "POST" {
		http.Error(w, "Method not allowed", 405)
		return
	}

	var c store.Chore
	if err := json.NewDecoder(r.Body).Decode(&c); err != nil {
		jsonError(w, err.Error(), 400)
		return
	}

	if c.Title == "" {
		jsonError(w, "Title is required", 400)
		return
	}
	if c.MemberID <= 0 {
		jsonError(w, "Valid member_id is required", 400)
		return
	}

	id, err := app.Store.CreateChore(c)
	if err != nil {
		jsonError(w, err.Error(), 500)
		return
	}

	c.ID = id
	c.Completed = false
	app.Broker.Notify("update")
	jsonResponse(w, c)
}

// POST /api/chores/:id/toggle
func (app *App) handleChoreToggle(w http.ResponseWriter, r *http.Request) {
	if r.Method == "DELETE" {
		id, err := pathID(r.URL.Path)
		if err != nil {
			jsonError(w, "Invalid chore ID", 400)
			return
		}
		tx, err := app.Store.DB.Begin()
		if err != nil {
			jsonError(w, "Could not delete chore", 500)
			return
		}
		defer tx.Rollback()
		if _, err = tx.Exec("DELETE FROM chore_completions WHERE chore_id=?", id); err != nil {
			jsonError(w, "Could not delete history", 500)
			return
		}
		result, err := tx.Exec("DELETE FROM chores WHERE id=?", id)
		if err != nil {
			jsonError(w, "Could not delete chore", 500)
			return
		}
		count, _ := result.RowsAffected()
		if count == 0 {
			jsonError(w, "Chore not found", 404)
			return
		}
		if err = tx.Commit(); err != nil {
			jsonError(w, "Could not delete chore", 500)
			return
		}
		app.Broker.Notify("update")
		jsonResponse(w, map[string]bool{"success": true})
		return
	}
	if r.Method != "POST" || !strings.HasSuffix(r.URL.Path, "/toggle") {
		jsonError(w, "Method not allowed", 405)
		return
	}
	parts := strings.Split(r.URL.Path, "/")
	if len(parts) < 4 {
		jsonError(w, "Invalid path", 400)
		return
	}
	idStr := parts[3]
	id, err := strconv.Atoi(idStr)
	if err != nil || id <= 0 {
		jsonError(w, "Invalid chore ID", 400)
		return
	}

	var body struct {
		Completed bool `json:"completed"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		jsonError(w, err.Error(), 400)
		return
	}

	if err := app.Store.ToggleChore(id, body.Completed); err != nil {
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
	app.mu.Lock()
	err := app.Store.ResetChores(true)
	app.mu.Unlock()
	if err != nil {
		jsonError(w, "Could not reset chores", 500)
		return
	}
	app.Broker.Notify("update")
	jsonResponse(w, map[string]bool{"success": true})
}
