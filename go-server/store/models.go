package store

import (
	"database/sql"
)

type FamilyMember struct {
	ID      int            `json:"id"`
	Name    string         `json:"name"`
	Color   sql.NullString `json:"color"`
	Avatar  sql.NullString `json:"avatar"`
	Stars   int            `json:"stars"`
	Phone   sql.NullString `json:"phone"`
	Email   sql.NullString `json:"email"`
	Role    sql.NullString `json:"role"`
	Visible sql.NullBool   `json:"visible"`
}

// JSON Friendly version (optional, if we want to map sql.Null* to pointers)
type FamilyMemberJSON struct {
	ID      int     `json:"id"`
	Name    string  `json:"name"`
	Color   *string `json:"color"`
	Avatar  *string `json:"avatar"`
	Stars   int     `json:"stars"`
	Phone   *string `json:"phone"`
	Email   *string `json:"email"`
	Role    *string `json:"role"`
	Visible bool    `json:"visible"`
}

type Setting struct {
	Key   string `json:"key"`
	Value string `json:"value"`
}

type Chore struct {
	ID        int    `json:"id"`
	Title     string `json:"title"`
	TimeOfDay string `json:"time_of_day"` // 'Morning', 'Evening'
	MemberID  int    `json:"member_id"`
	Completed bool   `json:"completed"`
	// Joined fields
	MemberName string `json:"member_name,omitempty"`
}

type ChoreCompletion struct {
	ID          int    `json:"id"`
	ChoreID     int    `json:"chore_id"`
	MemberID    int    `json:"member_id"`
	CompletedAt string `json:"completed_at"`
}

type Meal struct {
	ID    int    `json:"id"`
	Title string `json:"title"`
	Date  string `json:"date"` // YYYY-MM-DD
	Type  string `json:"type"` // Breakfast, Lunch, Dinner
	Color string `json:"color"`
}

type Event struct {
	Timezone    string  `json:"timezone"`
	Version     *int    `json:"version,omitempty"`
	ID          int     `json:"id"`
	Title       string  `json:"title"`
	StartDate   string  `json:"start_date"`
	EndDate     *string `json:"end_date"`
	MemberID    *int    `json:"member_id"`
	MemberIDs   []int   `json:"member_ids"`
	Recurrence  *string `json:"recurrence"`
	Color       string  `json:"color,omitempty"`
	IsExternal  bool    `json:"is_external,omitempty"`
	Description string  `json:"description,omitempty"`
	Location    string  `json:"location,omitempty"`
	IsAllDay    bool    `json:"is_all_day"`
}

type List struct {
	ID    int    `json:"id"`
	Title string `json:"title"`
	Icon  string `json:"icon"`
}

type ListItem struct {
	ID        int    `json:"id"`
	ListID    int    `json:"list_id"`
	Text      string `json:"text"`
	Completed bool   `json:"completed"`
}

type Photo struct {
	ID         int    `json:"id"`
	URL        string `json:"url"`
	UploadedAt string `json:"uploaded_at"`
}

type CalendarSubscription struct {
	ID    int    `json:"id"`
	URL   string `json:"url"`
	Name  string `json:"name"`
	Color string `json:"color"`
}
