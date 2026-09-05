package main

import (
	"encoding/json"
	"mylight/store"
	"net/http"
	"time"
)

// GET/POST /api/settings
func (app *App) handleSettings(w http.ResponseWriter, r *http.Request) {
	if r.Method == "GET" {
		settings, err := app.Store.GetSettings()
		if err != nil {
			jsonError(w, err.Error(), 500)
			return
		}
		user, _ := r.Context().Value(userKey{}).(*store.FamilyMemberJSON)
		if user != nil && user.Role != nil && *user.Role == "display" {
			allowed := map[string]bool{"family_name": true, "timezone": true, "weather_location": true, "screensaver_timeout": true, "enable_confetti": true, "enable_major_celebration": true, "theme": true, "photo_interval": true}
			for key := range settings {
				if !allowed[key] {
					delete(settings, key)
				}
			}
		}
		if user == nil || user.Role == nil || *user.Role != "admin" {
			delete(settings, "edit_code")
			delete(settings, "google_chat_webhook")
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
		if s.Key == "chore_reset_time" {
			if _, err := time.Parse("15:04", s.Value); err != nil {
				jsonError(w, "Use a valid reset time (HH:MM)", 400)
				return
			}
		}
		if s.Key == "timezone" {
			if _, err := time.LoadLocation(s.Value); err != nil {
				jsonError(w, "Unknown timezone", 400)
				return
			}
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
