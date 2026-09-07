package store

import (
	"encoding/json"
	"errors"
	"os"
	"path/filepath"
	"sync"
	"testing"
	"time"
)

func TestOccurrenceSharedFixtures(t *testing.T) {
	data, err := os.ReadFile("../../testdata/recurrence.json")
	if err != nil {
		t.Fatal(err)
	}
	var cases []struct {
		Name            string
		Event           Event
		Starts, Invalid []string
	}
	if err = json.Unmarshal(data, &cases); err != nil {
		t.Fatal(err)
	}
	for _, c := range cases {
		t.Run(c.Name, func(t *testing.T) {
			for index, key := range c.Starts {
				ordinal, occurrence, err := LocateOccurrence(c.Event, key)
				if err != nil || ordinal != index || occurrence.StartDate != key {
					t.Fatalf("%s: index=%d occurrence=%+v err=%v", key, ordinal, occurrence, err)
				}
			}
			for _, key := range c.Invalid {
				if _, _, err := LocateOccurrence(c.Event, key); !errors.Is(err, ErrInvalidOccurrence) {
					t.Fatalf("accepted %s: %v", key, err)
				}
			}
		})
	}
}
func occurrenceStore(t *testing.T) (*Store, int, Event) {
	t.Helper()
	s, err := NewStore(filepath.Join(t.TempDir(), "data.db"))
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { s.Close() })
	rule := "FREQ=DAILY;COUNT=5"
	end := "2026-09-07T15:00:00Z"
	e := Event{Title: "Class", StartDate: "2026-09-07T14:00:00Z", EndDate: &end, Timezone: "America/Chicago", Recurrence: &rule, MemberIDs: []int{}}
	id, err := s.CreateEvent(e)
	if err != nil {
		t.Fatal(err)
	}
	return s, id, e
}
func TestExceptionLifecycleAndSeriesProtection(t *testing.T) {
	s, id, e := occurrenceStore(t)
	key := "2026-09-08T14:00:00Z"
	moved := e
	moved.Title = "Moved"
	moved.StartDate = "2026-10-05T17:00:00Z"
	end := "2026-10-05T18:00:00Z"
	moved.EndDate = &end
	moved.Recurrence = nil
	if _, err := s.MutateOccurrence(id, 1, key, "occurrence", &moved, false); err != nil {
		t.Fatal(err)
	}
	editor, err := s.GetOccurrence(id, key)
	if err != nil {
		t.Fatal(err)
	}
	if *editor.Series.Version != 2 || editor.Occurrence.Title != "Moved" || editor.Key != "2026-09-08T14:00:00.000Z" {
		t.Fatalf("%+v", editor)
	}
	// A moved exception must be discoverable even if the master starts AFTER the
	// requested range (this one moves later; the API test covers moving earlier).
	rangeStart, _ := time.Parse(time.RFC3339, "2026-10-05T00:00:00Z")
	found, err := s.GetEventsInRange(&CalendarRange{Start: rangeStart, End: rangeStart.AddDate(0, 0, 1)})
	if err != nil {
		t.Fatal(err)
	}
	movedFound := false
	for _, raw := range found {
		row := raw.(map[string]interface{})
		if row["title"] == "Moved" {
			movedFound = true
			if row["series_id"] != id {
				t.Fatal(row)
			}
		}
	}
	if !movedFound {
		t.Fatal(found)
	}
	if err := s.DeleteEventVersion(editor.Occurrence.ID, 1); !errors.Is(err, ErrDetachedEvent) {
		t.Fatal(err)
	}
	if _, err := s.MutateOccurrence(id, 1, key, "occurrence", nil, false); !errors.Is(err, ErrEventConflict) {
		t.Fatal(err)
	}
	version := 2
	e.Version = &version
	e.Title = "Renamed series"
	if err := s.UpdateEvent(id, e); err != nil {
		t.Fatal(err)
	}
	editor, _ = s.GetOccurrence(id, key)
	if editor.Occurrence.Title != "Moved" {
		t.Fatal(editor)
	}
	version = 3
	e.StartDate = "2026-09-07T13:00:00Z"
	if err := s.UpdateEvent(id, e); !errors.Is(err, ErrExceptionResetRequired) {
		t.Fatal(err)
	}
	if _, err := s.MutateOccurrence(id, 3, key, "occurrence", nil, false); err != nil {
		t.Fatal(err)
	}
	editor, _ = s.GetOccurrence(id, key)
	if !editor.Cancelled || *editor.Series.Version != 4 {
		t.Fatal(editor)
	}
	if _, err := s.MutateOccurrence(id, 4, key, "restore", nil, false); err != nil {
		t.Fatal(err)
	}
	editor, _ = s.GetOccurrence(id, key)
	if editor.Cancelled || len(editor.Exdates) != 0 || editor.Occurrence.Title != "Renamed series" {
		t.Fatal(editor)
	}
	var count int
	s.DB.QueryRow("SELECT count(*) FROM events").Scan(&count)
	if count != 1 {
		t.Fatal(count)
	}
}
func TestFutureSplitAndDeletePreservePast(t *testing.T) {
	s, id, e := occurrenceStore(t)
	// Keep a past cancellation; future edits must be explicitly replaced.
	if _, err := s.MutateOccurrence(id, 1, "2026-09-07T14:00:00Z", "occurrence", nil, false); err != nil {
		t.Fatal(err)
	}
	if _, err := s.MutateOccurrence(id, 2, "2026-09-10T14:00:00Z", "occurrence", nil, false); err != nil {
		t.Fatal(err)
	}
	editor, err := s.GetOccurrence(id, "2026-09-09T14:00:00Z")
	if err != nil {
		t.Fatal(err)
	}
	if editor.FutureRecurrence != "FREQ=DAILY;COUNT=3" {
		t.Fatal(editor)
	}
	next := editor.Occurrence
	next.Recurrence = &editor.FutureRecurrence
	next.Title = "New class"
	if _, err := s.MutateOccurrence(id, 3, editor.Key, "future", &next, false); !errors.Is(err, ErrExceptionResetRequired) {
		t.Fatal(err)
	}
	newID, err := s.MutateOccurrence(id, 3, editor.Key, "future", &next, true)
	if err != nil || newID == id {
		t.Fatal(newID, err)
	}
	prior, _ := s.GetOccurrence(id, "2026-09-07T14:00:00Z")
	if !prior.Cancelled {
		t.Fatal(prior)
	}
	if _, err := s.GetOccurrence(id, "2026-09-09T14:00:00Z"); !errors.Is(err, ErrInvalidOccurrence) {
		t.Fatal(err)
	}
	if _, err := s.GetOccurrence(newID, "2026-09-11T14:00:00Z"); err != nil {
		t.Fatal(err)
	}
	if _, err := s.GetOccurrence(newID, "2026-09-12T14:00:00Z"); !errors.Is(err, ErrInvalidOccurrence) {
		t.Fatal(err)
	}
	// Deleting from the second date truncates this new series only.
	if _, err := s.MutateOccurrence(newID, 1, "2026-09-10T14:00:00Z", "future", nil, false); err != nil {
		t.Fatal(err)
	}
	if _, err := s.GetOccurrence(newID, "2026-09-09T14:00:00Z"); err != nil {
		t.Fatal(err)
	}
	if _, err := s.GetOccurrence(newID, "2026-09-10T14:00:00Z"); !errors.Is(err, ErrInvalidOccurrence) {
		t.Fatal(err)
	}
	_ = e
}
func TestOccurrenceWriteRollbackAndIndependentConnections(t *testing.T) {
	s, id, e := occurrenceStore(t)
	e.Recurrence = nil
	e.StartDate = "2026-10-01T14:00:00Z"
	e.MemberIDs = []int{999}
	if _, err := s.MutateOccurrence(id, 1, "2026-09-08T14:00:00Z", "occurrence", &e, false); !errors.Is(err, ErrInvalidEventMembers) {
		t.Fatal(err)
	}
	view, _ := s.GetOccurrence(id, "2026-09-08T14:00:00Z")
	if len(view.Exdates) != 0 || *view.Series.Version != 1 {
		t.Fatal(view)
	}
	// Separate connection pools ensure this isn't merely the per-Store mutex.
	var filename string
	var seq int
	var name string
	if err := s.DB.QueryRow("PRAGMA database_list").Scan(&seq, &name, &filename); err != nil {
		t.Fatal(err)
	}
	other, err := NewStore(filename)
	if err != nil {
		t.Fatal(err)
	}
	defer other.Close()
	ready := make(chan struct{})
	results := make(chan error, 2)
	var wg sync.WaitGroup
	for _, conn := range []*Store{s, other} {
		wg.Add(1)
		go func(conn *Store) {
			defer wg.Done()
			<-ready
			_, err := conn.MutateOccurrence(id, 1, "2026-09-08T14:00:00Z", "occurrence", nil, false)
			results <- err
		}(conn)
	}
	close(ready)
	wg.Wait()
	close(results)
	success, conflict := 0, 0
	for err := range results {
		if err == nil {
			success++
		} else if errors.Is(err, ErrEventConflict) {
			conflict++
		} else {
			t.Fatal(err)
		}
	}
	if success != 1 || conflict != 1 {
		t.Fatal(success, conflict)
	}
}
func TestExceptionMigrationRestartAndCascade(t *testing.T) {
	path := filepath.Join(t.TempDir(), "old.db")
	s, err := NewStore(path)
	if err != nil {
		t.Fatal(err)
	}
	if _, err = s.DB.Exec("DROP TABLE event_exceptions; DELETE FROM schema_migrations WHERE version=8"); err != nil {
		t.Fatal(err)
	}
	s.Close()
	for i := 0; i < 2; i++ {
		s, err = NewStore(path)
		if err != nil {
			t.Fatal(err)
		}
		s.Close()
	}
	s, err = NewStore(path)
	if err != nil {
		t.Fatal(err)
	}
	defer s.Close()
	rule := "FREQ=DAILY;COUNT=2"
	e := Event{Title: "Test", StartDate: "2026-09-07", IsAllDay: true, Recurrence: &rule, MemberIDs: []int{}}
	id, err := s.CreateEvent(e)
	if err != nil {
		t.Fatal(err)
	}
	e.Recurrence = nil
	e.StartDate = "2026-10-01"
	if _, err := s.MutateOccurrence(id, 1, "2026-09-08", "occurrence", &e, false); err != nil {
		t.Fatal(err)
	}
	if err := s.DeleteEventVersion(id, 2); err != nil {
		t.Fatal(err)
	}
	for _, table := range []string{"events", "event_exceptions", "event_members"} {
		var count int
		if err := s.DB.QueryRow("SELECT count(*) FROM " + table).Scan(&count); err != nil || count != 0 {
			t.Fatal(table, count, err)
		}
	}
}
