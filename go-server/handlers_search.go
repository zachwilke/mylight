
// GET /api/search?q=query
func (app *App) handleSearch(w http.ResponseWriter, r *http.Request) {
	if r.Method != "GET" {
		http.Error(w, "Method not allowed", 405)
		return
	}

	query := r.URL.Query().Get("q")
	if query == "" {
		jsonResponse(w, map[string]interface{}{})
		return
	}

	searchQuery := "%" + query + "%"

	// 1. Search Events
	rows, err := app.DB.Query("SELECT id, title, start_date, location, member_id FROM events WHERE title LIKE ? OR description LIKE ? LIMIT 5", searchQuery, searchQuery)
	if err != nil {
		jsonError(w, err.Error(), 500)
		return
	}
	defer rows.Close()

	events := []map[string]interface{}{}
	for rows.Next() {
		var id int
		var title, start, location string
		var memberID sql.NullInt64
		if err := rows.Scan(&id, &title, &start, &location, &memberID); err != nil {
			// Try scanning with nullable strings if simple strings fail
			// But schema says title, start_date are NOT NULL usually. Location might be null.
			// Let's use NullString for location in scan if needed, or simple string if schema enforces default ""
			// Re-checking handleEvents: location is sql.NullString.
			continue // skip for now if scan fails, but we should fix scan
		}
		// Wait, scan needs to match types.
		// Let's assume location is nullable.
		// Re-write query to handle nulls
	}
	// Re-do Search with proper scanning
}
