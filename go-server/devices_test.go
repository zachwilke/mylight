package main

import (
	"bufio"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"
)

func pairTestDevice(t *testing.T, h http.Handler, ownerCookie *http.Cookie, canComplete bool) (*http.Cookie, int) {
	t.Helper()
	w := request(h, "POST", "/api/pairing", nil, nil)
	if w.Code != 200 {
		t.Fatal(w.Code, w.Body.String())
	}
	var code struct {
		Code string `json:"code"`
	}
	if err := json.Unmarshal(w.Body.Bytes(), &code); err != nil {
		t.Fatal(err)
	}
	cookie := w.Result().Cookies()[0]
	if cookie.Name != deviceCookie || !cookie.HttpOnly {
		t.Fatal("missing protected device proof")
	}
	w = request(h, "POST", "/api/devices/approve", map[string]interface{}{"name": "Kitchen", "code": code.Code, "can_complete_tasks": canComplete}, ownerCookie)
	if w.Code != 200 {
		t.Fatal(w.Code, w.Body.String())
	}
	var approved struct {
		ID int `json:"id"`
	}
	json.Unmarshal(w.Body.Bytes(), &approved)
	if w := request(h, "POST", "/api/devices/approve", map[string]string{"name": "Other", "code": code.Code}, ownerCookie); w.Code != 400 {
		t.Fatal("pairing code replay accepted", w.Code)
	}
	return cookie, approved.ID
}

func TestDisplayPairingAndCapabilities(t *testing.T) {
	app, h := testApp(t)
	ownerCookie := owner(t, h)
	cookie, id := pairTestDevice(t, h, ownerCookie, false)
	for _, path := range []string{"/api/events", "/api/chores", "/api/family", "/api/settings", "/api/meals", "/api/device", "/api/session"} {
		if w := request(h, "GET", path, nil, cookie); w.Code != 200 {
			t.Fatal(path, w.Code, w.Body.String())
		}
	}
	if w := request(h, "GET", "/api/session", nil, cookie); !strings.Contains(w.Body.String(), `"role":"display"`) {
		t.Fatal(w.Body.String())
	}
	if w := request(h, "GET", "/api/family", nil, cookie); strings.Contains(w.Body.String(), "parent@example.test") {
		t.Fatal("display received adult contact information")
	}
	app.Store.UpsertSetting("future_secret", "private-fixture")
	if w := request(h, "GET", "/api/settings", nil, cookie); strings.Contains(w.Body.String(), "private-fixture") {
		t.Fatal("display settings must be allowlisted")
	}
	for _, path := range []string{"/api/backup", "/api/calendars", "/api/devices", "/api/remote-access", "/api/history", "/api/search"} {
		if w := request(h, "GET", path, nil, cookie); w.Code != 403 {
			t.Fatal("display overprivileged", path, w.Code)
		}
	}
	for _, path := range []string{"/api/events", "/api/settings", "/api/family", "/api/chores", "/api/chores/reset", "/api/chores/1/toggle", "/api/photos", "/api/lists"} {
		if w := request(h, "POST", path, map[string]string{}, cookie); w.Code != 403 {
			t.Fatal("display mutation accepted", path, w.Code)
		}
	}
	var tokenHash string
	app.Store.DB.QueryRow("SELECT token_hash FROM paired_devices WHERE id=?", id).Scan(&tokenHash)
	if tokenHash == cookie.Value || tokenHash != hashToken(cookie.Value) {
		t.Fatal("device credential stored unhashed")
	}
	if w := request(h, "GET", "/api/pairing", nil, nil); strings.Contains(w.Body.String(), "approved") {
		t.Fatal("approval was stolen without browser proof")
	}
	app.Store.DB.Exec("UPDATE paired_devices SET revoked_at=? WHERE id=?", time.Now().Unix(), id)
	if w := request(h, "GET", "/api/events", nil, cookie); w.Code != 401 {
		t.Fatal("revoked display still reads household", w.Code)
	}
}

