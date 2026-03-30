package main

import (
	"encoding/json"
	"fmt"
	"io"
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

	} else if r.Method == "POST" {
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

	} else if r.Method == "POST" {
		// Multipart upload
		err := r.ParseMultipartForm(10 << 20) // 10MB
		if err != nil {
			jsonError(w, err.Error(), 400)
			return
		}

		files := r.MultipartForm.File["photos"]
		var urls []string

		for _, fileHeader := range files {
			file, err := fileHeader.Open()
			if err != nil {
				continue
			}
			defer file.Close()

			// Generate unique name
			filename := fmt.Sprintf("photo-%d-%s", time.Now().UnixNano(), filepath.Base(fileHeader.Filename))
			dstPath := filepath.Join(app.Config.UploadsDir, filename)

			dst, err := os.Create(dstPath)
			if err != nil {
				continue
			}
			defer dst.Close()

			io.Copy(dst, file)

			url := "/uploads/" + filename
			app.Store.AddPhoto(url)
			urls = append(urls, url)
		}
		jsonResponse(w, map[string]interface{}{"success": true, "urls": urls})
	}
}
