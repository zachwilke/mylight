package store

import (
	"errors"
	"path/filepath"
	"testing"
)

type eventLockFixture struct{}

func (eventLockFixture) Error() string { return "synthetic SQLite busy snapshot" }
func (eventLockFixture) Code() int     { return 517 }

func TestEventWriteRetriesAreBoundedAndDoNotReplayConflicts(t *testing.T) {
	calls := 0
	err := retryEventWrite(func() error { calls++; return eventLockFixture{} })
	if err == nil || calls != 4 {
		t.Fatal(calls, err)
	}
	calls = 0
	err = retryEventWrite(func() error { calls++; return ErrEventConflict })
	if !errors.Is(err, ErrEventConflict) || calls != 1 {
		t.Fatal(calls, err)
	}
	calls = 0
	err = retryEventWrite(func() error {
		calls++
		if calls < 2 {
			return eventLockFixture{}
		}
		return nil
	})
	if err != nil || calls != 2 {
		t.Fatal(calls, err)
	}
}

func TestEventVersionMigrationAndRestart(t *testing.T) {
	path := filepath.Join(t.TempDir(), "v5.db")
	s, err := NewStore(path)
	if err != nil {
		t.Fatal(err)
	}
	if _, err := s.DB.Exec(`ALTER TABLE events DROP COLUMN version; DELETE FROM schema_migrations WHERE version=6;
		INSERT INTO events(title,start_date) VALUES('Legacy','2026-09-05T12:00:00Z');`); err != nil {
		t.Fatal(err)
	}
	s.Close()
	s, err = NewStore(path)
	if err != nil {
		t.Fatal(err)
	}
	e, err := s.GetEvent(1)
	if err != nil || e.(map[string]interface{})["version"] != 1 {
		t.Fatal(e, err)
	}
	v := 1
	if err := s.UpdateEvent(1, Event{Title: "Updated", StartDate: "2026-09-05T12:00:00Z", Version: &v}); err != nil {
		t.Fatal(err)
	}
	if err := s.UpdateEvent(1, Event{Title: "Stale", StartDate: "2026-09-05T12:00:00Z", Version: &v}); !errors.Is(err, ErrEventConflict) {
		t.Fatal(err)
	}
	s.Close()
	s, err = NewStore(path)
	if err != nil {
		t.Fatal(err)
	}
	defer s.Close()
	e, err = s.GetEvent(1)
	if err != nil || e.(map[string]interface{})["version"] != 2 || e.(map[string]interface{})["title"] != "Updated" {
		t.Fatal(e, err)
	}
}

func TestEventVersionsAcrossDatabaseConnections(t *testing.T) {
	path := filepath.Join(t.TempDir(), "shared.db")
	one, err := NewStore(path)
	if err != nil {
		t.Fatal(err)
	}
	defer one.Close()
	two, err := NewStore(path)
	if err != nil {
		t.Fatal(err)
	}
	defer two.Close()
	if _, err := one.CreateEvent(Event{Title: "Initial", StartDate: "2026-09-05T12:00:00Z"}); err != nil {
		t.Fatal(err)
	}
	for version := 1; version <= 10; version++ {
		start := make(chan struct{})
		results := make(chan error, 2)
		for _, s := range []*Store{one, two} {
			go func(s *Store) {
				<-start
				results <- s.UpdateEvent(1, Event{Title: "Next", StartDate: "2026-09-05T12:00:00Z", Version: &version})
			}(s)
		}
		close(start)
		a, b := <-results, <-results
		if !((a == nil && errors.Is(b, ErrEventConflict)) || (b == nil && errors.Is(a, ErrEventConflict))) {
			t.Fatal(a, b)
		}
	}
	if err := two.DeleteEventVersion(1, 10); !errors.Is(err, ErrEventConflict) {
		t.Fatal(err)
	}
	if err := one.DeleteEventVersion(1, 11); err != nil {
		t.Fatal(err)
	}
}
