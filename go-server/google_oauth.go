package main

import (
	"context"
	"crypto/aes"
	"crypto/cipher"
	"crypto/rand"
	"database/sql"
	"encoding/base64"
	"encoding/json"
	"errors"
	"io"
	"mylight/googlecalendar"
	"net/http"
	"net/url"
	"os"
	"strconv"
	"strings"
	"time"

	"golang.org/x/oauth2"
)

const googleCallbackPath = "/google/callback"
const googleNonceCookie = "mylight_google_nonce"

type googleConnection struct {
	OAuth  oauth2.Config
	Cipher cipher.AEAD
	HTTP   *http.Client
}

func loadGoogleConnection() (*googleConnection, error) {
	id, secret, redirect, key := os.Getenv("MYLIGHT_GOOGLE_CLIENT_ID"), os.Getenv("MYLIGHT_GOOGLE_CLIENT_SECRET"), os.Getenv("MYLIGHT_GOOGLE_REDIRECT_URL"), os.Getenv("MYLIGHT_GOOGLE_TOKEN_KEY")
	if id == "" && secret == "" && redirect == "" && key == "" {
		return nil, nil
	}
	u, err := url.Parse(redirect)
	if err != nil || u.Host == "" || u.User != nil || u.RawQuery != "" || u.Fragment != "" || u.Path != googleCallbackPath || (u.Scheme != "https" && !(u.Scheme == "http" && (u.Hostname() == "localhost" || u.Hostname() == "127.0.0.1"))) || id == "" || secret == "" {
		return nil, errors.New("Google requires client ID, client secret, token key and a fixed HTTPS redirect URL ending in /google/callback (HTTP localhost is allowed for development)")
	}
	raw, err := base64.StdEncoding.DecodeString(key)
	if err != nil || len(raw) != 32 {
		return nil, errors.New("MYLIGHT_GOOGLE_TOKEN_KEY must be a base64-encoded 32-byte key")
	}
	block, err := aes.NewCipher(raw)
	if err != nil {
		return nil, err
	}
	aead, err := cipher.NewGCM(block)
	if err != nil {
		return nil, err
	}
	return &googleConnection{OAuth: oauth2.Config{ClientID: id, ClientSecret: secret, RedirectURL: redirect, Scopes: []string{"openid", "https://www.googleapis.com/auth/calendar.events.readonly", "https://www.googleapis.com/auth/calendar.calendarlist.readonly"}, Endpoint: oauth2.Endpoint{AuthURL: "https://accounts.google.com/o/oauth2/v2/auth", TokenURL: "https://oauth2.googleapis.com/token", AuthStyle: oauth2.AuthStyleInParams}}, Cipher: aead, HTTP: &http.Client{Timeout: 30 * time.Second, CheckRedirect: func(*http.Request, []*http.Request) error { return http.ErrUseLastResponse }}}, nil
}
func (g *googleConnection) seal(value []byte, purpose string) string {
	nonce := make([]byte, g.Cipher.NonceSize())
	if _, err := rand.Read(nonce); err != nil {
		panic(err)
	}
	return base64.RawStdEncoding.EncodeToString(g.Cipher.Seal(nonce, nonce, value, []byte(purpose)))
}
func (g *googleConnection) open(value, purpose string) ([]byte, error) {
	data, err := base64.RawStdEncoding.DecodeString(value)
	if err != nil || len(data) < g.Cipher.NonceSize() {
		return nil, errors.New("Google credentials cannot be decrypted; restore the original token key or reconnect")
	}
	plain, err := g.Cipher.Open(nil, data[:g.Cipher.NonceSize()], data[g.Cipher.NonceSize():], []byte(purpose))
	if err != nil {
		return nil, errors.New("Google credentials cannot be decrypted; restore the original token key or reconnect")
	}
	return plain, nil
}
func (g *googleConnection) ctx(ctx context.Context) context.Context {
	return context.WithValue(ctx, oauth2.HTTPClient, g.HTTP)
}
func (app *App) googleClient(ctx context.Context, account int) (*http.Client, error) {
	g := app.Google
	if g == nil {
		return nil, errors.New("Google connection is not configured on this server")
	}
	var sealed, subject string
	if err := app.Store.DB.QueryRow("SELECT token,subject FROM google_accounts WHERE id=?", account).Scan(&sealed, &subject); err != nil {
		return nil, errors.New("Google account is no longer connected")
	}
	raw, err := g.open(sealed, "google-token:"+subject)
	if err != nil {
		return nil, err
	}
	var old oauth2.Token
	if json.Unmarshal(raw, &old) != nil {
		return nil, errors.New("Google credentials are invalid; reconnect the account")
	}
	token, err := g.OAuth.TokenSource(g.ctx(ctx), &old).Token()
	if err != nil {
		var response *oauth2.RetrieveError
		if errors.As(err, &response) && ((response.Response != nil && response.Response.StatusCode >= 400 && response.Response.StatusCode < 500 && response.Response.StatusCode != 429) || (response.ErrorCode != "" && response.ErrorCode != "temporarily_unavailable" && response.ErrorCode != "server_error")) {
			return nil, googlecalendar.ErrPermission
		}
		return nil, googlecalendar.ErrBusy
	}
	if token.AccessToken != old.AccessToken || token.RefreshToken != old.RefreshToken || !token.Expiry.Equal(old.Expiry) {
		raw, err = json.Marshal(token)
		if err != nil {
			return nil, err
		}
		res, err := app.Store.DB.Exec("UPDATE google_accounts SET token=? WHERE id=? AND token=?", g.seal(raw, "google-token:"+subject), account, sealed)
		if err != nil {
			return nil, err
		}
		n, err := res.RowsAffected()
		if err != nil || n != 1 {
			return nil, errors.New("Google connection changed; retry the refresh")
		}
	}
	// Refresh is persisted before any Calendar calls. This static transport cannot
	// secretly rotate a refresh token without storing it for the next process run.
	return &http.Client{Transport: &oauth2.Transport{Source: oauth2.StaticTokenSource(token), Base: g.HTTP.Transport}, Timeout: g.HTTP.Timeout, CheckRedirect: g.HTTP.CheckRedirect}, nil
}
func (app *App) startGoogle(w http.ResponseWriter, r *http.Request) {
	g := app.Google
	if g == nil {
		jsonError(w, "Configure Google on this server before connecting", 503)
		return
	}
	var request struct {
		AllowEditing bool `json:"allow_editing"`
		AccountID    int  `json:"account_id"`
	}
	if err := json.NewDecoder(r.Body).Decode(&request); err != nil && !errors.Is(err, io.EOF) {
		jsonError(w, "Invalid Google connection request", 400)
		return
	}
	if request.AllowEditing && request.AccountID < 1 {
		jsonError(w, "Connect the Google account before enabling editing", 400)
		return
	}
	var accountRef interface{}
	if request.AccountID > 0 {
		var existing int
		if err := app.Store.DB.QueryRow("SELECT id FROM google_accounts WHERE id=?", request.AccountID).Scan(&existing); err != nil {
			jsonError(w, "Google account is no longer connected", 404)
			return
		}
		accountRef = existing
	}
	oauthConfig := g.OAuth
	if request.AllowEditing {
		oauthConfig.Scopes = []string{"openid", "https://www.googleapis.com/auth/calendar.events", "https://www.googleapis.com/auth/calendar.calendarlist.readonly"}
	}
	u, _ := url.Parse(g.OAuth.RedirectURL)
	if r.Host != u.Host {
		jsonError(w, "Open MyLight at the configured Google redirect origin before connecting", 400)
		return
	}
	state, err := randomToken()
	if err != nil {
		jsonError(w, "Could not start Google connection", 500)
		return
	}
	nonce, err := randomToken()
	if err != nil {
		jsonError(w, "Could not start Google connection", 500)
		return
	}
	verifier := oauth2.GenerateVerifier()
	cookie, err := r.Cookie(sessionCookie)
	if err != nil {
		jsonError(w, "Please sign in", 401)
		return
	}
	tx, err := app.Store.DB.Begin()
	if err != nil {
		jsonError(w, "Could not start Google connection", 500)
		return
	}
	defer tx.Rollback()
	_, err = tx.Exec("DELETE FROM google_oauth_states WHERE expires_at<=? OR session_hash=?", time.Now().Unix(), hashToken(cookie.Value))
	if err == nil {
		_, err = tx.Exec("INSERT INTO google_oauth_states(state_hash,session_hash,nonce_hash,verifier,expires_at,allow_editing,account_id) VALUES(?,?,?,?,?,?,?)", hashToken(state), hashToken(cookie.Value), hashToken(nonce), g.seal([]byte(verifier), "google-state:"+hashToken(state)), time.Now().Add(10*time.Minute).Unix(), request.AllowEditing, accountRef)
	}
	if err == nil {
		err = tx.Commit()
	}
	if err != nil {
		jsonError(w, "Could not start Google connection", 500)
		return
	}
	http.SetCookie(w, &http.Cookie{Name: googleNonceCookie, Value: nonce, Path: googleCallbackPath, MaxAge: 600, HttpOnly: true, Secure: u.Scheme == "https", SameSite: http.SameSiteLaxMode})
	jsonResponse(w, map[string]string{"url": oauthConfig.AuthCodeURL(state, oauth2.AccessTypeOffline, oauth2.SetAuthURLParam("prompt", "consent"), oauth2.S256ChallengeOption(verifier))})
}

