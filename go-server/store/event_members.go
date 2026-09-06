package store

import (
	"database/sql"
	"errors"
	"sort"
	"time"
)

var ErrInvalidEventMembers = errors.New("choose at most 100 existing family members with distinct positive IDs")
var ErrLegacyEventMembers = errors.New("this event has multiple participants; reload with a current MyLight client before editing")
var ErrEventConflict = errors.New("this event changed on another device; review the latest version before saving or deleting")

// All event fields and their participant set commit together. Nil is a legacy
// request; an explicit empty slice means an unassigned/shared event.
func (s *Store) saveEvent(id int, e Event) (int, error) {
	var saved int
	err := retryEventWrite(func() error { var err error; saved, err = s.saveEventAttempt(id, e); return err })
	return saved, err
}

// Retry the entire rolled-back transaction, never a statement in an obsolete
// SQLite read snapshot. Successful writes are never replayed.
func retryEventWrite(write func() error) error {
	for attempt := 0; ; attempt++ {
		err := write()
		var code interface{ Code() int }
		if attempt >= 6 || !errors.As(err, &code) || (code.Code()&255 != 5 && code.Code()&255 != 6) {
			return err
		}
		// Slow disks and race-instrumented Linux runners can keep the winning
		// writer active beyond a few milliseconds. Back off for at most 1.175s
		// in total, while retaining a fixed attempt budget and never replaying
		// conflicts or uncertain non-lock failures.
		delay := min(25<<attempt, 400)
		time.Sleep(time.Duration(delay) * time.Millisecond)
	}
}

func (s *Store) saveEventAttempt(id int, e Event) (int, error) {
	tx, err := s.DB.Begin()
	if err != nil {
		return 0, err
	}
	defer tx.Rollback()
	if id != 0 {
		var version int
		if err := tx.QueryRow("SELECT version FROM events WHERE id=?", id).Scan(&version); err != nil {
			return 0, err
		}
		if e.Version != nil && *e.Version != version {
			return 0, ErrEventConflict
		}
		if e.MemberIDs == nil {
			var count int
			if err := tx.QueryRow("SELECT count(*) FROM event_members WHERE event_id=?", id).Scan(&count); err != nil {
				return 0, err
			}
			if count > 1 {
				return 0, ErrLegacyEventMembers
			}
		}
	}
	ids := append([]int{}, e.MemberIDs...)
	if e.MemberIDs == nil && e.MemberID != nil && *e.MemberID != 0 {
		ids = append(ids, *e.MemberID)
	}
	if len(ids) > 100 {
		return 0, ErrInvalidEventMembers
	}
	sort.Ints(ids)
	for i, member := range ids {
		if member <= 0 || (i > 0 && ids[i-1] == member) {
			return 0, ErrInvalidEventMembers
		}
		var exists int
		if err := tx.QueryRow("SELECT id FROM family_members WHERE id=?", member).Scan(&exists); err != nil {
			if errors.Is(err, sql.ErrNoRows) {
				return 0, ErrInvalidEventMembers
			}
			return 0, err
		}
	}
	var primary interface{}
	if len(ids) > 0 {
		primary = ids[0]
	}
	if id == 0 {
		result, err := tx.Exec("INSERT INTO events(title,start_date,end_date,member_id,recurrence,description,location,is_all_day) VALUES(?,?,?,?,?,?,?,?)", e.Title, e.StartDate, e.EndDate, primary, e.Recurrence, e.Description, e.Location, e.IsAllDay)
		if err != nil {
			return 0, err
		}
		created, err := result.LastInsertId()
		if err != nil {
			return 0, err
		}
		id = int(created)
	} else {
		query := "UPDATE events SET title=?,start_date=?,end_date=?,member_id=?,recurrence=?,description=?,location=?,is_all_day=?,version=version+1 WHERE id=?"
		args := []interface{}{e.Title, e.StartDate, e.EndDate, primary, e.Recurrence, e.Description, e.Location, e.IsAllDay, id}
		if e.Version != nil {
			query += " AND version=?"
			args = append(args, *e.Version)
		}
		result, err := tx.Exec(query, args...)
		if err != nil {
			return 0, err
		}
		changed, err := result.RowsAffected()
		if err != nil {
			return 0, err
		}
		if changed != 1 {
			return 0, ErrEventConflict
		}
	}
	if _, err := tx.Exec("DELETE FROM event_members WHERE event_id=?", id); err != nil {
		return 0, err
	}
	for _, member := range ids {
		if _, err := tx.Exec("INSERT INTO event_members(event_id,member_id) VALUES(?,?)", id, member); err != nil {
			return 0, err
		}
	}
	return id, tx.Commit()
}
