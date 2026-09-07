package main

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"mylight/calendarfeed"
	"mylight/store"
	"net/http"
	"strconv"
	"strings"
	"time"
)

type calendarSource struct {
	Provider    string `json:"provider"`
	ID          int    `json:"id"`
	Name        string `json:"name"`
	Color       string `json:"color"`
	LastSync    string `json:"last_sync"`
	LastAttempt string `json:"last_attempt"`
	LastError   string `json:"last_error"`
	RangeStart  string `json:"range_start"`
	RangeEnd    string `json:"range_end"`
	Count       int    `json:"event_count"`
	// Feed URLs often contain credentials: never return them in API responses.
	URL           string `json:"-"`
	ETag          string `json:"-"`
	LastModified  string `json:"-"`
	CacheTimezone string `json:"-"`
}

func (app *App) calendarSources() ([]calendarSource, error) {
	rows, err := app.Store.DB.Query("SELECT id,name,color,last_sync,last_attempt,last_error,range_start,range_end,url,json_array_length(events_json),etag,last_modified,cache_timezone,CASE WHEN EXISTS(SELECT 1 FROM google_calendars WHERE source_id=calendar_sources.id) THEN 'google' ELSE 'feed' END FROM calendar_sources ORDER BY id")
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	sources := []calendarSource{}
	for rows.Next() {
		var s calendarSource
		if err := rows.Scan(&s.ID, &s.Name, &s.Color, &s.LastSync, &s.LastAttempt, &s.LastError, &s.RangeStart, &s.RangeEnd, &s.URL, &s.Count, &s.ETag, &s.LastModified, &s.CacheTimezone, &s.Provider); err != nil {
			return nil, err
		}
		sources = append(sources, s)
	}
	return sources, rows.Err()
}

func (app *App) handleCalendars(w http.ResponseWriter, r *http.Request) {
	if r.URL.Path == "/api/calendars" && r.Method == "GET" {
		sources, err := app.calendarSources()
		if err != nil {
			jsonError(w, "Could not read subscriptions", 500)
			return
		}
		jsonResponse(w, sources)
		return
	}
	if r.URL.Path == "/api/calendars" && r.Method == "POST" {
		var body struct {
			URL   string `json:"url"`
			Name  string `json:"name"`
			Color string `json:"color"`
		}
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
			jsonError(w, "Invalid subscription", 400)
			return
		}
		address, err := calendarfeed.NormalizeURL(body.URL)
		if err != nil {
			jsonError(w, err.Error(), 400)
			return
		}
		body.Name = strings.TrimSpace(body.Name)
		if body.Name == "" || len(body.Name) > 100 {
			jsonError(w, "Enter a calendar name of 1–100 characters", 400)
			return
		}
		colors := map[string]bool{"bg-blue-100 text-blue-800": true, "bg-emerald-100 text-emerald-800": true, "bg-purple-100 text-purple-800": true, "bg-orange-100 text-orange-800": true, "bg-rose-100 text-rose-800": true}
		if !colors[body.Color] {
			body.Color = "bg-blue-100 text-blue-800"
		}
		// Serialize subscription creation and sync without holding the household lock.
		if !app.calendarSync.TryLock() {
			jsonError(w, "A calendar refresh is already running. Try again shortly.", 409)
			return
		}
		defer app.calendarSync.Unlock()
		var count int
		if err := app.Store.DB.QueryRow("SELECT count(*) FROM calendar_sources").Scan(&count); err != nil {
			jsonError(w, "Could not add subscription", 500)
			return
		}
		if count >= 20 {
			jsonError(w, "This household already has 20 subscriptions", 400)
			return
		}
		result, err := app.Store.DB.Exec("INSERT INTO calendar_sources(url,name,color) VALUES(?,?,?)", address, body.Name, body.Color)
		if err != nil {
			jsonError(w, "Could not add calendar. It may already be subscribed.", 409)
			return
		}
		id, err := result.LastInsertId()
		if err != nil {
			jsonError(w, "Could not read subscription", 500)
			return
		}
		if err := app.syncCalendarConditional(r.Context(), calendarSource{ID: int(id), URL: address}, calendarfeed.FetchConditional); err != nil {
			jsonError(w, "Calendar added, but the sync result could not be saved. Try refreshing.", 500)
			return
		}
		app.respondCalendar(w, int(id))
		return
	}
	parts := strings.Split(strings.Trim(r.URL.Path, "/"), "/")
	if len(parts) < 3 || len(parts) > 4 {
		jsonError(w, "Not found", 404)
		return
	}
	id, err := strconv.Atoi(parts[2])
	if err != nil || id < 1 {
		jsonError(w, "Invalid calendar ID", 400)
		return
	}
	if len(parts) == 3 && r.Method == "DELETE" {
		if err := app.Store.CheckGoogleJobs(id, 0); err != nil {
			jsonError(w, err.Error(), 409)
			return
		}
		app.deleteRow(w, "calendar_sources", id)
		return
	}
	if len(parts) == 4 && parts[3] == "sync" && r.Method == "POST" {
		if !app.calendarSync.TryLock() {
			jsonError(w, "A calendar refresh is already running. Try again shortly.", 409)
			return
		}
		defer app.calendarSync.Unlock()
		sources, err := app.calendarSources()
		if err != nil {
			jsonError(w, "Could not load calendars", 500)
			return
		}
		for _, s := range sources {
			if s.ID == id {
				if last, err := time.Parse(time.RFC3339, s.LastAttempt); err == nil && time.Since(last) < 30*time.Second {
					jsonError(w, "Wait 30 seconds between refresh attempts", 429)
					return
				}
				if err := app.syncConnectedCalendar(r.Context(), s); err != nil {
					jsonError(w, "Could not save the calendar refresh", 500)
					return
				}
				app.respondCalendar(w, id)
				return
			}
		}
		jsonError(w, "Calendar not found", 404)
		return
	}
	jsonError(w, "Method not allowed", 405)
}

