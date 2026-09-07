package main

import (
	"context"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"io"
	"mylight/store"
	"net/http"
	"net/http/httptest"
	"net/url"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"golang.org/x/oauth2"
)

type googleTransport func(*http.Request) (*http.Response, error)

func (f googleTransport) RoundTrip(r *http.Request) (*http.Response, error) { return f(r) }
func configureGoogle(t *testing.T, app *App, f func(*http.Request) (int, string)) {
	t.Helper()
	t.Setenv("MYLIGHT_GOOGLE_CLIENT_ID", "client-test")
	t.Setenv("MYLIGHT_GOOGLE_CLIENT_SECRET", "client-secret-test")
	t.Setenv("MYLIGHT_GOOGLE_REDIRECT_URL", "https://example.com/google/callback")
	t.Setenv("MYLIGHT_GOOGLE_TOKEN_KEY", base64.StdEncoding.EncodeToString(make([]byte, 32)))
	var err error
	app.Google, err = loadGoogleConnection()
	if err != nil {
		t.Fatal(err)
	}
	app.Google.HTTP.Transport = googleTransport(func(r *http.Request) (*http.Response, error) {
		status, body := f(r)
		return &http.Response{StatusCode: status, Body: io.NopCloser(strings.NewReader(body)), Header: http.Header{"Content-Type": {"application/json"}}}, nil
	})
}
func googleAccount(t *testing.T, app *App, expired bool) int {
	t.Helper()
	expiry := time.Now().Add(time.Hour)
	if expired {
		expiry = time.Now().Add(-time.Hour)
	}
	token := oauth2.Token{AccessToken: "private-access", RefreshToken: "private-refresh", Expiry: expiry, TokenType: "Bearer"}
	raw, _ := json.Marshal(token)
	res, err := app.Store.DB.Exec("INSERT INTO google_accounts(subject,token) VALUES(?,?)", "subject-test", app.Google.seal(raw, "google-token:subject-test"))
	if err != nil {
		t.Fatal(err)
	}
	id, _ := res.LastInsertId()
	return int(id)
}
func googleSource(t *testing.T, app *App, account int) calendarSource {
	t.Helper()
	res, err := app.Store.DB.Exec("INSERT INTO calendar_sources(url,name,color) VALUES('google:test','Google Test','blue')")
	if err != nil {
		t.Fatal(err)
	}
	id, _ := res.LastInsertId()
	_, err = app.Store.DB.Exec("INSERT INTO google_calendars(source_id,account_id,calendar_id) VALUES(?,?,'primary')", id, account)
	if err != nil {
		t.Fatal(err)
	}
	return calendarSource{ID: int(id)}
}
func TestGoogleOAuthStatePKCEAndReplay(t *testing.T) {
	app, h := testApp(t)
	ownerCookie := owner(t, h)
	calls := 0
	verifier := ""
	configureGoogle(t, app, func(r *http.Request) (int, string) {
		calls++
		switch r.URL.Host {
		case "oauth2.googleapis.com":
			r.ParseForm()
			verifier = r.Form.Get("code_verifier")
			if r.Method != "POST" || r.Form.Get("code") != "test-code" || r.Form.Get("redirect_uri") != "https://example.com/google/callback" || r.Form.Get("client_secret") != "client-secret-test" {
				t.Fatal("invalid exchange")
			}
			return 200, `{"access_token":"private-access","refresh_token":"private-refresh","expires_in":3600,"token_type":"Bearer","scope":"openid https://www.googleapis.com/auth/calendar.events.readonly https://www.googleapis.com/auth/calendar.calendarlist.readonly"}`
		case "openidconnect.googleapis.com":
			if r.Header.Get("Authorization") != "Bearer private-access" {
				t.Fatal("missing userinfo auth")
			}
			return 200, `{"sub":"subject-test"}`
		default:
			t.Fatal("unexpected request", r.URL)
			return 500, ""
		}
	})
	w := request(h, "POST", "/api/google/connect", nil, ownerCookie)
	if w.Code != 200 {
		t.Fatal(w.Code, w.Body.String())
	}
	var response map[string]string
	json.Unmarshal(w.Body.Bytes(), &response)
	auth, _ := url.Parse(response["url"])
	q := auth.Query()
	if q.Get("code_challenge_method") != "S256" || q.Get("state") == "" || q.Get("access_type") != "offline" || strings.Contains(q.Get("scope"), "calendar.events ") {
		t.Fatal(q)
	}
	cookies := w.Result().Cookies()
	if len(cookies) != 1 || !cookies[0].HttpOnly || !cookies[0].Secure || cookies[0].SameSite != http.SameSiteLaxMode {
		t.Fatal(cookies)
	}
	callback := "/google/callback?code=test-code&state=" + q.Get("state")
	if result := request(h, "GET", callback, nil, nil); !strings.Contains(result.Header().Get("Location"), "failed") || calls != 0 {
		t.Fatal("accepted callback without browser binding")
	}
	if wrong := request(h, "GET", "/google/callback?state=unknown&code=c", nil, cookies[0]); len(wrong.Result().Cookies()) != 0 || calls != 0 {
		t.Fatal("unknown state cleared the valid browser nonce")
	}
	result := request(h, "GET", callback, nil, cookies[0])
	if result.Code != 303 || !strings.Contains(result.Header().Get("Location"), "connected") {
		t.Fatal(result.Code, result.Header())
	}
	if oauth2.S256ChallengeFromVerifier(verifier) != q.Get("code_challenge") {
		t.Fatal("PKCE did not match")
	}
	if result := request(h, "GET", callback, nil, cookies[0]); !strings.Contains(result.Header().Get("Location"), "failed") || calls != 2 {
		t.Fatal("callback replayed")
	}
	var sealed string
	app.Store.DB.QueryRow("SELECT token FROM google_accounts").Scan(&sealed)
	if strings.Contains(sealed, "private-") {
		t.Fatal("tokens stored in plaintext")
	}
	plain, err := app.Google.open(sealed, "google-token:subject-test")
	if err != nil || !strings.Contains(string(plain), "private-refresh") {
		t.Fatal("cannot decrypt saved token")
	}
	if _, err := app.Google.open(sealed, "google-token:different-account"); err == nil {
		t.Fatal("token not bound to account")
	}
	w = request(h, "GET", "/api/google", nil, ownerCookie)
	if strings.Contains(w.Body.String(), "private") || strings.Contains(w.Body.String(), "subject-test") || !strings.Contains(w.Body.String(), `"configured":true`) {
		t.Fatal(w.Body.String())
	}
}
func TestGoogleOAuthRevokedSessionAndWrongOrigin(t *testing.T) {
	app, h := testApp(t)
	cookie := owner(t, h)
	configureGoogle(t, app, func(*http.Request) (int, string) { t.Fatal("revoked flow used network"); return 500, "" })
	req := httptest.NewRequest("POST", "https://wrong.example/api/google/connect", nil)
	req.AddCookie(cookie)
	req.Header.Set("X-MyLight-Request", "1")
	w := httptest.NewRecorder()
	h.ServeHTTP(w, req)
	if w.Code != 400 {
		t.Fatal(w.Code)
	}
	w = request(h, "POST", "/api/google/connect", nil, cookie)
	var body map[string]string
	json.Unmarshal(w.Body.Bytes(), &body)
	u, _ := url.Parse(body["url"])
	app.Store.DB.Exec("DELETE FROM sessions")
	result := request(h, "GET", "/google/callback?code=c&state="+u.Query().Get("state"), nil, w.Result().Cookies()[0])
	if !strings.Contains(result.Header().Get("Location"), "failed") {
		t.Fatal(result.Header())
	}
	var count int
	app.Store.DB.QueryRow("SELECT count(*) FROM google_oauth_states").Scan(&count)
	if count != 0 {
		t.Fatal("session revocation retained OAuth state")
	}
}
func TestGoogleTokenRotationPersistedBeforeUse(t *testing.T) {
	app, _ := testApp(t)
	calls := 0
	configureGoogle(t, app, func(r *http.Request) (int, string) {
		calls++
		if r.URL.Host != "oauth2.googleapis.com" {
			t.Fatal(r.URL)
		}
		return 200, `{"access_token":"new-access","refresh_token":"rotated-refresh","expires_in":3600,"token_type":"Bearer"}`
	})
	id := googleAccount(t, app, true)
	if _, err := app.googleClient(context.Background(), id); err != nil {
		t.Fatal(err)
	}
	if _, err := app.googleClient(context.Background(), id); err != nil || calls != 1 {
		t.Fatal(err, calls)
	}
	var sealed string
	app.Store.DB.QueryRow("SELECT token FROM google_accounts WHERE id=?", id).Scan(&sealed)
	raw, err := app.Google.open(sealed, "google-token:subject-test")
	if err != nil || !strings.Contains(string(raw), "rotated-refresh") {
		t.Fatal("rotation not durable", err)
	}
}
func TestGoogleAtomicSyncRecoveryAndDisconnect(t *testing.T) {
	app, h := testApp(t)
	cookie := owner(t, h)
	mode := "initial"
	calls := 0
	configureGoogle(t, app, func(r *http.Request) (int, string) {
		calls++
		if r.Header.Get("Authorization") != "Bearer private-access" || r.URL.Host != "www.googleapis.com" || r.Method != "GET" {
			t.Fatal("unexpected request", r.URL)
		}
		q := r.URL.Query()
		if q.Get("singleEvents") == "true" {
			if mode == "window-failure" {
				return 503, "secret-diagnostics"
			}
			if mode == "reconcile" {
				return 200, `{"kind":"calendar#events","items":[]}`
			}
			return 200, `{"kind":"calendar#events","items":[{"id":"moved-original","summary":"Google class","start":{"date":"2026-09-07"},"end":{"date":"2026-09-08"}}]}`
		}
		if mode == "reconcile" && q.Get("syncToken") != "" {
			return 410, "expired"
		}
		if mode == "nochange" {
			return 200, `{"kind":"calendar#events","items":[],"nextSyncToken":"cursor2"}`
		}
		if mode == "reconcile" {
			return 200, `{"kind":"calendar#events","items":[],"nextSyncToken":"fresh"}`
		}
		if mode == "page-failure" {
			if q.Get("pageToken") == "two" {
				return 503, "secret-diagnostics"
			}
			return 200, `{"kind":"calendar#events","items":[{"id":"moved-original","status":"cancelled"}],"nextPageToken":"two"}`
		}
		if mode == "window-failure" {
			return 200, `{"kind":"calendar#events","items":[{"id":"moved-original","status":"cancelled"}],"nextSyncToken":"must-not-commit"}`
		}
		return 200, `{"kind":"calendar#events","items":[{"id":"moved-original","etag":"v1","originalStartTime":{"date":"2026-09-05"}}],"nextSyncToken":"cursor1"}`
	})
	account := googleAccount(t, app, false)
	source := googleSource(t, app, account)
	if err := app.syncConnectedCalendar(context.Background(), source); err != nil {
		t.Fatal(err)
	}
	check := func(cursor string, eventCount int) {
		t.Helper()
		var stored string
		app.Store.DB.QueryRow("SELECT sync_token FROM google_calendars").Scan(&stored)
		if stored != cursor {
			t.Fatal(stored, cursor)
		}
		w := request(h, "GET", "/api/events", nil, cookie)
		var events []map[string]interface{}
		json.Unmarshal(w.Body.Bytes(), &events)
		if w.Code != 200 || len(events) != eventCount {
			t.Fatal(w.Code, w.Body.String())
		}
	}
	check("cursor1", 1)
	for _, m := range []string{"page-failure", "window-failure"} {
		mode = m
		if err := app.syncConnectedCalendar(context.Background(), source); err != nil {
			t.Fatal(err)
		}
		check("cursor1", 1)
	}
	w := request(h, "GET", "/api/calendars", nil, cookie)
	if strings.Contains(w.Body.String(), "secret-diagnostics") || !strings.Contains(w.Body.String(), "temporarily") {
		t.Fatal(w.Body.String())
	}
	sources, _ := app.calendarSources()
	source = sources[0]
	mode = "nochange"
	before := calls
	if err := app.syncConnectedCalendar(context.Background(), source); err != nil {
		t.Fatal(err)
	}
	check("cursor2", 1)
	if calls != before+1 {
		t.Fatal("unchanged snapshot fetched expanded window")
	}
	mode = "reconcile"
	if err := app.syncConnectedCalendar(context.Background(), source); err != nil {
		t.Fatal(err)
	}
	check("fresh", 0)
	w = request(h, "DELETE", fmt.Sprintf("/api/google/%d", account), nil, cookie)
	if w.Code != 200 {
		t.Fatal(w.Code, w.Body.String())
	}
	for _, table := range []string{"google_accounts", "google_calendars", "calendar_sources"} {
		var count int
		app.Store.DB.QueryRow("SELECT count(*) FROM " + table).Scan(&count)
		if count != 0 {
			t.Fatal("disconnect retained", table)
		}
	}
}

