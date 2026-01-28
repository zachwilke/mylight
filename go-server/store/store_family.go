package store

import (
	"database/sql"

	"golang.org/x/crypto/bcrypt"
)

func (s *Store) GetFamilyMembers() ([]FamilyMemberJSON, error) {
	rows, err := s.DB.Query("SELECT id, name, color, avatar, stars, phone, email, role, visible FROM family_members")
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var members []FamilyMemberJSON
	for rows.Next() {
		var id int
		var name string
		var color sql.NullString
		var avatar sql.NullString
		var stars int
		var phone, email, role sql.NullString
		var visible sql.NullBool

		if err := rows.Scan(&id, &name, &color, &avatar, &stars, &phone, &email, &role, &visible); err != nil {
			continue
		}

		c := color.String
		a := avatar.String
		p := phone.String
		e := email.String
		r := role.String
		v := true
		if visible.Valid {
			v = visible.Bool
		}

		members = append(members, FamilyMemberJSON{
			ID:      id,
			Name:    name,
			Color:   &c,
			Avatar:  &a,
			Stars:   stars,
			Phone:   &p,
			Email:   &e,
			Role:    &r,
			Visible: v,
		})
	}
	return members, nil
}

func (s *Store) GetFamilyMembersMap() (map[int]string, error) {
	rows, err := s.DB.Query("SELECT id, name FROM family_members")
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	members := make(map[int]string)
	for rows.Next() {
		var id int
		var name string
		rows.Scan(&id, &name)
		members[id] = name
	}
	return members, nil
}

func (s *Store) CreateFamilyMember(m FamilyMemberJSON, password string) (int, error) {
	hash, err := bcrypt.GenerateFromPassword([]byte(password), bcrypt.DefaultCost)
	if err != nil {
		return 0, err
	}

	res, err := s.DB.Exec("INSERT INTO family_members (name, email, password_hash, role, color, stars, visible) VALUES (?, ?, ?, ?, ?, 0, ?)",
		m.Name, m.Email, string(hash), m.Role, m.Color, true)
	if err != nil {
		return 0, err
	}
	id, err := res.LastInsertId()
	return int(id), err
}

func (s *Store) UpdateFamilyMember(id int, m map[string]interface{}) error {
	// Simple dynamic update (only supporting what was in handler previously)
	if val, ok := m["visible"]; ok {
		visibleInt := 0
		if val.(bool) {
			visibleInt = 1
		}
		_, err := s.DB.Exec("UPDATE family_members SET visible = ? WHERE id = ?", visibleInt, id)
		return err
	}
	// Expand here if more updates needed
	return nil
}

func (s *Store) UpdateAvatar(id int, url string) error {
	_, err := s.DB.Exec("UPDATE family_members SET avatar = ? WHERE id = ?", url, id)
	return err
}

func (s *Store) AuthenticateUser(email, password string) (*FamilyMemberJSON, error) {
	var id int
	var name string
	var hash string
	var role sql.NullString
	var avatar sql.NullString

	err := s.DB.QueryRow("SELECT id, name, password_hash, role, avatar FROM family_members WHERE email = ?", email).Scan(&id, &name, &hash, &role, &avatar)
	if err != nil {
		return nil, err
	}

	err = bcrypt.CompareHashAndPassword([]byte(hash), []byte(password))
	if err != nil {
		return nil, err
	}

	r := role.String
	a := avatar.String
	e := email

	return &FamilyMemberJSON{
		ID:     id,
		Name:   name,
		Role:   &r,
		Email:  &e,
		Avatar: &a,
	}, nil
}

func (s *Store) SearchMembers(query string) ([]interface{}, error) {
	rows, err := s.DB.Query("SELECT id, name, avatar FROM family_members WHERE name LIKE ? LIMIT 5", "%"+query+"%")
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var results []interface{}
	for rows.Next() {
		var id int
		var name string
		var avatar sql.NullString
		if err := rows.Scan(&id, &name, &avatar); err == nil {
			results = append(results, map[string]interface{}{
				"id":     id,
				"name":   name,
				"avatar": avatar.String,
			})
		}
	}
	return results, nil
}
