package store

import (
	"database/sql"
	"encoding/json"
	"errors"
	"time"
)

var ErrGoogleJobConflict = errors.New("this outgoing change was updated; reload before continuing")
var ErrGoogleJobActive = errors.New("this Google appointment already has an outgoing change; review it in Settings → Integrations")
var ErrGoogleWritesDisabled = errors.New("enable Google editing in Settings → Integrations first")
var ErrGoogleJobsPending = errors.New("review or stop outgoing Google changes before removing this calendar or account")

type GoogleJob struct {
	Operation   string          `json:"operation"`
	SourceName  string          `json:"source_name"`
	ID          string          `json:"id"`
	SourceID    int             `json:"source_id"`
	EventID     string          `json:"event_id"`
	BaseETag    string          `json:"-"`
	Draft       json.RawMessage `json:"draft"`
	State       string          `json:"state"`
	Version     int             `json:"version"`
	Attempts    int             `json:"attempts"`
	NextAttempt int64           `json:"next_attempt"`
	Message     string          `json:"message"`
	Remote      json.RawMessage `json:"remote"`
	LeaseToken  string          `json:"-"`
	LeaseUntil  int64           `json:"-"`
}

const jobColumns = "operation,id,source_id,event_id,base_etag,draft,state,version,attempts,next_attempt,message,remote_json,lease_token,lease_until,(SELECT name FROM calendar_sources WHERE id=google_jobs.source_id)"

func scanGoogleJob(row interface{ Scan(...interface{}) error }) (GoogleJob, error) {
	var j GoogleJob
	var draft, remote string
	err := row.Scan(&j.Operation, &j.ID, &j.SourceID, &j.EventID, &j.BaseETag, &draft, &j.State, &j.Version, &j.Attempts, &j.NextAttempt, &j.Message, &remote, &j.LeaseToken, &j.LeaseUntil, &j.SourceName)
	j.Draft = json.RawMessage(draft)
	j.Remote = json.RawMessage(remote)
	return j, err
}
func (s *Store) GoogleJobs() ([]GoogleJob, error) {
	rows, err := s.DB.Query("SELECT " + jobColumns + " FROM google_jobs WHERE state NOT IN ('done','discarded') ORDER BY created_at,id LIMIT 1001")
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	jobs := []GoogleJob{}
	for rows.Next() {
		j, err := scanGoogleJob(rows)
		if err != nil {
			return nil, err
		}
		jobs = append(jobs, j)
	}
	return jobs, rows.Err()
}
func (s *Store) GoogleJob(id string) (GoogleJob, error) {
	return scanGoogleJob(s.DB.QueryRow("SELECT "+jobColumns+" FROM google_jobs WHERE id=?", id))
}
func (s *Store) QueueGoogleJob(j GoogleJob) (GoogleJob, error) {
	if j.Operation == "" {
		j.Operation = "update"
	}
	if j.Operation != "update" && j.Operation != "create" && j.Operation != "delete" {
		return GoogleJob{}, ErrGoogleJobConflict
	}
	var result GoogleJob
	err := retryEventWrite(func() error {
		tx, err := s.DB.Begin()
		if err != nil {
			return err
		}
		defer tx.Rollback()
		existing, err := scanGoogleJob(tx.QueryRow("SELECT "+jobColumns+" FROM google_jobs WHERE id=?", j.ID))
		if err == nil {
			if existing.Operation != j.Operation || existing.SourceID != j.SourceID || existing.EventID != j.EventID || string(existing.Draft) != string(j.Draft) || existing.BaseETag != j.BaseETag {
				return ErrGoogleJobConflict
			}
			result = existing
			return nil
		}
		if !errors.Is(err, sql.ErrNoRows) {
			return err
		}
		var enabled, count int
		if err := tx.QueryRow("SELECT a.write_enabled FROM google_accounts a JOIN google_calendars c ON c.account_id=a.id WHERE c.source_id=?", j.SourceID).Scan(&enabled); err != nil {
			return err
		}
		if enabled != 1 {
			return ErrGoogleWritesDisabled
		}
		if err := tx.QueryRow("SELECT count(*) FROM google_jobs WHERE source_id=? AND event_id=? AND state NOT IN ('done','discarded')", j.SourceID, j.EventID).Scan(&count); err != nil {
			return err
		}
		if count > 0 {
			return ErrGoogleJobActive
		}
		if err := tx.QueryRow("SELECT count(*) FROM google_jobs").Scan(&count); err != nil {
			return err
		}
		if count >= 10000 {
			return errors.New("outgoing Google history has reached its 10,000-change limit")
		}
		if err := tx.QueryRow("SELECT count(*) FROM google_jobs WHERE state NOT IN ('done','discarded')").Scan(&count); err != nil {
			return err
		}
		if count >= 1000 {
			return errors.New("review outgoing changes before queuing more")
		}
		_, err = tx.Exec("INSERT INTO google_jobs(operation,id,source_id,event_id,base_etag,draft,created_at) VALUES(?,?,?,?,?,?,?)", j.Operation, j.ID, j.SourceID, j.EventID, j.BaseETag, string(j.Draft), time.Now().Unix())
		if err != nil {
			return err
		}
		result, err = scanGoogleJob(tx.QueryRow("SELECT "+jobColumns+" FROM google_jobs WHERE id=?", j.ID))
		if err != nil {
			return err
		}
		return tx.Commit()
	})
	return result, err
}

