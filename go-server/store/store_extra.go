package store

import (
	"database/sql"
	"fmt"
)

// -- Meals --

func (s *Store) GetMeals(start, end string) ([]Meal, error) {
	var rows *sql.Rows
	var err error

	if start != "" && end != "" {
		rows, err = s.DB.Query("SELECT id, title, date, type, color FROM meals WHERE date BETWEEN ? AND ? LIMIT 1000", start, end)
	} else {
		rows, err = s.DB.Query("SELECT id, title, date, type, color FROM meals LIMIT 1000")
	}

	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var meals []Meal
	for rows.Next() {
		var m Meal
		if err := rows.Scan(&m.ID, &m.Title, &m.Date, &m.Type, &m.Color); err != nil {
			return nil, fmt.Errorf("scan meal row: %w", err)
		}
		meals = append(meals, m)
	}
	return meals, rows.Err()
}

func (s *Store) UpsertMeal(m Meal) (Meal, error) {
	var existingID int
	err := s.DB.QueryRow("SELECT id FROM meals WHERE date = ? AND type = ?", m.Date, m.Type).Scan(&existingID)
	if err == nil {
		_, err = s.DB.Exec("UPDATE meals SET title = ?, color = ? WHERE id = ?", m.Title, m.Color, existingID)
		if err != nil {
			return m, err
		}
		m.ID = existingID
		return m, nil
	}

	if err != sql.ErrNoRows {
		return m, fmt.Errorf("check existing meal: %w", err)
	}

	res, err := s.DB.Exec("INSERT INTO meals (date, type, title, color) VALUES (?, ?, ?, ?)", m.Date, m.Type, m.Title, m.Color)
	if err != nil {
		return m, err
	}
	id, err := res.LastInsertId()
	if err != nil {
		return m, fmt.Errorf("get last insert id: %w", err)
	}
	m.ID = int(id)
	return m, nil
}

// -- Photos --

func (s *Store) GetPhotos() ([]Photo, error) {
	rows, err := s.DB.Query("SELECT id, url, uploaded_at FROM photos ORDER BY uploaded_at DESC LIMIT 500")
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var photos []Photo
	for rows.Next() {
		var p Photo
		if err := rows.Scan(&p.ID, &p.URL, &p.UploadedAt); err != nil {
			return nil, fmt.Errorf("scan photo row: %w", err)
		}
		photos = append(photos, p)
	}
	return photos, rows.Err()
}

func (s *Store) AddPhoto(url string) error {
	_, err := s.DB.Exec("INSERT INTO photos (url) VALUES (?)", url)
	return err
}
