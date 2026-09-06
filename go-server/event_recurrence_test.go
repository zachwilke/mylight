package main

import (
	"strings"
	"testing"
)

func TestLocalRecurrenceValidation(t *testing.T) {
	for _, rule := range []string{"", "FREQ=DAILY", "RRULE:FREQ=WEEKLY;INTERVAL=2;BYDAY=MO,WE", "FREQ=MONTHLY;BYDAY=-1FR;COUNT=12", "FREQ=YEARLY;BYMONTH=6;BYMONTHDAY=15", "FREQ=DAILY;UNTIL=20260910T120000Z"} {
		body := eventBody{Title: "Valid", Start: "2026-09-05T12:00:00Z", Recurrence: rule}
		if err := validateEvent(&body); err != nil {
			t.Errorf("%s: %v", rule, err)
		}
		if strings.HasPrefix(body.Recurrence, "RRULE:") {
			t.Fatal("prefix not canonicalized")
		}
	}
	for _, rule := range []string{"RRULE:", "INTERVAL=2", "FREQ=DAILY;FREQ=WEEKLY", "FREQ=SECONDLY", "FREQ=HOURLY", "FREQ=DAILY;BYHOUR=9", "FREQ=DAILY;COUNT=0", "FREQ=DAILY;COUNT=10001", "FREQ=DAILY;INTERVAL=0", "FREQ=DAILY;INTERVAL=1001", "FREQ=WEEKLY;BYDAY=1MO", "FREQ=WEEKLY;BYMONTHDAY=1", "FREQ=MONTHLY;BYWEEKNO=1", "FREQ=DAILY;BYYEARDAY=2", "FREQ=DAILY;BYSETPOS=1", "FREQ=MONTHLY;BYMONTHDAY=32", "FREQ=YEARLY;BYMONTH=13", "FREQ=DAILY;WKST=1MO", "FREQ=DAILY;UNTIL=20260904T120000Z", "FREQ=DAILY;UNTIL=20260910", "FREQ=DAILY;COUNT=2;UNTIL=20260910T120000Z", "FREQ=DAILY;DTSTART=20260906T120000Z", "FREQ=DAILY\nEXDATE:20260906T120000Z", "FREQ=YEARLY;BYEASTER=1"} {
		body := eventBody{Title: "Invalid", Start: "2026-09-05T12:00:00Z", Recurrence: rule}
		if err := validateEvent(&body); err == nil {
			t.Errorf("accepted %s", rule)
		}
	}
	for _, until := range []string{"20260910", "20260910T000000Z"} {
		body := eventBody{Title: "All day", Start: "2026-09-05", AllDay: true, Recurrence: "FREQ=DAILY;UNTIL=" + until}
		if err := validateEvent(&body); (err == nil) != (until == "20260910") {
			t.Fatal(until, err)
		}
	}
}

func TestInvalidRecurrenceDoesNotChangeEvent(t *testing.T) {
	_, h := testApp(t)
	cookie := owner(t, h)
	body := map[string]interface{}{"title": "Original", "start_date": "2026-09-05T12:00:00Z", "recurrence": "FREQ=WEEKLY"}
	if w := request(h, "POST", "/api/events", body, cookie); w.Code != 200 {
		t.Fatal(w.Body.String())
	}
	body["version"] = 1
	body["title"] = "Must not save"
	body["recurrence"] = "FREQ=MINUTELY"
	if w := request(h, "PUT", "/api/events/1", body, cookie); w.Code != 400 {
		t.Fatal(w.Code, w.Body.String())
	}
	if w := request(h, "GET", "/api/events/1", nil, cookie); !strings.Contains(w.Body.String(), `"title":"Original"`) || !strings.Contains(w.Body.String(), `"version":1`) {
		t.Fatal(w.Body.String())
	}
	if w := request(h, "POST", "/api/events", body, cookie); w.Code != 400 {
		t.Fatal(w.Code, w.Body.String())
	}
}