// Claim is one SQLite write, shared by independent processes. Every completion
// is fenced by an unpredictable lease token so an expired worker cannot commit.
func (s *Store) ClaimGoogleJob(now int64, token string) (GoogleJob, error) {
	return scanGoogleJob(s.DB.QueryRow(`UPDATE google_jobs SET state='running',attempts=attempts+1,version=version+1,lease_token=?,lease_until=?
 WHERE id=(SELECT id FROM google_jobs WHERE ((state IN ('pending','retry') AND next_attempt<=?) OR (state='running' AND lease_until<=?)) ORDER BY next_attempt,created_at,id LIMIT 1)
 RETURNING `+jobColumns, token, now+120, now, now))
}
func (s *Store) FinishGoogleJob(j GoogleJob, state, message string, remote json.RawMessage, next int64) error {
	if remote == nil {
		remote = json.RawMessage("null")
	}
	tx, err := s.DB.Begin()
	if err != nil {
		return err
	}
	defer tx.Rollback()
	res, err := tx.Exec("UPDATE google_jobs SET state=?,message=?,remote_json=?,next_attempt=?,lease_token='',lease_until=0,version=version+1 WHERE id=? AND state='running' AND lease_token=? AND lease_until>?", state, message, string(remote), next, j.ID, j.LeaseToken, time.Now().Unix())
	if err != nil {
		return err
	}
	n, err := res.RowsAffected()
	if err != nil {
		return err
	}
	if n != 1 {
		return ErrGoogleJobConflict
	}
	if state == "done" {
		if _, err = tx.Exec("UPDATE calendar_sources SET last_attempt='',cache_timezone='' WHERE id=?", j.SourceID); err != nil {
			return err
		}
	}
	return tx.Commit()
}
func (s *Store) ResolveGoogleJob(id string, version int, action, etag string) error {
	return retryEventWrite(func() error {
		tx, err := s.DB.Begin()
		if err != nil {
			return err
		}
		defer tx.Rollback()
		j, err := scanGoogleJob(tx.QueryRow("SELECT "+jobColumns+" FROM google_jobs WHERE id=?", id))
		if err != nil {
			return err
		}
		if j.Version != version || j.State == "running" || j.State == "done" || j.State == "discarded" {
			return ErrGoogleJobConflict
		}
		switch action {
		case "discard":
			_, err = tx.Exec("UPDATE google_jobs SET state='discarded',version=version+1 WHERE id=?", id)
		case "retry":
			if j.State == "conflict" {
				return ErrGoogleJobConflict
			}
			_, err = tx.Exec("UPDATE google_jobs SET state='pending',next_attempt=0,message='',version=version+1 WHERE id=?", id)
		case "apply":
			var remote struct {
				ETag     string `json:"etag"`
				Editable bool   `json:"editable"`
			}
			if j.Operation == "create" || j.State != "conflict" || json.Unmarshal(j.Remote, &remote) != nil || !remote.Editable || etag == "" || remote.ETag != etag {
				return ErrGoogleJobConflict
			}
			_, err = tx.Exec("UPDATE google_jobs SET state='pending',base_etag=?,next_attempt=0,message='',version=version+1 WHERE id=?", etag, id)
		default:
			return ErrGoogleJobConflict
		}
		if err != nil {
			return err
		}
		if action == "discard" {
			if _, err := tx.Exec("UPDATE calendar_sources SET last_attempt='',cache_timezone='' WHERE id=?", j.SourceID); err != nil {
				return err
			}
		}
		return tx.Commit()
	})
}
func (s *Store) CheckGoogleJobs(source, account int) error {
	var count int
	err := s.DB.QueryRow("SELECT count(*) FROM google_jobs j JOIN google_calendars c ON c.source_id=j.source_id WHERE j.state NOT IN ('done','discarded') AND (j.source_id=? OR c.account_id=?)", source, account).Scan(&count)
	if err != nil {
		return err
	}
	if count > 0 {
		return ErrGoogleJobsPending
	}
	return nil
}
func migrateGoogleJobs(db *sql.DB) error {
	tx, err := db.Begin()
	if err != nil {
		return err
	}
	defer tx.Rollback()
	var applied int
	if err := tx.QueryRow("SELECT count(*) FROM schema_migrations WHERE version=10").Scan(&applied); err != nil {
		return err
	}
	if applied > 0 {
		return tx.Commit()
	}
	_, err = tx.Exec(`ALTER TABLE google_accounts ADD COLUMN write_enabled INTEGER NOT NULL DEFAULT 0;
 ALTER TABLE google_oauth_states ADD COLUMN allow_editing INTEGER NOT NULL DEFAULT 0;
 ALTER TABLE google_oauth_states ADD COLUMN account_id INTEGER REFERENCES google_accounts(id) ON DELETE CASCADE;
 CREATE TABLE google_jobs (
 id TEXT PRIMARY KEY,source_id INTEGER NOT NULL REFERENCES calendar_sources(id) ON DELETE CASCADE,
 event_id TEXT NOT NULL,base_etag TEXT NOT NULL,draft TEXT NOT NULL,
 state TEXT NOT NULL DEFAULT 'pending' CHECK(state IN ('pending','running','retry','paused','conflict','done','discarded')),
 version INTEGER NOT NULL DEFAULT 1,attempts INTEGER NOT NULL DEFAULT 0,next_attempt INTEGER NOT NULL DEFAULT 0,
 created_at INTEGER NOT NULL,message TEXT NOT NULL DEFAULT '',remote_json TEXT NOT NULL DEFAULT 'null',
 lease_token TEXT NOT NULL DEFAULT '',lease_until INTEGER NOT NULL DEFAULT 0
 );
 CREATE UNIQUE INDEX google_jobs_active ON google_jobs(source_id,event_id) WHERE state NOT IN ('done','discarded');
 CREATE TRIGGER google_jobs_protect_disconnect BEFORE DELETE ON calendar_sources
 WHEN EXISTS(SELECT 1 FROM google_jobs WHERE source_id=OLD.id AND state NOT IN ('done','discarded'))
 BEGIN SELECT RAISE(ABORT,'review outgoing changes before disconnecting'); END;
 INSERT INTO schema_migrations(version) VALUES(10);`)
	if err != nil {
		return err
	}
	return tx.Commit()
}

func migrateGoogleJobOperations(db *sql.DB) error {
	tx, err := db.Begin()
	if err != nil {
		return err
	}
	defer tx.Rollback()
	var applied int
	if err = tx.QueryRow("SELECT count(*) FROM schema_migrations WHERE version=11").Scan(&applied); err != nil {
		return err
	}
	if applied == 0 {
		_, err = tx.Exec(`ALTER TABLE google_jobs ADD COLUMN operation TEXT NOT NULL DEFAULT 'update' CHECK(operation IN ('update','create','delete')); INSERT INTO schema_migrations(version) VALUES(11);`)
		if err != nil {
			return err
		}
	}
	return tx.Commit()
}
