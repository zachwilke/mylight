package main

import (
	"encoding/json"
	"fmt"
	"mylight/googlecalendar"
	"mylight/store"
	"net/http"
	"net/url"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func outgoingEvent() googlecalendar.Event {
	e := googlecalendar.Event{Kind: "calendar#event", ID: "instance_20260907", ETag: `"v1"`, Status: "confirmed", Summary: "Class", Start: googlecalendar.Date{Date: "2026-09-07"}, End: googlecalendar.Date{Date: "2026-09-08"}, RecurringEventID: "parent"}
	e.ExtendedProperties.Private = map[string]string{"otherApp": "keep"}
	e.ExtendedProperties.Shared = map[string]string{"shared": "keep"}
	return e
}
func outgoingDraft() googlecalendar.Draft {
	return googlecalendar.Draft{Title: "Library class", Start: "2026-09-07", End: "2026-09-08", AllDay: true, Description: "Bring books", Location: "Library"}
}
func queueOutgoing(t *testing.T, app *App, source int, id string) store.GoogleJob {
	t.Helper()
	raw, _ := json.Marshal(outgoingDraft())
	j, err := app.Store.QueueGoogleJob(store.GoogleJob{ID: id, SourceID: source, EventID: outgoingEvent().ID, BaseETag: `"v1"`, Draft: raw})
	if err != nil {
		t.Fatal(err)
	}
	return j
}
func TestGoogleOutgoingLostResponseIsNotSentTwice(t *testing.T) {
	app, h := testApp(t)
	cookie := owner(t, h)
	remote := outgoingEvent()
	patches := 0
	configureGoogle(t, app, func(r *http.Request) (int, string) {
		if r.Method == "PATCH" {
			patches++
			if r.Header.Get("If-Match") != `"v1"` || r.URL.Query().Get("sendUpdates") != "none" {
				t.Fatal(r.Header, r.URL)
			}
			var payload map[string]json.RawMessage
			if json.NewDecoder(r.Body).Decode(&payload) != nil {
				t.Fatal("invalid patch")
			}
			for _, field := range []string{"attendees", "recurrence", "organizer", "reminders", "attachments"} {
				if payload[field] != nil {
					t.Fatal("patched unrelated field", field)
				}
			}
			json.Unmarshal(payload["summary"], &remote.Summary)
			json.Unmarshal(payload["extendedProperties"], &remote.ExtendedProperties)
			remote.ETag = `"v2"`
			if remote.ExtendedProperties.Private["otherApp"] != "keep" || remote.ExtendedProperties.Shared["shared"] != "keep" {
				t.Fatal("lost other app metadata")
			}
			return 200, `truncated response after Google committed`
		}
		raw, _ := json.Marshal(remote)
		return 200, string(raw)
	})
	account := googleAccount(t, app, false)
	app.Store.DB.Exec("UPDATE google_accounts SET write_enabled=1 WHERE id=?", account)
	source := googleSource(t, app, account)
	job := queueOutgoing(t, app, source.ID, "operation-lost-response")
	app.processGoogleJobs()
	saved, _ := app.Store.GoogleJob(job.ID)
	if saved.State != "retry" || patches != 1 || remote.Summary != "Library class" {
		t.Fatal(saved, patches, remote)
	}
	if w := request(h, "DELETE", fmt.Sprintf("/api/calendars/%d", source.ID), nil, cookie); w.Code != 409 {
		t.Fatal("removed source with unresolved outcome", w.Code)
	}
	app.Store.DB.Exec("UPDATE google_jobs SET next_attempt=0 WHERE id=?", job.ID)
	app.processGoogleJobs()
	saved, _ = app.Store.GoogleJob(job.ID)
	if saved.State != "done" || patches != 1 {
		t.Fatal("duplicated an accepted patch", saved, patches)
	}
	// Replaying the same enqueue also remains terminal and cannot create work.
	same := queueOutgoing(t, app, source.ID, job.ID)
	if same.State != "done" {
		t.Fatal(same)
	}
	if w := request(h, "DELETE", fmt.Sprintf("/api/calendars/%d", source.ID), nil, cookie); w.Code != 200 {
		t.Fatal(w.Code, w.Body.String())
	}
}
func TestGoogleOutgoingVersionConflictAndExplicitResolution(t *testing.T) {
	app, h := testApp(t)
	cookie := owner(t, h)
	remote := outgoingEvent()
	patches := 0
	configureGoogle(t, app, func(r *http.Request) (int, string) {
		if r.Method == "PATCH" {
			patches++
			if patches == 1 {
				remote.Summary = "Changed in Google"
				remote.ETag = `"v2"`
				return 412, "private provider error"
			}
			if r.Header.Get("If-Match") != remote.ETag {
				t.Fatal("unconditional overwrite")
			}
			var payload struct {
				Summary            string `json:"summary"`
				ExtendedProperties struct {
					Private map[string]string `json:"private"`
				} `json:"extendedProperties"`
			}
			json.NewDecoder(r.Body).Decode(&payload)
			remote.Summary = payload.Summary
			remote.ExtendedProperties.Private = payload.ExtendedProperties.Private
			remote.ETag = `"v3"`
		}
		raw, _ := json.Marshal(remote)
		return 200, string(raw)
	})
	account := googleAccount(t, app, false)
	app.Store.DB.Exec("UPDATE google_accounts SET write_enabled=1")
	source := googleSource(t, app, account)
	job := queueOutgoing(t, app, source.ID, "operation-conflict-case")
	app.processGoogleJobs()
	saved, _ := app.Store.GoogleJob(job.ID)
	if saved.State != "conflict" || !strings.Contains(string(saved.Remote), "Changed in Google") || patches != 1 {
		t.Fatal(saved, patches)
	}
	route := "/api/google-jobs/" + job.ID
	for _, body := range []map[string]interface{}{{"action": "apply", "version": 1, "etag": `"v2"`}, {"action": "apply", "version": saved.Version, "etag": `"wrong"`}, {"action": "retry", "version": saved.Version}} {
		if w := request(h, "POST", route, body, cookie); w.Code != 409 {
			t.Fatal("accepted stale/implicit conflict resolution", w.Code)
		}
	}
	w := request(h, "POST", route, map[string]interface{}{"action": "apply", "version": saved.Version, "etag": `"v2"`}, cookie)
	if w.Code != 200 {
		t.Fatal(w.Code, w.Body.String())
	}
	app.processGoogleJobs()
	saved, _ = app.Store.GoogleJob(job.ID)
	if saved.State != "done" || patches != 2 || remote.Summary != "Library class" {
		t.Fatal(saved, remote, patches)
	}
}
func TestGoogleOutgoingStopsOnRemoteChangesPermissionsAndSeries(t *testing.T) {
	for _, mode := range []string{"changed", "deleted", "master", "permission", "disabled"} {
		t.Run(mode, func(t *testing.T) {
			app, _ := testApp(t)
			remote := outgoingEvent()
			calls := 0
			configureGoogle(t, app, func(r *http.Request) (int, string) {
				calls++
				if r.Method != "GET" {
					t.Fatal("unexpected write", mode)
				}
				switch mode {
				case "changed":
					remote.ETag = `"new"`
				case "deleted":
					return 404, "secret"
				case "permission":
					return 403, "secret"
				case "master":
					remote.Recurrence = []string{"RRULE:FREQ=DAILY"}
				}
				raw, _ := json.Marshal(remote)
				return 200, string(raw)
			})
			account := googleAccount(t, app, false)
			app.Store.DB.Exec("UPDATE google_accounts SET write_enabled=1")
			source := googleSource(t, app, account)
			job := queueOutgoing(t, app, source.ID, "operation-stops-safely")
			if mode == "disabled" {
				app.Store.DB.Exec("UPDATE google_accounts SET write_enabled=0")
			}
			app.processGoogleJobs()
			saved, _ := app.Store.GoogleJob(job.ID)
			expected := "conflict"
			if mode == "permission" || mode == "disabled" {
				expected = "paused"
			}
			if saved.State != expected || (mode == "disabled" && calls != 0) {
				t.Fatal(mode, saved, calls)
			}
			if err := app.Store.ResolveGoogleJob(job.ID, saved.Version, "discard", ""); err != nil {
				t.Fatal(err)
			}
		})
	}
}
func TestGoogleOutgoingAPIValidatesOwnerScopeAndIdempotency(t *testing.T) {
	app, h := testApp(t)
	cookie := owner(t, h)
	configureGoogle(t, app, func(r *http.Request) (int, string) {
		if strings.HasSuffix(r.URL.Path, "calendarList") {
			return 200, `{"kind":"calendar#calendarList","items":[{"id":"primary","accessRole":"owner"}]}`
		}
		raw, _ := json.Marshal(outgoingEvent())
		return 200, string(raw)
	})
	account := googleAccount(t, app, false)
	source := googleSource(t, app, account)
	route := fmt.Sprintf("/api/google-events/%d/%s", source.ID, outgoingEvent().ID)
	body := map[string]interface{}{"request_id": "operation-api-request", "etag": `"v1"`, "title": "Library class", "start_date": "2026-09-07", "end_date": "2026-09-08", "is_all_day": true}
	if w := request(h, "POST", route, body, cookie); w.Code != 403 {
		t.Fatal("read-only grant queued a write", w.Code)
	}
	app.Store.DB.Exec("UPDATE google_accounts SET write_enabled=1")
	if w := request(h, "GET", route, nil, cookie); w.Code != 200 || strings.Contains(w.Body.String(), "otherApp") {
		t.Fatal(w.Code, w.Body.String())
	}
	for i := 0; i < 2; i++ {
		if w := request(h, "POST", route, body, cookie); w.Code != 202 {
			t.Fatal(w.Code, w.Body.String())
		}
	}
	body["title"] = "Different draft"
	if w := request(h, "POST", route, body, cookie); w.Code != 409 {
		t.Fatal("idempotency key reused for different draft", w.Code)
	}
	body["request_id"] = "another-queued-request"
	if w := request(h, "POST", route, body, cookie); w.Code != 409 {
		t.Fatal("two active writes to same event", w.Code)
	}
	body["end_date"] = "2026-09-01"
	if w := request(h, "POST", route, body, cookie); w.Code != 400 {
		t.Fatal("invalid interval queued", w.Code)
	}
	if w := request(h, "DELETE", fmt.Sprintf("/api/google/%d", account), nil, cookie); w.Code != 409 {
		t.Fatal("account disconnected with active work", w.Code)
	}
	app.Store.DB.Exec("UPDATE family_members SET role='user' WHERE id=1")
	for _, path := range []string{route, "/api/google-jobs"} {
		if w := request(h, "GET", path, nil, cookie); w.Code != 403 {
			t.Fatal(path, w.Code)
		}
	}
}
func TestGoogleOutgoingOAuthRequiresExplicitGrantAndSameAccount(t *testing.T) {
	for _, wrongAccount := range []bool{false, true} {
		t.Run(fmt.Sprint(wrongAccount), func(t *testing.T) {
			app, h := testApp(t)
			cookie := owner(t, h)
			configureGoogle(t, app, func(r *http.Request) (int, string) {
				if r.URL.Host == "oauth2.googleapis.com" {
					return 200, `{"access_token":"write-access","refresh_token":"write-refresh","expires_in":3600,"token_type":"Bearer","scope":"openid https://www.googleapis.com/auth/calendar.events https://www.googleapis.com/auth/calendar.calendarlist.readonly"}`
				}
				if wrongAccount {
					return 200, `{"sub":"wrong-account"}`
				}
				return 200, `{"sub":"subject-test"}`
			})
			account := googleAccount(t, app, false)
			w := request(h, "POST", "/api/google/connect", map[string]interface{}{"allow_editing": true, "account_id": account}, cookie)
			var response map[string]string
			json.Unmarshal(w.Body.Bytes(), &response)
			if !strings.Contains(response["url"], "calendar.events+") {
				t.Fatal("editing scope not requested", response)
			}
			// Read persisted state to avoid parsing/reformatting the opaque state URL.
			u, err := url.Parse(response["url"])
			if err != nil {
				t.Fatal(err)
			}
			result := request(h, "GET", "/google/callback?code=edit&state="+u.Query().Get("state"), nil, w.Result().Cookies()[0])
			var enabled bool
			app.Store.DB.QueryRow("SELECT write_enabled FROM google_accounts WHERE id=?", account).Scan(&enabled)
			if enabled == wrongAccount || (wrongAccount && !strings.Contains(result.Header().Get("Location"), "failed")) {
				t.Fatal(enabled, result.Header())
			}
		})
	}
}

func TestGoogleOutgoingRefreshErrorsDistinguishOfflineFromRevoked(t *testing.T) {
	for _, revoked := range []bool{false, true} {
		t.Run(fmt.Sprint(revoked), func(t *testing.T) {
			app, _ := testApp(t)
			configureGoogle(t, app, func(r *http.Request) (int, string) {
				if r.URL.Host != "oauth2.googleapis.com" {
					t.Fatal("used expired token")
				}
				if revoked {
					return 400, `{"error":"invalid_grant","error_description":"private account detail"}`
				}
				return 503, "offline"
			})
			account := googleAccount(t, app, true)
			app.Store.DB.Exec("UPDATE google_accounts SET write_enabled=1")
			source := googleSource(t, app, account)
			job := queueOutgoing(t, app, source.ID, "operation-refresh-error")
			app.processGoogleJobs()
			saved, _ := app.Store.GoogleJob(job.ID)
			expected := "retry"
			if revoked {
				expected = "paused"
			}
			if saved.State != expected || strings.Contains(saved.Message, "private") {
				t.Fatal(saved)
			}
		})
	}
}
func TestGoogleOutgoingResolutionCannotOverwriteAnotherNewVersion(t *testing.T) {
	app, _ := testApp(t)
	remote := outgoingEvent()
	remote.ETag = `"v2"`
	configureGoogle(t, app, func(r *http.Request) (int, string) {
		if r.Method != "GET" {
			t.Fatal("overwrote a newer version")
		}
		raw, _ := json.Marshal(remote)
		return 200, string(raw)
	})
	account := googleAccount(t, app, false)
	app.Store.DB.Exec("UPDATE google_accounts SET write_enabled=1")
	source := googleSource(t, app, account)
	job := queueOutgoing(t, app, source.ID, "operation-second-conflict")
	app.processGoogleJobs()
	saved, _ := app.Store.GoogleJob(job.ID)
	if err := app.Store.ResolveGoogleJob(job.ID, saved.Version, "apply", `"v2"`); err != nil {
		t.Fatal(err)
	}
	remote.ETag = `"v3"`
	remote.Summary = "Changed again"
	app.processGoogleJobs()
	saved, _ = app.Store.GoogleJob(job.ID)
	if saved.State != "conflict" || !strings.Contains(string(saved.Remote), "Changed again") {
		t.Fatal(saved)
	}
	if err := app.Store.ResolveGoogleJob(job.ID, saved.Version, "discard", ""); err != nil {
		t.Fatal(err)
	}
}
func TestGoogleOutgoingBackupRestoreDoesNotReplayOverNewerGoogleVersion(t *testing.T) {
	app, h := testApp(t)
	cookie := owner(t, h)
	remote := outgoingEvent()
	configureGoogle(t, app, func(r *http.Request) (int, string) {
		if r.Method != "GET" {
			t.Fatal("restored old draft overwrote newer Google data")
		}
		raw, _ := json.Marshal(remote)
		return 200, string(raw)
	})
	account := googleAccount(t, app, false)
	app.Store.DB.Exec("UPDATE google_accounts SET write_enabled=1")
	source := googleSource(t, app, account)
	job := queueOutgoing(t, app, source.ID, "operation-restored-draft")
	backup := request(h, "GET", "/api/backup", nil, cookie)
	if backup.Code != 200 {
		t.Fatal(backup.Code, backup.Body.String())
	}
	archive := filepath.Join(t.TempDir(), "backup.zip")
	if err := os.WriteFile(archive, backup.Body.Bytes(), 0600); err != nil {
		t.Fatal(err)
	}
	destination := filepath.Join(t.TempDir(), "restored")
	if err := restoreBackup(archive, destination); err != nil {
		t.Fatal(err)
	}
	restored, err := store.NewStore(filepath.Join(destination, "mylight.db"))
	if err != nil {
		t.Fatal(err)
	}
	defer restored.Close()
	// More work happened on Google after this backup was created. Its latest
	// operation marker need not be ours: the old ETag must still prevent replay.
	remote.ETag = `"v5"`
	remote.Summary = "Newer Google plan"
	next := &App{Store: restored, Google: app.Google, Broker: NewBroker()}
	next.processGoogleJobs()
	saved, err := restored.GoogleJob(job.ID)
	if err != nil || saved.State != "conflict" || !strings.Contains(string(saved.Remote), "Newer Google plan") {
		t.Fatal(saved, err)
	}
}