func (app *App) respondCalendar(w http.ResponseWriter, id int) {
	sources, err := app.calendarSources()
	if err != nil {
		jsonError(w, "Could not read calendar", 500)
		return
	}
	for _, s := range sources {
		if s.ID == id {
			jsonResponse(w, s)
			return
		}
	}
	jsonError(w, "Calendar not found", 404)
}

type feedFetcher func(context.Context, string) ([]byte, error)

func (app *App) syncCalendar(ctx context.Context, source calendarSource, fetch feedFetcher) error {
	return app.syncCalendarConditional(ctx, source, func(ctx context.Context, url string, _ calendarfeed.Validators) (calendarfeed.FetchResult, error) {
		data, err := fetch(ctx, url)
		return calendarfeed.FetchResult{Data: data}, err
	})
}

type conditionalFeedFetcher func(context.Context, string, calendarfeed.Validators) (calendarfeed.FetchResult, error)

func (app *App) syncCalendarConditional(ctx context.Context, source calendarSource, fetch conditionalFeedFetcher) error {
	now := time.Now()
	zone, _ := app.Store.GetSetting("timezone")
	loc, err := time.LoadLocation(zone)
	if err != nil {
		loc = time.UTC
	}
	localNow := now.In(loc)
	start := time.Date(localNow.Year(), localNow.Month(), localNow.Day(), 0, 0, 0, 0, loc).AddDate(0, 0, -31)
	end := start.AddDate(0, 0, 398)
	validators := calendarfeed.Validators{}
	// An unchanged feed still needs expanding when the date window or timezone
	// changes. Never let 304 pin the household to yesterday's cached occurrences.
	if source.LastSync != "" && source.RangeStart == start.Format("2006-01-02") && source.RangeEnd == end.Format("2006-01-02") && source.CacheTimezone == loc.String() {
		validators = calendarfeed.Validators{ETag: source.ETag, LastModified: source.LastModified}
	}
	fetched, err := fetch(ctx, source.URL, validators)
	if err == nil && fetched.NotModified {
		if validators.ETag == "" && validators.LastModified == "" {
			err = fmt.Errorf("calendar returned not-modified without a usable snapshot")
		} else {
			_, err := app.Store.DB.Exec("UPDATE calendar_sources SET last_sync=?,last_attempt=?,last_error='' WHERE id=?", now.UTC().Format(time.RFC3339), now.UTC().Format(time.RFC3339), source.ID)
			app.Broker.Notify("update")
			return err
		}
	}
	var events []calendarfeed.Event
	if err == nil {
		events, err = calendarfeed.Parse(fetched.Data, loc, start, end)
	}
	if err != nil {
		// Failed refreshes leave the last good snapshot untouched, including removals.
		_, err = app.Store.DB.Exec("UPDATE calendar_sources SET last_attempt=?,last_error=? WHERE id=?", now.UTC().Format(time.RFC3339), err.Error(), source.ID)
	} else {
		encoded, marshalErr := json.Marshal(events)
		if marshalErr != nil {
			return marshalErr
		}
		_, err = app.Store.DB.Exec("UPDATE calendar_sources SET events_json=?,last_sync=?,last_attempt=?,last_error='',range_start=?,range_end=?,etag=?,last_modified=?,cache_timezone=? WHERE id=?", string(encoded), now.UTC().Format(time.RFC3339), now.UTC().Format(time.RFC3339), start.Format("2006-01-02"), end.Format("2006-01-02"), fetched.Validators.ETag, fetched.Validators.LastModified, loc.String(), source.ID)
	}
	app.Broker.Notify("update")
	return err
}

