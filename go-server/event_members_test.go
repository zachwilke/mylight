package main

import (
	"strings"
	"testing"
)

func TestEventParticipantAPI(t *testing.T) {
	_, h := testApp(t)
	cookie := owner(t, h)
	if w := request(h, "POST", "/api/family", map[string]string{"name": "Alex"}, cookie); w.Code != 200 {
		t.Fatal(w.Body.String())
	}
	body := map[string]interface{}{"title": "Together", "start_date": "2026-09-05T12:00:00Z", "member_ids": []int{2, 1}, "version": 1}
	if w := request(h, "POST", "/api/events", body, cookie); w.Code != 200 {
		t.Fatal(w.Code, w.Body.String())
	}
	if w := request(h, "GET", "/api/events?start=2026-09-05T00:00:00Z&end=2026-09-06T00:00:00Z", nil, cookie); w.Code != 200 || !strings.Contains(w.Body.String(), `"member_ids":[1,2]`) {
		t.Fatal(w.Code, w.Body.String())
	}
	for _, ids := range []interface{}{[]int{999}, []int{1, 1}, []int{0}, "invalid"} {
		body["member_ids"] = ids
		if w := request(h, "PUT", "/api/events/1", body, cookie); w.Code != 400 {
			t.Fatal(w.Code, w.Body.String())
		}
	}
	delete(body, "member_ids")
	body["member_id"] = 1
	if w := request(h, "PUT", "/api/events/1", body, cookie); w.Code != 409 {
		t.Fatal(w.Code, w.Body.String())
	}
	body["member_ids"] = []int{}
	if w := request(h, "PUT", "/api/events/1", body, cookie); w.Code != 200 {
		t.Fatal(w.Code, w.Body.String())
	}
	if w := request(h, "GET", "/api/events", nil, cookie); !strings.Contains(w.Body.String(), `"member_ids":[]`) {
		t.Fatal(w.Body.String())
	}
	if w := request(h, "PUT", "/api/events/999", body, cookie); w.Code != 404 {
		t.Fatal(w.Code, w.Body.String())
	}
	delete(body, "member_ids")
	body["version"] = 2
	if w := request(h, "PUT", "/api/events/1", body, cookie); w.Code != 200 {
		t.Fatal("legacy single-person update failed", w.Code, w.Body.String())
	}
	if w := request(h, "GET", "/api/events", nil, cookie); !strings.Contains(w.Body.String(), `"member_ids":[1]`) {
		t.Fatal("legacy assignment not retained", w.Body.String())
	}
}
