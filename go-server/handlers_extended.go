package main

import (
	"database/sql"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"time"

	"github.com/apognu/gocal"
)

// -- Meals --
func (app *App) handleMeals(w http.ResponseWriter, r *http.Request) {
	if r.Method == "GET" {
		q := "SELECT id, title, date, type, color FROM meals"
		// start, end query params support if needed
		start := r.URL.Query().Get("start")
		end := r.URL.Query().Get("end")
		var rows *sql.Rows
		var err error

		if start != "" && end != "" {
			q += " WHERE date BETWEEN ? AND ?"
			rows, err = app.DB.Query(q, start, end)
		} else {
			rows, err = app.DB.Query(q)
		}

		if err != nil {
			jsonError(w, err.Error(), 500)
			return
		}
		defer rows.Close()

		var meals []Meal
		for rows.Next() {
			var m Meal
			rows.Scan(&m.ID, &m.Title, &m.Date, &m.Type, &m.Color)
			meals = append(meals, m)
		}
		jsonResponse(w, meals)
	} else if r.Method == "POST" {
		var m Meal
		if err := json.NewDecoder(r.Body).Decode(&m); err != nil {
			jsonError(w, err.Error(), 400)
			return
		}
		if m.Date == "" || m.Type == "" {
			jsonError(w, "Date and Type required", 400)
			return
		}

		// Check existing
		var existingID int
		err := app.DB.QueryRow("SELECT id FROM meals WHERE date = ? AND type = ?", m.Date, m.Type).Scan(&existingID)
		if err == nil {
			// Update
			_, err = app.DB.Exec("UPDATE meals SET title = ?, color = ? WHERE id = ?", m.Title, m.Color, existingID)
			if err != nil {
				jsonError(w, err.Error(), 500)
				return
			}
			m.ID = existingID
		} else {
			// Insert
			res, err := app.DB.Exec("INSERT INTO meals (date, type, title, color) VALUES (?, ?, ?, ?)", m.Date, m.Type, m.Title, m.Color)
			if err != nil {
				jsonError(w, err.Error(), 500)
				return
			}
			id, _ := res.LastInsertId()
			m.ID = int(id)
		}
		jsonResponse(w, map[string]interface{}{"success": true, "meal": m})
	}
}

