package main

import (
	"crypto/rand"
	"database/sql"
	"encoding/hex"
	"encoding/json"
	"mylight/store"
	"net/http"
	"regexp"
	"strings"
	"time"
)

const deviceCookie = "mylight_device"

type devicePreferences struct {
	HomeView string `json:"home_view"`
	Theme    string `json:"theme"`
}

type pairedDevice struct {
	ID               int               `json:"id"`
	Name             string            `json:"name"`
	CanCompleteTasks bool              `json:"can_complete_tasks"`
	CreatedAt        int64             `json:"created_at"`
	ExpiresAt        int64             `json:"expires_at"`
	RevokedAt        *int64            `json:"revoked_at"`
	Preferences      devicePreferences `json:"preferences"`
}

func randomToken() (string, error) {
	var bytes [32]byte
	if _, err := rand.Read(bytes[:]); err != nil {
		return "", err
	}
	return hex.EncodeToString(bytes[:]), nil
}

func (app *App) deviceForRequest(r *http.Request) (*pairedDevice, error) {
	cookie, err := r.Cookie(deviceCookie)
	if err != nil {
		return nil, err
	}
	var device pairedDevice
	var raw string
	device.Preferences = devicePreferences{HomeView: "today", Theme: "system"}
	err = app.Store.DB.QueryRow("SELECT id,name,can_complete_tasks,created_at,expires_at,preferences FROM paired_devices WHERE token_hash=? AND revoked_at IS NULL AND expires_at>?", hashToken(cookie.Value), time.Now().Unix()).Scan(&device.ID, &device.Name, &device.CanCompleteTasks, &device.CreatedAt, &device.ExpiresAt, &raw)
	if err == nil {
		err = json.Unmarshal([]byte(raw), &device.Preferences)
	}
	return &device, err
}

func (app *App) deviceUser(r *http.Request) (*store.FamilyMemberJSON, error) {
	device, err := app.deviceForRequest(r)
	if err != nil {
		return nil, err
	}
	role := "display"
	return &store.FamilyMemberJSON{ID: -device.ID, Name: device.Name, Role: &role, Visible: true}, nil
}

func (app *App) deviceAllowed(r *http.Request) bool {
	device, err := app.deviceForRequest(r)
	if err != nil {
		return false
	}
	if r.Method == "GET" {
		return map[string]bool{"/api/settings": true, "/api/family": true, "/api/events": true, "/api/chores": true, "/api/meals": true, "/api/lists": true, "/api/photos": true, "/api/updates": true, "/api/device": true}[r.URL.Path]
	}
	return device.CanCompleteTasks && r.Method == "POST" && regexp.MustCompile(`^/api/chores/[1-9][0-9]*/toggle$`).MatchString(r.URL.Path)
}

