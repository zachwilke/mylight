package store

import (
	"database/sql"
	"encoding/json"
	"errors"
	"path/filepath"
	"sync"
	"testing"
	"time"
)

func googleJobStore(t *testing.T) (*Store, string) {
	t.Helper()
	path := filepath.Join(t.TempDir(), "jobs.db")
	s, err := NewStore(path)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { s.Close() })
	_, err = s.DB.Exec(`INSERT INTO google_accounts(id,subject,token,write_enabled) VALUES(1,'test','encrypted',1);
 INSERT INTO calendar_sources(id,url,name,color) VALUES(1,'google:test','Test','blue');
 INSERT INTO google_calendars(source_id,account_id,calendar_id) VALUES(1,1,'primary');`)
	if err != nil {
		t.Fatal(err)
	}
	return s, path
}
func jobFixture() GoogleJob {
	return GoogleJob{ID: "test-operation-123", SourceID: 1, EventID: "remote", BaseETag: `"v1"`, Draft: json.RawMessage(`{"title":"Draft"}`)}
}
func TestGoogleJobsDurabilityCompetingClaimsAndLeaseFencing(t *testing.T) {
	s, path := googleJobStore(t)
	job, err := s.QueueGoogleJob(jobFixture())
	if err != nil {
		t.Fatal(err)
	}
	second, err := NewStore(path)
	if err != nil {
		t.Fatal(err)
	}
	defer second.Close()
	var wg sync.WaitGroup
	wg.Add(2)
	jobs := make(chan GoogleJob, 2)
	errs := make(chan error, 2)
	for i, st := range []*Store{s, second} {
		go func(i int, st *Store) {
			defer wg.Done()
			j, e := st.ClaimGoogleJob(time.Now().Unix(), []string{"worker-one", "worker-two"}[i])
			jobs <- j
			errs <- e
		}(i, st)
	}
	wg.Wait()
	close(jobs)
	close(errs)
	wins := 0
	for e := range errs {
		if e == nil {
			wins++
		} else if !errors.Is(e, sql.ErrNoRows) {
			t.Fatal(e)
		}
	}
	if wins != 1 {
		t.Fatal("more than one claimant", wins)
	}
	var claimed GoogleJob
	for j := range jobs {
		if j.ID != "" {
			claimed = j
		}
	}
	if err := s.ResolveGoogleJob(job.ID, claimed.Version, "discard", ""); !errors.Is(err, ErrGoogleJobConflict) {
		t.Fatal("discarded in-flight work", err)
	}
	// Simulate a crashed process: a new process reclaims only after lease expiry.
	if _, err := s.DB.Exec("UPDATE google_jobs SET lease_until=0 WHERE id=?", job.ID); err != nil {
		t.Fatal(err)
	}
	newer, err := second.ClaimGoogleJob(time.Now().Unix(), "restarted-worker")
	if err != nil || newer.Attempts != 2 {
		t.Fatal(newer, err)
	}
	if err := s.FinishGoogleJob(claimed, "done", "", nil, 0); !errors.Is(err, ErrGoogleJobConflict) {
		t.Fatal("stale worker committed", err)
	}
	if err := second.FinishGoogleJob(newer, "conflict", "changed", json.RawMessage(`{"etag":"v2","editable":true}`), 0); err != nil {
		t.Fatal(err)
	}
	saved, _ := s.GoogleJob(job.ID)
	if err := s.ResolveGoogleJob(job.ID, saved.Version, "apply", "v2"); err != nil {
		t.Fatal(err)
	}
	saved, _ = second.GoogleJob(job.ID)
	if saved.State != "pending" || saved.BaseETag != "v2" {
		t.Fatal("resolution not durable", saved)
	}
}
func TestGoogleJobsEnqueueAndDisconnectAreAtomic(t *testing.T) {
	s, _ := googleJobStore(t)
	first, err := s.QueueGoogleJob(jobFixture())
	if err != nil {
		t.Fatal(err)
	}
	same, err := s.QueueGoogleJob(jobFixture())
	if err != nil || same.ID != first.ID {
		t.Fatal(same, err)
	}
	different := jobFixture()
	different.ID = "other-operation-123"
	if _, err := s.QueueGoogleJob(different); !errors.Is(err, ErrGoogleJobActive) {
		t.Fatal(err)
	}
	if _, err := s.DB.Exec("DELETE FROM calendar_sources WHERE id=1"); err == nil {
		t.Fatal("DB allowed active queue deletion")
	}
	if err := s.ResolveGoogleJob(first.ID, first.Version, "discard", ""); err != nil {
		t.Fatal(err)
	}
	if _, err := s.DB.Exec("DELETE FROM calendar_sources WHERE id=1"); err != nil {
		t.Fatal(err)
	}
	var count int
	s.DB.QueryRow("SELECT count(*) FROM google_jobs").Scan(&count)
	if count != 0 {
		t.Fatal("terminal jobs did not cascade")
	}
}
