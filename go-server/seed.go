//go:build ignore
// +build ignore

package main

import (
	"database/sql"
	"fmt"
	"log"
	"time"

	_ "modernc.org/sqlite"
)

const DbPath = "../mylight.db"

func main() {
	db, err := sql.Open("sqlite", DbPath)
	if err != nil {
		log.Fatal("Failed to open database:", err)
	}
	defer db.Close()

	if err := db.Ping(); err != nil {
		log.Fatal("Failed to connect to database:", err)
	}

	fmt.Println("🌱 Seeding database for development...")

	// Clear existing data (optional - comment out to preserve existing data)
	clearTables(db)

	// Seed family members
	seedFamilyMembers(db)

	// Seed chores
	seedChores(db)

	// Seed events
	seedEvents(db)

	// Seed meals
	seedMeals(db)

	// Seed settings
	seedSettings(db)

	fmt.Println("✅ Database seeded successfully!")
}

func clearTables(db *sql.DB) {
	fmt.Println("🧹 Clearing existing data...")
	tables := []string{
		"chore_completions",
		"chores",
		"events",
		"meals",
		"photos",
		"calendar_subscriptions",
		"family_members",
		"settings",
	}
	for _, table := range tables {
		_, err := db.Exec(fmt.Sprintf("DELETE FROM %s", table))
		if err != nil {
			log.Printf("Warning: Failed to clear %s: %v", table, err)
		}
	}
	// Reset auto-increment counters
	db.Exec("DELETE FROM sqlite_sequence")
}

func seedFamilyMembers(db *sql.DB) {
	fmt.Println("👨‍👩‍👧‍👦 Seeding family members...")
	members := []struct {
		name   string
		color  string
		avatar string
		stars  int
		phone  string
		email  string
		role   string
	}{
		{"Dad", "#4F46E5", "👨", 42, "(555) 123-4567", "dad@family.com", "admin"},
		{"Mom", "#EC4899", "👩", 38, "(555) 234-5678", "mom@family.com", "admin"},
		{"Emma", "#10B981", "👧", 125, "", "emma@family.com", "user"},
		{"Jack", "#F59E0B", "👦", 98, "", "jack@family.com", "user"},
	}

	for _, m := range members {
		_, err := db.Exec(`
			INSERT INTO family_members (name, color, avatar, stars, phone, email, role)
			VALUES (?, ?, ?, ?, ?, ?, ?)`,
			m.name, m.color, m.avatar, m.stars, m.phone, m.email, m.role)
		if err != nil {
			log.Printf("Failed to insert %s: %v", m.name, err)
		}
	}
}

func seedChores(db *sql.DB) {
	fmt.Println("✅ Seeding chores...")
	chores := []struct {
		title     string
		memberID  int
		timeOfDay string
		completed bool
	}{
		// Morning chores
		{"Make Bed", 3, "Morning", false},
		{"Make Bed", 4, "Morning", true},
		{"Brush Teeth", 3, "Morning", true},
		{"Brush Teeth", 4, "Morning", true},
		{"Feed the Dog", 3, "Morning", false},
		{"Set Breakfast Table", 4, "Morning", false},

		// Evening chores
		{"Clean Room", 3, "Evening", false},
		{"Clean Room", 4, "Evening", false},
		{"Homework", 3, "Evening", false},
		{"Homework", 4, "Evening", false},
		{"Take Out Trash", 4, "Evening", false},
		{"Load Dishwasher", 3, "Evening", false},
		{"Walk the Dog", 1, "Evening", false},
		{"Cook Dinner", 2, "Evening", false},
	}

	for _, c := range chores {
		_, err := db.Exec(`
			INSERT INTO chores (title, member_id, time_of_day, completed)
			VALUES (?, ?, ?, ?)`,
			c.title, c.memberID, c.timeOfDay, c.completed)
		if err != nil {
			log.Printf("Failed to insert chore %s: %v", c.title, err)
		}
	}

	// Add some completion history
	seedChoreCompletions(db)
}

func seedChoreCompletions(db *sql.DB) {
	fmt.Println("📊 Seeding chore completion history...")
	now := time.Now()

	// Generate completions over the past 2 weeks
	for daysAgo := 14; daysAgo >= 0; daysAgo-- {
		date := now.AddDate(0, 0, -daysAgo)

		// Each family member completes some random chores each day
		completions := []struct {
			choreID  int
			memberID int
		}{
			// Emma's completions
			{1, 3}, {3, 3},
			// Jack's completions
			{2, 4}, {4, 4}, {5, 4},
		}

		for _, c := range completions {
			timestamp := date.Format("2006-01-02 15:04:05")
			_, err := db.Exec(`
				INSERT INTO chore_completions (chore_id, member_id, completed_at)
				VALUES (?, ?, ?)`,
				c.choreID, c.memberID, timestamp)
			if err != nil {
				log.Printf("Failed to insert completion: %v", err)
			}
		}
	}
}

