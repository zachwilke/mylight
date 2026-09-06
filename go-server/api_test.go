package main

import (
	"bytes"
	"database/sql"
	"encoding/json"
	"mylight/store"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func testApp(t *testing.T) (*App, http.Handler) {
	t.Helper()
	dir := t.TempDir()
	s, err := store.NewStore(filepath.Join(dir, "test.db"))
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { s.Close() })
	uploads := filepath.Join(dir, "uploads")
	if err := os.Mkdir(uploads, 0700); err != nil {
		t.Fatal(err)
	}
	app := &App{Store: s, Broker: NewBroker(), Config: Config{UploadsDir: uploads, DbPath: filepath.Join(dir, "test.db")}}
	return app, app.routes()
}
func request(handler http.Handler, method, path string, body interface{}, cookie *http.Cookie) *httptest.ResponseRecorder {
	var b bytes.Buffer
	if body != nil {
		json.NewEncoder(&b).Encode(body)
	}
	r := httptest.NewRequest(method, path, &b)
	r.Header.Set("Content-Type", "application/json")
	r.Header.Set("X-MyLight-Request", "1")
	if cookie != nil {
		r.AddCookie(cookie)
	}
	w := httptest.NewRecorder()
	handler.ServeHTTP(w, r)
	return w
}
func owner(t *testing.T, h http.Handler) *http.Cookie {
	t.Helper()
	w := request(h, "POST", "/api/setup", map[string]string{"name": "Parent", "email": "parent@example.test", "password": "test-password-123", "family_name": "Test family", "timezone": "America/Chicago"}, nil)
	if w.Code != 200 {
		t.Fatalf("setup: %d %s", w.Code, w.Body.String())
	}
	cookies := w.Result().Cookies()
	if len(cookies) != 1 || !cookies[0].HttpOnly {
		t.Fatal("missing protected cookie")
	}
	return cookies[0]
}
func TestSetupAndSessions(t *testing.T) {
	_, h := testApp(t)
	if w := request(h, "GET", "/api/family", nil, nil); w.Code != 401 {
		t.Fatal(w.Code)
	}
	cookie := owner(t, h)
	if w := request(h, "POST", "/api/setup", map[string]string{"name": "Other", "email": "other@example.test", "password": "test-password-123", "timezone": "UTC"}, nil); w.Code != 409 {
		t.Fatal(w.Code, w.Body.String())
	}
	if w := request(h, "GET", "/api/session", nil, cookie); w.Code != 200 {
		t.Fatal(w.Code)
	}
	r := httptest.NewRequest("POST", "/api/settings", strings.NewReader(`{"key":"family_name","value":"Attacker"}`))
	r.AddCookie(cookie)
	w := httptest.NewRecorder()
	h.ServeHTTP(w, r)
	if w.Code != 403 {
		t.Fatal("CSRF accepted", w.Code)
	}
	r = httptest.NewRequest("POST", "/api/settings", strings.NewReader(`{"key":"family_name","value":"Attacker"}`))
	r.AddCookie(cookie)
	r.Header.Set("X-MyLight-Request", "1")
	r.Header.Set("Origin", "https://attacker.example")
	w = httptest.NewRecorder()
	h.ServeHTTP(w, r)
	if w.Code != 403 {
		t.Fatal("cross origin accepted", w.Code)
	}
	if w = request(h, "DELETE", "/api/session", nil, cookie); w.Code != 200 {
		t.Fatal(w.Code)
	}
	if w = request(h, "GET", "/api/family", nil, cookie); w.Code != 401 {
		t.Fatal("revoked session accepted")
	}
}

func TestAuthenticationRateLimit(t *testing.T) {
	_, h := testApp(t)
	for i := 0; i < 20; i++ {
		request(h, "POST", "/api/login", map[string]string{}, nil)
	}
	if w := request(h, "POST", "/api/login", map[string]string{}, nil); w.Code != 429 {
		t.Fatalf("expected rate limit, got %d", w.Code)
	}
}

