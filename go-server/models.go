package main

import (
	"database/sql"
)

type FamilyMember struct {
	ID     int            `json:"id"`
	Name   string         `json:"name"`
	Color  sql.NullString `json:"color"`
	Avatar sql.NullString `json:"avatar"`
	Stars  int            `json:"stars"`
	Phone  sql.NullString `json:"phone"`
}

// Custom JSON marshaling to handle NullString nicely if desired,
// or just use pointers *string in struct and handle nulls in scanning.
// For simplicity in this rapid refactor: pointers is easier for JSON.

type FamilyMemberJSON struct {
	ID     int     `json:"id"`
	Name   string  `json:"name"`
	Color  *string `json:"color"`
	Avatar *string `json:"avatar"`
	Stars  int     `json:"stars"`
	Phone  *string `json:"phone"`
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
	ID         interface{} `json:"id"` // Can be int or string (external)
	Title      string      `json:"title"`
	StartDate  string      `json:"start_date"`
	EndDate    *string     `json:"end_date"`
	MemberID   *int        `json:"member_id"`
	Recurrence *string     `json:"recurrence"`
	Color      string      `json:"color,omitempty"`
	IsExternal bool        `json:"is_external,omitempty"`
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
