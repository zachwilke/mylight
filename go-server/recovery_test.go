package main

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestRecoveryPasswordFileBounds(t *testing.T) {
	for _, suffix := range []string{"", "\n", "\r\n"} {
		path := filepath.Join(t.TempDir(), "password.txt")
		want := strings.Repeat("x", 72)
		if err := os.WriteFile(path, []byte(want+suffix), 0600); err != nil {
			t.Fatal(err)
		}
		got, err := readRecoveryPassword(path)
		if err != nil || got != want {
			t.Fatal("valid maximum-length password rejected", err)
		}
	}
	for _, value := range []string{"short", strings.Repeat("x", 73), strings.Repeat("x", 1000)} {
		path := filepath.Join(t.TempDir(), "password.txt")
		if err := os.WriteFile(path, []byte(value), 0600); err != nil {
			t.Fatal(err)
		}
		if _, err := readRecoveryPassword(path); err == nil {
			t.Fatal("invalid password file accepted")
		}
	}
}

func TestOwnerRecoveryPreservesDataAndRevokesAccess(t *testing.T) {
	app, h := testApp(t)
	own := owner(t, h)
	device, _ := pairTestDevice(t, h, own, true)
	app.Store.DB.Exec("INSERT INTO events(title,start_date) VALUES('Keep me','2026-09-05T12:00:00Z')")
	if err := recoverOwner(app.Config.DbPath, "new-test-password-123"); err != nil {
		t.Fatal(err)
	}
	if w := request(h, "GET", "/api/events", nil, own); w.Code != 401 {
		t.Fatal("old owner session survived recovery")
	}
	if w := request(h, "GET", "/api/events", nil, device); w.Code != 401 {
		t.Fatal("old device survived recovery")
	}
	if w := request(h, "POST", "/api/login", map[string]string{"email": "parent@example.test", "password": "test-password-123"}, nil); w.Code != 401 {
		t.Fatal("old password survived recovery")
	}
	w := request(h, "POST", "/api/login", map[string]string{"email": "parent@example.test", "password": "new-test-password-123"}, nil)
	if w.Code != 200 {
		t.Fatal(w.Code, w.Body.String())
	}
	var count int
	app.Store.DB.QueryRow("SELECT count(*) FROM events WHERE title='Keep me'").Scan(&count)
	if count != 1 {
		t.Fatal("recovery lost household data")
	}
}

func TestRecoveryRequiresExclusiveServerLock(t *testing.T) {
	app, h := testApp(t)
	owner(t, h)
	lock, err := acquireDataLock(filepath.Dir(app.Config.DbPath))
	if err != nil {
		t.Fatal(err)
	}
	defer lock.Close()
	if err := recoverOwner(app.Config.DbPath, "new-test-password-123"); err == nil {
		t.Fatal("recovery ran while server held its lock")
	}
	if second, err := acquireDataLock(filepath.Dir(app.Config.DbPath)); err == nil {
		second.Close()
		t.Fatal("second server obtained lock")
	}
}
