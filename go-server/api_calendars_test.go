package main

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"mylight/calendarfeed"
	"net/http"
	"strings"
	"testing"
	"time"
)

func TestCalendarCacheRefreshAndRemoval(t *testing.T) {
	app, h := testApp(t)
	cookie := owner(t, h)
	result, err := app.Store.DB.Exec("INSERT INTO calendar_sources(url,name,color) VALUES(?,?,?)", "https://calendar.example.test/private-token", "School", "blue")
	if err != nil {
		t.Fatal(err)
	}
	id, _ := result.LastInsertId()
	source := calendarSource{ID: int(id), URL: "https://calendar.example.test/private-token"}
	start := time.Now().UTC().Add(time.Hour).Format("20060102T150405Z")
	good := func(context.Context, string) ([]byte, error) {
		return []byte("BEGIN:VCALENDAR\r\nVERSION:2.0\r\nBEGIN:VEVENT\r\nUID:school\r\nSUMMARY:School event\r\nDTSTART:" + start + "\r\nEND:VEVENT\r\nEND:VCALENDAR\r\n"), nil
	}
	app.syncCalendar(context.Background(), source, good)
	app.syncCalendar(context.Background(), source, good)
	w := request(h, "GET", "/api/events", nil, cookie)
	var events []map[string]interface{}
	if w.Code != 200 || json.Unmarshal(w.Body.Bytes(), &events) != nil || len(events) != 1 || events[0]["is_external"] != true {
		t.Fatal(w.Code, w.Body.String())
	}
	key := events[0]["id"]
	app.syncCalendar(context.Background(), source, func(context.Context, string) ([]byte, error) { return nil, errors.New("temporary network failure") })
	w = request(h, "GET", "/api/events", nil, cookie)
	json.Unmarshal(w.Body.Bytes(), &events)
	if len(events) != 1 || events[0]["id"] != key {
		t.Fatal("failed refresh lost last good snapshot", w.Body.String())
	}
	w = request(h, "GET", "/api/calendars", nil, cookie)
	if strings.Contains(w.Body.String(), "private-token") || !strings.Contains(w.Body.String(), "temporary network failure") {
		t.Fatal("secret leaked or status missing", w.Body.String())
	}
	if w = request(h, "PUT", fmt.Sprint("/api/events/", key), map[string]string{}, cookie); w.Code != 400 {
		t.Fatal("imported event editable", w.Code)
	}
	app.syncCalendar(context.Background(), source, func(context.Context, string) ([]byte, error) {
		return []byte("BEGIN:VCALENDAR\r\nVERSION:2.0\r\nEND:VCALENDAR\r\n"), nil
	})
	w = request(h, "GET", "/api/events", nil, cookie)
	if strings.TrimSpace(w.Body.String()) != "[]" {
		t.Fatal("provider deletions not applied", w.Body.String())
	}
	app.syncCalendar(context.Background(), source, good)
	if w = request(h, "DELETE", fmt.Sprintf("/api/calendars/%d", id), nil, cookie); w.Code != 200 {
		t.Fatal(w.Code, w.Body.String())
	}
	w = request(h, "GET", "/api/events", nil, cookie)
	if strings.TrimSpace(w.Body.String()) != "[]" {
		t.Fatal("unsubscribe left cached events", w.Body.String())
	}
}

func TestCalendarSubscriptionAuthAndValidation(t *testing.T) {
	_, h := testApp(t)
	if w := request(h, "GET", "/api/calendars", nil, nil); w.Code != http.StatusUnauthorized {
		t.Fatal(w.Code)
	}
	cookie := owner(t, h)
	w := request(h, "POST", "/api/calendars", map[string]string{"name": "Bad feed", "url": "https://127.0.0.1/secret"}, cookie)
	if w.Code != 400 {
		t.Fatal("unsafe feed accepted", w.Code)
	}
}

func TestCalendarConditionalRefresh(t *testing.T) {
	app, handler := testApp(t)
	owner(t, handler)
	result, err := app.Store.DB.Exec("INSERT INTO calendar_sources(url,name,color) VALUES('https://calendar.example.test/feed','School','blue')")
	if err != nil {
		t.Fatal(err)
	}
	id, _ := result.LastInsertId()
	source := calendarSource{ID: int(id), URL: "https://calendar.example.test/feed"}
	good := func(context.Context, string, calendarfeed.Validators) (calendarfeed.FetchResult, error) {
		return calendarfeed.FetchResult{Data: []byte("BEGIN:VCALENDAR\r\nVERSION:2.0\r\nEND:VCALENDAR\r\n"), Validators: calendarfeed.Validators{ETag: `"v1"`, LastModified: "Fri, 04 Sep 2026 00:00:00 GMT"}}, nil
	}
	if err := app.syncCalendarConditional(context.Background(), source, good); err != nil {
		t.Fatal(err)
	}
	sources, err := app.calendarSources()
	if err != nil {
		t.Fatal(err)
	}
	source = sources[0]
	unchanged := func(_ context.Context, _ string, v calendarfeed.Validators) (calendarfeed.FetchResult, error) {
		if v.ETag != `"v1"` || v.LastModified == "" {
			t.Fatal("validators missing", v)
		}
		return calendarfeed.FetchResult{NotModified: true}, nil
	}
	if err := app.syncCalendarConditional(context.Background(), source, unchanged); err != nil {
		t.Fatal(err)
	}
	var raw, syncError string
	if err := app.Store.DB.QueryRow("SELECT events_json,last_error FROM calendar_sources WHERE id=?", id).Scan(&raw, &syncError); err != nil || raw != "[]" || syncError != "" {
		t.Fatal(raw, syncError, err)
	}
	for _, change := range []string{"window", "timezone"} {
		stale := source
		if change == "window" {
			stale.RangeStart = "2000-01-01"
		} else {
			stale.CacheTimezone = "Pacific/Honolulu"
		}
		err := app.syncCalendarConditional(context.Background(), stale, func(_ context.Context, _ string, v calendarfeed.Validators) (calendarfeed.FetchResult, error) {
			if v.ETag != "" || v.LastModified != "" {
				t.Fatal("stale recurrence window sent validators", change, v)
			}
			return calendarfeed.FetchResult{NotModified: true}, nil
		})
		if err != nil {
			t.Fatal(err)
		}
		app.Store.DB.QueryRow("SELECT last_error FROM calendar_sources WHERE id=?", id).Scan(&syncError)
		if syncError == "" {
			t.Fatal("accepted 304 with unusable snapshot")
		}
	}
	// A failed parse must not replace validators with those of invalid content.
	app.syncCalendarConditional(context.Background(), source, func(context.Context, string, calendarfeed.Validators) (calendarfeed.FetchResult, error) {
		return calendarfeed.FetchResult{Data: []byte("invalid"), Validators: calendarfeed.Validators{ETag: `"bad"`}}, nil
	})
	sources, _ = app.calendarSources()
	if sources[0].ETag != `"v1"` || sources[0].LastError == "" {
		t.Fatal("invalid content replaced the good validator", sources[0])
	}
}
