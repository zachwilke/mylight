package main

import (
	"encoding/json"
	"log"
	"mylight/store"
	"net/http"
	"strconv"
	"strings"
)

// GET/POST/PUT /api/family
func (app *App) handleFamily(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")

	switch r.Method {
	case "GET":
		app.handleFamilyGet(w, r)
	case "POST":
		app.handleFamilyPost(w, r)
	case "PUT":
		app.handleFamilyPut(w, r)
	case "DELETE":
		id, err := pathID(r.URL.Path)
		if err != nil {
			jsonError(w, "Invalid member ID", 400)
			return
		}
		if err = app.Store.DeleteFamilyMember(id); err != nil {
			jsonError(w, err.Error(), 400)
			return
		}
		app.Broker.Notify("update")
		jsonResponse(w, map[string]bool{"success": true})
	default:
		http.Error(w, "Method not allowed", 405)
	}
}

func (app *App) handleFamilyGet(w http.ResponseWriter, r *http.Request) {
	members, err := app.Store.GetFamilyMembers()
	if err != nil {
		jsonError(w, err.Error(), 500)
		return
	}
	if user, _ := r.Context().Value(userKey{}).(*store.FamilyMemberJSON); user != nil && user.Role != nil && *user.Role == "display" {
		for i := range members {
			members[i].Email = nil
			members[i].Phone = nil
			members[i].Role = nil
		}
	}
	jsonResponse(w, members)
}

func (app *App) handleFamilyPost(w http.ResponseWriter, r *http.Request) {
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
	if req.Name == "" {
		jsonError(w, "Name is required", 400)
		return
	}
	if req.Email != nil {
		normalized := strings.ToLower(strings.TrimSpace(*req.Email))
		req.Email = &normalized
	}
	if req.Password != "" && (len(req.Password) < 10 || len(req.Password) > 72 || req.Email == nil || !strings.Contains(*req.Email, "@")) {
		jsonError(w, "Adult sign-in requires an email and password between 10 and 72 characters", 400)
		return
	}

	id, err := app.Store.CreateFamilyMember(req.FamilyMemberJSON, req.Password)
	if err != nil {
		jsonError(w, err.Error(), 500)
		return
	}

	app.Broker.Notify("update")
	member, err := app.Store.GetFamilyMember(id)
	if err != nil {
		jsonError(w, "Could not read member", 500)
		return
	}
	jsonResponse(w, member)
}

func (app *App) handleFamilyPut(w http.ResponseWriter, r *http.Request) {
	parts := strings.Split(r.URL.Path, "/")
	if len(parts) < 4 {
		jsonError(w, "Missing ID", 400)
		return
	}

	id, err := strconv.Atoi(parts[3])
	if err != nil || id <= 0 {
		jsonError(w, "Invalid member ID", 400)
		return
	}

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
	if body.Email == "" || body.Password == "" {
		jsonError(w, "Email and password are required", 400)
		return
	}

	app.mu.Lock()
	defer app.mu.Unlock()
	user, err := app.Store.AuthenticateUser(strings.ToLower(strings.TrimSpace(body.Email)), body.Password)
	if err != nil {
		jsonError(w, "Invalid credentials", 401)
		return
	}
	if err := app.newSession(w, r, user.ID); err != nil {
		jsonError(w, "Could not start session", 500)
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
	id, err := strconv.Atoi(parts[3])
	if err != nil || id <= 0 {
		jsonError(w, "Invalid member ID", 400)
		return
	}

	r.Body = http.MaxBytesReader(w, r.Body, 10<<20)
	if err := r.ParseMultipartForm(10 << 20); err != nil {
		jsonError(w, "Failed to parse multipart form", 400)
		return
	}
	defer r.MultipartForm.RemoveAll()
	if _, err := app.Store.GetFamilyMember(id); err != nil {
		jsonError(w, "Member not found", 404)
		return
	}
	file, _, err := r.FormFile("avatar")
	if err != nil {
		log.Printf("Error retrieving file: %v", err)
		jsonError(w, "Error retrieving file", 400)
		return
	}
	defer file.Close()

	avatarURL, err := app.saveImage(file)
	if err != nil {
		jsonError(w, err.Error(), 400)
		return
	}
	if err := app.Store.UpdateAvatar(id, avatarURL); err != nil {
		log.Printf("Error updating db: %v", err)
		jsonError(w, "Error updating db", 500)
		return
	}

	app.Broker.Notify("update")
	jsonResponse(w, map[string]interface{}{"success": true, "avatar": avatarURL})
}
