package main

import (
	"mylight/store"
	"net/http"
)

func (app *App) handleHistory(w http.ResponseWriter, r *http.Request) {
	if r.Method != "GET" {
		http.Error(w, "Method not allowed", 405)
		return
	}

	period := r.URL.Query().Get("period")
	if period == "" {
		period = "week"
	}

	history, err := app.Store.GetHistory(period)
	if err != nil {
		jsonError(w, err.Error(), 500)
		return
	}

	// Return empty array instead of null
	if history == nil {
		history = []store.HistoryRow{}
	}

	jsonResponse(w, history)
}
