package main

import (
	"database/sql"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"strings"
	"time"

	"github.com/gofrs/flock"
	"golang.org/x/crypto/bcrypt"
	"golang.org/x/term"
)

// All current server/recovery processes share this lock. Never delete its file
// while an instance is running; the lock is tied to the file identity.
func acquireDataLock(dataDir string) (*flock.Flock, error) {
	if err := os.MkdirAll(dataDir, 0700); err != nil {
		return nil, fmt.Errorf("create data directory: %w", err)
	}
	lock := flock.New(filepath.Join(dataDir, ".mylight.lock"), flock.SetPermissions(0600))
	locked, err := lock.TryLock()
	if err != nil {
		lock.Close()
		return nil, fmt.Errorf("could not lock MyLight data directory: %w", err)
	}
	if !locked {
		lock.Close()
		return nil, fmt.Errorf("MyLight is using this data directory; stop the server before recovery or restore")
	}
	return lock, nil
}

func readRecoveryPassword(path string) (string, error) {
	if path != "" {
		file, err := os.Open(path)
		if err != nil {
			return "", fmt.Errorf("could not open password file")
		}
		defer file.Close()
		bytes, err := io.ReadAll(io.LimitReader(file, 75))
		if err != nil || len(bytes) > 74 {
			return "", fmt.Errorf("invalid password file")
		}
		password := strings.TrimSuffix(strings.TrimSuffix(string(bytes), "\n"), "\r")
		if len(password) < 10 || len(password) > 72 {
			return "", fmt.Errorf("password must contain 10–72 bytes")
		}
		return password, nil
	}
	if !term.IsTerminal(int(os.Stdin.Fd())) {
		return "", fmt.Errorf("use an interactive terminal or --password-file with a protected local file")
	}
	fmt.Fprint(os.Stderr, "New owner password (10–72 bytes): ")
	first, err := term.ReadPassword(int(os.Stdin.Fd()))
	fmt.Fprintln(os.Stderr)
	if err != nil {
		return "", err
	}
	fmt.Fprint(os.Stderr, "Confirm password: ")
	second, err := term.ReadPassword(int(os.Stdin.Fd()))
	fmt.Fprintln(os.Stderr)
	if err != nil {
		return "", err
	}
	if string(first) != string(second) {
		return "", fmt.Errorf("passwords do not match")
	}
	return string(first), nil
}

func recoverOwner(dbPath, password string) error {
	if len(password) < 10 || len(password) > 72 {
		return fmt.Errorf("password must contain 10–72 bytes")
	}
	if _, err := os.Stat(dbPath); err != nil {
		return fmt.Errorf("no existing MyLight database at the configured data directory")
	}
	lock, err := acquireDataLock(filepath.Dir(dbPath))
	if err != nil {
		return err
	}
	defer lock.Close()
	db, err := sql.Open("sqlite", dbPath)
	if err != nil {
		return err
	}
	defer db.Close()
	db.SetMaxOpenConns(1)
	hash, err := bcrypt.GenerateFromPassword([]byte(password), bcrypt.DefaultCost)
	if err != nil {
		return err
	}
	tx, err := db.Begin()
	if err != nil {
		return err
	}
	defer tx.Rollback()
	var count, id int
	if err = tx.QueryRow("SELECT count(*),COALESCE(MIN(id),0) FROM family_members WHERE role='admin'").Scan(&count, &id); err != nil {
		return err
	}
	if count != 1 {
		return fmt.Errorf("recovery requires exactly one existing household owner; no accounts were changed")
	}
	if _, err = tx.Exec("UPDATE family_members SET password_hash=? WHERE id=?", string(hash), id); err != nil {
		return err
	}
	if _, err = tx.Exec("DELETE FROM sessions"); err != nil {
		return err
	}
	var devices int
	if err = tx.QueryRow("SELECT count(*) FROM sqlite_master WHERE type='table' AND name='paired_devices'").Scan(&devices); err != nil {
		return err
	}
	if devices > 0 {
		if _, err = tx.Exec("UPDATE paired_devices SET revoked_at=? WHERE revoked_at IS NULL; DELETE FROM pairing_requests", time.Now().Unix()); err != nil {
			return err
		}
	}
	return tx.Commit()
}