// -- Events & Calendar --
func (app *App) handleEvents(w http.ResponseWriter, r *http.Request) {
	if r.Method == "GET" {
		// 1. Local Events
		rows, err := app.DB.Query("SELECT id, title, start_date, end_date, member_id, recurrence, description, location, is_all_day FROM events")
		if err != nil {
			jsonError(w, err.Error(), 500)
			return
		}
		defer rows.Close()

		var events []Event
		for rows.Next() {
			var e Event
			var id int
			var endDate sql.NullString
			var desc, loc sql.NullString
			var isAllDay sql.NullBool

			rows.Scan(&id, &e.Title, &e.StartDate, &endDate, &e.MemberID, &e.Recurrence, &desc, &loc, &isAllDay)
			e.ID = id
			if endDate.Valid {
				s := endDate.String
				e.EndDate = &s
			}
			if desc.Valid {
				e.Description = desc.String
			}
			if loc.Valid {
				e.Location = loc.String
			}
			if isAllDay.Valid {
				e.IsAllDay = isAllDay.Bool
			}
			events = append(events, e)
		}

		// 2. External Calendars
		subRows, err := app.DB.Query("SELECT url, color FROM calendar_subscriptions")
		if err == nil {
			defer subRows.Close()
			for subRows.Next() {
				var url, color string
				subRows.Scan(&url, &color)

				// Fetch external
				extEvents, err := fetchExternalCalendar(url, color)
				if err == nil {
					events = append(events, extEvents...)
				}
			}
		}

		jsonResponse(w, events)
	} else if r.Method == "POST" {
		var e Event
		if err := json.NewDecoder(r.Body).Decode(&e); err != nil {
			jsonError(w, err.Error(), 400)
			return
		}
		res, err := app.DB.Exec(
			"INSERT INTO events (title, start_date, end_date, member_id, recurrence, description, location, is_all_day) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
			e.Title, e.StartDate, e.EndDate, e.MemberID, e.Recurrence, e.Description, e.Location, e.IsAllDay,
		)
		if err != nil {
			jsonError(w, err.Error(), 500)
			return
		}
		id, _ := res.LastInsertId()
		e.ID = int(id)
		jsonResponse(w, e)
	} else if r.Method == "PUT" {
		// Basic update support
		// parts := filepath.SplitList(r.URL.Path)
		// ... manual parse of ID or just expect it in body if we refactor, but standard REST usually implies ID in URL
		// For now, let's just grab ID from e.ID if we sent it, or reuse the path splitting logic
		// The current router in main.go doesn't easily support parameterized routes /api/events/:id without manual parsing
		// But let's check how DELETE works or just implement extraction.
		// NOTE: simple router in main.go matches strict paths usually, but "/" prefix matches all.
		// handleEvents is mapped to "/api/events" ? No it checks method.
		// Actually typical pattern here: /api/events/123

		idStr := filepath.Base(r.URL.Path)
		if idStr == "events" || idStr == "" {
			// It's just /api/events, so POST is Create. PUT without ID is weird.
			// If the user wants to update, they usually send to /api/events/123
			// We need to check if we are at root or subpath
			jsonError(w, "Missing ID for update", 400)
			return
		}

		var e Event
		if err := json.NewDecoder(r.Body).Decode(&e); err != nil {
			jsonError(w, err.Error(), 400)
			return
		}

		_, err := app.DB.Exec(
			"UPDATE events SET title=?, start_date=?, end_date=?, member_id=?, recurrence=?, description=?, location=?, is_all_day=? WHERE id=?",
			e.Title, e.StartDate, e.EndDate, e.MemberID, e.Recurrence, e.Description, e.Location, e.IsAllDay, idStr,
		)
		if err != nil {
			jsonError(w, err.Error(), 500)
			return
		}
		jsonResponse(w, e)
	} else if r.Method == "DELETE" {
		idStr := filepath.Base(r.URL.Path)
		if idStr == "events" {
			jsonError(w, "Missing ID", 400)
			return
		}
		_, err := app.DB.Exec("DELETE FROM events WHERE id = ?", idStr)
		if err != nil {
			jsonError(w, err.Error(), 500)
			return
		}
		jsonResponse(w, map[string]bool{"success": true})
	}
}

func fetchExternalCalendar(url, color string) ([]Event, error) {
	resp, err := http.Get(url)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	c := gocal.NewParser(resp.Body)
	c.Parse()

	var events []Event
	for _, e := range c.Events {
		start := e.Start.Format(time.RFC3339)
		end := e.End.Format(time.RFC3339)
		events = append(events, Event{
			ID:         fmt.Sprintf("ext-%s", e.Uid),
			Title:      e.Summary,
			StartDate:  start,
			EndDate:    &end,
			Color:      color,
			IsExternal: true,
		})
	}
	return events, nil
}

// -- Photos --
func (app *App) handlePhotos(w http.ResponseWriter, r *http.Request) {
	if r.Method == "GET" {
		rows, err := app.DB.Query("SELECT id, url, uploaded_at FROM photos ORDER BY uploaded_at DESC")
		if err != nil {
			jsonError(w, err.Error(), 500)
			return
		}
		defer rows.Close()
		var photos []Photo
		for rows.Next() {
			var p Photo
			rows.Scan(&p.ID, &p.URL, &p.UploadedAt)
			photos = append(photos, p)
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
			dstPath := filepath.Join(UploadsDir, filename)

			dst, err := os.Create(dstPath)
			if err != nil {
				continue
			}
			defer dst.Close()

			io.Copy(dst, file)

			url := "/uploads/" + filename
			app.DB.Exec("INSERT INTO photos (url) VALUES (?)", url)
			urls = append(urls, url)
		}
		jsonResponse(w, map[string]interface{}{"success": true, "urls": urls})
	}
}
