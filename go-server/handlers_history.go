package main

import (
	"net/http"
	"time"
)

type HistoryRow struct {
	Date       string `json:"date"`
	MemberName string `json:"member_name"`
	Count      int    `json:"count"`
}

func (app *App) handleHistory(w http.ResponseWriter, r *http.Request) {
	if r.Method != "GET" {
		http.Error(w, "Method not allowed", 405)
		return
	}

	period := r.URL.Query().Get("period")
	if period == "" {
		period = "week"
	}

	// Calculate start date
	now := time.Now()
	var startDate time.Time

	switch period {
	case "week":
		startDate = now.AddDate(0, 0, -7)
	case "month":
		startDate = now.AddDate(0, -1, 0)
	case "year":
		startDate = now.AddDate(-1, 0, 0)
	default:
		startDate = now.AddDate(0, 0, -7)
	}

	// SQLite query
	// Group by Date (YYYY-MM-DD) and Member
	query := `
		SELECT 
			strftime('%Y-%m-%d', cc.completed_at) as date,
			m.name,
			COUNT(cc.id) as count
		FROM chore_completions cc
		JOIN family_members m ON cc.member_id = m.id
		WHERE cc.completed_at >= ?
		GROUP BY date, m.name
		ORDER BY date ASC
	`

	rows, err := app.DB.Query(query, startDate)
	if err != nil {
		jsonError(w, err.Error(), 500)
		return
	}
	defer rows.Close()

	var history []HistoryRow
	for rows.Next() {
		var h HistoryRow
		if err := rows.Scan(&h.Date, &h.MemberName, &h.Count); err != nil {
			continue
		}
		history = append(history, h)
	}

	jsonResponse(w, history)
}
