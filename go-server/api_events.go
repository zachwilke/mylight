package main

import (
	"encoding/json"
	"mylight/store"
	"net/http"
	"strconv"
	"strings"
)

// GET/POST /api/events
func (app *App) handleEvents(w http.ResponseWriter, r *http.Request) {
	if r.Method == "GET" {
		events, err := app.Store.GetEvents()
		if err != nil {
			jsonError(w, err.Error(), 500)
			return
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

		var recur *string
		if body.Recurrence != "" {
			recur = &body.Recurrence
		}

		var end *string
		if body.End != "" {
			end = &body.End
		}

		var memID *int
		if body.MemberId != 0 {
			memID = &body.MemberId
		}

		e := store.Event{
			Title:       body.Title,
			StartDate:   body.Start,
			EndDate:     end,
			MemberID:    memID,
			Recurrence:  recur,
			Description: body.Description,
			Location:    body.Location,
			IsAllDay:    body.AllDay,
		}

		id, err := app.Store.CreateEvent(e)
		if err != nil {
			jsonError(w, err.Error(), 500)
			return
		}
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

		var recur *string
		if body.Recurrence != "" {
			recur = &body.Recurrence
		}

		var end *string
		if body.End != "" {
			end = &body.End
		}

		var memID *int
		if body.MemberId != 0 {
			memID = &body.MemberId
		}

		e := store.Event{
			Title:       body.Title,
			StartDate:   body.Start,
			EndDate:     end,
			MemberID:    memID,
			Recurrence:  recur,
			Description: body.Description,
			Location:    body.Location,
			IsAllDay:    body.AllDay,
		}

		if err := app.Store.UpdateEvent(id, e); err != nil {
			jsonError(w, err.Error(), 500)
			return
		}
		app.Broker.Notify("update")
		jsonResponse(w, map[string]bool{"success": true})

	} else if r.Method == "DELETE" {
		if err := app.Store.DeleteEvent(id); err != nil {
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

	events, _ := app.Store.SearchEvents(query)
	chores, _ := app.Store.SearchChores(query)
	members, _ := app.Store.SearchMembers(query)

	if events == nil {
		events = []interface{}{}
	}
	if chores == nil {
		chores = []interface{}{}
	}
	if members == nil {
		members = []interface{}{}
	}

	jsonResponse(w, map[string]interface{}{
		"events":  events,
		"chores":  chores,
		"members": members,
	})
}