func (app *App) refreshCalendars() {
	if !app.calendarSync.TryLock() {
		return
	}
	defer app.calendarSync.Unlock()
	app.processGoogleJobs()
	sources, err := app.calendarSources()
	if err != nil {
		return
	}
	for _, source := range sources {
		if last, err := time.Parse(time.RFC3339, source.LastAttempt); err == nil && time.Since(last) < 15*time.Minute {
			continue
		}
		if err := app.syncConnectedCalendar(context.Background(), source); err != nil {
			log.Printf("Could not persist calendar %d refresh", source.ID)
		}
	}
}

func (app *App) importedEvents(window *store.CalendarRange, limit int) ([]interface{}, error) {
	rows, err := app.Store.DB.Query("SELECT id,name,color,events_json,EXISTS(SELECT 1 FROM google_calendars WHERE source_id=calendar_sources.id),COALESCE((SELECT a.write_enabled FROM google_accounts a JOIN google_calendars c ON c.account_id=a.id WHERE c.source_id=calendar_sources.id),0) FROM calendar_sources")
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	result := []interface{}{}
	for rows.Next() {
		var id int
		var name, color, raw string
		var google, editable bool
		if err := rows.Scan(&id, &name, &color, &raw, &google, &editable); err != nil {
			return nil, err
		}
		var events []calendarfeed.Event
		if err := json.Unmarshal([]byte(raw), &events); err != nil {
			return nil, fmt.Errorf("invalid cached calendar")
		}
		for _, e := range events {
			if window != nil && !importedEventOverlaps(e, *window) {
				continue
			}
			if len(result) >= limit {
				return nil, store.ErrCalendarTooDense
			}
			googleID := ""
			if google {
				googleID = e.Key
			}
			result = append(result, map[string]interface{}{"google_event_id": googleID, "google_editable": editable && app.Google != nil, "id": fmt.Sprintf("feed-%d-%s", id, e.Key), "title": e.Title, "start_date": e.Start, "end_date": e.End, "is_all_day": e.AllDay, "is_external": true, "source_name": name, "source_id": id, "color": color, "description": e.Description, "location": e.Location})
		}
	}
	return result, rows.Err()
}

func importedEventOverlaps(event calendarfeed.Event, window store.CalendarRange) bool {
	if event.AllDay && len(event.Start) == 10 {
		start, end := window.Days()
		return event.Start < end && (event.End > start || event.Start >= start)
	}
	start, err := time.Parse(time.RFC3339Nano, event.Start)
	if err != nil {
		return false
	}
	end, err := time.Parse(time.RFC3339Nano, event.End)
	if err != nil {
		end = start.Add(time.Hour)
	}
	return start.Before(window.End) && (end.After(window.Start) || !start.Before(window.Start))
}
