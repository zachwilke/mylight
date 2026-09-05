package main

import (
	"encoding/json"
	"strings"
	"testing"
)

func TestEventVersionConcurrencyAndDelete(t *testing.T) {
	_, h := testApp(t)
	cookie := owner(t, h)
	base := map[string]interface{}{"title": "Original", "start_date": "2026-09-05T12:00:00Z", "member_ids": []int{1}}
	if w := request(h, "POST", "/api/events", base, cookie); w.Code != 200 {
		t.Fatal(w.Code, w.Body.String())
	}
	if w := request(h, "PUT", "/api/events/1", base, cookie); w.Code != 428 {
		t.Fatal(w.Code, w.Body.String())
	}
	for _, path := range []string{"/api/events/1", "/api/events/1?version=bad", "/api/events/1?version=1&version=1"} {
		if w := request(h, "DELETE", path, nil, cookie); w.Code != 428 {
			t.Fatal(w.Code, w.Body.String())
		}
	}
	results := make(chan int, 2)
	for _, title := range []string{"Phone edit", "Wall edit"} {
		go func(title string) {
			results <- request(h, "PUT", "/api/events/1", map[string]interface{}{"title": title, "start_date": base["start_date"], "member_ids": []int{1}, "version": 1}, cookie).Code
		}(title)
	}
	a, b := <-results, <-results
	if !((a == 200 && b == 409) || (a == 409 && b == 200)) {
		t.Fatal("expected one winning write", a, b)
	}
	w := request(h, "GET", "/api/events/1", nil, cookie)
	var latest struct {
		Version int
		Title   string
	}
	if err := json.Unmarshal(w.Body.Bytes(), &latest); err != nil || w.Code != 200 || latest.Version != 2 {
		t.Fatal(w.Code, w.Body.String(), err)
	}
	if latest.Title != "Phone edit" && latest.Title != "Wall edit" {
		t.Fatal(latest)
	}
	if w := request(h, "DELETE", "/api/events/1?version=1", nil, cookie); w.Code != 409 {
		t.Fatal(w.Code, w.Body.String())
	}
	if w := request(h, "DELETE", "/api/events/1?version=2", nil, cookie); w.Code != 200 {
		t.Fatal(w.Code, w.Body.String())
	}
	if w := request(h, "GET", "/api/events/1", nil, cookie); w.Code != 404 {
		t.Fatal(w.Code, w.Body.String())
	}
	base["version"] = 2
	if w := request(h, "PUT", "/api/events/1", base, cookie); w.Code != 404 {
		t.Fatal("resurrected deleted event", w.Code, w.Body.String())
	}
}

func TestParticipantRemovalInvalidatesOpenEvent(t *testing.T) {
	_, h := testApp(t)
	cookie := owner(t, h)
	if w := request(h, "POST", "/api/family", map[string]string{"name": "Child"}, cookie); w.Code != 200 {
		t.Fatal(w.Body.String())
	}
	base := map[string]interface{}{"title": "Together", "start_date": "2026-09-05T12:00:00Z", "member_ids": []int{1, 2}}
	if w := request(h, "POST", "/api/events", base, cookie); w.Code != 200 {
		t.Fatal(w.Body.String())
	}
	if w := request(h, "DELETE", "/api/family/2", nil, cookie); w.Code != 200 {
		t.Fatal(w.Body.String())
	}
	base["version"] = 1
	if w := request(h, "PUT", "/api/events/1", base, cookie); w.Code != 409 {
		t.Fatal(w.Code, w.Body.String())
	}
	if w := request(h, "GET", "/api/events/1", nil, cookie); w.Code != 200 || !strings.Contains(w.Body.String(), `"version":2`) || !strings.Contains(w.Body.String(), `"member_ids":[1]`) {
		t.Fatal(w.Code, w.Body.String())
	}
}
