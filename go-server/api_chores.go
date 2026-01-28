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
	} else if r.Method == "POST" {
		var c store.Chore
		if err := json.NewDecoder(r.Body).Decode(&c); err != nil {
			jsonError(w, err.Error(), 400)
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
}

// POST /api/chores/:id/toggle
func (app *App) handleChoreToggle(w http.ResponseWriter, r *http.Request) {
	parts := strings.Split(r.URL.Path, "/")
	if len(parts) < 4 {
		jsonError(w, "Invalid path", 400)
		return
	}
	idStr := parts[3]
	id, _ := strconv.Atoi(idStr)

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
	app.checkAndResetChores(true) // Logic still in main/app for now as it uses Lock, essentially just calls store.ResetChores
	app.Broker.Notify("update")
	json.NewEncoder(w).Encode(map[string]bool{"success": true})
}