func (app *App) handlePairing(w http.ResponseWriter, r *http.Request) {
	if r.Method == "GET" {
		if device, err := app.deviceForRequest(r); err == nil {
			jsonResponse(w, map[string]interface{}{"state": "approved", "device": device})
			return
		}
		cookie, err := r.Cookie(deviceCookie)
		if err != nil {
			jsonResponse(w, map[string]string{"state": "expired"})
			return
		}
		var expires int64
		err = app.Store.DB.QueryRow("SELECT expires_at FROM pairing_requests WHERE token_hash=? AND expires_at>?", hashToken(cookie.Value), time.Now().Unix()).Scan(&expires)
		if err == sql.ErrNoRows {
			jsonResponse(w, map[string]string{"state": "expired"})
			return
		}
		if err != nil {
			jsonError(w, "Could not check pairing", 500)
			return
		}
		jsonResponse(w, map[string]interface{}{"state": "pending", "expires_at": expires})
		return
	}
	if r.Method != "POST" {
		jsonError(w, "Method not allowed", 405)
		return
	}
	needed, err := app.needsSetup()
	if err != nil {
		jsonError(w, "Could not check household", 500)
		return
	}
	if needed {
		jsonError(w, "Create your household locally before pairing a display", 409)
		return
	}
	if _, err := app.deviceForRequest(r); err == nil {
		jsonError(w, "This browser is already paired; revoke it before pairing again", 409)
		return
	}
	token, err := randomToken()
	if err != nil {
		jsonError(w, "Could not create pairing", 500)
		return
	}
	var codeBytes [5]byte
	if _, err := rand.Read(codeBytes[:]); err != nil {
		jsonError(w, "Could not create pairing", 500)
		return
	}
	code := strings.ToUpper(hex.EncodeToString(codeBytes[:]))
	now := time.Now()
	expires := now.Add(10 * time.Minute)
	app.mu.Lock()
	defer app.mu.Unlock()
	tx, err := app.Store.DB.Begin()
	if err != nil {
		jsonError(w, "Could not create pairing", 500)
		return
	}
	defer tx.Rollback()
	if _, err = tx.Exec("DELETE FROM pairing_requests WHERE expires_at<=?", now.Unix()); err != nil {
		jsonError(w, "Could not clean expired pairings", 500)
		return
	}
	if cookie, err := r.Cookie(deviceCookie); err == nil {
		if _, err = tx.Exec("DELETE FROM pairing_requests WHERE token_hash=?", hashToken(cookie.Value)); err != nil {
			jsonError(w, "Could not replace pairing", 500)
			return
		}
	}
	var count int
	if err = tx.QueryRow("SELECT count(*) FROM pairing_requests").Scan(&count); err != nil {
		jsonError(w, "Could not create pairing", 500)
		return
	}
	if count >= 50 {
		jsonError(w, "Too many pending displays; try again after codes expire", 429)
		return
	}
	if _, err = tx.Exec("INSERT INTO pairing_requests(token_hash,code_hash,expires_at) VALUES(?,?,?)", hashToken(token), hashToken(code), expires.Unix()); err != nil {
		jsonError(w, "Could not create pairing", 500)
		return
	}
	if err = tx.Commit(); err != nil {
		jsonError(w, "Could not create pairing", 500)
		return
	}
	// The short code approves a pending browser; it is never its authentication credential.
	http.SetCookie(w, &http.Cookie{Name: deviceCookie, Value: token, Path: "/", HttpOnly: true, SameSite: http.SameSiteStrictMode, Secure: r.TLS != nil || getEnv("COOKIE_SECURE", "false") == "true", MaxAge: 365 * 24 * 3600})
	jsonResponse(w, map[string]interface{}{"code": code[:5] + "-" + code[5:], "expires_at": expires.Unix()})
}

