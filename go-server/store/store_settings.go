package store

func (s *Store) GetSettings() (map[string]string, error) {
	rows, err := s.DB.Query("SELECT key, value FROM settings")
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	settings := make(map[string]string)
	for rows.Next() {
		var k, v string
		rows.Scan(&k, &v)
		settings[k] = v
	}
	return settings, nil
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
