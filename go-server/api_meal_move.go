package main

import (
	"database/sql"
	"encoding/json"
	"net/http"
	"time"
)

// Move an existing meal atomically; never overwrite another planned meal.
func (app *App) handleMealMove(w http.ResponseWriter, r *http.Request) {
	id, err := pathID(r.URL.Path)
	if err != nil {
		jsonError(w, "Invalid meal ID", 400)
		return
	}
	var body struct {
		Date string `json:"date"`
		Type string `json:"type"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		jsonError(w, "Invalid meal", 400)
		return
	}
	if _, err := time.Parse("2006-01-02", body.Date); err != nil {
		jsonError(w, "Invalid date", 400)
		return
	}
	if body.Type != "Breakfast" && body.Type != "Lunch" && body.Type != "Dinner" && body.Type != "Snack" {
		jsonError(w, "Invalid meal type", 400)
		return
	}
	tx, err := app.Store.DB.Begin()
	if err != nil {
		jsonError(w, "Could not move meal", 500)
		return
	}
	defer tx.Rollback()
	var existing int
	err = tx.QueryRow("SELECT id FROM meals WHERE date=? AND type=? AND id!=?", body.Date, body.Type, id).Scan(&existing)
	if err == nil {
		jsonError(w, "That slot already has a meal. Choose an empty slot.", 409)
		return
	}
	if err != sql.ErrNoRows {
		jsonError(w, "Could not check destination", 500)
		return
	}
	result, err := tx.Exec("UPDATE meals SET date=?,type=? WHERE id=?", body.Date, body.Type, id)
	if err != nil {
		jsonError(w, "Could not move meal", 500)
		return
	}
	count, err := result.RowsAffected()
	if err != nil {
		jsonError(w, "Could not move meal", 500)
		return
	}
	if count == 0 {
		jsonError(w, "Meal not found", 404)
		return
	}
	if err := tx.Commit(); err != nil {
		jsonError(w, "Could not move meal", 500)
		return
	}
	app.Broker.Notify("update")
	jsonResponse(w, map[string]bool{"success": true})
}