func (app *App) handleDevices(w http.ResponseWriter, r *http.Request) {
	if r.URL.Path == "/api/devices" && r.Method == "GET" {
		rows, err := app.Store.DB.Query("SELECT id,name,can_complete_tasks,created_at,expires_at,revoked_at,preferences FROM paired_devices ORDER BY id DESC")
		if err != nil {
			jsonError(w, "Could not list displays", 500)
			return
		}
		defer rows.Close()
		devices := []pairedDevice{}
		for rows.Next() {
			var d pairedDevice
			var raw string
			d.Preferences = devicePreferences{HomeView: "today", Theme: "system"}
			if err := rows.Scan(&d.ID, &d.Name, &d.CanCompleteTasks, &d.CreatedAt, &d.ExpiresAt, &d.RevokedAt, &raw); err != nil {
				jsonError(w, "Could not read display", 500)
				return
			}
			if err := json.Unmarshal([]byte(raw), &d.Preferences); err != nil {
				jsonError(w, "Could not read display preferences", 500)
				return
			}
			devices = append(devices, d)
		}
		if err := rows.Err(); err != nil {
			jsonError(w, "Could not read displays", 500)
			return
		}
		jsonResponse(w, devices)
		return
	}
	if r.URL.Path == "/api/devices/approve" && r.Method == "POST" {
		var body struct {
			Code             string `json:"code"`
			Name             string `json:"name"`
			CanCompleteTasks bool   `json:"can_complete_tasks"`
		}
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
			jsonError(w, "Invalid approval", 400)
			return
		}
		body.Name = strings.TrimSpace(body.Name)
		body.Code = strings.ToUpper(strings.ReplaceAll(strings.TrimSpace(body.Code), "-", ""))
		if body.Name == "" || len(body.Name) > 100 || !regexp.MustCompile(`^[A-F0-9]{10}$`).MatchString(body.Code) {
			jsonError(w, "Enter the display code and a name of 1–100 characters", 400)
			return
		}
		app.mu.Lock()
		defer app.mu.Unlock()
		tx, err := app.Store.DB.Begin()
		if err != nil {
			jsonError(w, "Could not approve display", 500)
			return
		}
		defer tx.Rollback()
		var tokenHash string
		err = tx.QueryRow("SELECT token_hash FROM pairing_requests WHERE code_hash=? AND expires_at>?", hashToken(body.Code), time.Now().Unix()).Scan(&tokenHash)
		if err != nil {
			jsonError(w, "Code expired or already used. Create a new code on the display.", 400)
			return
		}
		var count int
		if err = tx.QueryRow("SELECT count(*) FROM paired_devices WHERE revoked_at IS NULL AND expires_at>?", time.Now().Unix()).Scan(&count); err != nil {
			jsonError(w, "Could not check displays", 500)
			return
		}
		if count >= 20 {
			jsonError(w, "Revoke an unused display before adding more (limit 20)", 400)
			return
		}
		result, err := tx.Exec("INSERT INTO paired_devices(name,token_hash,can_complete_tasks,created_at,expires_at) VALUES(?,?,?,?,?)", body.Name, tokenHash, body.CanCompleteTasks, time.Now().Unix(), time.Now().Add(365*24*time.Hour).Unix())
		if err != nil {
			jsonError(w, "Could not approve display", 500)
			return
		}
		if _, err = tx.Exec("DELETE FROM pairing_requests WHERE token_hash=?", tokenHash); err != nil {
			jsonError(w, "Could not finish approval", 500)
			return
		}
		if err = tx.Commit(); err != nil {
			jsonError(w, "Could not finish approval", 500)
			return
		}
		id, _ := result.LastInsertId()
		app.Broker.Notify("update")
		jsonResponse(w, map[string]interface{}{"id": id, "success": true})
		return
	}
	if r.Method == "PUT" {
		id, err := pathID(r.URL.Path)
		if err != nil {
			jsonError(w, "Invalid display", 400)
			return
		}
		var body struct {
			Name             string            `json:"name"`
			CanCompleteTasks bool              `json:"can_complete_tasks"`
			Preferences      devicePreferences `json:"preferences"`
		}
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
			jsonError(w, "Invalid display settings", 400)
			return
		}
		body.Name = strings.TrimSpace(body.Name)
		if body.Name == "" || len(body.Name) > 100 || (body.Preferences.HomeView != "today" && body.Preferences.HomeView != "week") || !map[string]bool{"system": true, "light": true, "dark": true}[body.Preferences.Theme] {
			jsonError(w, "Choose a display name, Today or Week view, and a supported theme", 400)
			return
		}
		encoded, _ := json.Marshal(body.Preferences)
		result, err := app.Store.DB.Exec("UPDATE paired_devices SET name=?,can_complete_tasks=?,preferences=? WHERE id=? AND revoked_at IS NULL AND expires_at>?", body.Name, body.CanCompleteTasks, string(encoded), id, time.Now().Unix())
		if err != nil {
			jsonError(w, "Could not update display", 500)
			return
		}
		count, _ := result.RowsAffected()
		if count == 0 {
			jsonError(w, "Display is expired, revoked, or missing", 404)
			return
		}
		app.Broker.Notify("update")
		jsonResponse(w, map[string]bool{"success": true})
		return
	}
	if r.Method == "DELETE" {
		id, err := pathID(r.URL.Path)
		if err != nil {
			jsonError(w, "Invalid display", 400)
			return
		}
		result, err := app.Store.DB.Exec("UPDATE paired_devices SET revoked_at=? WHERE id=? AND revoked_at IS NULL", time.Now().Unix(), id)
		if err != nil {
			jsonError(w, "Could not revoke display", 500)
			return
		}
		count, _ := result.RowsAffected()
		if count == 0 {
			jsonError(w, "Display already revoked or not found", 404)
			return
		}
		app.Broker.Notify("update")
		jsonResponse(w, map[string]bool{"success": true})
		return
	}
	jsonError(w, "Method not allowed", 405)
}

func (app *App) handleDevice(w http.ResponseWriter, r *http.Request) {
	if r.Method != "GET" {
		jsonError(w, "Method not allowed", 405)
		return
	}
	device, err := app.deviceForRequest(r)
	if err != nil {
		jsonError(w, "Display is not paired", 401)
		return
	}
	jsonResponse(w, device)
}

func (app *App) handleUpdates(w http.ResponseWriter, r *http.Request) {
	app.Broker.serve(w, r, func() bool { _, err := app.sessionUser(r); return err == nil })
}
