package main

import (
	"context"
	"crypto/tls"
	"encoding/json"
	"net/http/httptest"
	"path/filepath"
	"strings"
	"testing"

	"tailscale.com/ipn/ipnstate"
)

func TestTailnetConfiguration(t *testing.T) {
	for _, key := range []string{"MYLIGHT_TAILSCALE", "MYLIGHT_TAILSCALE_ONLY", "MYLIGHT_TAILSCALE_STATE_DIR", "MYLIGHT_TAILSCALE_HOSTNAME", "MYLIGHT_TAILSCALE_AUTH_KEY_FILE", "TS_AUTHKEY"} {
		t.Setenv(key, "")
	}
	data := filepath.Join(t.TempDir(), "data")
	cfg, err := tailnetConfigFromEnv(data)
	if err != nil || cfg.Enabled {
		t.Fatal("Tailscale must be opt-in", cfg, err)
	}
	remote, err := startRemoteAccess(cfg)
	if err != nil || remote.node != nil || remote.listener != nil {
		t.Fatal("disabled integration started a node")
	}
	t.Setenv("MYLIGHT_TAILSCALE_ONLY", "true")
	if _, err := tailnetConfigFromEnv(data); err == nil {
		t.Fatal("tailnet-only enabled without a tailnet")
	}
	t.Setenv("MYLIGHT_TAILSCALE", "true")
	cfg, err = tailnetConfigFromEnv(data)
	if err != nil || cfg.StateDir != data+"-tailscale" || !cfg.Only {
		t.Fatal(cfg, err)
	}
	t.Setenv("MYLIGHT_TAILSCALE_STATE_DIR", filepath.Join(data, "uploads", "identity"))
	if _, err := tailnetConfigFromEnv(data); err == nil {
		t.Fatal("accepted identity in household data")
	}
	t.Setenv("MYLIGHT_TAILSCALE_STATE_DIR", "")
	t.Setenv("MYLIGHT_TAILSCALE_HOSTNAME", "../bad")
	if _, err := tailnetConfigFromEnv(data); err == nil {
		t.Fatal("accepted invalid hostname")
	}
}

func TestTailnetStatusAndAuthorization(t *testing.T) {
	app, handler := testApp(t)
	cookie := owner(t, handler)
	status := &ipnstate.Status{BackendState: "NeedsLogin", AuthURL: "https://login.tailscale.com/a/synthetic-test"}
	app.Remote = &remoteAccess{config: tailnetConfig{Enabled: true, AuthKey: "synthetic-private-key"}, status: func(context.Context) (*ipnstate.Status, error) { return status, nil }}
	if w := request(handler, "GET", "/api/remote-access", nil, nil); w.Code != 401 {
		t.Fatal("unauthenticated enrollment disclosed", w.Code)
	}
	w := request(handler, "GET", "/api/remote-access", nil, cookie)
	if w.Code != 200 || !strings.Contains(w.Body.String(), "synthetic-test") || strings.Contains(w.Body.String(), "synthetic-private-key") {
		t.Fatal(w.Code, w.Body.String())
	}
	status.AuthURL = "https://evil.example/a/test"
	if app.Remote.snapshot(context.Background()).AuthURL != "" {
		t.Fatal("untrusted auth link displayed")
	}
	status.BackendState = "Running"
	if app.Remote.snapshot(context.Background()).State != "needs_https" {
		t.Fatal("claimed ready without HTTPS")
	}
	status.CurrentTailnet = &ipnstate.TailnetStatus{MagicDNSEnabled: true}
	status.CertDomains = []string{"mylight.example.ts.net"}
	if got := app.Remote.snapshot(context.Background()); got.State != "ready" || got.URL != "https://mylight.example.ts.net" {
		t.Fatal(got)
	}
	// A normal adult is not the owner and cannot see enrollment URLs.
	request(handler, "POST", "/api/family", map[string]string{"name": "Adult", "email": "adult@example.test", "password": "test-password-456", "role": "adult"}, cookie)
	login := request(handler, "POST", "/api/login", map[string]string{"email": "adult@example.test", "password": "test-password-456"}, nil)
	if login.Code != 200 {
		t.Fatal(login.Code, login.Body.String())
	}
	if w := request(handler, "GET", "/api/remote-access", nil, login.Result().Cookies()[0]); w.Code != 403 {
		t.Fatal("non-owner can enroll", w.Code)
	}
}

func TestTailnetHTTPSKeepsSessionProtection(t *testing.T) {
	_, handler := testApp(t)
	body, _ := json.Marshal(map[string]string{"name": "Owner", "email": "owner@example.test", "password": "test-password-123", "family_name": "Test", "timezone": "UTC"})
	r := httptest.NewRequest("POST", "https://mylight.example.ts.net/api/setup", strings.NewReader(string(body)))
	r.TLS = &tls.ConnectionState{}
	r.Header.Set("X-MyLight-Request", "1")
	r.Header.Set("Origin", "https://mylight.example.ts.net")
	w := httptest.NewRecorder()
	handler.ServeHTTP(w, r)
	if w.Code != 200 || len(w.Result().Cookies()) != 1 || !w.Result().Cookies()[0].Secure {
		t.Fatal("HTTPS must issue a Secure cookie", w.Code, w.Body.String())
	}
	// Identity-like reverse-proxy headers do not create a MyLight session.
	r = httptest.NewRequest("GET", "https://mylight.example.ts.net/api/events", nil)
	r.Header.Set("Tailscale-User-Login", "owner@example.test")
	w = httptest.NewRecorder()
	handler.ServeHTTP(w, r)
	if w.Code != 401 {
		t.Fatal("trusted a spoofable identity header", w.Code)
	}
}

func TestTailnetCannotClaimHousehold(t *testing.T) {
	_, h := testApp(t)
	w := request(privateAccessHandler(h), "POST", "/api/setup", map[string]string{"name": "Remote", "email": "remote@example.test", "password": "test-password-123", "timezone": "UTC"}, nil)
	if w.Code != 403 {
		t.Fatal("tailnet member could claim first-run ownership", w.Code)
	}
	owner(t, h) // local setup remains available
}
