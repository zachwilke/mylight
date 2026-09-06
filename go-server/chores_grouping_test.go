package main

import (
	"encoding/json"
	"mylight/store"
	"testing"
)

func TestIDGroupedChoresKeepDuplicateNamesSeparate(t *testing.T) {
	app, h := testApp(t)
	cookie := owner(t, h)
	if _, err := app.Store.DB.Exec("UPDATE family_members SET name='Alex' WHERE id=1; INSERT INTO family_members(name) VALUES('Alex')"); err != nil {
		t.Fatal(err)
	}
	for _, id := range []int{1, 2} {
		if w := request(h, "POST", "/api/chores", map[string]interface{}{"title": "Practice", "member_id": id, "time_of_day": "Morning"}, cookie); w.Code != 200 {
			t.Fatal(w.Code, w.Body.String())
		}
	}
	read := func(path string) map[string][]store.Chore {
		t.Helper()
		w := request(h, "GET", path, nil, cookie)
		var groups map[string][]store.Chore
		if w.Code != 200 {
			t.Fatal(w.Code, w.Body.String())
		}
		if err := json.Unmarshal(w.Body.Bytes(), &groups); err != nil {
			t.Fatal(err)
		}
		return groups
	}
	groups := read("/api/chores?group_by=member_id")
	if len(groups["1"]) != 1 || len(groups["2"]) != 1 || groups["1"][0].MemberID != 1 || groups["2"][0].MemberID != 2 {
		t.Fatal(groups)
	}
	if len(read("/api/chores")["Alex"]) != 2 {
		t.Fatal("legacy grouping lost chores")
	}
	if _, err := app.Store.DB.Exec("UPDATE family_members SET name='Casey' WHERE id=2"); err != nil {
		t.Fatal(err)
	}
	if read("/api/chores?group_by=member_id")["2"][0].MemberName != "Casey" {
		t.Fatal("rename changed identity")
	}
	for _, path := range []string{"/api/chores?group_by=name", "/api/chores?group_by=member_id&group_by=member_id"} {
		if w := request(h, "GET", path, nil, cookie); w.Code != 400 {
			t.Fatal(path, w.Code)
		}
	}
}
