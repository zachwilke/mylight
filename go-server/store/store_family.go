package store

import (
	"database/sql"
	"fmt"

	"golang.org/x/crypto/bcrypt"
)

func (s *Store) GetFamilyMembers() ([]FamilyMemberJSON, error) {
	rows, err := s.DB.Query("SELECT id, name, color, avatar, stars, phone, email, role, visible FROM family_members LIMIT 100")
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	members := []FamilyMemberJSON{}
	for rows.Next() {
		var id int
		var name string
		var color sql.NullString
		var avatar sql.NullString
		var stars int
		var phone, email, role sql.NullString
		var visible sql.NullBool

		if err := rows.Scan(&id, &name, &color, &avatar, &stars, &phone, &email, &role, &visible); err != nil {
			return nil, fmt.Errorf("scan family member row: %w", err)
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
	return members, rows.Err()
}

func (s *Store) GetFamilyMembersMap() (map[int]string, error) {
	rows, err := s.DB.Query("SELECT id, name FROM family_members LIMIT 100")
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	members := make(map[int]string)
	for rows.Next() {
		var id int
		var name string
		if err := rows.Scan(&id, &name); err != nil {
			return nil, fmt.Errorf("scan family member map row: %w", err)
		}
		members[id] = name
	}
	return members, rows.Err()
}

func (s *Store) CreateFamilyMember(m FamilyMemberJSON, password string) (int, error) {
	var hash []byte
	var err error
	if password != "" {
		hash, err = bcrypt.GenerateFromPassword([]byte(password), bcrypt.DefaultCost)
		if err != nil {
			return 0, err
		}
	}
	if m.Email != nil && *m.Email == "" {
		m.Email = nil
	}
	role := "user"
	if password == "" {
		role = "child"
	}

	res, err := s.DB.Exec("INSERT INTO family_members (name, email, password_hash, role, color, phone, stars, visible) VALUES (?, ?, ?, ?, ?, ?, 0, ?)",
		m.Name, m.Email, string(hash), role, m.Color, m.Phone, true)
	if err != nil {
		return 0, err
	}
	id, err := res.LastInsertId()
	return int(id), err
}

func (s *Store) UpdateFamilyMember(id int, m map[string]interface{}) error {
	if _, err := s.GetFamilyMember(id); err != nil {
		return err
	}
	tx, err := s.DB.Begin()
	if err != nil {
		return err
	}
	defer tx.Rollback()
	for key, value := range m {
		switch key {
		case "name", "phone", "color":
			v, ok := value.(string)
			if !ok {
				return fmt.Errorf("%s must be text", key)
			}
			if key == "name" && v == "" {
				return fmt.Errorf("name is required")
			}
		case "visible":
			if _, ok := value.(bool); !ok {
				return fmt.Errorf("visible must be boolean")
			}
		default:
			return fmt.Errorf("unsupported field: %s", key)
		}
		if _, err = tx.Exec("UPDATE family_members SET "+key+"=? WHERE id=?", value, id); err != nil {
			return err
		}
	}
	return tx.Commit()
}

func (s *Store) GetFamilyMember(id int) (*FamilyMemberJSON, error) {
	var name string
	var color, avatar, phone, email, role sql.NullString
	var stars int
	var visible sql.NullBool
	err := s.DB.QueryRow("SELECT name,color,avatar,stars,phone,email,role,visible FROM family_members WHERE id=?", id).
		Scan(&name, &color, &avatar, &stars, &phone, &email, &role, &visible)
	if err != nil {
		return nil, err
	}
	v := !visible.Valid || visible.Bool
	return &FamilyMemberJSON{ID: id, Name: name, Color: &color.String, Avatar: &avatar.String, Stars: stars,
		Phone: &phone.String, Email: &email.String, Role: &role.String, Visible: v}, nil
}

func (s *Store) DeleteFamilyMember(id int) error {
	m, err := s.GetFamilyMember(id)
	if err != nil {
		return err
	}
	if m.Role != nil && *m.Role == "admin" {
		return fmt.Errorf("the household owner cannot be deleted")
	}
	tx, err := s.DB.Begin()
	if err != nil {
		return err
	}
	defer tx.Rollback()
	if _, err := tx.Exec("UPDATE events SET version=version+1 WHERE member_id=? OR id IN (SELECT event_id FROM event_members WHERE member_id=?)", id, id); err != nil {
		return err
	}
	for _, q := range []string{"DELETE FROM chore_completions WHERE member_id=?", "DELETE FROM chores WHERE member_id=?", "DELETE FROM event_members WHERE member_id=?", "UPDATE events SET member_id=(SELECT MIN(member_id) FROM event_members WHERE event_id=events.id) WHERE member_id=?", "DELETE FROM family_members WHERE id=?"} {
		if _, err = tx.Exec(q, id); err != nil {
			return err
		}
	}
	return tx.Commit()
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
		if err := rows.Scan(&id, &name, &avatar); err != nil {
			return nil, fmt.Errorf("scan search member row: %w", err)
		}
		results = append(results, map[string]interface{}{
			"id":     id,
			"name":   name,
			"avatar": avatar.String,
		})
	}
	return results, rows.Err()
}