// The ordinary session is SameSite=Strict. A separate short-lived Lax nonce
// permits Google's top-level callback, while the state remains bound to an
// unexpired owner session in SQLite. No authorization code reaches the SPA.
func (app *App) handleGoogleCallback(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Cache-Control", "no-store")
	w.Header().Set("Referrer-Policy", "no-referrer")
	fail := func() { http.Redirect(w, r, "/settings?tab=integrations&google=failed", http.StatusSeeOther) }
	if r.Method != "GET" || app.Google == nil {
		fail()
		return
	}
	g := app.Google
	u, _ := url.Parse(g.OAuth.RedirectURL)
	if r.Host != u.Host {
		fail()
		return
	}
	nonce, err := r.Cookie(googleNonceCookie)
	if err != nil {
		fail()
		return
	}
	q := r.URL.Query()
	state := q.Get("state")
	if state == "" || len(state) > 256 || len(q["state"]) != 1 {
		fail()
		return
	}
	if !app.calendarSync.TryLock() {
		fail()
		return
	}
	defer app.calendarSync.Unlock()
	var sealed, session string
	var allowEditing bool
	var expectedAccount sql.NullInt64
	err = app.Store.DB.QueryRow(`DELETE FROM google_oauth_states WHERE state_hash=? AND nonce_hash=? AND expires_at>? AND session_hash IN
 (SELECT s.token_hash FROM sessions s JOIN family_members f ON f.id=s.member_id WHERE s.expires_at>? AND f.role='admin') RETURNING verifier,session_hash,allow_editing,account_id`, hashToken(state), hashToken(nonce.Value), time.Now().Unix(), time.Now().Unix()).Scan(&sealed, &session, &allowEditing, &expectedAccount)
	if err != nil {
		fail()
		return
	}
	http.SetCookie(w, &http.Cookie{Name: googleNonceCookie, Value: "", Path: googleCallbackPath, MaxAge: -1, HttpOnly: true, Secure: u.Scheme == "https", SameSite: http.SameSiteLaxMode})
	if q.Get("error") != "" || len(q["code"]) != 1 || q.Get("code") == "" || len(q.Get("code")) > 8192 {
		fail()
		return
	}
	verifier, err := g.open(sealed, "google-state:"+hashToken(state))
	if err != nil {
		fail()
		return
	}
	ctx, cancel := context.WithTimeout(r.Context(), 45*time.Second)
	defer cancel()
	token, err := g.OAuth.Exchange(g.ctx(ctx), q.Get("code"), oauth2.VerifierOption(string(verifier)))
	if err != nil || token.AccessToken == "" || token.RefreshToken == "" {
		fail()
		return
	}
	// UserInfo authenticates the stable subject with the issued access token.
	// Never identify accounts by an unverified decoded ID token or calendar name.
	client := &http.Client{Transport: &oauth2.Transport{Source: oauth2.StaticTokenSource(token), Base: g.HTTP.Transport}, Timeout: 30 * time.Second, CheckRedirect: g.HTTP.CheckRedirect}
	req, _ := http.NewRequestWithContext(ctx, "GET", "https://openidconnect.googleapis.com/v1/userinfo", nil)
	resp, err := client.Do(req)
	if err != nil {
		fail()
		return
	}
	data, readErr := io.ReadAll(io.LimitReader(resp.Body, 16385))
	resp.Body.Close()
	var info struct {
		Sub string `json:"sub"`
	}
	if readErr != nil || resp.StatusCode != 200 || len(data) > 16384 || json.Unmarshal(data, &info) != nil || info.Sub == "" || len(info.Sub) > 255 {
		fail()
		return
	}
	// Verify both Calendar permissions before saving a connection (partial consent
	// is possible). No household calendar is selected or read during this probe.
	granted, _ := token.Extra("scope").(string)
	scopes := map[string]bool{}
	for _, s := range strings.Fields(granted) {
		scopes[s] = true
	}
	eventScope := "https://www.googleapis.com/auth/calendar.events.readonly"
	if allowEditing {
		eventScope = "https://www.googleapis.com/auth/calendar.events"
	}
	if (!scopes[eventScope] && !(!allowEditing && scopes["https://www.googleapis.com/auth/calendar.events"])) || !scopes["https://www.googleapis.com/auth/calendar.calendarlist.readonly"] {
		fail()
		return
	}
	raw, err := json.Marshal(token)
	if err != nil {
		fail()
		return
	}
	tx, err := app.Store.DB.Begin()
	if err != nil {
		fail()
		return
	}
	defer tx.Rollback()
	var valid, count int
	err = tx.QueryRow("SELECT count(*) FROM sessions s JOIN family_members f ON f.id=s.member_id WHERE s.token_hash=? AND s.expires_at>? AND f.role='admin'", session, time.Now().Unix()).Scan(&valid)
	if err != nil || valid != 1 {
		fail()
		return
	}
	if expectedAccount.Valid {
		var subject string
		if err := tx.QueryRow("SELECT subject FROM google_accounts WHERE id=?", expectedAccount.Int64).Scan(&subject); err != nil || subject != info.Sub {
			fail()
			return
		}
	}
	err = tx.QueryRow("SELECT count(*) FROM google_accounts WHERE subject!=?", info.Sub).Scan(&count)
	if err != nil || count >= 5 {
		fail()
		return
	}
	_, err = tx.Exec("INSERT INTO google_accounts(subject,token,write_enabled) VALUES(?,?,?) ON CONFLICT(subject) DO UPDATE SET token=excluded.token,write_enabled=excluded.write_enabled", info.Sub, g.seal(raw, "google-token:"+info.Sub), allowEditing)
	if err == nil {
		err = tx.Commit()
	}
	if err != nil {
		fail()
		return
	}
	http.Redirect(w, r, "/settings?tab=integrations&google=connected", http.StatusSeeOther)
}
func googleID(raw string) (int, error) {
	id, err := strconv.Atoi(raw)
	if err != nil || id < 1 {
		return 0, sql.ErrNoRows
	}
	return id, nil
}