func TestNonOwnerCannotAdministerHousehold(t *testing.T) {
	_, h := testApp(t)
	cookie := owner(t, h)
	w := request(h, "POST", "/api/family", map[string]string{"name": "Adult", "email": "adult@example.test", "password": "test-password-123"}, cookie)
	if w.Code != 200 {
		t.Fatal(w.Code, w.Body.String())
	}
	w = request(h, "POST", "/api/login", map[string]string{"email": "adult@example.test", "password": "test-password-123"}, nil)
	if w.Code != 200 || len(w.Result().Cookies()) != 1 {
		t.Fatal("adult sign in failed", w.Code)
	}
	adult := w.Result().Cookies()[0]
	for _, path := range []string{"/api/family", "/api/settings", "/api/calendars"} {
		if w = request(h, "POST", path, map[string]string{}, adult); w.Code != 403 {
			t.Fatal("non-owner mutation accepted", path, w.Code)
		}
	}
	if w = request(h, "GET", "/api/backup", nil, adult); w.Code != 403 {
		t.Fatal("non-owner backup accepted", w.Code)
	}
	if w = request(h, "GET", "/api/events", nil, adult); w.Code != 200 {
		t.Fatal("adult cannot read calendar", w.Code)
	}
}

func TestLegacyMigrationPreservesEvents(t *testing.T) {
	path := filepath.Join(t.TempDir(), "legacy.db")
	db, err := sql.Open("sqlite", path)
	if err != nil {
		t.Fatal(err)
	}
	_, err = db.Exec(`CREATE TABLE events (id INTEGER PRIMARY KEY, title TEXT, start_date TEXT, member_id INTEGER, recurrence TEXT);
INSERT INTO events VALUES(1,'Existing appointment','2026-09-05T15:00:00Z',NULL,NULL);`)
	db.Close()
	if err != nil {
		t.Fatal(err)
	}
	for i := 0; i < 2; i++ {
		s, err := store.NewStore(path)
		if err != nil {
			t.Fatal(err)
		}
		events, err := s.GetEvents()
		s.Close()
		if err != nil || len(events) != 1 {
			t.Fatal("legacy event lost on migration", err, events)
		}
	}
}

func TestMealMovePreservesIdentityAndRejectsOverwrite(t *testing.T) {
	app, h := testApp(t)
	cookie := owner(t, h)
	for _, day := range []string{"2026-09-05", "2026-09-06"} {
		w := request(h, "POST", "/api/meals", map[string]string{"date": day, "type": "Dinner", "title": "Pizza", "color": "green"}, cookie)
		if w.Code != 200 {
			t.Fatal(w.Code)
		}
	}
	w := request(h, "PUT", "/api/meals/1", map[string]string{"date": "2026-09-06", "type": "Dinner"}, cookie)
	if w.Code != 409 {
		t.Fatalf("occupied slot accepted: %d", w.Code)
	}
	w = request(h, "PUT", "/api/meals/1", map[string]string{"date": "2026-09-07", "type": "Dinner"}, cookie)
	if w.Code != 200 {
		t.Fatal(w.Code, w.Body.String())
	}
	var date string
	if err := app.Store.DB.QueryRow("SELECT date FROM meals WHERE id=1").Scan(&date); err != nil || date != "2026-09-07" {
		t.Fatal("source meal identity lost", err, date)
	}
	var count int
	if err := app.Store.DB.QueryRow("SELECT count(*) FROM meals").Scan(&count); err != nil || count != 2 {
		t.Fatal("move changed meal count", err, count)
	}
	w = request(h, "PUT", "/api/meals/1", map[string]string{"date": "2026-09-07", "type": "Snack"}, cookie)
	if w.Code != 200 {
		t.Fatal("snack move rejected", w.Code)
	}
}

