package store

import (
	"errors"
	"path/filepath"
	"reflect"
	"testing"
)

func TestEventParticipantsAtomicLifecycle(t *testing.T) {
	s, err := NewStore(filepath.Join(t.TempDir(), "test.db"))
	if err != nil {
		t.Fatal(err)
	}
	defer s.Close()
	if _, err := s.DB.Exec("INSERT INTO family_members(id,name,role) VALUES(1,'Alex','child'),(2,'Alex','child')"); err != nil {
		t.Fatal(err)
	}
	e := Event{Title: "Together", StartDate: "2026-09-05T12:00:00Z", MemberIDs: []int{2, 1}}
	id, err := s.CreateEvent(e)
	if err != nil {
		t.Fatal(err)
	}
	check := func(want []int, title string) {
		t.Helper()
		events, err := s.GetEvents()
		if err != nil {
			t.Fatal(err)
		}
		row := events[0].(map[string]interface{})
		if !reflect.DeepEqual(row["member_ids"], want) || row["title"] != title {
			t.Fatal(row)
		}
	}
	check([]int{1, 2}, "Together")
	// A storage failure after updating the event must roll back both tables.
	if _, err := s.DB.Exec("CREATE TRIGGER reject_participant BEFORE INSERT ON event_members WHEN NEW.member_id=2 BEGIN SELECT RAISE(ABORT,'fixture failure'); END"); err != nil {
		t.Fatal(err)
	}
	e.Title = "Must roll back"
	if err := s.UpdateEvent(id, e); err == nil {
		t.Fatal("expected participant insertion failure")
	}
	check([]int{1, 2}, "Together")
	if _, err := s.DB.Exec("DROP TRIGGER reject_participant"); err != nil {
		t.Fatal(err)
	}
	e.Title = "Must roll back"
	for _, ids := range [][]int{{1, 999}, {1, 1}, {0}, {-1}} {
		e.MemberIDs = ids
		if err := s.UpdateEvent(id, e); !errors.Is(err, ErrInvalidEventMembers) {
			t.Fatal(err)
		}
		check([]int{1, 2}, "Together")
	}
	e.MemberIDs = make([]int, 101)
	if err := s.UpdateEvent(id, e); !errors.Is(err, ErrInvalidEventMembers) {
		t.Fatal(err)
	}
	e.MemberIDs = nil
	if err := s.UpdateEvent(id, e); !errors.Is(err, ErrLegacyEventMembers) {
		t.Fatal(err)
	}
	check([]int{1, 2}, "Together")
	if err := s.DeleteFamilyMember(1); err != nil {
		t.Fatal(err)
	}
	check([]int{2}, "Together")
	var primary int
	if err := s.DB.QueryRow("SELECT member_id FROM events WHERE id=?", id).Scan(&primary); err != nil || primary != 2 {
		t.Fatal(primary, err)
	}
	if err := s.DeleteFamilyMember(2); err != nil {
		t.Fatal(err)
	}
	check([]int{}, "Together")
	if err := s.DeleteEvent(id); err != nil {
		t.Fatal(err)
	}
	var count int
	if err := s.DB.QueryRow("SELECT count(*) FROM event_members").Scan(&count); err != nil || count != 0 {
		t.Fatal(count, err)
	}
}

func TestEventParticipantMigrationAndRestart(t *testing.T) {
	path := filepath.Join(t.TempDir(), "legacy.db")
	s, err := NewStore(path)
	if err != nil {
		t.Fatal(err)
	}
	// Recreate the immediately preceding schema using only synthetic data.
	_, err = s.DB.Exec(`DROP TABLE event_members; DELETE FROM schema_migrations WHERE version=5;
		INSERT INTO family_members(id,name) VALUES(1,'Alex');
		INSERT INTO events(id,title,start_date,member_id) VALUES(1,'Legacy','2026-09-05T12:00:00Z',1),(2,'Orphan','2026-09-05T12:00:00Z',999);`)
	if err != nil {
		t.Fatal(err)
	}
	s.Close()
	for i := 0; i < 2; i++ {
		s, err = NewStore(path)
		if err != nil {
			t.Fatal(err)
		}
		events, err := s.GetEvents()
		if err != nil {
			t.Fatal(err)
		}
		if !reflect.DeepEqual(events[0].(map[string]interface{})["member_ids"], []int{1}) || !reflect.DeepEqual(events[1].(map[string]interface{})["member_ids"], []int{}) {
			t.Fatal(events)
		}
		s.Close()
	}
}

func TestEventParticipantsExplicitSharedAndCascade(t *testing.T) {
	s, err := NewStore(filepath.Join(t.TempDir(), "test.db"))
	if err != nil {
		t.Fatal(err)
	}
	defer s.Close()
	if _, err = s.DB.Exec("INSERT INTO family_members(id,name) VALUES(1,'Alex'),(2,'Sam')"); err != nil {
		t.Fatal(err)
	}
	e := Event{Title: "Meeting", StartDate: "2026-09-05T12:00:00Z", MemberIDs: []int{1, 2}}
	id, err := s.CreateEvent(e)
	if err != nil {
		t.Fatal(err)
	}
	e.MemberIDs = []int{}
	if err = s.UpdateEvent(id, e); err != nil {
		t.Fatal(err)
	}
	rows, err := s.GetEvents()
	if err != nil {
		t.Fatal(err)
	}
	if len(rows[0].(map[string]interface{})["member_ids"].([]int)) != 0 {
		t.Fatal(rows)
	}
	e.MemberIDs = []int{1, 2}
	if err = s.UpdateEvent(id, e); err != nil {
		t.Fatal(err)
	}
	if err = s.DeleteEvent(id); err != nil {
		t.Fatal(err)
	}
	var n int
	if err = s.DB.QueryRow("SELECT count(*) FROM event_members").Scan(&n); err != nil || n != 0 {
		t.Fatal(n, err)
	}
}
