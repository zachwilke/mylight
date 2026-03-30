package main

import (
	"encoding/json"
	"fmt"
	"io"
	"log"
	"mylight/store"
	"net/http"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"time"
)

// GET /api/family
// GET/POST/PUT /api/family
func (app *App) handleFamily(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")

	if r.Method == "GET" {
		members, err := app.Store.GetFamilyMembers()
		if err != nil {
			jsonError(w, err.Error(), 500)
			return
		}
		jsonResponse(w, members)

	} else if r.Method == "POST" {
		if strings.HasSuffix(r.URL.Path, "/avatar") {
			app.handleAvatarUpload(w, r)
			return
		}

		var req struct {
			store.FamilyMemberJSON
			Password string `json:"password"`
		}

		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			jsonError(w, err.Error(), 400)
			return
		}

		id, err := app.Store.CreateFamilyMember(req.FamilyMemberJSON, req.Password)
		if err != nil {
			jsonError(w, err.Error(), 500)
			return
		}

		app.Broker.Notify("update")
		jsonResponse(w, map[string]interface{}{"success": true, "id": id})

	} else if r.Method == "PUT" {
		parts := strings.Split(r.URL.Path, "/")
		if len(parts) >= 4 {
			idStr := parts[3]
			id, _ := strconv.Atoi(idStr)

			var body map[string]interface{}
			if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
				jsonError(w, err.Error(), 400)
				return
			}

			if err := app.Store.UpdateFamilyMember(id, body); err != nil {
				jsonError(w, err.Error(), 500)
				return
			}

			app.Broker.Notify("update")
			jsonResponse(w, map[string]bool{"success": true})
		} else {
			jsonError(w, "Missing ID", 400)
		}
	}
}

// POST /api/login
func (app *App) handleLogin(w http.ResponseWriter, r *http.Request) {
	if r.Method != "POST" {
		http.Error(w, "Method not allowed", 405)
		return
	}

	var body struct {
		Email    string `json:"email"`
		Password string `json:"password"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		jsonError(w, err.Error(), 400)
		return
	}

	user, err := app.Store.AuthenticateUser(body.Email, body.Password)
	if err != nil {
		jsonError(w, "Invalid credentials", 401)
		return
	}

	jsonResponse(w, map[string]interface{}{
		"success": true,
		"user":    user,
	})
}

// POST /api/family/:id/avatar
func (app *App) handleAvatarUpload(w http.ResponseWriter, r *http.Request) {
	parts := strings.Split(r.URL.Path, "/")
	if len(parts) < 5 {
		jsonError(w, "Invalid path", 400)
		return
	}
	idStr := parts[3]
	id, _ := strconv.Atoi(idStr)

	r.ParseMultipartForm(10 << 20) // 10 MB
	file, handler, err := r.FormFile("avatar")
	if err != nil {
		log.Printf("Error retrieving file: %v", err)
		jsonError(w, "Error retrieving file", 400)
		return
	}
	defer file.Close()

	filename := fmt.Sprintf("avatar_%d_%d%s", id, time.Now().Unix(), filepath.Ext(handler.Filename))
	dstPath := filepath.Join(app.Config.UploadsDir, filename)

	dst, err := os.Create(dstPath)
	if err != nil {
		log.Printf("Error creating file: %v", err)
		jsonError(w, "Error saving file", 500)
		return
	}
	defer dst.Close()

	if _, err := io.Copy(dst, file); err != nil {
		log.Printf("Error copying file: %v", err)
		jsonError(w, "Error copying file", 500)
		return
	}

	avatarURL := fmt.Sprintf("/uploads/%s", filename)
	if err := app.Store.UpdateAvatar(id, avatarURL); err != nil {
		log.Printf("Error updating db: %v", err)
		jsonError(w, "Error updating db", 500)
		return
	}

	app.Broker.Notify("update")
	jsonResponse(w, map[string]interface{}{"success": true, "avatar": avatarURL})
}
