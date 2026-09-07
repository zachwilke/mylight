package main

import (
	"context"
	"crypto/sha256"
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"mylight/googlecalendar"
	"mylight/store"
	"net/http"
	"regexp"
	"strings"
	"time"
)

var googleEventIdentity = regexp.MustCompile(`^[A-Za-z0-9_-]{1,1000}$`)
var googleJobIdentity = regexp.MustCompile(`^[a-zA-Z0-9_-]{16,100}$`)

func (app *App) googleTarget(source int) (account int, calendar string, enabled bool, err error) {
	err = app.Store.DB.QueryRow("SELECT c.account_id,c.calendar_id,a.write_enabled FROM google_calendars c JOIN google_accounts a ON a.id=c.account_id WHERE c.source_id=?", source).Scan(&account, &calendar, &enabled)
	return
}
func (app *App) handleGoogleEvent(w http.ResponseWriter, r *http.Request) {
	parts := strings.Split(strings.Trim(r.URL.Path, "/"), "/")
	if len(parts) != 3 && len(parts) != 4 {
		jsonError(w, "Not found", 404)
		return
	}
	source, err := googleID(parts[2])
	if err != nil || (len(parts) == 4 && !googleEventIdentity.MatchString(parts[3])) {
		jsonError(w, "Invalid Google appointment", 400)
		return
	}
	id := ""
	if len(parts) == 4 {
		id = parts[3]
	}
	account, calendar, enabled, err := app.googleTarget(source)
	if err != nil {
		jsonError(w, "Google calendar is not connected", 404)
		return
	}
	if !enabled {
		jsonError(w, store.ErrGoogleWritesDisabled.Error(), 403)
		return
	}
	if r.Method == "GET" && id != "" {
		if !app.calendarSync.TryLock() {
			jsonError(w, "A calendar operation is running. Try again shortly.", 409)
			return
		}
		defer app.calendarSync.Unlock()
		ctx, cancel := context.WithTimeout(r.Context(), 45*time.Second)
		defer cancel()
		client, err := app.googleClient(ctx, account)
		if err != nil {
			jsonError(w, err.Error(), 502)
			return
		}
		calendars, err := (googlecalendar.Client{HTTP: client}).Calendars(ctx)
		if err != nil {
			jsonError(w, err.Error(), 502)
			return
		}
		writable := false
		for _, candidate := range calendars {
			if candidate.ID == calendar && (candidate.AccessRole == "owner" || candidate.AccessRole == "writer") {
				writable = true
			}
		}
		if !writable {
			jsonError(w, "This Google calendar is read-only for the connected account", 403)
			return
		}
		e, err := (googlecalendar.Client{HTTP: client}).GetEvent(ctx, calendar, id)
		if err != nil {
			jsonError(w, err.Error(), 502)
			return
		}
		view, err := e.View()
		if err != nil {
			jsonError(w, err.Error(), 422)
			return
		}
		if !view.Editable {
			jsonError(w, "Edit this kind of appointment or the entire series in Google", 422)
			return
		}
		jsonResponse(w, view)
		return
	}
	if r.Method != "POST" {
		jsonError(w, "Method not allowed", 405)
		return
	}
	var body struct {
		googlecalendar.Draft
		Operation string `json:"operation"`
		ETag      string `json:"etag"`
		RequestID string `json:"request_id"`
	}
	if json.NewDecoder(r.Body).Decode(&body) != nil || !googleJobIdentity.MatchString(body.RequestID) || len(body.ETag) > 500 || strings.ContainsAny(body.ETag, "\r\n") {
		jsonError(w, "Reload the appointment before saving", 400)
		return
	}
	if body.Operation == "" {
		body.Operation = "update"
	}
	if (body.Operation != "create" && body.Operation != "delete" && body.Operation != "update") ||
		(body.Operation == "create" && (id != "" || body.ETag != "")) ||
		(body.Operation != "create" && (id == "" || body.ETag == "")) {
		jsonError(w, "Invalid appointment operation; reload before continuing", 400)
		return
	}
	if body.Operation == "create" {
		id = fmt.Sprintf("ml%x", sha256.Sum256([]byte(body.RequestID)))
	}
	validation := eventBody{Title: body.Title, Start: body.Start, End: body.End, AllDay: body.AllDay, Description: body.Description, Location: body.Location}
	if err := validateEvent(&validation); err != nil {
		jsonError(w, err.Error(), 400)
		return
	}
	if body.End == "" {
		jsonError(w, "An end date is required", 400)
		return
	}
	body.Title = validation.Title
	raw, err := json.Marshal(body.Draft)
	if err != nil {
		jsonError(w, "Could not queue change", 500)
		return
	}
	job, err := app.Store.QueueGoogleJob(store.GoogleJob{Operation: body.Operation, ID: body.RequestID, SourceID: source, EventID: id, BaseETag: body.ETag, Draft: raw})
	if err != nil {
		jsonError(w, err.Error(), 409)
		return
	}
	app.Broker.Notify("update")
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusAccepted)
	jsonResponse(w, job)
	// Cron survives a process restart; the queued SQLite job is the source of truth.
}
func (app *App) handleGoogleJobs(w http.ResponseWriter, r *http.Request) {
	if r.URL.Path == "/api/google-jobs" && r.Method == "GET" {
		jobs, err := app.Store.GoogleJobs()
		if err != nil {
			jsonError(w, "Could not read outgoing changes", 500)
			return
		}
		jsonResponse(w, jobs)
		return
	}
	parts := strings.Split(strings.Trim(r.URL.Path, "/"), "/")
	if r.Method != "POST" || len(parts) != 3 || !googleJobIdentity.MatchString(parts[2]) {
		jsonError(w, "Not found", 404)
		return
	}
	var body struct {
		Action  string `json:"action"`
		Version int    `json:"version"`
		ETag    string `json:"etag"`
	}
	if json.NewDecoder(r.Body).Decode(&body) != nil || body.Version < 1 {
		jsonError(w, "Reload outgoing changes before continuing", 400)
		return
	}
	if err := app.Store.ResolveGoogleJob(parts[2], body.Version, body.Action, body.ETag); err != nil {
		jsonError(w, err.Error(), 409)
		return
	}
	app.Broker.Notify("update")
	jsonResponse(w, map[string]bool{"success": true})
}

