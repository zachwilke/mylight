package store

import (
	"database/sql"
	"errors"
	"fmt"
	"log"
	"time"
)

func (s *Store) GetChores() (map[string][]Chore, error) {
	// 1. Get Members for mapping
	members, err := s.GetFamilyMembersMap()
	if err != nil {
		return nil, err
	}

	memberNames := []string{}
	for _, name := range members {
		memberNames = append(memberNames, name)
	}

	// 2. Get Chores
	rows, err := s.DB.Query("SELECT id, title, member_id, time_of_day, completed FROM chores LIMIT 1000")
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	choresByMember := make(map[string][]Chore)
	for _, name := range members {
		choresByMember[name] = []Chore{}
	}

	for rows.Next() {
		var c Chore
		if err := rows.Scan(&c.ID, &c.Title, &c.MemberID, &c.TimeOfDay, &c.Completed); err != nil {
			return nil, fmt.Errorf("scan chore row: %w", err)
		}
		if name, ok := members[c.MemberID]; ok {
			c.MemberName = name
			choresByMember[name] = append(choresByMember[name], c)
		}
	}
	return choresByMember, rows.Err()
}

func (s *Store) CreateChore(c Chore) (int, error) {
	res, err := s.DB.Exec("INSERT INTO chores (title, member_id, time_of_day, completed) VALUES (?, ?, ?, 0)", c.Title, c.MemberID, c.TimeOfDay)
	if err != nil {
		return 0, err
	}
	id, err := res.LastInsertId()
	return int(id), err
}

func (s *Store) ToggleChore(id int, completed bool) error {
	tx, err := s.DB.Begin()
	if err != nil {
		return err
	}
	defer tx.Rollback()

	// Get member ID
	var memberID int
	var wasCompleted bool
	err = tx.QueryRow("SELECT member_id, completed FROM chores WHERE id = ?", id).Scan(&memberID, &wasCompleted)
	if err != nil {
		return err
	}
	if wasCompleted == completed {
		return tx.Commit()
	}

	// Update Chore
	_, err = tx.Exec("UPDATE chores SET completed = ? WHERE id = ?", completed, id)
	if err != nil {
		return err
	}

	if completed {
		// Add Star
		_, err = tx.Exec("UPDATE family_members SET stars = stars + 1 WHERE id = ?", memberID)
		if err != nil {
			return err
		}
		// Record Completion
		_, err = tx.Exec("INSERT INTO chore_completions (chore_id, member_id) VALUES (?, ?)", id, memberID)
		if err != nil {
			return err
		}
	} else {
		// Remove Star
		_, err = tx.Exec("UPDATE family_members SET stars = MAX(0, stars - 1) WHERE id = ?", memberID)
		if err != nil {
			return err
		}
		// Remove Last Completion
		_, err = tx.Exec("DELETE FROM chore_completions WHERE id = (SELECT id FROM chore_completions WHERE chore_id = ? AND member_id = ? ORDER BY completed_at DESC LIMIT 1)", id, memberID)
		if err != nil {
			return err
		}
	}

	return tx.Commit()
}

func (s *Store) ResetChores(force bool) error {
	location := time.Local
	if zone, err := s.GetSetting("timezone"); err == nil && zone != "" {
		if loc, err := time.LoadLocation(zone); err == nil {
			location = loc
		}
	}
	now := time.Now().In(location)
	resetTime, err := s.GetSetting("chore_reset_time")
	if err != nil && !errors.Is(err, sql.ErrNoRows) {
		return err
	}
	if resetTime == "" {
		resetTime = "00:00"
	}
	clock, err := time.Parse("15:04", resetTime)
	if err != nil {
		return err
	}
	boundary := time.Date(now.Year(), now.Month(), now.Day(), clock.Hour(), clock.Minute(), 0, 0, location)
	if now.Before(boundary) {
		boundary = boundary.AddDate(0, 0, -1)
	}
	today := boundary.Format("2006-01-02")

	var lastReset string
	err = s.DB.QueryRow("SELECT value FROM settings WHERE key = 'last_chore_reset'").Scan(&lastReset)
	if err != nil && !errors.Is(err, sql.ErrNoRows) {
		return err
	}

	if force || lastReset != today {
		log.Println("[Store] Resetting chores...")
		tx, err := s.DB.Begin()
		if err != nil {
			return err
		}
		defer tx.Rollback()
		_, err = tx.Exec("UPDATE chores SET completed = 0")
		if err != nil {
			return err
		}
		_, err = tx.Exec("INSERT OR REPLACE INTO settings (key, value) VALUES ('last_chore_reset', ?)", today)
		if err != nil {
			return err
		}
		return tx.Commit()
	}
	return nil
}

func (s *Store) SearchChores(query string) ([]interface{}, error) {
	rows, err := s.DB.Query("SELECT id, title, member_id, completed FROM chores WHERE title LIKE ? ORDER BY id DESC LIMIT 5", "%"+query+"%")
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var results []interface{}
	for rows.Next() {
		var id int
		var title string
		var memberID int
		var completed bool
		if err := rows.Scan(&id, &title, &memberID, &completed); err != nil {
			return nil, fmt.Errorf("scan search chore row: %w", err)
		}
		results = append(results, map[string]interface{}{
			"id":        id,
			"title":     title,
			"member_id": memberID,
			"completed": completed,
		})
	}
	return results, rows.Err()
}