func TestGoogleRoutesOwnerOnlyAndCalendarSelection(t *testing.T) {
	app, h := testApp(t)
	for _, route := range []string{"/api/google", "/api/google/1/calendars"} {
		if w := request(h, "GET", route, nil, nil); w.Code != 401 {
			t.Fatal(route, w.Code)
		}
	}
	cookie := owner(t, h)
	configureGoogle(t, app, func(r *http.Request) (int, string) {
		if strings.HasSuffix(r.URL.Path, "calendarList") {
			return 200, `{"kind":"calendar#calendarList","items":[{"id":"school","summary":"School","accessRole":"reader"},{"id":"private","accessRole":"freeBusyReader"}]}`
		}
		if r.URL.Query().Get("singleEvents") == "true" {
			return 200, `{"kind":"calendar#events","items":[]}`
		}
		return 200, `{"kind":"calendar#events","items":[],"nextSyncToken":"cursor"}`
	})
	account := googleAccount(t, app, false)
	route := fmt.Sprintf("/api/google/%d/calendars", account)
	w := request(h, "POST", route, map[string]string{"calendar_id": "private"}, cookie)
	if w.Code != 400 {
		t.Fatal(w.Code, w.Body.String())
	}
	w = request(h, "POST", route, map[string]string{"calendar_id": "school"}, cookie)
	if w.Code != 200 || strings.Contains(w.Body.String(), "google:") {
		t.Fatal(w.Code, w.Body.String())
	}
	w = request(h, "POST", route, map[string]string{"calendar_id": "school"}, cookie)
	if w.Code != 409 {
		t.Fatal(w.Code, w.Body.String())
	}
	// The existing source refresh route dispatches to Google, never feed fetching.
	app.Store.DB.Exec("UPDATE calendar_sources SET last_attempt=''")
	var source int
	app.Store.DB.QueryRow("SELECT id FROM calendar_sources").Scan(&source)
	w = request(h, "POST", fmt.Sprintf("/api/calendars/%d/sync", source), nil, cookie)
	if w.Code != 200 || strings.Contains(w.Body.String(), "last_error\":\"Google") {
		t.Fatal(w.Code, w.Body.String())
	}
	app.Store.DB.Exec("UPDATE family_members SET role='user' WHERE id=1")
	for _, method := range []string{"GET", "POST", "DELETE"} {
		if w := request(h, method, "/api/google/1/calendars", nil, cookie); w.Code != 403 {
			t.Fatal(method, w.Code)
		}
	}
}
func TestGoogleConfigurationFailsClosed(t *testing.T) {
	app, _ := testApp(t)
	configureGoogle(t, app, func(*http.Request) (int, string) { return 500, "" })
	for _, redirect := range []string{"http://example.com/google/callback", "https://example.com/other", "https://user@example.com/google/callback", "https://example.com/google/callback?override=yes"} {
		t.Setenv("MYLIGHT_GOOGLE_REDIRECT_URL", redirect)
		if _, err := loadGoogleConnection(); err == nil {
			t.Fatal("accepted unsafe redirect", redirect)
		}
	}
	t.Setenv("MYLIGHT_GOOGLE_REDIRECT_URL", "http://localhost:3000/google/callback")
	if _, err := loadGoogleConnection(); err != nil {
		t.Fatal(err)
	}
	t.Setenv("MYLIGHT_GOOGLE_TOKEN_KEY", "short")
	if _, err := loadGoogleConnection(); err == nil {
		t.Fatal("accepted invalid key")
	}
}

