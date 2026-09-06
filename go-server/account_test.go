package main

import (
	"encoding/json"
	"net/http"
	"strings"
	"testing"
)

func loginTestOwner(t *testing.T, h http.Handler) *http.Cookie {
	t.Helper()
	w := request(h, "POST", "/api/login", map[string]string{"email": "parent@example.test", "password": "test-password-123"}, nil)
	if w.Code != 200 {
		t.Fatal(w.Code, w.Body.String())
	}
	return w.Result().Cookies()[0]
}

func TestAccountPasswordRequiresConfirmationAndRevokesSessions(t *testing.T) {
	_, h := testApp(t)
	own := owner(t, h)
	other := loginTestOwner(t, h)
	device, _ := pairTestDevice(t, h, own, false)
	body := map[string]string{"current_password": "wrong-password", "new_password": "replacement-test-password"}
	if w := request(h, "POST", "/api/account/password", body, own); w.Code != 403 {
		t.Fatal(w.Code, w.Body.String())
	}
	body["current_password"] = "test-password-123"
	body["new_password"] = "short"
	if w := request(h, "POST", "/api/account/password", body, own); w.Code != 400 {
		t.Fatal(w.Code)
	}
	body["new_password"] = "replacement-test-password"
	if w := request(h, "POST", "/api/account/password", body, device); w.Code != 403 {
		t.Fatal("display accessed account", w.Code)
	}
	if w := request(h, "POST", "/api/account/password", body, own); w.Code != 200 {
		t.Fatal(w.Code, w.Body.String())
	}
	for _, cookie := range []*http.Cookie{own, other} {
		if w := request(h, "GET", "/api/events", nil, cookie); w.Code != 401 {
			t.Fatal("session survived password change")
		}
	}
	if w := request(h, "GET", "/api/events", nil, device); w.Code != 200 {
		t.Fatal("independent display grant lost", w.Code)
	}
	if w := request(h, "POST", "/api/login", map[string]string{"email": "parent@example.test", "password": "test-password-123"}, nil); w.Code != 401 {
		t.Fatal("old password accepted")
	}
	if w := request(h, "POST", "/api/login", map[string]string{"email": "parent@example.test", "password": body["new_password"]}, nil); w.Code != 200 {
		t.Fatal(w.Code)
	}
}

func TestSessionHandlesAreScopedAndCannotAuthenticate(t *testing.T) {
	app, h := testApp(t)
	own := owner(t, h)
	other := loginTestOwner(t, h)
	w := request(h, "GET", "/api/account/sessions", nil, own)
	var sessions []struct {
		ID      string `json:"id"`
		Current bool   `json:"current"`
	}
	if w.Code != 200 || json.Unmarshal(w.Body.Bytes(), &sessions) != nil || len(sessions) != 2 {
		t.Fatal(w.Code, w.Body.String())
	}
	var target string
	for _, session := range sessions {
		if strings.Contains(w.Body.String(), hashToken(own.Value)) || strings.Contains(w.Body.String(), own.Value) {
			t.Fatal("session verifier leaked")
		}
		if !session.Current {
			target = session.ID
		}
		if w := request(h, "GET", "/api/events", nil, &http.Cookie{Name: sessionCookie, Value: session.ID}); w.Code != 401 {
			t.Fatal("session handle authenticated")
		}
	}
	// A target belonging to a different member must not be revoked.
	result, err := app.Store.DB.Exec("INSERT INTO family_members(name,role) VALUES('Other account','child')")
	if err != nil {
		t.Fatal(err)
	}
	id, _ := result.LastInsertId()
	if _, err := app.Store.DB.Exec("INSERT INTO sessions(token_hash,member_id,expires_at) VALUES(?,?,9999999999)", hashToken("other-member-cookie"), id); err != nil {
		t.Fatal(err)
	}
	body := map[string]string{"current_password": "test-password-123", "session_id": sessionHandle(hashToken("other-member-cookie"))}
	if w := request(h, "POST", "/api/account/sessions/revoke", body, own); w.Code != 404 {
		t.Fatal("cross-account revoke", w.Code)
	}
	body["session_id"] = target
	body["current_password"] = "incorrect-password"
	if w := request(h, "POST", "/api/account/sessions/revoke", body, own); w.Code != 403 {
		t.Fatal(w.Code)
	}
	body["current_password"] = "test-password-123"
	if w := request(h, "POST", "/api/account/sessions/revoke", body, own); w.Code != 200 {
		t.Fatal(w.Code, w.Body.String())
	}
	if w := request(h, "GET", "/api/events", nil, other); w.Code != 401 {
		t.Fatal("revoked session survived")
	}
	if w := request(h, "GET", "/api/events", nil, own); w.Code != 200 {
		t.Fatal("current session lost")
	}
}
