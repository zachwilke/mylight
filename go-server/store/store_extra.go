package store

import (
	"database/sql"
)

// -- Meals --

func (s *Store) GetMeals(start, end string) ([]Meal, error) {
	q := "SELECT id, title, date, type, color FROM meals"
	var rows *sql.Rows
	var err error

	if start != "" && end != "" {
		q += " WHERE date BETWEEN ? AND ?"
		rows, err = s.DB.Query(q, start, end)
	} else {
		rows, err = s.DB.Query(q)
	}

	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var meals []Meal
	for rows.Next() {
		var m Meal
		rows.Scan(&m.ID, &m.Title, &m.Date, &m.Type, &m.Color)
		meals = append(meals, m)
	}
	return meals, nil
}

func (s *Store) UpsertMeal(m Meal) (Meal, error) {
	// Check existing
	var existingID int
	err := s.DB.QueryRow("SELECT id FROM meals WHERE date = ? AND type = ?", m.Date, m.Type).Scan(&existingID)
	if err == nil {
		// Update
		_, err = s.DB.Exec("UPDATE meals SET title = ?, color = ? WHERE id = ?", m.Title, m.Color, existingID)
		if err != nil {
			return m, err
		}
		m.ID = existingID
	} else {
		// Insert
		res, err := s.DB.Exec("INSERT INTO meals (date, type, title, color) VALUES (?, ?, ?, ?)", m.Date, m.Type, m.Title, m.Color)
		if err != nil {
			return m, err
		}
		id, _ := res.LastInsertId()
		m.ID = int(id)
	}
	return m, nil
}

// -- Photos --

func (s *Store) GetPhotos() ([]Photo, error) {
	rows, err := s.DB.Query("SELECT id, url, uploaded_at FROM photos ORDER BY uploaded_at DESC")
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var photos []Photo
	for rows.Next() {
		var p Photo
		rows.Scan(&p.ID, &p.URL, &p.UploadedAt)
		photos = append(photos, p)
	}
	return photos, nil
}

func (s *Store) AddPhoto(url string) error {
	_, err := s.DB.Exec("INSERT INTO photos (url) VALUES (?)", url)
	return err
}