func TestGoogleBackupRestoreKeepsCacheButDropsPendingAuthorization(t *testing.T) {
	app, h := testApp(t)
	cookie := owner(t, h)
	configureGoogle(t, app, func(*http.Request) (int, string) { t.Fatal("backup contacted Google"); return 500, "" })
	account := googleAccount(t, app, false)
	source := googleSource(t, app, account)
	_, err := app.Store.DB.Exec("UPDATE google_calendars SET sync_token='durable-cursor',resources_json='{\"master\":{\"id\":\"master\",\"etag\":\"v2\"}}' WHERE source_id=?", source.ID)
	if err != nil {
		t.Fatal(err)
	}
	if w := request(h, "POST", "/api/google/connect", nil, cookie); w.Code != 200 {
		t.Fatal(w.Code, w.Body.String())
	}
	backup := request(h, "GET", "/api/backup", nil, cookie)
	if backup.Code != 200 {
		t.Fatal(backup.Code, backup.Body.String())
	}
	archive := filepath.Join(t.TempDir(), "backup.zip")
	if err := os.WriteFile(archive, backup.Body.Bytes(), 0600); err != nil {
		t.Fatal(err)
	}
	destination := filepath.Join(t.TempDir(), "restored")
	if err := restoreBackup(archive, destination); err != nil {
		t.Fatal(err)
	}
	restored, err := store.NewStore(filepath.Join(destination, "mylight.db"))
	if err != nil {
		t.Fatal(err)
	}
	defer restored.Close()
	for _, table := range []string{"sessions", "google_oauth_states"} {
		var count int
		err := restored.DB.QueryRow("SELECT count(*) FROM " + table).Scan(&count)
		if err != nil || count != 0 {
			t.Fatal(table, count, err)
		}
	}
	var cursor, raw, sealed string
	if err := restored.DB.QueryRow("SELECT sync_token,resources_json FROM google_calendars").Scan(&cursor, &raw); err != nil || cursor != "durable-cursor" || !strings.Contains(raw, "v2") {
		t.Fatal(cursor, raw, err)
	}
	if err := restored.DB.QueryRow("SELECT token FROM google_accounts").Scan(&sealed); err != nil {
		t.Fatal(err)
	}
	plain, err := app.Google.open(sealed, "google-token:subject-test")
	if err != nil || !strings.Contains(string(plain), "private-refresh") {
		t.Fatal("restored token cannot be read with original key", err)
	}
	var foreignKeyErrors int
	rows, err := restored.DB.Query("PRAGMA foreign_key_check")
	if err != nil {
		t.Fatal(err)
	}
	for rows.Next() {
		foreignKeyErrors++
	}
	rows.Close()
	if foreignKeyErrors != 0 {
		t.Fatal("restore left broken references")
	}
}
func TestGoogleOAuthExpiredStateAndPartialConsent(t *testing.T) {
	for _, mode := range []string{"expired", "partial"} {
		t.Run(mode, func(t *testing.T) {
			app, h := testApp(t)
			cookie := owner(t, h)
			calls := 0
			configureGoogle(t, app, func(r *http.Request) (int, string) {
				calls++
				if mode == "expired" {
					t.Fatal("expired state exchanged code")
				}
				if r.URL.Host == "oauth2.googleapis.com" {
					return 200, `{"access_token":"access","refresh_token":"refresh","expires_in":3600,"token_type":"Bearer","scope":"openid"}`
				}
				return 200, `{"sub":"test"}`
			})
			w := request(h, "POST", "/api/google/connect", nil, cookie)
			var body map[string]string
			json.Unmarshal(w.Body.Bytes(), &body)
			u, _ := url.Parse(body["url"])
			if mode == "expired" {
				app.Store.DB.Exec("UPDATE google_oauth_states SET expires_at=0")
			}
			result := request(h, "GET", "/google/callback?code=c&state="+u.Query().Get("state"), nil, w.Result().Cookies()[0])
			if !strings.Contains(result.Header().Get("Location"), "failed") {
				t.Fatal("accepted invalid consent", mode)
			}
			var count int
			app.Store.DB.QueryRow("SELECT count(*) FROM google_accounts").Scan(&count)
			if count != 0 {
				t.Fatal("saved invalid connection")
			}
		})
	}
}
