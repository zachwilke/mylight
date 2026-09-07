package main

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"mylight/calendarfeed"
	"mylight/googlecalendar"
	"net/http"
	"strings"
	"time"
)

func (app *App) handleGoogle(w http.ResponseWriter, r *http.Request) {
	if r.URL.Path == "/api/google" && r.Method == "GET" {
		type account struct {
			ID           int  `json:"id"`
			Calendars    int  `json:"calendars"`
			WriteEnabled bool `json:"write_enabled"`
		}
		rows, err := app.Store.DB.Query("SELECT a.id,(SELECT count(*) FROM google_calendars c WHERE c.account_id=a.id)  ,a.write_enabled FROM google_accounts a ORDER BY a.id")
		if err != nil {
			jsonError(w, "Could not read Google connections", 500)
			return
		}
		defer rows.Close()
		accounts := []account{}
		for rows.Next() {
			var a account
			if rows.Scan(&a.ID, &a.Calendars, &a.WriteEnabled) != nil {
				jsonError(w, "Could not read Google connections", 500)
				return
			}
			accounts = append(accounts, a)
		}
		if rows.Err() != nil {
			jsonError(w, "Could not read Google connections", 500)
			return
		}
		jsonResponse(w, map[string]interface{}{"configured": app.Google != nil, "accounts": accounts})
		return
	}
	if r.URL.Path == "/api/google/connect" && r.Method == "POST" {
		app.startGoogle(w, r)
		return
	}
	parts := strings.Split(strings.Trim(r.URL.Path, "/"), "/")
	if len(parts) < 3 || len(parts) > 4 {
		jsonError(w, "Not found", 404)
		return
	}
	id, err := googleID(parts[2])
	if err != nil {
		jsonError(w, "Invalid Google account", 400)
		return
	}
	if !app.calendarSync.TryLock() {
		jsonError(w, "A calendar operation is running. Try again shortly.", 409)
		return
	}
	defer app.calendarSync.Unlock()
	if len(parts) == 3 && r.Method == "DELETE" {
		if err := app.Store.CheckGoogleJobs(0, id); err != nil {
			jsonError(w, err.Error(), 409)
			return
		}
		tx, err := app.Store.DB.Begin()
		if err != nil {
			jsonError(w, "Could not disconnect Google", 500)
			return
		}
		defer tx.Rollback()
		_, err = tx.Exec("DELETE FROM calendar_sources WHERE id IN (SELECT source_id FROM google_calendars WHERE account_id=?)", id)
		if err == nil {
			_, err = tx.Exec("DELETE FROM google_accounts WHERE id=?", id)
		}
		if err == nil {
			err = tx.Commit()
		}
		if err != nil {
			jsonError(w, "Could not disconnect Google", 500)
			return
		}
		app.Broker.Notify("update")
		jsonResponse(w, map[string]bool{"success": true})
		return
	}
	if len(parts) != 4 || parts[3] != "calendars" || (r.Method != "GET" && r.Method != "POST") {
		jsonError(w, "Method not allowed", 405)
		return
	}
	ctx, cancel := context.WithTimeout(r.Context(), 60*time.Second)
	defer cancel()
	client, err := app.googleClient(ctx, id)
	if err != nil {
		jsonError(w, err.Error(), 502)
		return
	}
	calendars, err := (googlecalendar.Client{HTTP: client}).Calendars(ctx)
	if err != nil {
		jsonError(w, err.Error(), 502)
		return
	}
	if r.Method == "GET" {
		rows, err := app.Store.DB.Query("SELECT calendar_id,source_id FROM google_calendars WHERE account_id=?", id)
		if err != nil {
			jsonError(w, "Could not read selected calendars", 500)
			return
		}
		connected := map[string]int{}
		for rows.Next() {
			var calendar string
			var source int
			if err = rows.Scan(&calendar, &source); err != nil {
				break
			}
			connected[calendar] = source
		}
		if err == nil {
			err = rows.Err()
		}
		rows.Close()
		if err != nil {
			jsonError(w, "Could not read selected calendars", 500)
			return
		}
		type choice struct {
			googlecalendar.Calendar
			Connected bool `json:"connected"`
			SourceID  int  `json:"source_id,omitempty"`
		}
		choices := []choice{}
		for _, calendar := range calendars {
			choices = append(choices, choice{calendar, connected[calendar.ID] > 0, connected[calendar.ID]})
		}
		jsonResponse(w, choices)
		return
	}
	var body struct {
		CalendarID string `json:"calendar_id"`
	}
	if json.NewDecoder(r.Body).Decode(&body) != nil {
		jsonError(w, "Choose a Google calendar", 400)
		return
	}
	name := ""
	found := false
	for _, c := range calendars {
		if c.ID == body.CalendarID {
			name = c.Summary
			found = true
			break
		}
	}
	if !found {
		jsonError(w, "That calendar is not available to this Google account", 400)
		return
	}
	if name == "" {
		name = "Google Calendar"
	}
	tx, err := app.Store.DB.Begin()
	if err != nil {
		jsonError(w, "Could not connect calendar", 500)
		return
	}
	defer tx.Rollback()
	var count int
	err = tx.QueryRow("SELECT count(*) FROM calendar_sources").Scan(&count)
	if err != nil {
		jsonError(w, "Could not connect calendar", 500)
		return
	}
	if count >= 20 {
		jsonError(w, "This household already has 20 calendars", 400)
		return
	}
	res, err := tx.Exec("INSERT INTO calendar_sources(url,name,color) VALUES(?,?,?)", fmt.Sprintf("google:%d:%s", id, body.CalendarID), name, "bg-blue-100 text-blue-800")
	if err != nil {
		jsonError(w, "This calendar may already be connected", 409)
		return
	}
	source, err := res.LastInsertId()
	if err == nil {
		_, err = tx.Exec("INSERT INTO google_calendars(source_id,account_id,calendar_id) VALUES(?,?,?)", source, id, body.CalendarID)
	}
	if err == nil {
		err = tx.Commit()
	}
	if err != nil {
		jsonError(w, "Could not connect calendar", 500)
		return
	}
	if err := app.syncGoogleCalendar(ctx, calendarSource{ID: int(source)}); err != nil {
		jsonError(w, "Calendar added, but its refresh status could not be saved", 500)
		return
	}
	app.respondCalendar(w, int(source))
}