func TestDisplayTaskCompletionAndExpiry(t *testing.T) {
	app, h := testApp(t)
	own := owner(t, h)
	cookie, id := pairTestDevice(t, h, own, true)
	app.Store.DB.Exec("INSERT INTO chores(id,title,member_id,time_of_day) VALUES(91,'Feed cat',1,'Morning')")
	for i := 0; i < 2; i++ {
		if w := request(h, "POST", "/api/chores/91/toggle", map[string]bool{"completed": true}, cookie); w.Code != 200 {
			t.Fatal(w.Code, w.Body.String())
		}
	}
	var stars int
	app.Store.DB.QueryRow("SELECT stars FROM family_members WHERE id=1").Scan(&stars)
	if stars != 1 {
		t.Fatal("display retry double-awarded stars", stars)
	}
	if w := request(h, "DELETE", "/api/chores/91", nil, cookie); w.Code != 403 {
		t.Fatal("completion permission allowed deletion")
	}
	app.Store.DB.Exec("UPDATE paired_devices SET expires_at=1 WHERE id=?", id)
	if w := request(h, "GET", "/api/events", nil, cookie); w.Code != 401 {
		t.Fatal("expired device accepted")
	}
	w := request(h, "POST", "/api/pairing", nil, nil)
	var code map[string]interface{}
	json.Unmarshal(w.Body.Bytes(), &code)
	app.Store.DB.Exec("UPDATE pairing_requests SET expires_at=1")
	if w := request(h, "POST", "/api/devices/approve", map[string]interface{}{"code": code["code"], "name": "Expired"}, own); w.Code != 400 {
		t.Fatal("expired code approved")
	}
}

func TestDisplayRevocationClosesLiveUpdates(t *testing.T) {
	app, h := testApp(t)
	own := owner(t, h)
	cookie, id := pairTestDevice(t, h, own, false)
	server := httptest.NewServer(h)
	defer server.Close()
	client := &http.Client{Timeout: 3 * time.Second}
	req, _ := http.NewRequest("GET", server.URL+"/api/updates", nil)
	req.AddCookie(cookie)
	response, err := client.Do(req)
	if err != nil {
		t.Fatal(err)
	}
	defer response.Body.Close()
	app.Store.DB.Exec("UPDATE paired_devices SET revoked_at=? WHERE id=?", time.Now().Unix(), id)
	app.Broker.Notify("update")
	scanner := bufio.NewScanner(response.Body)
	expired := false
	for scanner.Scan() {
		if strings.Contains(scanner.Text(), "session-expired") {
			expired = true
		}
	}
	if err := scanner.Err(); err != nil {
		t.Fatal("revoked stream did not close", err)
	}
	if !expired {
		t.Fatal("stream closed without clearing browser authentication")
	}
}

func TestOwnerControlsDisplayPreferences(t *testing.T) {
	app, h := testApp(t)
	own := owner(t, h)
	cookie, id := pairTestDevice(t, h, own, true)
	body := map[string]interface{}{"name": "Kitchen", "can_complete_tasks": false, "preferences": map[string]string{"home_view": "week", "theme": "dark"}}
	path := fmt.Sprintf("/api/devices/%d", id)
	if w := request(h, "PUT", path, body, cookie); w.Code != 403 {
		t.Fatal("display changed its own permissions", w.Code)
	}
	if w := request(h, "PUT", path, body, own); w.Code != 200 {
		t.Fatal(w.Code, w.Body.String())
	}
	w := request(h, "GET", "/api/device", nil, cookie)
	if !strings.Contains(w.Body.String(), `"home_view":"week"`) || !strings.Contains(w.Body.String(), `"theme":"dark"`) {
		t.Fatal("preferences not persisted", w.Body.String())
	}
	if w := request(h, "POST", "/api/chores/91/toggle", map[string]bool{"completed": true}, cookie); w.Code != 403 {
		t.Fatal("permission downgrade not enforced", w.Code)
	}
	body["preferences"] = map[string]string{"home_view": "unsafe", "theme": "dark"}
	if w := request(h, "PUT", path, body, own); w.Code != 400 {
		t.Fatal("invalid preference accepted", w.Code)
	}
	var count int
	app.Store.DB.QueryRow("SELECT count(*) FROM paired_devices").Scan(&count)
	if count != 1 {
		t.Fatal(count)
	}
}
