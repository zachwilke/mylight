package main

import (
	"context"
	"crypto/rand"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"mylight/store"
	"net"
	"net/http"
	"net/url"
	"strings"
	"sync"
	"time"

	"golang.org/x/crypto/bcrypt"
)

type userKey struct{}

type authAttempt struct {
	count int
	until time.Time
}
type authLimiter struct {
	mu       sync.Mutex
	attempts map[string]authAttempt
}

func (limiter *authLimiter) allow(remote string) bool {
	limiter.mu.Lock()
	defer limiter.mu.Unlock()
	now := time.Now()
	if limiter.attempts == nil {
		limiter.attempts = make(map[string]authAttempt)
	}
	for key, attempt := range limiter.attempts {
		if now.After(attempt.until) {
			delete(limiter.attempts, key)
		}
	}
	key, _, err := net.SplitHostPort(remote)
	if err != nil {
		key = remote
	}
	attempt, exists := limiter.attempts[key]
	if !exists {
		if len(limiter.attempts) >= 1024 {
			return false
		}
		attempt.until = now.Add(time.Minute)
	}
	if attempt.count >= 20 {
		return false
	}
	attempt.count++
	limiter.attempts[key] = attempt
	return true
}

const sessionCookie = "mylight_session"

func hashToken(token string) string {
	sum := sha256.Sum256([]byte(token))
	return hex.EncodeToString(sum[:])
}

func (app *App) newSession(w http.ResponseWriter, r *http.Request, memberID int) error {
	if _, err := app.Store.DB.Exec("DELETE FROM sessions WHERE expires_at<=?", time.Now().Unix()); err != nil {
		return err
	}
	token := make([]byte, 32)
	if _, err := rand.Read(token); err != nil {
		return err
	}
	value := hex.EncodeToString(token)
	expires := time.Now().Add(30 * 24 * time.Hour)
	if _, err := app.Store.DB.Exec("INSERT INTO sessions(token_hash, member_id, expires_at) VALUES (?, ?, ?)", hashToken(value), memberID, expires.Unix()); err != nil {
		return err
	}
	http.SetCookie(w, &http.Cookie{Name: sessionCookie, Value: value, Path: "/", HttpOnly: true, SameSite: http.SameSiteStrictMode, Secure: r.TLS != nil || getEnv("COOKIE_SECURE", "false") == "true", Expires: expires, MaxAge: 30 * 24 * 3600})
	return nil
}

func (app *App) sessionUser(r *http.Request) (*store.FamilyMemberJSON, error) {
	cookie, err := r.Cookie(sessionCookie)
	if err != nil {
		return app.deviceUser(r)
	}
	var id int
	if err := app.Store.DB.QueryRow("SELECT member_id FROM sessions WHERE token_hash=? AND expires_at>?", hashToken(cookie.Value), time.Now().Unix()).Scan(&id); err != nil {
		return app.deviceUser(r)
	}
	return app.Store.GetFamilyMember(id)
}

func (app *App) needsSetup() (bool, error) {
	var count int
	err := app.Store.DB.QueryRow("SELECT count(*) FROM family_members WHERE password_hash IS NOT NULL AND password_hash != ''").Scan(&count)
	return count == 0, err
}

func (app *App) security(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("X-Content-Type-Options", "nosniff")
		w.Header().Set("Referrer-Policy", "same-origin")
		w.Header().Set("X-Frame-Options", "SAMEORIGIN")
		if strings.HasPrefix(r.URL.Path, "/api/") {
			if r.Method == "POST" && (r.URL.Path == "/api/login" || r.URL.Path == "/api/setup" || r.URL.Path == "/api/pairing" || r.URL.Path == "/api/devices/approve" || strings.HasPrefix(r.URL.Path, "/api/account/")) && !app.loginLimits.allow(r.RemoteAddr) {
				w.Header().Set("Retry-After", "60")
				jsonError(w, "Too many sign-in attempts. Please try again in a minute.", 429)
				return
			}
			w.Header().Set("Cache-Control", "no-store")
			r.Body = http.MaxBytesReader(w, r.Body, 20<<20)
			if r.Method != "GET" && r.Method != "HEAD" {
				if r.Header.Get("X-MyLight-Request") != "1" {
					jsonError(w, "Missing request protection header", 403)
					return
				}
				if origin := r.Header.Get("Origin"); origin != "" {
					u, err := url.Parse(origin)
					if err != nil || u.Host != r.Host || (u.Scheme != "http" && u.Scheme != "https") {
						jsonError(w, "Request origin does not match this server", 403)
						return
					}
				}
			}
			public := r.URL.Path == "/api/setup" || r.URL.Path == "/api/login" || r.URL.Path == "/api/session" || r.URL.Path == "/api/pairing"
			if !public {
				user, err := app.sessionUser(r)
				if err != nil {
					jsonError(w, "Please sign in", 401)
					return
				}
				if user.Role != nil && *user.Role == "display" && !app.deviceAllowed(r) {
					jsonError(w, "This display does not have permission for that action", 403)
					return
				}
				adminOnly := strings.HasPrefix(r.URL.Path, "/api/google") || strings.HasPrefix(r.URL.Path, "/api/devices") || r.URL.Path == "/api/remote-access" || strings.HasPrefix(r.URL.Path, "/api/backup") || strings.HasPrefix(r.URL.Path, "/api/calendars") || (r.Method != "GET" && (strings.HasPrefix(r.URL.Path, "/api/family") || r.URL.Path == "/api/settings"))
				if adminOnly && (user.Role == nil || *user.Role != "admin") {
					jsonError(w, "An adult account is required", 403)
					return
				}
				r = r.WithContext(context.WithValue(r.Context(), userKey{}, user))
			}
		}
		if strings.HasPrefix(r.URL.Path, "/uploads/") {
			if _, err := app.sessionUser(r); err != nil {
				http.Error(w, "Please sign in", 401)
				return
			}
		}
		next.ServeHTTP(w, r)
	})
}

