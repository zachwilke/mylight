package store

import (
	"database/sql"
	"encoding/json"
	"errors"
	"strings"
	"time"
)

var ErrInvalidOccurrence = errors.New("invalid recurring-event operation")
var ErrExceptionResetRequired = errors.New("changing this schedule replaces individual changes and cancellations; explicitly confirm replacing them")
var ErrDetachedEvent = errors.New("edit this occurrence through its recurring series using the latest series version")

func loadEventTx(tx *sql.Tx, id int) (Event, error) {
	var e Event
	var members string
	err := tx.QueryRow(`SELECT id,COALESCE(title,''),start_date,end_date,member_id,recurrence,COALESCE(description,''),COALESCE(location,''),is_all_day,version,timezone,
 (SELECT json_group_array(member_id) FROM (SELECT member_id FROM event_members WHERE event_id=events.id ORDER BY member_id)) FROM events WHERE id=?`, id).
		Scan(&e.ID, &e.Title, &e.StartDate, &e.EndDate, &e.MemberID, &e.Recurrence, &e.Description, &e.Location, &e.IsAllDay, &e.Version, &e.Timezone, &members)
	if err != nil {
		return e, err
	}
	err = json.Unmarshal([]byte(members), &e.MemberIDs)
	return e, err
}

func rejectDetachedWrite(tx *sql.Tx, id int) error {
	var count int
	if err := tx.QueryRow("SELECT count(*) FROM event_exceptions WHERE override_event_id=?", id).Scan(&count); err != nil {
		return err
	}
	if count > 0 {
		return ErrDetachedEvent
	}
	return nil
}

func exceptionKeys(tx *sql.Tx, id int) ([]string, error) {
	rows, err := tx.Query("SELECT recurrence_id FROM event_exceptions WHERE series_id=? ORDER BY recurrence_id", id)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	keys := []string{}
	for rows.Next() {
		var key string
		if err := rows.Scan(&key); err != nil {
			return nil, err
		}
		keys = append(keys, key)
	}
	return keys, rows.Err()
}

// Delete children before their mapping; ON DELETE SET NULL keeps a cancelled
// occurrence if an internal child delete ever happens independently.
func removeExceptions(tx *sql.Tx, id int, from string) error {
	if _, err := tx.Exec("DELETE FROM events WHERE id IN (SELECT override_event_id FROM event_exceptions WHERE series_id=? AND recurrence_id>=?)", id, from); err != nil {
		return err
	}
	_, err := tx.Exec("DELETE FROM event_exceptions WHERE series_id=? AND recurrence_id>=?", id, from)
	return err
}

func protectSeriesWrite(tx *sql.Tx, id int, e Event) error {
	if err := rejectDetachedWrite(tx, id); err != nil {
		return err
	}
	old, err := loadEventTx(tx, id)
	if err != nil {
		return err
	}
	if e.Version != nil && *old.Version != *e.Version {
		return ErrEventConflict
	}
	str := func(p *string) string {
		if p == nil {
			return ""
		}
		return *p
	}
	scheduleChanged := old.StartDate != e.StartDate || str(old.EndDate) != str(e.EndDate) || str(old.Recurrence) != str(e.Recurrence) || old.Timezone != e.Timezone || old.IsAllDay != e.IsAllDay
	if !scheduleChanged {
		return nil
	}
	keys, err := exceptionKeys(tx, id)
	if err != nil {
		return err
	}
	if len(keys) > 0 && !e.ResetExceptions {
		return ErrExceptionResetRequired
	}
	return removeExceptions(tx, id, "")
}

type OccurrenceEditor struct {
	Series           Event    `json:"series"`
	Occurrence       Event    `json:"occurrence"`
	Key              string   `json:"key"`
	FutureRecurrence string   `json:"future_recurrence"`
	Exdates          []string `json:"exdates"`
	Cancelled        bool     `json:"cancelled"`
}

func (s *Store) GetOccurrence(id int, key string) (OccurrenceEditor, error) {
	tx, err := s.DB.Begin()
	if err != nil {
		return OccurrenceEditor{}, err
	}
	defer tx.Rollback()
	series, err := loadEventTx(tx, id)
	if err != nil {
		return OccurrenceEditor{}, err
	}
	ordinal, event, err := LocateOccurrence(series, key)
	if err != nil {
		return OccurrenceEditor{}, err
	}
	key = event.StartDate
	keys, err := exceptionKeys(tx, id)
	if err != nil {
		return OccurrenceEditor{}, err
	}
	var child sql.NullInt64
	err = tx.QueryRow("SELECT override_event_id FROM event_exceptions WHERE series_id=? AND recurrence_id=?", id, key).Scan(&child)
	cancelled := err == nil && !child.Valid
	if err != nil && !errors.Is(err, sql.ErrNoRows) {
		return OccurrenceEditor{}, err
	}
	if child.Valid {
		event, err = loadEventTx(tx, int(child.Int64))
		if err != nil {
			return OccurrenceEditor{}, err
		}
	}
	return OccurrenceEditor{Series: series, Occurrence: event, Key: key, FutureRecurrence: remainingRecurrence(series, ordinal), Exdates: keys, Cancelled: cancelled}, tx.Commit()
}

