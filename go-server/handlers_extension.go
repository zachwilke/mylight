
// GET /api/search?q=query
func (app *App) handleSearch(w http.ResponseWriter, r *http.Request) {
	if r.Method != "GET" {
		http.Error(w, "Method not allowed", 405)
		return
	}

	query := r.URL.Query().Get("q")
	if query == "" {
		jsonResponse(w, map[string]interface{}{
			"events":  []interface{}{},
			"chores":  []interface{}{},
			"members": []interface{}{},
		})
		return
	}

	searchQuery := "%" + query + "%"
	results := map[string]interface{}{
		"events":  []interface{}{},
		"chores":  []interface{}{},
		"members": []interface{}{},
	}

	// 1. Search Events
	eRows, err := app.DB.Query("SELECT id, title, start_date, location, member_id FROM events WHERE title LIKE ? OR description LIKE ? ORDER BY start_date DESC LIMIT 5", searchQuery, searchQuery)
	if err == nil {
		defer eRows.Close()
		for eRows.Next() {
			var id int
			var title, start string
			var location sql.NullString
			var memberID sql.NullInt64
			if err := eRows.Scan(&id, &title, &start, &location, &memberID); err == nil {
				results["events"] = append(results["events"].([]interface{}), map[string]interface{}{
					"id":         id,
					"title":      title,
					"start_date": start,
					"location":   location.String,
					"member_id":  memberID.Int64,
				})
			}
		}
	}

	// 2. Search Chores
	cRows, err := app.DB.Query("SELECT id, title, member_id, completed FROM chores WHERE title LIKE ? ORDER BY id DESC LIMIT 5", searchQuery)
	if err == nil {
		defer cRows.Close()
		for cRows.Next() {
			var id int
			var title string
			var memberID int
			var completed bool
			if err := cRows.Scan(&id, &title, &memberID, &completed); err == nil {
				results["chores"] = append(results["chores"].([]interface{}), map[string]interface{}{
					"id":        id,
					"title":     title,
					"member_id": memberID,
					"completed": completed,
				})
			}
		}
	}

	// 3. Search Members
	mRows, err := app.DB.Query("SELECT id, name, avatar FROM family_members WHERE name LIKE ? LIMIT 5", searchQuery)
	if err == nil {
		defer mRows.Close()
		for mRows.Next() {
			var id int
			var name string
			var avatar sql.NullString
			if err := mRows.Scan(&id, &name, &avatar); err == nil {
				results["members"] = append(results["members"].([]interface{}), map[string]interface{}{
					"id":     id,
					"name":   name,
					"avatar": avatar.String,
				})
			}
		}
	}

	jsonResponse(w, results)
}
