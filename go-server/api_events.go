package main

import (
	"encoding/json"
	"fmt"
	"mylight/store"
	"net/http"
	"strconv"
	"strings"
)

type eventBody struct {
	Title       string `json:"title"`
	Start       string `json:"start_date"`
	End         string `json:"end_date"`
	MemberId    int    `json:"member_id"`
	Recurrence  string `json:"recurrence"`
	Description string `json:"description"`
	Location    string `json:"location"`
	AllDay      bool   `json:"is_all_day"`
}

func eventFromBody(body eventBody) store.Event {
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
	return store.Event{
		Title:       body.Title,
		StartDate:   body.Start,
		EndDate:     end,
		MemberID:    memID,
		Recurrence:  recur,
		Description: body.Description,
		Location:    body.Location,
		IsAllDay:    body.AllDay,
	}
}

// GET/POST /api/events
func (app *App) handleEvents(w http.ResponseWriter, r *http.Request) {
	if r.Method == "GET" {
		events, err := app.Store.GetEvents()
		if err != nil {
			jsonError(w, err.Error(), 500)
			return
		}
		jsonResponse(w, events)
		return
	}

	if r.Method != "POST" {
		http.Error(w, "Method not allowed", 405)
		return
	}

	var body eventBody
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		jsonError(w, err.Error(), 400)
		return
	}
	if body.Title == "" {
		jsonError(w, "Title is required", 400)
		return
	}
	if body.Start == "" {
		jsonError(w, "start_date is required", 400)
		return
	}

	id, err := app.Store.CreateEvent(eventFromBody(body))
	if err != nil {
		jsonError(w, err.Error(), 500)
		return
	}
	app.Broker.Notify("update")
	jsonResponse(w, map[string]interface{}{"success": true, "id": id})
}

// PUT/DELETE /api/events/:id
func (app *App) handleEventDetail(w http.ResponseWriter, r *http.Request) {
	parts := strings.Split(r.URL.Path, "/")
	if len(parts) < 4 {
		jsonError(w, "Invalid path", 400)
		return
	}
	id, err := strconv.Atoi(parts[3])
	if err != nil || id <= 0 {
		jsonError(w, "Invalid event ID", 400)
		return
	}

	if r.Method == "DELETE" {
		if err := app.Store.DeleteEvent(id); err != nil {
			jsonError(w, err.Error(), 500)
			return
		}
		app.Broker.Notify("update")
		jsonResponse(w, map[string]bool{"success": true})
		return
	}

	if r.Method != "PUT" {
		http.Error(w, "Method not allowed", 405)
		return
	}

	var body eventBody
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		jsonError(w, err.Error(), 400)
		return
	}

	if err := app.Store.UpdateEvent(id, eventFromBody(body)); err != nil {
		jsonError(w, err.Error(), 500)
		return
	}
	app.Broker.Notify("update")
	jsonResponse(w, map[string]bool{"success": true})
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

	events, err := app.Store.SearchEvents(query)
	if err != nil {
		jsonError(w, fmt.Sprintf("Failed to search events: %v", err), 500)
		return
	}
	chores, err := app.Store.SearchChores(query)
	if err != nil {
		jsonError(w, fmt.Sprintf("Failed to search chores: %v", err), 500)
		return
	}
	members, err := app.Store.SearchMembers(query)
	if err != nil {
		jsonError(w, fmt.Sprintf("Failed to search members: %v", err), 500)
		return
	}

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