// Raw provider state, cursor, and visible window commit atomically. Neither a
// partial page nor a failed full reconciliation can erase the last good copy.
func (app *App) syncGoogleCalendar(parent context.Context, source calendarSource) error {
	ctx, cancel := context.WithTimeout(parent, 90*time.Second)
	defer cancel()
	var account int
	var calendar, cursor, raw string
	err := app.Store.DB.QueryRow("SELECT account_id,calendar_id,sync_token,resources_json FROM google_calendars WHERE source_id=?", source.ID).Scan(&account, &calendar, &cursor, &raw)
	if err != nil {
		return err
	}
	now := time.Now()
	zone, _ := app.Store.GetSetting("timezone")
	loc, err := time.LoadLocation(zone)
	if err != nil {
		loc = time.UTC
		err = nil
	}
	day := now.In(loc)
	start := time.Date(day.Year(), day.Month(), day.Day(), 0, 0, 0, 0, loc).AddDate(0, 0, -31)
	end := start.AddDate(0, 0, 398)
	var previous map[string]json.RawMessage
	if json.Unmarshal([]byte(raw), &previous) != nil {
		err = errors.New("Google cache is invalid; remove and reconnect this calendar")
	}
	client, clientErr := app.googleClient(ctx, account)
	if clientErr != nil {
		err = clientErr
	}
	var next string
	var staged map[string]json.RawMessage
	var snapshot []byte
	changed := false
	if err == nil {
		staged, next, changed, err = (googlecalendar.Client{HTTP: client}).Pull(ctx, calendar, cursor, previous)
	}
	if err == nil && (changed || source.LastSync == "" || source.RangeStart != start.Format("2006-01-02") || source.RangeEnd != end.Format("2006-01-02") || source.CacheTimezone != loc.String()) {
		events, fetchErr := (googlecalendar.Client{HTTP: client}).Window(ctx, calendar, start, end)
		err = fetchErr
		if err == nil {
			snapshot, err = json.Marshal(events)
		}
	}
	if err != nil {
		_, saveErr := app.Store.DB.Exec("UPDATE calendar_sources SET last_attempt=?,last_error=? WHERE id=?", now.UTC().Format(time.RFC3339), err.Error(), source.ID)
		app.Broker.Notify("update")
		return saveErr
	}
	stagedRaw, err := json.Marshal(staged)
	if err != nil {
		return err
	}
	tx, err := app.Store.DB.Begin()
	if err != nil {
		return err
	}
	defer tx.Rollback()
	result, err := tx.Exec("UPDATE google_calendars SET sync_token=?,resources_json=? WHERE source_id=? AND sync_token=?", next, string(stagedRaw), source.ID, cursor)
	if err != nil {
		return err
	}
	n, err := result.RowsAffected()
	if err != nil {
		return err
	}
	if n != 1 {
		return errors.New("Google calendar changed during refresh; retry")
	}
	if snapshot != nil {
		_, err = tx.Exec("UPDATE calendar_sources SET events_json=?,range_start=?,range_end=?,cache_timezone=? WHERE id=?", string(snapshot), start.Format("2006-01-02"), end.Format("2006-01-02"), loc.String(), source.ID)
	}
	if err == nil {
		_, err = tx.Exec("UPDATE calendar_sources SET last_sync=?,last_attempt=?,last_error='' WHERE id=?", now.UTC().Format(time.RFC3339), now.UTC().Format(time.RFC3339), source.ID)
	}
	if err == nil {
		err = tx.Commit()
	}
	if err == nil {
		app.Broker.Notify("update")
	}
	return err
}

func (app *App) syncConnectedCalendar(ctx context.Context, source calendarSource) error {
	var google int
	err := app.Store.DB.QueryRow("SELECT source_id FROM google_calendars WHERE source_id=?", source.ID).Scan(&google)
	if err == nil {
		return app.syncGoogleCalendar(ctx, source)
	}
	if !errors.Is(err, sql.ErrNoRows) {
		return err
	}
	return app.syncCalendarConditional(ctx, source, calendarfeed.FetchConditional)
}