// A single transaction owns the master revision, exclusion, detached event and
// participants. Racing edits (even on two different occurrences) conflict safely.
func (s *Store) MutateOccurrence(id, version int, key, scope string, replacement *Event, reset bool) (int, error) {
	saved := id
	err := retryEventWrite(func() error {
		tx, err := s.DB.Begin()
		if err != nil {
			return err
		}
		defer tx.Rollback()
		master, err := loadEventTx(tx, id)
		if err != nil {
			return err
		}
		if version < 1 || *master.Version != version {
			return ErrEventConflict
		}
		ordinal, original, err := LocateOccurrence(master, key)
		if err != nil {
			return err
		}
		key = original.StartDate
		keys, err := exceptionKeys(tx, id)
		if err != nil {
			return err
		}
		switch scope {
		case "occurrence", "restore":
			if scope == "occurrence" && len(keys) >= 1000 {
				found := false
				for _, k := range keys {
					if k == key {
						found = true
					}
				}
				if !found {
					return ErrCalendarTooDense
				}
			}
			var child sql.NullInt64
			err = tx.QueryRow("SELECT override_event_id FROM event_exceptions WHERE series_id=? AND recurrence_id=?", id, key).Scan(&child)
			if err != nil && !errors.Is(err, sql.ErrNoRows) {
				return err
			}
			if child.Valid {
				if _, err := tx.Exec("DELETE FROM events WHERE id=?", child.Int64); err != nil {
					return err
				}
			}
			if _, err := tx.Exec("DELETE FROM event_exceptions WHERE series_id=? AND recurrence_id=?", id, key); err != nil {
				return err
			}
			if scope == "occurrence" {
				var override interface{}
				if replacement != nil {
					e := *replacement
					e.Version = nil
					if e.Recurrence != nil && *e.Recurrence != "" {
						return ErrInvalidOccurrence
					}
					created, err := saveEventTx(tx, 0, e)
					if err != nil {
						return err
					}
					override = created
				}
				if _, err := tx.Exec("INSERT INTO event_exceptions(series_id,recurrence_id,override_event_id) VALUES(?,?,?)", id, key, override); err != nil {
					return err
				}
			}
			if _, err := tx.Exec("UPDATE events SET version=version+1 WHERE id=?", id); err != nil {
				return err
			}
		case "future":
			if replacement != nil && !reset {
				for _, k := range keys {
					if k >= key {
						return ErrExceptionResetRequired
					}
				}
			}
			if err := removeExceptions(tx, id, key); err != nil {
				return err
			}
			if ordinal == 0 {
				if replacement == nil {
					_, err = tx.Exec("DELETE FROM events WHERE id=?", id)
				} else {
					e := *replacement
					e.Version = &version
					saved, err = saveEventTx(tx, id, e)
				}
				if err != nil {
					return err
				}
			} else {
				fields := []string{}
				for _, field := range strings.Split(*master.Recurrence, ";") {
					if !strings.HasPrefix(field, "COUNT=") && !strings.HasPrefix(field, "UNTIL=") {
						fields = append(fields, field)
					}
				}
				layout, icsLayout := time.RFC3339Nano, "20060102T150405Z"
				if master.IsAllDay {
					layout = "2006-01-02"
					icsLayout = "20060102"
				}
				cutoff, _ := time.Parse(layout, key)
				// Daily-or-coarser rules need no sub-second cutoff.
				rule := strings.Join(append(fields, "UNTIL="+cutoff.Add(-time.Second).Format(icsLayout)), ";")
				if _, err := tx.Exec("UPDATE events SET recurrence=?,version=version+1 WHERE id=?", rule, id); err != nil {
					return err
				}
				if replacement != nil {
					e := *replacement
					e.Version = nil
					saved, err = saveEventTx(tx, 0, e)
					if err != nil {
						return err
					}
				}
			}
		default:
			return ErrInvalidOccurrence
		}
		return tx.Commit()
	})
	return saved, err
}

// Export is one consistent read snapshot including moved occurrences outside the
// visible window; a series download must not silently lose detached instances.
type SeriesExport struct {
	Event
	Exdates   []string         `json:"exdates"`
	Overrides []ExportOverride `json:"overrides"`
}
type ExportOverride struct {
	Event
	RecurrenceID string `json:"recurrence_id"`
}

func (s *Store) GetSeriesExport(id int) (SeriesExport, error) {
	tx, err := s.DB.Begin()
	if err != nil {
		return SeriesExport{}, err
	}
	defer tx.Rollback()
	event, err := loadEventTx(tx, id)
	if err != nil {
		return SeriesExport{}, err
	}
	result := SeriesExport{Event: event, Exdates: []string{}, Overrides: []ExportOverride{}}
	rows, err := tx.Query("SELECT recurrence_id,override_event_id FROM event_exceptions WHERE series_id=? ORDER BY recurrence_id", id)
	if err != nil {
		return result, err
	}
	type reference struct {
		key string
		id  sql.NullInt64
	}
	refs := []reference{}
	for rows.Next() {
		var ref reference
		if err := rows.Scan(&ref.key, &ref.id); err != nil {
			rows.Close()
			return result, err
		}
		refs = append(refs, ref)
	}
	err = rows.Err()
	rows.Close()
	if err != nil {
		return result, err
	}
	for _, ref := range refs {
		if !ref.id.Valid {
			result.Exdates = append(result.Exdates, ref.key)
			continue
		}
		child, err := loadEventTx(tx, int(ref.id.Int64))
		if err != nil {
			return result, err
		}
		result.Overrides = append(result.Overrides, ExportOverride{Event: child, RecurrenceID: ref.key})
	}
	return result, tx.Commit()
}
