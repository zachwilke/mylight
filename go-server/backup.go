package main

import (
	"archive/zip"
	"database/sql"
	"fmt"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"time"
)

func (app *App) handleBackup(w http.ResponseWriter, r *http.Request) {
	if r.Method != "GET" {
		jsonError(w, "Method not allowed", 405)
		return
	}
	dir, err := os.MkdirTemp("", "mylight-backup-")
	if err != nil {
		jsonError(w, "Could not prepare backup", 500)
		return
	}
	defer os.RemoveAll(dir)
	snapshot := filepath.Join(dir, "mylight.db")
	app.mu.Lock()
	_, err = app.Store.DB.ExecContext(r.Context(), "VACUUM INTO ?", snapshot)
	app.mu.Unlock()
	if err != nil {
		jsonError(w, "Could not snapshot database", 500)
		return
	}
	// Sessions are intentionally excluded: restoring a backup requires signing in again.
	db, err := sql.Open("sqlite", snapshot)
	if err != nil {
		jsonError(w, "Could not prepare snapshot", 500)
		return
	}
	_, err = db.Exec("DELETE FROM sessions; DELETE FROM pairing_requests; DELETE FROM paired_devices;")
	db.Close()
	if err != nil {
		jsonError(w, "Could not clear snapshot sessions", 500)
		return
	}
	output, err := os.CreateTemp(dir, "backup-*.zip")
	if err != nil {
		jsonError(w, "Could not create backup", 500)
		return
	}
	defer output.Close()
	archive := zip.NewWriter(output)
	add := func(path, name string) error {
		f, err := os.Open(path)
		if err != nil {
			return err
		}
		defer f.Close()
		entry, err := archive.Create(name)
		if err != nil {
			return err
		}
		_, err = io.Copy(entry, f)
		return err
	}
	if err = add(snapshot, "mylight.db"); err == nil {
		err = filepath.WalkDir(app.Config.UploadsDir, func(path string, entry os.DirEntry, walkErr error) error {
			if walkErr != nil {
				return walkErr
			}
			if entry.IsDir() {
				return nil
			}
			if entry.Type()&os.ModeSymlink != 0 {
				return nil
			}
			return add(path, "uploads/"+filepath.Base(path))
		})
	}
	closeErr := archive.Close()
	if err == nil {
		err = closeErr
	}
	if err != nil {
		jsonError(w, "Backup failed; no incomplete archive was sent", 500)
		return
	}
	if _, err = output.Seek(0, 0); err != nil {
		jsonError(w, "Could not read backup", 500)
		return
	}
	w.Header().Set("Content-Type", "application/zip")
	w.Header().Set("Content-Disposition", fmt.Sprintf(`attachment; filename="mylight-%s.zip"`, time.Now().Format("2006-01-02")))
	http.ServeContent(w, r, "backup.zip", time.Now(), output)
}

// restoreBackup is an offline operation. Existing data is retained beside the restored directory.
func restoreBackup(archivePath, dataDir string) error {
	if dataDir == "" {
		return fmt.Errorf("set DATA_DIR to a dedicated MyLight data directory before restoring")
	}
	destination, err := filepath.Abs(dataDir)
	if err != nil {
		return err
	}
	if destination == "/" || destination == filepath.Dir(destination) {
		return fmt.Errorf("unsafe data directory")
	}
	lock, err := acquireDataLock(destination)
	if err != nil {
		return err
	}
	defer lock.Close()
	entries, err := os.ReadDir(destination)
	if err != nil && !os.IsNotExist(err) {
		return err
	}
	for _, entry := range entries {
		name := entry.Name()
		if name != ".mylight.lock" && name != "mylight.db" && name != "mylight.db-wal" && name != "mylight.db-shm" && name != "uploads" {
			return fmt.Errorf("destination contains unrelated files; use a dedicated data directory")
		}
	}
	source, err := zip.OpenReader(archivePath)
	if err != nil {
		return err
	}
	defer source.Close()
	stage, err := os.MkdirTemp(filepath.Dir(destination), ".mylight-restore-")
	if err != nil {
		return err
	}
	defer os.RemoveAll(stage)
	var total int64
	seen := map[string]bool{}
	for _, file := range source.File {
		name := file.Name
		if seen[name] {
			return fmt.Errorf("duplicate archive entry")
		}
		seen[name] = true
		if name != "mylight.db" && (!strings.HasPrefix(name, "uploads/") || strings.Contains(strings.TrimPrefix(name, "uploads/"), "/")) {
			return fmt.Errorf("invalid backup entry: %s", name)
		}
		if strings.Contains(name, "..") || strings.Contains(name, `\`) || file.Mode()&os.ModeSymlink != 0 || file.FileInfo().IsDir() {
			return fmt.Errorf("unsafe backup entry")
		}
		if file.UncompressedSize64 > 512<<20 {
			return fmt.Errorf("backup file too large")
		}
		target := filepath.Join(stage, filepath.FromSlash(name))
		if err = os.MkdirAll(filepath.Dir(target), 0700); err != nil {
			return err
		}
		in, err := file.Open()
		if err != nil {
			return err
		}
		out, err := os.OpenFile(target, os.O_CREATE|os.O_EXCL|os.O_WRONLY, 0600)
		if err != nil {
			in.Close()
			return err
		}
		n, copyErr := io.Copy(out, io.LimitReader(in, (512<<20)-total+1))
		total += n
		in.Close()
		closeErr := out.Close()
		if copyErr != nil {
			return copyErr
		}
		if closeErr != nil {
			return closeErr
		}
		if total > 512<<20 {
			return fmt.Errorf("backup exceeds 512 MB restore limit")
		}
	}
	if !seen["mylight.db"] {
		return fmt.Errorf("backup has no database")
	}
	db, err := sql.Open("sqlite", filepath.Join(stage, "mylight.db"))
	if err != nil {
		return err
	}
	var integrity string
	err = db.QueryRow("PRAGMA integrity_check").Scan(&integrity)
	if err == nil && integrity != "ok" {
		err = fmt.Errorf("database integrity check failed")
	}
	if err == nil {
		var version int
		err = db.QueryRow("SELECT MAX(version) FROM schema_migrations").Scan(&version)
		if err == nil && version > 6 {
			err = fmt.Errorf("backup requires a newer MyLight version")
		}
	}
	if err == nil {
		_, err = db.Exec("DELETE FROM sessions")
	}
	if err == nil {
		var present int
		err = db.QueryRow("SELECT count(*) FROM sqlite_master WHERE type='table' AND name='paired_devices'").Scan(&present)
		if err == nil && present > 0 {
			_, err = db.Exec("DELETE FROM pairing_requests; DELETE FROM paired_devices;")
		}
	}
	db.Close()
	if err != nil {
		return err
	}
	if err = os.MkdirAll(filepath.Join(stage, "uploads"), 0700); err != nil {
		return err
	}
	retained := ""
	if _, err = os.Stat(destination); err == nil {
		retained = destination + ".before-restore-" + time.Now().Format("20060102-150405.000000000")
		if err = os.Rename(destination, retained); err != nil {
			return err
		}
	}
	if err = os.Rename(stage, destination); err != nil {
		if retained != "" {
			os.Rename(retained, destination)
		}
		return err
	}
	if retained != "" {
		fmt.Println("Previous data retained at", retained)
	}
	return nil
}