func TestInvalidEventDates(t *testing.T) {
	_, h := testApp(t)
	cookie := owner(t, h)
	for _, body := range []map[string]interface{}{
		{"title": " ", "start_date": "2026-09-05T15:00:00Z"},
		{"title": "Bad date", "start_date": "not a date"},
		{"title": "Backwards", "start_date": "2026-09-05T15:00:00Z", "end_date": "2026-09-05T14:00:00Z"},
	} {
		for _, method := range []string{"POST", "PUT"} {
			path := "/api/events"
			if method == "PUT" {
				path += "/1"
			}
			if w := request(h, method, path, body, cookie); w.Code != 400 {
				t.Fatalf("invalid event accepted: %d %s", w.Code, w.Body.String())
			}
		}
	}
}

func TestUnsafeImageRejected(t *testing.T) {
	app, _ := testApp(t)
	for _, content := range []string{"<svg xmlns=\"http://www.w3.org/2000/svg\"><script>alert(1)</script></svg>", "<html>not an image</html>"} {
		if _, err := app.saveImage(strings.NewReader(content)); err == nil {
			t.Fatal("accepted active content as an image")
		}
	}
	files, err := os.ReadDir(app.Config.UploadsDir)
	if err != nil || len(files) != 0 {
		t.Fatal("rejected upload left files behind")
	}
}
func TestOrdinaryEventLifecycle(t *testing.T) {
	_, h := testApp(t)
	cookie := owner(t, h)
	w := request(h, "POST", "/api/events", map[string]interface{}{"title": "Dentist", "start_date": "2026-09-05T15:00:00Z", "member_id": 1}, cookie)
	if w.Code != 200 {
		t.Fatal(w.Body.String())
	}
	w = request(h, "GET", "/api/events", nil, cookie)
	if w.Code != 200 || !strings.Contains(w.Body.String(), "Dentist") {
		t.Fatal(w.Code, w.Body.String())
	}
	w = request(h, "PUT", "/api/events/1", map[string]interface{}{"title": "Moved dentist", "start_date": "2026-09-06T15:00:00Z", "version": 1}, cookie)
	if w.Code != 200 {
		t.Fatal(w.Body.String())
	}
	w = request(h, "DELETE", "/api/events/1?version=2", nil, cookie)
	if w.Code != 200 {
		t.Fatal(w.Body.String())
	}
	w = request(h, "GET", "/api/events", nil, cookie)
	if strings.TrimSpace(w.Body.String()) != "[]" {
		t.Fatal(w.Body.String())
	}
	w = request(h, "GET", "/api/missing", nil, cookie)
	if w.Code != 404 || !strings.Contains(w.Header().Get("Content-Type"), "json") {
		t.Fatal(w.Code, w.Body.String())
	}
}
func TestFamilyChoresAndLists(t *testing.T) {
	app, h := testApp(t)
	cookie := owner(t, h)
	w := request(h, "POST", "/api/family", map[string]string{"name": "Child"}, cookie)
	if w.Code != 200 || !strings.Contains(w.Body.String(), `"name":"Child"`) {
		t.Fatal(w.Body.String())
	}
	w = request(h, "PUT", "/api/family/2", map[string]string{"name": "New name", "phone": "123", "color": "bg-blue-100 text-blue-800"}, cookie)
	if w.Code != 200 {
		t.Fatal(w.Body.String())
	}
	member, err := app.Store.GetFamilyMember(2)
	if err != nil || member.Name != "New name" {
		t.Fatal(member, err)
	}
	w = request(h, "POST", "/api/chores", map[string]interface{}{"title": "Make bed", "member_id": 2, "time_of_day": "Morning"}, cookie)
	if w.Code != 200 {
		t.Fatal(w.Body.String())
	}
	for i := 0; i < 3; i++ {
		w = request(h, "POST", "/api/chores/1/toggle", map[string]bool{"completed": true}, cookie)
		if w.Code != 200 {
			t.Fatal(w.Body.String())
		}
	}
	member, _ = app.Store.GetFamilyMember(2)
	if member.Stars != 1 {
		t.Fatal("duplicate stars", member.Stars)
	}
	for i := 0; i < 2; i++ {
		request(h, "POST", "/api/chores/1/toggle", map[string]bool{"completed": false}, cookie)
	}
	member, _ = app.Store.GetFamilyMember(2)
	if member.Stars != 0 {
		t.Fatal(member.Stars)
	}
	w = request(h, "POST", "/api/lists", map[string]string{"title": "Groceries"}, cookie)
	if w.Code != 200 {
		t.Fatal(w.Body.String())
	}
	w = request(h, "POST", "/api/items", map[string]interface{}{"list_id": 1, "text": "Milk"}, cookie)
	if w.Code != 200 {
		t.Fatal(w.Body.String())
	}
	w = request(h, "POST", "/api/items/1/toggle", map[string]bool{"completed": true}, cookie)
	if w.Code != 200 {
		t.Fatal(w.Body.String())
	}
	w = request(h, "GET", "/api/lists/1/items", nil, cookie)
	if !strings.Contains(w.Body.String(), `"completed":true`) {
		t.Fatal(w.Body.String())
	}
	for _, path := range []string{"/api/items/1", "/api/lists/1", "/api/chores/1", "/api/family/2"} {
		w = request(h, "DELETE", path, nil, cookie)
		if w.Code != 200 {
			t.Fatal(path, w.Code, w.Body.String())
		}
	}
}

