package main

import (
	"encoding/json"
	"mylight/store"
	"net/http"
)

// GET/POST /api/settings
func (app *App) handleSettings(w http.ResponseWriter, r *http.Request) {
	if r.Method == "GET" {
		settings, err := app.Store.GetSettings()
		if err != nil {
			jsonError(w, err.Error(), 500)
			return
		}
		jsonResponse(w, settings)
	} else if r.Method == "POST" {
		var s store.Setting
		if err := json.NewDecoder(r.Body).Decode(&s); err != nil {
			jsonError(w, err.Error(), 400)
			return
		}
		if s.Key == "" {
			jsonError(w, "Setting key is required", 400)
			return
		}

		if err := app.Store.UpsertSetting(s.Key, s.Value); err != nil {
			jsonError(w, err.Error(), 500)
			return
		}

		if s.Key == "chore_reset_time" {
			app.rescheduleReset(s.Value)
		}
		app.Broker.Notify("update")
		jsonResponse(w, map[string]bool{"success": true})
	}
}
