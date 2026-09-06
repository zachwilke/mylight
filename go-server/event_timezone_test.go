package main

import (
	"encoding/json"
	"testing"
)

func TestEventTimezoneValidationAndPersistence(t *testing.T) {
	_, h := testApp(t)
	cookie := owner(t, h)
	body := map[string]interface{}{"title": "Practice", "start_date": "2026-03-07T15:00:00Z", "timezone": "America/Chicago", "recurrence": "FREQ=DAILY;COUNT=3"}
	if w := request(h, "POST", "/api/events", body, cookie); w.Code != 200 {
		t.Fatal(w.Code, w.Body.String())
	}
	for _, zone := range []string{"Local", "../UTC", "/etc/passwd", "America/Missing", "UTC\r\nBad:value"} {
		body["timezone"] = zone
		if w := request(h, "POST", "/api/events", body, cookie); w.Code != 400 {
			t.Fatal(zone, w.Code, w.Body.String())
		}
	}
	body["version"] = 1
	delete(body, "timezone")
	if w := request(h, "PUT", "/api/events/1", body, cookie); w.Code != 200 {
		t.Fatal(w.Code, w.Body.String())
	}
	w := request(h, "GET", "/api/events/1", nil, cookie)
	var event map[string]interface{}
	if err := json.Unmarshal(w.Body.Bytes(), &event); err != nil {
		t.Fatal(err)
	}
	if event["timezone"] != "America/Chicago" || event["version"] != float64(2) {
		t.Fatal(event)
	}
}
