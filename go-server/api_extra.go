package main

import (
	"encoding/json"
	"fmt"
	"io"
	"log"
	"mime/multipart"
	"mylight/store"
	"net/http"
	"os"
	"path/filepath"
	"time"
)

// -- Meals --
func (app *App) handleMeals(w http.ResponseWriter, r *http.Request) {
	if r.Method == "GET" {
		start := r.URL.Query().Get("start")
		end := r.URL.Query().Get("end")

		meals, err := app.Store.GetMeals(start, end)
		if err != nil {
			jsonError(w, err.Error(), 500)
			return
		}
		if meals == nil {
			meals = []store.Meal{}
		}
		jsonResponse(w, meals)
		return
	}

	if r.Method != "POST" {
		http.Error(w, "Method not allowed", 405)
		return
	}

	var m store.Meal
	if err := json.NewDecoder(r.Body).Decode(&m); err != nil {
		jsonError(w, err.Error(), 400)
		return
	}
	if m.Date == "" || m.Type == "" {
		jsonError(w, "Date and Type required", 400)
		return
	}

	updatedMeal, err := app.Store.UpsertMeal(m)
	if err != nil {
		jsonError(w, err.Error(), 500)
		return
	}
	jsonResponse(w, map[string]interface{}{"success": true, "meal": updatedMeal})
}

// -- Photos --
func (app *App) handlePhotos(w http.ResponseWriter, r *http.Request) {
	if r.Method == "GET" {
		photos, err := app.Store.GetPhotos()
		if err != nil {
			jsonError(w, err.Error(), 500)
			return
		}
		if photos == nil {
			photos = []store.Photo{}
		}
		jsonResponse(w, photos)
		return
	}

	if r.Method != "POST" {
		http.Error(w, "Method not allowed", 405)
		return
	}

	if err := r.ParseMultipartForm(10 << 20); err != nil { // 10MB
		jsonError(w, fmt.Sprintf("Failed to parse multipart form: %v", err), 400)
		return
	}

	files := r.MultipartForm.File["photos"]
	if len(files) == 0 {
		jsonError(w, "No photos provided", 400)
		return
	}

	var urls []string
	var errors []string

	for _, fileHeader := range files {
		url, err := app.savePhoto(fileHeader)
		if err != nil {
			log.Printf("Failed to save photo %s: %v", fileHeader.Filename, err)
			errors = append(errors, fmt.Sprintf("%s: %v", fileHeader.Filename, err))
			continue
		}
		urls = append(urls, url)
	}

	if len(urls) == 0 {
		jsonError(w, fmt.Sprintf("All uploads failed: %v", errors), 500)
		return
	}

	jsonResponse(w, map[string]interface{}{"success": true, "urls": urls})
}

func (app *App) savePhoto(fh *multipart.FileHeader) (string, error) {
	file, err := fh.Open()
	if err != nil {
		return "", fmt.Errorf("open file: %w", err)
	}
	defer file.Close()

	filename := fmt.Sprintf("photo-%d-%s", time.Now().UnixNano(), filepath.Base(fh.Filename))
	dstPath := filepath.Join(app.Config.UploadsDir, filename)

	dst, err := os.Create(dstPath)
	if err != nil {
		return "", fmt.Errorf("create destination: %w", err)
	}
	defer dst.Close()

	if _, err := io.Copy(dst, file); err != nil {
		return "", fmt.Errorf("copy file: %w", err)
	}

	url := "/uploads/" + filename
	if err := app.Store.AddPhoto(url); err != nil {
		return "", fmt.Errorf("save to database: %w", err)
	}
	return url, nil
}
