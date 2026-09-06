package main

import (
	"encoding/json"
	"mylight/store"
	"net/http"
	"time"

	"golang.org/x/crypto/bcrypt"
)

// A public handle is deliberately distinct from both the cookie and its stored
// verifier. It can only identify sessions belonging to the authenticated member.
func sessionHandle(hash string) string { return hashToken("session-id:" + hash) }

func (app *App) handleAccount(w http.ResponseWriter, r *http.Request) {
	user, _ := r.Context().Value(userKey{}).(*store.FamilyMemberJSON)
	cookie, err := r.Cookie(sessionCookie)
	if user == nil || user.ID <= 0 || err != nil {
		jsonError(w, "Sign in with an account", 403)
		return
	}
	currentHash := hashToken(cookie.Value)
	if r.URL.Path == "/api/account/sessions" && r.Method == "GET" {
		rows, err := app.Store.DB.Query("SELECT token_hash,expires_at FROM sessions WHERE member_id=? AND expires_at>? ORDER BY expires_at DESC", user.ID, time.Now().Unix())
		if err != nil {
			jsonError(w, "Could not load sessions", 500)
			return
		}
		defer rows.Close()
		type session struct {
			ID        string `json:"id"`
			ExpiresAt int64  `json:"expires_at"`
			Current   bool   `json:"current"`
		}
		result := []session{}
		for rows.Next() {
			var hash string
			var item session
			if err = rows.Scan(&hash, &item.ExpiresAt); err != nil {
				jsonError(w, "Could not load sessions", 500)
				return
			}
			item.ID, item.Current = sessionHandle(hash), hash == currentHash
			result = append(result, item)
		}
		if rows.Err() != nil {
			jsonError(w, "Could not load sessions", 500)
			return
		}
		jsonResponse(w, result)
		return
	}
	if r.Method != "POST" || (r.URL.Path != "/api/account/password" && r.URL.Path != "/api/account/sessions/revoke") {
		jsonError(w, "Method not allowed", 405)
		return
	}
	var body struct {
		CurrentPassword string `json:"current_password"`
		NewPassword     string `json:"new_password"`
		SessionID       string `json:"session_id"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil || len(body.CurrentPassword) > 72 {
		jsonError(w, "Invalid account request", 400)
		return
	}
	app.mu.Lock()
	defer app.mu.Unlock()
	// Recheck the session in the same transaction as credential verification and
	// revocation so a request waiting behind a password change cannot revive access.
	tx, err := app.Store.DB.Begin()
	if err != nil {
		jsonError(w, "Could not update account", 500)
		return
	}
	defer tx.Rollback()
	var passwordHash string
	err = tx.QueryRow(`SELECT f.password_hash FROM family_members f JOIN sessions s ON s.member_id=f.id
		WHERE f.id=? AND s.token_hash=? AND s.expires_at>?`, user.ID, currentHash, time.Now().Unix()).Scan(&passwordHash)
	if err != nil {
		jsonError(w, "Please sign in again", 401)
		return
	}
	if bcrypt.CompareHashAndPassword([]byte(passwordHash), []byte(body.CurrentPassword)) != nil {
		jsonError(w, "Current password is incorrect", 403)
		return
	}
	if r.URL.Path == "/api/account/password" {
		if len(body.NewPassword) < 10 || len(body.NewPassword) > 72 {
			jsonError(w, "New password must contain 10–72 bytes", 400)
			return
		}
		hash, hashErr := bcrypt.GenerateFromPassword([]byte(body.NewPassword), bcrypt.DefaultCost)
		if hashErr != nil {
			jsonError(w, "Could not secure password", 500)
			return
		}
		if _, err = tx.Exec("UPDATE family_members SET password_hash=? WHERE id=?", string(hash), user.ID); err == nil {
			// Sign out every account session, including this one. Display grants are
			// independent and remain under the owner's explicit Devices controls.
			_, err = tx.Exec("DELETE FROM sessions WHERE member_id=?", user.ID)
		}
	} else {
		rows, queryErr := tx.Query("SELECT token_hash FROM sessions WHERE member_id=?", user.ID)
		if queryErr != nil {
			jsonError(w, "Could not revoke session", 500)
			return
		}
		var target string
		for rows.Next() {
			var hash string
			if err = rows.Scan(&hash); err != nil {
				break
			}
			if sessionHandle(hash) == body.SessionID {
				target = hash
			}
		}
		if err == nil {
			err = rows.Err()
		}
		rows.Close()
		if err == nil && target == "" {
			jsonError(w, "Session no longer exists", 404)
			return
		}
		if err == nil {
			_, err = tx.Exec("DELETE FROM sessions WHERE token_hash=? AND member_id=?", target, user.ID)
		}
	}
	if err != nil {
		jsonError(w, "Could not update account", 500)
		return
	}
	if err = tx.Commit(); err != nil {
		jsonError(w, "Could not update account", 500)
		return
	}
	app.Broker.Notify("update")
	jsonResponse(w, map[string]bool{"success": true})
}
