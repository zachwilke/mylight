package store

import (
	"database/sql"
	"errors"
	_ "modernc.org/sqlite"
	"path/filepath"
	"testing"
)

func TestFamilyLookupBeyondListLimit(t *testing.T) {
	s, err := NewStore(filepath.Join(t.TempDir(), "test.db"))
	if err != nil {
		t.Fatal(err)
	}
	defer s.Close()
	var id int64
	for i := 0; i < 101; i++ {
		result, err := s.DB.Exec("INSERT INTO family_members(name,stars,role) VALUES('Member',0,'child')")
		if err != nil {
			t.Fatal(err)
		}
		id, err = result.LastInsertId()
		if err != nil {
			t.Fatal(err)
		}
	}
	m, err := s.GetFamilyMember(int(id))
	if err != nil || m.ID != int(id) {
		t.Fatal("direct lookup missed existing member", err)
	}
	if err := s.UpdateFamilyMember(int(id), map[string]interface{}{"name": "Updated"}); err != nil {
		t.Fatal(err)
	}
	if err := s.DeleteFamilyMember(int(id)); err != nil {
		t.Fatal(err)
	}
	if _, err := s.GetFamilyMember(int(id)); !errors.Is(err, sql.ErrNoRows) {
		t.Fatal("missing-member behavior changed", err)
	}
}
