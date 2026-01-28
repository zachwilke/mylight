package store

import (
	"database/sql"
)

func (s *Store) GetEvents() ([]interface{}, error) {
	rows, err := s.DB.Query("SELECT id, title, start_date, end_date, member_id, recurrence, description, location, is_all_day FROM events")
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var events []interface{}
	for rows.Next() {
		var id int
		var title, startDate, recurrence string
		var endDate, description, location sql.NullString
		var memberID sql.NullInt64
		var isAllDay sql.NullBool

		if err := rows.Scan(&id, &title, &startDate, &endDate, &memberID, &recurrence, &description, &location, &isAllDay); err != nil {
			continue
		}

		events = append(events, map[string]interface{}{
			"id":          id,
			"title":       title,
			"start_date":  startDate,
			"end_date":    endDate.String,
			"member_id":   memberID.Int64,
			"recurrence":  recurrence,
			"description": description.String,
			"location":    location.String,
			"is_all_day":  isAllDay.Bool,
		})
	}
	return events, nil
}

func (s *Store) CreateEvent(e Event) (int, error) {
	var memberID interface{} = e.MemberID
	if e.MemberID != nil && *e.MemberID == 0 {
		memberID = nil
	}

	res, err := s.DB.Exec("INSERT INTO events (title, start_date, end_date, member_id, recurrence, description, location, is_all_day) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
		e.Title, e.StartDate, e.EndDate, memberID, e.Recurrence, e.Description, e.Location, e.IsAllDay)
	if err != nil {
		return 0, err
	}
	id, err := res.LastInsertId()
	return int(id), err
}

func (s *Store) UpdateEvent(id int, e Event) error {
	var memberID interface{} = e.MemberID
	if e.MemberID != nil && *e.MemberID == 0 {
		memberID = nil
	}

	_, err := s.DB.Exec("UPDATE events SET title=?, start_date=?, end_date=?, member_id=?, recurrence=?, description=?, location=?, is_all_day=? WHERE id=?",
		e.Title, e.StartDate, e.EndDate, memberID, e.Recurrence, e.Description, e.Location, e.IsAllDay, id)
	return err
}

func (s *Store) DeleteEvent(id int) error {
	_, err := s.DB.Exec("DELETE FROM events WHERE id = ?", id)
	return err
}

func (s *Store) SearchEvents(query string) ([]interface{}, error) {
	rows, err := s.DB.Query("SELECT id, title, start_date, location, member_id FROM events WHERE title LIKE ? OR description LIKE ? ORDER BY start_date DESC LIMIT 5", "%"+query+"%", "%"+query+"%")
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var results []interface{}
	for rows.Next() {
		var id int
		var title, start string
		var location sql.NullString
		var memberID sql.NullInt64
		if err := rows.Scan(&id, &title, &start, &location, &memberID); err == nil {
			results = append(results, map[string]interface{}{
				"id":         id,
				"title":      title,
				"start_date": start,
				"location":   location.String,
				"member_id":  memberID.Int64,
			})
		}
	}
	return results, nil
}
