package main

import (
	"encoding/json"
	"mylight/calendarfeed"
	"net/url"
	"testing"
)

func rangeURL(start, end string) string {
	return "/api/events?" + url.Values{"start": {start}, "end": {end}}.Encode()
}

func TestAllDayWritesRequireFloatingExclusiveDates(t *testing.T) {
	_, h := testApp(t)
	own := owner(t, h)
	for _, body := range []eventBody{
		{Title: "Bad timestamp", Start: "2026-03-08T00:00:00Z", AllDay: true},
		{Title: "Bad end", Start: "2026-03-08", End: "2026-03-09T00:00:00Z", AllDay: true},
		{Title: "Zero days", Start: "2026-03-08", End: "2026-03-08", AllDay: true},
	} {
		if w := request(h, "POST", "/api/events", body, own); w.Code != 400 {
			t.Fatal(w.Code, w.Body.String())
		}
	}
	if w := request(h, "POST", "/api/events", eventBody{Title: "Trip", Start: "2026-03-08", End: "2026-03-10", AllDay: true}, own); w.Code != 200 {
		t.Fatal(w.Code, w.Body.String())
	}
}

func TestCalendarRangeOverlapAndOffsets(t *testing.T) {
	app, h := testApp(t)
	own := owner(t, h)
	for _, event := range []struct {
		title, start, end, recurrence string
		allDay                        bool
	}{
		{"Overnight", "2026-09-04T23:00:00-05:00", "2026-09-05T01:00:00-05:00", "", false},
		{"Ends at boundary", "2026-09-04T23:00:00-05:00", "2026-09-05T00:00:00-05:00", "", false},
		{"Next day", "2026-09-06T00:00:00-05:00", "", "", false},
		{"Zero duration", "2026-09-05T00:00:00-05:00", "2026-09-05T00:00:00-05:00", "", false},
		{"UTC offset", "2026-09-06T04:30:00Z", "", "", false},
		{"Default hour overlap", "2026-09-04T23:30:00-05:00", "", "", false},
		{"Recurring master", "2020-01-01T08:00:00-06:00", "", "FREQ=DAILY", false},
		{"Future master", "2027-01-01T08:00:00-06:00", "", "FREQ=DAILY", false},
		{"All day", "2026-09-05", "", "", true},
		{"Multiple days", "2026-09-03", "2026-09-06", "", true},
		{"Ended all day", "2026-09-04", "2026-09-05", "", true},
	} {
		_, err := app.Store.DB.Exec("INSERT INTO events(title,start_date,end_date,recurrence,is_all_day) VALUES(?,?,?,?,?)", event.title, event.start, event.end, event.recurrence, event.allDay)
		if err != nil {
			t.Fatal(err)
		}
	}
	w := request(h, "GET", rangeURL("2026-09-05T00:00:00-05:00", "2026-09-06T00:00:00-05:00"), nil, own)
	var result []struct {
		Title string `json:"title"`
	}
	if w.Code != 200 || json.Unmarshal(w.Body.Bytes(), &result) != nil {
		t.Fatal(w.Code, w.Body.String())
	}
	want := map[string]bool{"Overnight": true, "Zero duration": true, "UTC offset": true, "Default hour overlap": true, "Recurring master": true, "All day": true, "Multiple days": true}
	for _, event := range result {
		if !want[event.Title] {
			t.Fatal("unexpected event", event.Title)
		}
		delete(want, event.Title)
	}
	if len(want) != 0 {
		t.Fatal("missing events", want)
	}
}

func TestCalendarRangeCivilDaysAndImportedEvents(t *testing.T) {
	app, h := testApp(t)
	own := owner(t, h)
	_, err := app.Store.DB.Exec("INSERT INTO events(title,start_date,is_all_day) VALUES('Local all day','2026-03-08',1)")
	if err != nil {
		t.Fatal(err)
	}
	raw, _ := json.Marshal([]calendarfeed.Event{
		{Key: "all", Title: "Feed all day", Start: "2026-03-08", End: "2026-03-09", AllDay: true},
		{Key: "old", Title: "Old feed event", Start: "2025-01-01T00:00:00Z", End: "2025-01-01T01:00:00Z"},
	})
	_, err = app.Store.DB.Exec("INSERT INTO calendar_sources(name,url,color,events_json) VALUES('Fixture','https://example.test/test.ics','green',?)", string(raw))
	if err != nil {
		t.Fatal(err)
	}
	for _, bounds := range [][2]string{
		{"2026-03-08T00:00:00+14:00", "2026-03-09T00:00:00+14:00"},
		{"2026-03-08T00:00:00-12:00", "2026-03-09T00:00:00-12:00"},
		{"2026-03-08T00:00:00-06:00", "2026-03-09T00:00:00-05:00"}, // 23-hour DST day
		{"2026-03-08T12:00:00-05:00", "2026-03-08T13:00:00-05:00"}, // partial civil day
	} {
		w := request(h, "GET", rangeURL(bounds[0], bounds[1]), nil, own)
		var events []map[string]interface{}
		if w.Code != 200 || json.Unmarshal(w.Body.Bytes(), &events) != nil || len(events) != 2 {
			t.Fatal(bounds, w.Code, w.Body.String())
		}
	}
}

func TestCalendarRangeValidationAndNoSilentTruncation(t *testing.T) {
	app, h := testApp(t)
	own := owner(t, h)
	for _, path := range []string{
		"/api/events?start=", "/api/events?start=2026-01-01&end=2026-02-01",
		rangeURL("2026-01-02T00:00:00Z", "2026-01-01T00:00:00Z"),
		rangeURL("2026-01-01T00:00:00Z", "2028-01-01T00:00:00Z"),
		rangeURL("2026-01-01T00:00:00Z", "2026-02-01T00:00:00Z") + "&start=2026-01-01T00%3A00%3A00Z",
	} {
		if w := request(h, "GET", path, nil, own); w.Code != 400 {
			t.Fatal(path, w.Code)
		}
	}
	_, err := app.Store.DB.Exec(`WITH RECURSIVE n(x) AS (SELECT 1 UNION ALL SELECT x+1 FROM n WHERE x<5001)
		INSERT INTO events(title,start_date) SELECT 'Old event','2020-01-01T12:00:00Z' FROM n`)
	if err != nil {
		t.Fatal(err)
	}
	if _, err = app.Store.DB.Exec("INSERT INTO events(title,start_date) VALUES('Upcoming','2026-09-05T12:00:00Z')"); err != nil {
		t.Fatal(err)
	}
	w := request(h, "GET", rangeURL("2026-09-01T00:00:00Z", "2026-10-01T00:00:00Z"), nil, own)
	var events []map[string]interface{}
	if w.Code != 200 || json.Unmarshal(w.Body.Bytes(), &events) != nil || len(events) != 1 || events[0]["title"] != "Upcoming" {
		t.Fatal(w.Code, w.Body.String())
	}
	if w = request(h, "GET", rangeURL("2020-01-01T00:00:00Z", "2020-01-02T00:00:00Z"), nil, own); w.Code != 422 {
		t.Fatal("truncated dense range", w.Code)
	}
	if w = request(h, "GET", "/api/events", nil, own); w.Code != 422 {
		t.Fatal("truncated legacy request", w.Code)
	}
}