func TestBackupRestore(t *testing.T) {
	app, h := testApp(t)
	cookie := owner(t, h)
	pairTestDevice(t, h, cookie, false)
	if _, err := app.Store.DB.Exec("INSERT INTO calendar_sources(url,name,color,events_json) VALUES(?,?,?,?)", "https://calendar.example.test/secret-test-link", "School", "blue", "[]"); err != nil {
		t.Fatal(err)
	}
	if w := request(h, "POST", "/api/family", map[string]string{"name": "Child"}, cookie); w.Code != 200 {
		t.Fatal(w.Body.String())
	}
	if w := request(h, "POST", "/api/events", map[string]interface{}{"title": "Keep this", "start_date": "2026-09-05T15:00:00Z", "timezone": "America/Chicago", "member_ids": []int{1, 2}}, cookie); w.Code != 200 {
		t.Fatal(w.Body.String())
	}
	w := request(h, "GET", "/api/backup", nil, cookie)
	if w.Code != 200 {
		t.Fatal(w.Code, w.Body.String())
	}
	dir := t.TempDir()
	archive := filepath.Join(dir, "backup.zip")
	if err := os.WriteFile(archive, w.Body.Bytes(), 0600); err != nil {
		t.Fatal(err)
	}
	destination := filepath.Join(dir, "restored")
	if err := restoreBackup(archive, destination); err != nil {
		t.Fatal(err)
	}
	restored, err := store.NewStore(filepath.Join(destination, "mylight.db"))
	if err != nil {
		t.Fatal(err)
	}
	defer restored.Close()
	events, err := restored.GetEvents()
	if err != nil || len(events) != 1 {
		t.Fatal(events, err)
	}
	ids := events[0].(map[string]interface{})["member_ids"].([]int)
	if events[0].(map[string]interface{})["timezone"] != "America/Chicago" {
		t.Fatal("backup lost event timezone")
	}
	if len(ids) != 2 || ids[0] != 1 || ids[1] != 2 {
		t.Fatal("backup lost event participants", ids)
	}
	var sessions int
	var sourceURL string
	if err := restored.DB.QueryRow("SELECT url FROM calendar_sources WHERE name='School'").Scan(&sourceURL); err != nil || sourceURL != "https://calendar.example.test/secret-test-link" {
		t.Fatal("backup lost subscription credentials", err)
	}
	if err = restored.DB.QueryRow("SELECT count(*) FROM sessions").Scan(&sessions); err != nil || sessions != 0 {
		t.Fatal("restored active sessions", sessions, err)
	}
	if err = restored.DB.QueryRow("SELECT count(*) FROM paired_devices").Scan(&sessions); err != nil || sessions != 0 {
		t.Fatal("restored device credentials", sessions, err)
	}
	if err = os.WriteFile(filepath.Join(destination, "unrelated.txt"), []byte("do not touch"), 0600); err != nil {
		t.Fatal(err)
	}
	if err = restoreBackup(archive, destination); err == nil {
		t.Fatal("restore accepted unrelated directory")
	}
}