func (app *App) handleSetup(w http.ResponseWriter, r *http.Request) {
	if r.Method == "GET" {
		needed, err := app.needsSetup()
		if err != nil {
			jsonError(w, "Could not check setup", 500)
			return
		}
		jsonResponse(w, map[string]bool{"needs_setup": needed})
		return
	}
	if r.Method != "POST" {
		jsonError(w, "Method not allowed", 405)
		return
	}
	var body struct {
		Name       string `json:"name"`
		Email      string `json:"email"`
		Password   string `json:"password"`
		FamilyName string `json:"family_name"`
		Timezone   string `json:"timezone"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		jsonError(w, "Invalid setup request", 400)
		return
	}
	body.Name = strings.TrimSpace(body.Name)
	body.Email = strings.ToLower(strings.TrimSpace(body.Email))
	if body.Name == "" || !strings.Contains(body.Email, "@") || len(body.Password) < 10 || len(body.Password) > 72 {
		jsonError(w, "Enter a name, email, and password between 10 and 72 characters", 400)
		return
	}
	if _, err := time.LoadLocation(body.Timezone); err != nil {
		jsonError(w, "Choose a valid timezone", 400)
		return
	}
	hash, err := bcrypt.GenerateFromPassword([]byte(body.Password), bcrypt.DefaultCost)
	if err != nil {
		jsonError(w, "Could not secure password", 500)
		return
	}
	app.mu.Lock()
	defer app.mu.Unlock()
	needed, err := app.needsSetup()
	if err != nil {
		jsonError(w, "Could not check setup", 500)
		return
	}
	if !needed {
		jsonError(w, "This household is already set up", 409)
		return
	}
	tx, err := app.Store.DB.Begin()
	if err != nil {
		jsonError(w, "Could not start setup", 500)
		return
	}
	defer tx.Rollback()
	result, err := tx.Exec("INSERT INTO family_members(name,email,password_hash,role,color,visible) VALUES(?,?,?,'admin','bg-emerald-100 text-emerald-800',1)", body.Name, body.Email, string(hash))
	if err != nil {
		jsonError(w, "Could not create owner", 500)
		return
	}
	id, err := result.LastInsertId()
	if err != nil {
		jsonError(w, "Could not create owner", 500)
		return
	}
	for key, value := range map[string]string{"family_name": body.FamilyName, "timezone": body.Timezone, "chore_reset_time": "00:00"} {
		if _, err = tx.Exec("INSERT OR REPLACE INTO settings(key,value) VALUES(?,?)", key, value); err != nil {
			jsonError(w, "Could not save setup", 500)
			return
		}
	}
	if err = tx.Commit(); err != nil {
		jsonError(w, "Could not finish setup", 500)
		return
	}
	if err = app.newSession(w, r, int(id)); err != nil {
		jsonError(w, "Household created. Please sign in.", 500)
		return
	}
	user, err := app.Store.GetFamilyMember(int(id))
	if err != nil {
		jsonError(w, "Household created. Please sign in.", 500)
		return
	}
	jsonResponse(w, map[string]interface{}{"user": user, "success": true})
}

func (app *App) handleSession(w http.ResponseWriter, r *http.Request) {
	if r.Method == "DELETE" {
		if cookie, err := r.Cookie(deviceCookie); err == nil {
			if _, err = app.Store.DB.Exec("UPDATE paired_devices SET revoked_at=? WHERE token_hash=? AND revoked_at IS NULL", time.Now().Unix(), hashToken(cookie.Value)); err != nil {
				jsonError(w, "Could not disconnect display", 500)
				return
			}
			if _, err = app.Store.DB.Exec("DELETE FROM pairing_requests WHERE token_hash=?", hashToken(cookie.Value)); err != nil {
				jsonError(w, "Could not cancel pairing", 500)
				return
			}
		}
		if cookie, err := r.Cookie(sessionCookie); err == nil {
			if _, err = app.Store.DB.Exec("DELETE FROM sessions WHERE token_hash=?", hashToken(cookie.Value)); err != nil {
				jsonError(w, "Could not sign out", 500)
				return
			}
		}
		http.SetCookie(w, &http.Cookie{Name: sessionCookie, Value: "", Path: "/", MaxAge: -1, HttpOnly: true, SameSite: http.SameSiteStrictMode})
		http.SetCookie(w, &http.Cookie{Name: deviceCookie, Value: "", Path: "/", MaxAge: -1, HttpOnly: true, SameSite: http.SameSiteStrictMode})
		app.Broker.Notify("update")
		jsonResponse(w, map[string]bool{"success": true})
		return
	}
	if r.Method != "GET" {
		jsonError(w, "Method not allowed", 405)
		return
	}
	user, err := app.sessionUser(r)
	if err != nil {
		jsonError(w, "Please sign in", 401)
		return
	}
	jsonResponse(w, map[string]interface{}{"user": user})
}
