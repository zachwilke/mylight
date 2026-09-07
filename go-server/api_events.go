package main

import (
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"mylight/store"
	"net/http"
	"strconv"
	"strings"
	"time"
)

type eventBody struct {
	Scope           string  `json:"scope"`
	Occurrence      string  `json:"occurrence"`
	ResetExceptions bool    `json:"reset_exceptions"`
	Timezone        *string `json:"timezone"`
	Version         *int    `json:"version"`
	Title           string  `json:"title"`
	Start           string  `json:"start_date"`
	End             string  `json:"end_date"`
	MemberId        int     `json:"member_id"`
	MemberIDs       []int   `json:"member_ids"`
	Recurrence      string  `json:"recurrence"`
	Description     string  `json:"description"`
	Location        string  `json:"location"`
	AllDay          bool    `json:"is_all_day"`
}

func validateEvent(body *eventBody) error {
	if body.Timezone != nil && *body.Timezone != "" {
		zone := *body.Timezone
		region := strings.Split(zone, "/")[0]
		allowedRegion := false
		for _, value := range []string{"Africa", "America", "Antarctica", "Arctic", "Asia", "Atlantic", "Australia", "Europe", "Indian", "Pacific", "Etc"} {
			if region == value {
				allowedRegion = true
			}
		}
		if zone != "UTC" && (!allowedRegion || !strings.Contains(zone, "/")) {
			return fmt.Errorf("choose an IANA region/city timezone or UTC")
		}
		if len(zone) > 100 || zone == "Local" || strings.ContainsAny(zone, "\r\n;:\\\"") || strings.Contains(zone, "..") || strings.HasPrefix(zone, "/") {
			return fmt.Errorf("choose a valid IANA event timezone")
		}
		if _, err := time.LoadLocation(zone); err != nil {
			return fmt.Errorf("choose a valid IANA event timezone")
		}
	}
	body.Title = strings.TrimSpace(body.Title)
	if body.Title == "" || len(body.Title) > 500 {
		return fmt.Errorf("enter a title of 1–500 characters")
	}
	parse := func(value string) (time.Time, error) {
		if body.AllDay {
			return time.Parse("2006-01-02", value)
		}
		return time.Parse(time.RFC3339, value)
	}
	start, err := parse(body.Start)
	if err != nil {
		return fmt.Errorf("start_date must be an ISO date with timezone (or a date for all-day events)")
	}
	if body.End != "" {
		end, err := parse(body.End)
		if err != nil || end.Before(start) || (body.AllDay && !end.After(start)) {
			return fmt.Errorf("end_date must be valid and not before start_date")
		}
	}
	if len(body.Recurrence) > 2000 || len(body.Description) > 20000 || len(body.Location) > 2000 {
		return fmt.Errorf("event details are too long")
	}
	if body.MemberId < 0 {
		return fmt.Errorf("invalid family member")
	}
	return validateLocalRecurrence(body, start)
}

