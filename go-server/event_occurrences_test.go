package main

import (
	"encoding/json"
	"mylight/store"
	"net/http"
	"net/url"
	"os"
	"path/filepath"
	"testing"
)

func newSeries(t *testing.T, h http.Handler, cookie *http.Cookie) map[string]interface{} {
	t.Helper()
	body := map[string]interface{}{"title": "Weekly class", "start_date": "2026-09-07T14:00:00Z", "end_date": "2026-09-07T15:00:00Z", "timezone": "America/Chicago", "recurrence": "FREQ=DAILY;COUNT=5", "member_ids": []int{1}}
	if w := request(h, "POST", "/api/events", body, cookie); w.Code != 200 {
		t.Fatal(w.Code, w.Body.String())
	}
	return body
}
func TestOccurrenceAPIAndBackupRestore(t *testing.T) {
	_, h := testApp(t)
	cookie := owner(t, h)
	body := newSeries(t, h, cookie)
	body["version"] = 1
	body["scope"] = "occurrence"
	body["occurrence"] = "2026-09-08T09:00:00-05:00"
	body["recurrence"] = ""
	body["title"] = "Moved before series"
	body["start_date"] = "2026-08-01T14:00:00Z"
	body["end_date"] = "2026-08-01T15:00:00Z"
	if w := request(h, "PUT", "/api/events/1", body, cookie); w.Code != 200 {
		t.Fatal(w.Code, w.Body.String())
	}
	if w := request(h, "PUT", "/api/events/1", body, cookie); w.Code != 409 {
		t.Fatal("replay", w.Code, w.Body.String())
	}
	w := request(h, "GET", "/api/events?start=2026-08-01T00:00:00Z&end=2026-08-02T00:00:00Z", nil, cookie)
	var events []map[string]interface{}
	if err := json.Unmarshal(w.Body.Bytes(), &events); err != nil {
		t.Fatal(err)
	}
	if len(events) != 1 || events[0]["series_id"] != float64(1) || events[0]["title"] != "Moved before series" {
		t.Fatal(events)
	}
	if w := request(h, "DELETE", "/api/events/2?version=1", nil, cookie); w.Code != 409 {
		t.Fatal(w.Code, w.Body.String())
	}
	if w := request(h, "GET", "/api/events/1?occurrence=2026-09-08T14:00:00Z", nil, nil); w.Code != 401 {
		t.Fatal(w.Code)
	}
	if w := request(h, "DELETE", "/api/events/1?version=2&scope=occurrence&occurrence=2026-09-09T14:00:00Z", nil, cookie); w.Code != 200 {
		t.Fatal(w.Code, w.Body.String())
	}
	w = request(h, "GET", "/api/events/1?export=1", nil, cookie)
	var exported store.SeriesExport
	if err := json.Unmarshal(w.Body.Bytes(), &exported); err != nil {
		t.Fatal(err)
	}
	if len(exported.Exdates) != 1 || len(exported.Overrides) != 1 || exported.Overrides[0].RecurrenceID != "2026-09-08T14:00:00.000Z" {
		t.Fatalf("%+v", exported)
	}
	backup := request(h, "GET", "/api/backup", nil, cookie)
	if backup.Code != 200 {
		t.Fatal(backup.Code, backup.Body.String())
	}
	archive := filepath.Join(t.TempDir(), "backup.zip")
	if err := os.WriteFile(archive, backup.Body.Bytes(), 0600); err != nil {
		t.Fatal(err)
	}
	dest := filepath.Join(t.TempDir(), "restored")
	if err := restoreBackup(archive, dest); err != nil {
		t.Fatal(err)
	}
	restored, err := store.NewStore(filepath.Join(dest, "mylight.db"))
	if err != nil {
		t.Fatal(err)
	}
	defer restored.Close()
	view, err := restored.GetOccurrence(1, "2026-09-08T14:00:00Z")
	if err != nil || view.Occurrence.Title != "Moved before series" || *view.Series.Version != 3 {
		t.Fatal(view, err)
	}
	cancelled, err := restored.GetOccurrence(1, "2026-09-09T14:00:00Z")
	if err != nil || !cancelled.Cancelled {
		t.Fatal(cancelled, err)
	}
}
func TestOccurrenceScopeValidationLeavesSeriesUntouched(t *testing.T) {
	app, h := testApp(t)
	cookie := owner(t, h)
	original := newSeries(t, h, cookie)
	for _, change := range []map[string]interface{}{
		{"scope": "typo", "occurrence": "2026-09-08T14:00:00Z"},
		{"scope": "occurrence", "occurrence": "2026-09-08T14:01:00Z", "recurrence": ""},
		{"scope": "occurrence", "occurrence": "2026-09-08T14:00:00Z"}, // Cannot make an override recur.
		{"scope": "future", "occurrence": "2026-09-20T14:00:00Z"},
		{"scope": "series", "occurrence": "2026-09-08T14:00:00Z"},
		{"scope": "occurrence", "occurrence": "2026-09-08T14:00:00Z", "timezone": nil, "recurrence": ""},
	} {
		body := map[string]interface{}{}
		for k, v := range original {
			body[k] = v
		}
		body["version"] = 1
		for k, v := range change {
			body[k] = v
		}
		w := request(h, "PUT", "/api/events/1", body, cookie)
		if w.Code != 400 {
			t.Fatal(change, w.Code, w.Body.String())
		}
	}
	for _, query := range []string{"scope=invalid", "scope=occurrence&scope=future", "scope=series&occurrence=x", "scope=occurrence&occurrence=x&occurrence=y", "scope=occurrence&occurrence=" + url.QueryEscape("2026-09-08T15:00:00Z")} {
		w := request(h, "DELETE", "/api/events/1?version=1&"+query, nil, cookie)
		if w.Code != 400 {
			t.Fatal(query, w.Code, w.Body.String())
		}
	}
	var version, count int
	app.Store.DB.QueryRow("SELECT version FROM events WHERE id=1").Scan(&version)
	app.Store.DB.QueryRow("SELECT count(*) FROM event_exceptions").Scan(&count)
	if version != 1 || count != 0 {
		t.Fatal(version, count)
	}
}
func TestFutureAPIUsesRemainingCountAndSupportsFirstOccurrence(t *testing.T) {
	_, h := testApp(t)
	cookie := owner(t, h)
	body := newSeries(t, h, cookie)
	w := request(h, "GET", "/api/events/1?occurrence=2026-09-09T14:00:00Z", nil, cookie)
	var editor store.OccurrenceEditor
	if err := json.Unmarshal(w.Body.Bytes(), &editor); err != nil {
		t.Fatal(err)
	}
	body["version"] = 1
	body["scope"] = "future"
	body["occurrence"] = editor.Key
	body["recurrence"] = editor.FutureRecurrence
	body["start_date"] = "2026-09-09T16:00:00Z"
	body["end_date"] = "2026-09-09T17:00:00Z"
	if w := request(h, "PUT", "/api/events/1", body, cookie); w.Code != 200 {
		t.Fatal(w.Code, w.Body.String())
	}
	if w := request(h, "GET", "/api/events/2?occurrence=2026-09-11T16:00:00Z", nil, cookie); w.Code != 200 {
		t.Fatal(w.Code, w.Body.String())
	}
	if w := request(h, "GET", "/api/events/2?occurrence=2026-09-12T16:00:00Z", nil, cookie); w.Code != 400 {
		t.Fatal(w.Code, w.Body.String())
	}
	if w := request(h, "DELETE", "/api/events/2?version=1&scope=future&occurrence=2026-09-09T16:00:00Z", nil, cookie); w.Code != 200 {
		t.Fatal(w.Code, w.Body.String())
	}
	if w := request(h, "GET", "/api/events/2", nil, cookie); w.Code != 404 {
		t.Fatal(w.Code, w.Body.String())
	}
	if w := request(h, "GET", "/api/events/1?occurrence=2026-09-08T14:00:00Z", nil, cookie); w.Code != 200 {
		t.Fatal(w.Code, w.Body.String())
	}
}