// Called under calendarSync before incoming refresh. Network work is outside
// SQLite transactions; leases plus Google's If-Match fence competing workers.
func (app *App) processGoogleJobs() {
	for i := 0; i < 10; i++ {
		token, err := randomToken()
		if err != nil {
			return
		}
		job, err := app.Store.ClaimGoogleJob(time.Now().Unix(), token)
		if errors.Is(err, sql.ErrNoRows) {
			return
		}
		if err != nil {
			return
		}
		app.Broker.Notify("update")
		app.processGoogleJob(job)
	}
}
func (app *App) processGoogleJob(job store.GoogleJob) {
	finish := func(state, message string, view interface{}, next int64) {
		raw, _ := json.Marshal(view)
		if app.Store.FinishGoogleJob(job, state, message, raw, next) == nil {
			app.Broker.Notify("update")
		}
	}
	retry := func(message string) {
		delay := min(time.Hour, time.Minute*time.Duration(1<<min(job.Attempts-1, 6)))
		finish("retry", message, nil, time.Now().Add(delay).Unix())
	}
	handleError := func(err error) {
		switch {
		case errors.Is(err, googlecalendar.ErrGone):
			finish("conflict", err.Error(), nil, 0)
		case errors.Is(err, googlecalendar.ErrPermission), errors.Is(err, googlecalendar.ErrRejected):
			finish("paused", err.Error(), nil, 0)
		default:
			retry(err.Error())
		}
	}
	account, calendar, enabled, err := app.googleTarget(job.SourceID)
	if err != nil || !enabled {
		finish("paused", store.ErrGoogleWritesDisabled.Error(), nil, 0)
		return
	}
	ctx, cancel := context.WithTimeout(context.Background(), 45*time.Second)
	defer cancel()
	client, err := app.googleClient(ctx, account)
	if err != nil {
		if errors.Is(err, googlecalendar.ErrBusy) {
			retry(err.Error())
		} else {
			finish("paused", err.Error(), nil, 0)
		}
		return
	}
	google := googlecalendar.Client{HTTP: client}
	// Check access before interpreting a missing event: Google also returns 404
	// for inaccessible resources. A removed calendar must not look like a deletion.
	if job.Operation == "create" || job.Operation == "delete" {
		calendars, accessErr := google.Calendars(ctx)
		if accessErr != nil {
			handleError(accessErr)
			return
		}
		writable := false
		for _, candidate := range calendars {
			if candidate.ID == calendar && (candidate.AccessRole == "owner" || candidate.AccessRole == "writer") {
				writable = true
			}
		}
		if !writable {
			handleError(googlecalendar.ErrPermission)
			return
		}
	}
	current, err := google.GetEvent(ctx, calendar, job.EventID)
	if job.Operation == "create" {
		if err == nil {
			if current.Operation() == job.ID {
				finish("done", "Google accepted this creation", nil, 0)
			} else {
				view, viewErr := current.View()
				var details interface{}
				if viewErr == nil {
					details = view
				}
				finish("conflict", "This ID already belongs to a Google appointment. Keep Google's version and start a new appointment.", details, 0)
			}
			return
		}
		if !errors.Is(err, googlecalendar.ErrGone) {
			handleError(err)
			return
		}
		var draft googlecalendar.Draft
		if json.Unmarshal(job.Draft, &draft) != nil {
			finish("paused", "The saved draft could not be read", nil, 0)
			return
		}
		created, insertErr := google.InsertEvent(ctx, calendar, job.EventID, draft, job.ID)
		if errors.Is(insertErr, googlecalendar.ErrExists) {
			retry("Checking the existing Google appointment before continuing")
			return
		}
		if insertErr != nil {
			handleError(insertErr)
			return
		}
		if created.Operation() != job.ID {
			retry("Checking whether Google accepted the creation")
			return
		}
		finish("done", "Google accepted this creation", nil, 0)
		return
	}
	if job.Operation == "delete" && (errors.Is(err, googlecalendar.ErrGone) || (err == nil && current.Status == "cancelled")) {
		finish("done", "This appointment is no longer in Google", nil, 0)
		return
	}
	if err != nil {
		handleError(err)
		return
	}
	if job.Operation != "delete" && current.Operation() == job.ID {
		finish("done", "Google accepted this change", nil, 0)
		return
	}
	view, err := current.View()
	if err != nil {
		finish("paused", err.Error(), nil, 0)
		return
	}
	if !view.Editable || current.ETag != job.BaseETag {
		finish("conflict", "This appointment changed in Google. Review both versions before applying your draft.", view, 0)
		return
	}
	var draft googlecalendar.Draft
	if json.Unmarshal(job.Draft, &draft) != nil {
		finish("paused", "The saved draft could not be read", nil, 0)
		return
	}
	var updated googlecalendar.Event
	if job.Operation == "delete" {
		err = google.DeleteEvent(ctx, calendar, current)
		if err == nil {
			finish("done", "Google accepted this deletion", nil, 0)
			return
		}
		if errors.Is(err, googlecalendar.ErrGone) {
			retry("Checking whether the appointment is still in Google")
			return
		}
	} else {
		updated, err = google.PatchEvent(ctx, calendar, current, draft, job.ID)
	}
	if errors.Is(err, googlecalendar.ErrVersion) {
		latest, fetchErr := google.GetEvent(ctx, calendar, job.EventID)
		if fetchErr != nil {
			handleError(fetchErr)
			return
		}
		if job.Operation != "delete" && latest.Operation() == job.ID {
			finish("done", "Google accepted this change", nil, 0)
			return
		}
		if job.Operation == "delete" && latest.Status == "cancelled" {
			finish("done", "This appointment is no longer in Google", nil, 0)
			return
		}
		latestView, fetchErr := latest.View()
		if fetchErr != nil {
			handleError(fetchErr)
			return
		}
		finish("conflict", err.Error(), latestView, 0)
		return
	}
	if err != nil {
		handleError(err)
		return
	}
	if updated.Operation() != job.ID {
		retry("Checking whether Google accepted the change")
		return
	}
	finish("done", "Google accepted this change", nil, 0)
}