func eventFromBody(body eventBody) store.Event {
	zone := ""
	if body.Timezone != nil {
		zone = *body.Timezone
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
	return store.Event{
		ResetExceptions: body.ResetExceptions,
		Timezone:        zone,
		Version:         body.Version,
		Title:           body.Title,
		StartDate:       body.Start,
		EndDate:         end,
		MemberID:        memID,
		MemberIDs:       body.MemberIDs,
		Recurrence:      recur,
		Description:     body.Description,
		Location:        body.Location,
		IsAllDay:        body.AllDay,
	}
}

// GET/POST /api/events
func (app *App) handleEvents(w http.ResponseWriter, r *http.Request) {
	if r.Method == "GET" {
		window, err := calendarRequestRange(r)
		if err != nil {
			jsonError(w, err.Error(), 400)
			return
		}
		events, err := app.Store.GetEventsInRange(window)
		if err != nil {
			if errors.Is(err, store.ErrCalendarTooDense) {
				jsonError(w, err.Error(), 422)
			} else {
				jsonError(w, "Could not load calendar", 500)
			}
			return
		}
		imported, err := app.importedEvents(window, store.MaxCalendarEvents-len(events))
		if err != nil {
			if errors.Is(err, store.ErrCalendarTooDense) {
				jsonError(w, err.Error(), 422)
			} else {
				jsonError(w, "Could not read subscribed calendars", 500)
			}
			return
		}
		jsonResponse(w, append(events, imported...))
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
	if err := validateEvent(&body); err != nil {
		jsonError(w, err.Error(), 400)
		return
	}

	if body.Scope != "" || body.Occurrence != "" {
		jsonError(w, "occurrence scope requires an existing series", 400)
		return
	}
	id, err := app.Store.CreateEvent(eventFromBody(body))
	if err != nil {
		eventWriteError(w, err)
		return
	}
	app.Broker.Notify("update")
	jsonResponse(w, map[string]interface{}{"success": true, "id": id, "version": 1})
}

func calendarRequestRange(r *http.Request) (*store.CalendarRange, error) {
	query := r.URL.Query()
	if !query.Has("start") && !query.Has("end") {
		return nil, nil
	}
	if len(query["start"]) != 1 || len(query["end"]) != 1 {
		return nil, fmt.Errorf("provide exactly one start and end with explicit timezone offsets")
	}
	start, startErr := time.Parse(time.RFC3339Nano, query.Get("start"))
	end, endErr := time.Parse(time.RFC3339Nano, query.Get("end"))
	if startErr != nil || endErr != nil || !end.After(start) || end.Sub(start) > 370*24*time.Hour {
		return nil, fmt.Errorf("choose a positive date range of at most 370 days, using ISO timestamps with timezone offsets")
	}
	return &store.CalendarRange{Start: start, End: end}, nil
}

// PUT/DELETE /api/events/:id
func (app *App) handleEventDetail(w http.ResponseWriter, r *http.Request) {
	parts := strings.Split(r.URL.Path, "/")
	if len(parts) != 4 {
		jsonError(w, "Invalid path", 400)
		return
	}
	id, err := strconv.Atoi(parts[3])
	if err != nil || id <= 0 {
		jsonError(w, "Invalid event ID", 400)
		return
	}

	if r.Method == "GET" {
		if r.URL.Query().Has("occurrence") {
			values := r.URL.Query()["occurrence"]
			if len(values) != 1 || values[0] == "" {
				jsonError(w, "provide exactly one occurrence", 400)
				return
			}
			event, err := app.Store.GetOccurrence(id, values[0])
			if err != nil {
				eventWriteError(w, err)
				return
			}
			jsonResponse(w, event)
			return
		}
		if r.URL.Query().Get("export") == "1" {
			event, err := app.Store.GetSeriesExport(id)
			if err != nil {
				eventWriteError(w, err)
				return
			}
			jsonResponse(w, event)
			return
		}
		event, err := app.Store.GetEvent(id)
		if err != nil {
			eventWriteError(w, err)
			return
		}
		jsonResponse(w, event)
		return
	}
	if r.Method == "DELETE" {
		values := r.URL.Query()["version"]
		version, err := strconv.Atoi(r.URL.Query().Get("version"))
		if len(values) != 1 || err != nil || version <= 0 {
			jsonError(w, "reload the event and include its version before deleting", 428)
			return
		}
		scope, key := r.URL.Query().Get("scope"), r.URL.Query().Get("occurrence")
		if len(r.URL.Query()["scope"]) > 1 || len(r.URL.Query()["occurrence"]) > 1 || (scope != "" && scope != "series" && scope != "occurrence" && scope != "future" && scope != "restore") || ((scope == "" || scope == "series") && key != "") {
			jsonError(w, "invalid deletion scope", 400)
			return
		}
		if scope == "occurrence" || scope == "future" || scope == "restore" {
			_, err = app.Store.MutateOccurrence(id, version, key, scope, nil, false)
		} else {
			err = app.Store.DeleteEventVersion(id, version)
		}
		if err != nil {
			eventWriteError(w, err)
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
	if err := validateEvent(&body); err != nil {
		jsonError(w, err.Error(), 400)
		return
	}

	if body.Version == nil || *body.Version <= 0 {
		jsonError(w, "reload the event and include its version before editing", 428)
		return
	}
	if body.Scope != "" && body.Scope != "series" && body.Scope != "occurrence" && body.Scope != "future" {
		jsonError(w, "invalid editing scope", 400)
		return
	}
	if body.Scope == "occurrence" || body.Scope == "future" {
		// Scoped writes are complete snapshots; do not guess an omitted timezone
		// or participants from a detached occurrence's parent.
		if body.Timezone == nil || body.MemberIDs == nil {
			jsonError(w, "reload with a current client before editing an occurrence", 400)
			return
		}
		e := eventFromBody(body)
		saved, err := app.Store.MutateOccurrence(id, *body.Version, body.Occurrence, body.Scope, &e, body.ResetExceptions)
		if err != nil {
			eventWriteError(w, err)
			return
		}
		app.Broker.Notify("update")
		jsonResponse(w, map[string]interface{}{"success": true, "id": saved})
		return
	}
	if body.Occurrence != "" {
		jsonError(w, "occurrence needs an explicit occurrence or future scope", 400)
		return
	}
	// Older clients must not silently erase a zone they do not understand.
	if body.Timezone == nil {
		var zone string
		if err := app.Store.DB.QueryRow("SELECT timezone FROM events WHERE id=?", id).Scan(&zone); err != nil {
			eventWriteError(w, err)
			return
		}
		body.Timezone = &zone
	}
	if err := app.Store.UpdateEvent(id, eventFromBody(body)); err != nil {
		eventWriteError(w, err)
		return
	}
	app.Broker.Notify("update")
	jsonResponse(w, map[string]interface{}{"success": true, "version": *body.Version + 1})
}

func eventWriteError(w http.ResponseWriter, err error) {
	switch {
	case errors.Is(err, store.ErrInvalidOccurrence):
		jsonError(w, err.Error(), 400)
	case errors.Is(err, store.ErrCalendarTooDense):
		jsonError(w, err.Error(), 422)
	case errors.Is(err, store.ErrExceptionResetRequired), errors.Is(err, store.ErrDetachedEvent):
		jsonError(w, err.Error(), 409)
	case errors.Is(err, store.ErrEventConflict):
		jsonError(w, err.Error(), 409)
	case errors.Is(err, store.ErrInvalidEventMembers):
		jsonError(w, err.Error(), 400)
	case errors.Is(err, store.ErrLegacyEventMembers):
		jsonError(w, err.Error(), 409)
	case errors.Is(err, sql.ErrNoRows):
		jsonError(w, "Event no longer exists", 404)
	default:
		jsonError(w, "Could not save event", 500)
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
