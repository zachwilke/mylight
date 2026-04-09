package store

import "fmt"

func (s *Store) GetSettings() (map[string]string, error) {
	rows, err := s.DB.Query("SELECT key, value FROM settings LIMIT 1000")
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	settings := make(map[string]string)
	for rows.Next() {
		var k, v string
		if err := rows.Scan(&k, &v); err != nil {
			return nil, fmt.Errorf("scan setting row: %w", err)
		}
		settings[k] = v
	}
	return settings, rows.Err()
}

func (s *Store) UpsertSetting(key, value string) error {
	_, err := s.DB.Exec("INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)", key, value)
	return err
}

func (s *Store) GetSetting(key string) (string, error) {
	var val string
	err := s.DB.QueryRow("SELECT value FROM settings WHERE key = ?", key).Scan(&val)
	return val, err
}