func seedEvents(db *sql.DB) {
	fmt.Println("📅 Seeding calendar events...")
	now := time.Now()

	events := []struct {
		title       string
		startDate   string
		endDate     string
		memberID    *int
		recurrence  string
		description string
		location    string
		isAllDay    bool
	}{
		{
			title:       "Soccer Practice",
			startDate:   now.AddDate(0, 0, 1).Format("2006-01-02") + "T16:00:00",
			endDate:     now.AddDate(0, 0, 1).Format("2006-01-02") + "T17:30:00",
			memberID:    intPtr(4),
			recurrence:  "weekly",
			description: "Weekly soccer practice at the park",
			location:    "Central Park Field 3",
			isAllDay:    false,
		},
		{
			title:       "Piano Lesson",
			startDate:   now.AddDate(0, 0, 2).Format("2006-01-02") + "T15:00:00",
			endDate:     now.AddDate(0, 0, 2).Format("2006-01-02") + "T16:00:00",
			memberID:    intPtr(3),
			recurrence:  "weekly",
			description: "Weekly piano lesson with Mrs. Johnson",
			location:    "Music Academy",
			isAllDay:    false,
		},
		{
			title:       "Family Movie Night",
			startDate:   now.AddDate(0, 0, 5).Format("2006-01-02") + "T19:00:00",
			endDate:     now.AddDate(0, 0, 5).Format("2006-01-02") + "T21:30:00",
			memberID:    nil,
			recurrence:  "",
			description: "Friday family movie night - pick a movie!",
			location:    "Living Room",
			isAllDay:    false,
		},
		{
			title:       "Dentist Appointment",
			startDate:   now.AddDate(0, 0, 7).Format("2006-01-02") + "T10:00:00",
			endDate:     now.AddDate(0, 0, 7).Format("2006-01-02") + "T11:00:00",
			memberID:    intPtr(3),
			recurrence:  "",
			description: "Regular checkup",
			location:    "Smile Dental Clinic",
			isAllDay:    false,
		},
		{
			title:       "School Holiday",
			startDate:   now.AddDate(0, 0, 14).Format("2006-01-02"),
			endDate:     now.AddDate(0, 0, 14).Format("2006-01-02"),
			memberID:    nil,
			recurrence:  "",
			description: "No school today",
			location:    "",
			isAllDay:    true,
		},
		{
			title:       "Grocery Shopping",
			startDate:   now.AddDate(0, 0, 3).Format("2006-01-02") + "T10:00:00",
			endDate:     now.AddDate(0, 0, 3).Format("2006-01-02") + "T12:00:00",
			memberID:    intPtr(2),
			recurrence:  "weekly",
			description: "Weekly grocery run",
			location:    "Whole Foods",
			isAllDay:    false,
		},
		{
			title:       "Birthday Party",
			startDate:   now.AddDate(0, 0, 10).Format("2006-01-02") + "T14:00:00",
			endDate:     now.AddDate(0, 0, 10).Format("2006-01-02") + "T17:00:00",
			memberID:    intPtr(4),
			recurrence:  "",
			description: "Tommy's birthday party",
			location:    "Fun Zone Arcade",
			isAllDay:    false,
		},
	}

	for _, e := range events {
		_, err := db.Exec(`
			INSERT INTO events (title, start_date, end_date, member_id, recurrence, description, location, is_all_day)
			VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
			e.title, e.startDate, e.endDate, e.memberID, e.recurrence, e.description, e.location, e.isAllDay)
		if err != nil {
			log.Printf("Failed to insert event %s: %v", e.title, err)
		}
	}
}

func seedMeals(db *sql.DB) {
	fmt.Println("🍽️ Seeding meal plans...")
	now := time.Now()

	meals := []struct {
		title string
		mType string
		color string
	}{
		// Week 1
		{"Pancakes & Fruit", "Breakfast", "#FCD34D"},
		{"Grilled Cheese & Tomato Soup", "Lunch", "#FBBF24"},
		{"Spaghetti & Meatballs", "Dinner", "#F59E0B"},

		{"Scrambled Eggs & Toast", "Breakfast", "#FCD34D"},
		{"Turkey Sandwich", "Lunch", "#FBBF24"},
		{"Tacos", "Dinner", "#F59E0B"},

		{"Oatmeal with Berries", "Breakfast", "#FCD34D"},
		{"Caesar Salad", "Lunch", "#FBBF24"},
		{"Grilled Salmon & Veggies", "Dinner", "#F59E0B"},

		{"French Toast", "Breakfast", "#FCD34D"},
		{"Leftover Salmon Bowl", "Lunch", "#FBBF24"},
		{"Pizza Night", "Dinner", "#F59E0B"},

		{"Smoothie Bowls", "Breakfast", "#FCD34D"},
		{"PB&J with Apple Slices", "Lunch", "#FBBF24"},
		{"Chicken Stir Fry", "Dinner", "#F59E0B"},

		{"Waffles", "Breakfast", "#FCD34D"},
		{"Quesadillas", "Lunch", "#FBBF24"},
		{"BBQ Burgers", "Dinner", "#F59E0B"},

		{"Eggs Benedict", "Breakfast", "#FCD34D"},
		{"Soup & Sandwich", "Lunch", "#FBBF24"},
		{"Roast Chicken Dinner", "Dinner", "#F59E0B"},
	}

	mealIndex := 0
	for day := 0; day < 7; day++ {
		date := now.AddDate(0, 0, day).Format("2006-01-02")
		for meal := 0; meal < 3; meal++ {
			if mealIndex >= len(meals) {
				break
			}
			m := meals[mealIndex]
			_, err := db.Exec(`
				INSERT INTO meals (title, date, type, color)
				VALUES (?, ?, ?, ?)`,
				m.title, date, m.mType, m.color)
			if err != nil {
				log.Printf("Failed to insert meal %s: %v", m.title, err)
			}
			mealIndex++
		}
	}
}

func seedSettings(db *sql.DB) {
	fmt.Println("⚙️ Seeding settings...")
	settings := []struct {
		key   string
		value string
	}{
		{"chore_reset_time", "06:00"},
		{"theme", "dark"},
		{"family_name", "The Wilke Family"},
	}

	for _, s := range settings {
		_, err := db.Exec(`
			INSERT OR REPLACE INTO settings (key, value)
			VALUES (?, ?)`, s.key, s.value)
		if err != nil {
			log.Printf("Failed to insert setting %s: %v", s.key, err)
		}
	}
}

func intPtr(i int) *int {
	return &i
}
