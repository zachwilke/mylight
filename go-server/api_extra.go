package main

import (
	"encoding/json"
	"fmt"
	"log"
	"mime/multipart"
	"mylight/store"
	"net/http"
	"os"
	"path/filepath"
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
	app.Broker.Notify("update")
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
	defer r.MultipartForm.RemoveAll()

	files := r.MultipartForm.File["photos"]
	if len(files) == 0 || len(files) > 20 {
		jsonError(w, "Provide between 1 and 20 photos per upload", 400)
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
	app.Broker.Notify("update")
}

func (app *App) savePhoto(fh *multipart.FileHeader) (string, error) {
	file, err := fh.Open()
	if err != nil {
		return "", fmt.Errorf("open file: %w", err)
	}
	defer file.Close()

	url, err := app.saveImage(file)
	if err != nil {
		return "", err
	}
	if err := app.Store.AddPhoto(url); err != nil {
		os.Remove(filepath.Join(app.Config.UploadsDir, filepath.Base(url)))
		return "", fmt.Errorf("save to database: %w", err)
	}
	return url, nil
}
