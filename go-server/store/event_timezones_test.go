package store

import (
	"path/filepath"
	"testing"
)

func TestEventTimezoneMigrationAndRestart(t *testing.T) {
	path := filepath.Join(t.TempDir(), "v6.db")
	s, err := NewStore(path)
	if err != nil {
		t.Fatal(err)
	}
	if _, err = s.DB.Exec(`ALTER TABLE events DROP COLUMN timezone; DELETE FROM schema_migrations WHERE version=7;
 INSERT INTO events(title,start_date,recurrence) VALUES('Legacy','2026-03-07T15:00:00Z','FREQ=DAILY');`); err != nil {
		t.Fatal(err)
	}
	s.Close()
	for i := 0; i < 2; i++ {
		s, err = NewStore(path)
		if err != nil {
			t.Fatal(err)
		}
		event, err := s.GetEvent(1)
		if err != nil || event.(map[string]interface{})["timezone"] != "" || event.(map[string]interface{})["version"] != 1 {
			t.Fatal(event, err)
		}
		s.Close()
	}
}
