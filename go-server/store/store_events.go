package store

import (
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"time"
)

const MaxCalendarEvents = 5000

var ErrCalendarTooDense = errors.New("calendar has too many entries; choose a smaller date range or reduce recurring series")

// CalendarRange uses instants for timed events and the caller's displayed civil
// dates for floating all-day events. End is exclusive, including across DST.
type CalendarRange struct {
	Start, End time.Time
}

func (r CalendarRange) Days() (string, string) {
	end := r.End
	if end.Hour() != 0 || end.Minute() != 0 || end.Second() != 0 || end.Nanosecond() != 0 {
		end = end.AddDate(0, 0, 1)
	}
	return r.Start.Format("2006-01-02"), end.Format("2006-01-02")
}

func (s *Store) GetEvents() ([]interface{}, error) {
	return s.GetEventsInRange(nil)
}

func (s *Store) GetEventsInRange(window *CalendarRange) ([]interface{}, error) {
	return s.getEvents(window, nil)
}

func (s *Store) GetEvent(id int) (interface{}, error) {
	events, err := s.getEvents(nil, &id)
	if err != nil {
		return nil, err
	}
	if len(events) == 0 {
		return nil, sql.ErrNoRows
	}
	return events[0], nil
}

func (s *Store) getEvents(window *CalendarRange, id *int) ([]interface{}, error) {
	query := `SELECT id, title, start_date, end_date, member_id, recurrence, description, location, is_all_day, version, timezone,
        (SELECT json_group_array(recurrence_id) FROM event_exceptions WHERE series_id=events.id),
        COALESCE((SELECT series_id FROM event_exceptions WHERE override_event_id=events.id),0),
        COALESCE((SELECT recurrence_id FROM event_exceptions WHERE override_event_id=events.id),''),
		COALESCE((SELECT '[' || group_concat(member_id) || ']' FROM
			(SELECT member_id FROM event_members WHERE event_id=events.id ORDER BY member_id)),
			(SELECT '[' || id || ']' FROM family_members WHERE id=events.member_id),'[]') FROM events`
	args := []interface{}{}
	if id != nil {
		query += " WHERE id=?"
		args = append(args, *id)
	} else if window != nil {
		startDay, endDay := window.Days()
		// Recurrence masters must be retained even when their original DTSTART is
		// long before the requested week. Expansion/exception semantics stay with
		// the shared occurrence engine; returning a master is not an occurrence.
		query += ` WHERE CASE WHEN is_all_day=1 AND length(start_date)=10 THEN
			julianday(start_date)<julianday(?) AND
			(COALESCE(recurrence,'')!='' OR
			 julianday(COALESCE(NULLIF(end_date,''),date(start_date,'+1 day')))>julianday(?) OR julianday(start_date)>=julianday(?))
		ELSE
			julianday(start_date)<julianday(?) AND
			(COALESCE(recurrence,'')!='' OR
			 julianday(COALESCE(NULLIF(end_date,''),datetime(start_date,'+1 hour')))>julianday(?) OR julianday(start_date)>=julianday(?))
		END`
		args = append(args, endDay, startDay, startDay, window.End.Format(time.RFC3339Nano), window.Start.Format(time.RFC3339Nano), window.Start.Format(time.RFC3339Nano))
	}
	// One extra row lets us fail honestly instead of displaying a partial calendar.
	query += " ORDER BY julianday(start_date), id LIMIT ?"
	args = append(args, MaxCalendarEvents+1)
	rows, err := s.DB.Query(query, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	events := []interface{}{}
	exceptionCount := 0
	for rows.Next() {
		var id int
		var version int
		var title, startDate, timezone string
		var recurrence sql.NullString
		var endDate, description, location sql.NullString
		var memberID sql.NullInt64
		var isAllDay sql.NullBool
		var memberJSON, exclusions, recurrenceID string
		var seriesID int

		if err := rows.Scan(&id, &title, &startDate, &endDate, &memberID, &recurrence, &description, &location, &isAllDay, &version, &timezone, &exclusions, &seriesID, &recurrenceID, &memberJSON); err != nil {
			return nil, fmt.Errorf("scan event row: %w", err)
		}

		memberIDs := []int{}
		if err := json.Unmarshal([]byte(memberJSON), &memberIDs); err != nil {
			return nil, err
		}
		exdates := []string{}
		if err := json.Unmarshal([]byte(exclusions), &exdates); err != nil {
			return nil, err
		}
		exceptionCount += len(exdates)
		if exceptionCount > MaxCalendarEvents {
			return nil, ErrCalendarTooDense
		}
		events = append(events, map[string]interface{}{
			"exdates":       exdates,
			"series_id":     seriesID,
			"recurrence_id": recurrenceID,
			"timezone":      timezone,
			"version":       version,
			"member_ids":    memberIDs,
			"id":            id,
			"title":         title,
			"start_date":    startDate,
			"end_date":      endDate.String,
			"member_id":     memberID.Int64,
			"recurrence":    recurrence.String,
			"description":   description.String,
			"location":      location.String,
			"is_all_day":    isAllDay.Bool,
		})
		if len(events) > MaxCalendarEvents {
			return nil, ErrCalendarTooDense
		}
	}
	return events, rows.Err()
}

func (s *Store) CreateEvent(e Event) (int, error) {
	return s.saveEvent(0, e)
}

func (s *Store) UpdateEvent(id int, e Event) error {
	_, err := s.saveEvent(id, e)
	return err
}

func (s *Store) DeleteEvent(id int) error {
	tx, err := s.DB.Begin()
	if err != nil {
		return err
	}
	defer tx.Rollback()
	if err := rejectDetachedWrite(tx, id); err != nil {
		return err
	}
	if err := removeExceptions(tx, id, ""); err != nil {
		return err
	}
	if _, err := tx.Exec("DELETE FROM events WHERE id=?", id); err != nil {
		return err
	}
	return tx.Commit()
}

func (s *Store) DeleteEventVersion(id, version int) error {
	return retryEventWrite(func() error { return s.deleteEventVersionAttempt(id, version) })
}

func (s *Store) deleteEventVersionAttempt(id, version int) error {
	tx, err := s.DB.Begin()
	if err != nil {
		return err
	}
	defer tx.Rollback()
	var current int
	if err := tx.QueryRow("SELECT version FROM events WHERE id=?", id).Scan(&current); err != nil {
		return err
	}
	if current != version {
		return ErrEventConflict
	}
	if err := rejectDetachedWrite(tx, id); err != nil {
		return err
	}
	if err := removeExceptions(tx, id, ""); err != nil {
		return err
	}
	result, err := tx.Exec("DELETE FROM events WHERE id=? AND version=?", id, version)
	if err != nil {
		return err
	}
	changed, err := result.RowsAffected()
	if err != nil {
		return err
	}
	if changed != 1 {
		return ErrEventConflict
	}
	return tx.Commit()
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
		if err := rows.Scan(&id, &title, &start, &location, &memberID); err != nil {
			return nil, fmt.Errorf("scan search event row: %w", err)
		}
		results = append(results, map[string]interface{}{
			"id":         id,
			"title":      title,
			"start_date": start,
			"location":   location.String,
			"member_id":  memberID.Int64,
		})
	}
	return results, rows.Err()
}
