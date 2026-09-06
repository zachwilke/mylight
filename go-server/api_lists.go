package main

import (
	"encoding/json"
	"fmt"
	"mylight/store"
	"net/http"
	"strconv"
	"strings"
)

func pathID(path string) (int, error) {
	parts := strings.Split(strings.Trim(path, "/"), "/")
	if len(parts) < 3 {
		return 0, fmt.Errorf("missing ID")
	}
	id, err := strconv.Atoi(parts[2])
	if err != nil || id <= 0 {
		return 0, fmt.Errorf("invalid ID")
	}
	return id, nil
}

func (app *App) handleLists(w http.ResponseWriter, r *http.Request) {
	if r.Method == "GET" && strings.HasSuffix(r.URL.Path, "/items") {
		id, err := pathID(r.URL.Path)
		if err != nil {
			jsonError(w, "Invalid list ID", 400)
			return
		}
		rows, err := app.Store.DB.Query("SELECT id,list_id,text,completed FROM list_items WHERE list_id=? ORDER BY id", id)
		if err != nil {
			jsonError(w, "Could not load items", 500)
			return
		}
		defer rows.Close()
		items := []store.ListItem{}
		for rows.Next() {
			var item store.ListItem
			if err = rows.Scan(&item.ID, &item.ListID, &item.Text, &item.Completed); err != nil {
				jsonError(w, "Could not load item", 500)
				return
			}
			items = append(items, item)
		}
		if err = rows.Err(); err != nil {
			jsonError(w, "Could not load items", 500)
			return
		}
		jsonResponse(w, items)
		return
	}
	if r.Method == "GET" {
		rows, err := app.Store.DB.Query("SELECT id,title,icon FROM lists ORDER BY id")
		if err != nil {
			jsonError(w, "Could not load lists", 500)
			return
		}
		defer rows.Close()
		lists := []store.List{}
		for rows.Next() {
			var list store.List
			if err = rows.Scan(&list.ID, &list.Title, &list.Icon); err != nil {
				jsonError(w, "Could not load list", 500)
				return
			}
			lists = append(lists, list)
		}
		if err = rows.Err(); err != nil {
			jsonError(w, "Could not load lists", 500)
			return
		}
		jsonResponse(w, lists)
		return
	}
	if r.Method == "POST" && r.URL.Path == "/api/lists" {
		var list store.List
		if err := json.NewDecoder(r.Body).Decode(&list); err != nil || strings.TrimSpace(list.Title) == "" {
			jsonError(w, "List title is required", 400)
			return
		}
		if list.Icon == "" {
			list.Icon = "list"
		}
		result, err := app.Store.DB.Exec("INSERT INTO lists(title,icon) VALUES(?,?)", list.Title, list.Icon)
		if err != nil {
			jsonError(w, "Could not create list", 500)
			return
		}
		id, err := result.LastInsertId()
		if err != nil {
			jsonError(w, "Could not create list", 500)
			return
		}
		list.ID = int(id)
		app.Broker.Notify("update")
		jsonResponse(w, list)
		return
	}
	if r.Method == "DELETE" {
		id, err := pathID(r.URL.Path)
		if err != nil {
			jsonError(w, "Invalid ID", 400)
			return
		}
		app.deleteRow(w, "lists", id)
		return
	}
	jsonError(w, "Method not allowed", 405)
}

func (app *App) handleItems(w http.ResponseWriter, r *http.Request) {
	if r.Method == "POST" && r.URL.Path == "/api/items" {
		var item store.ListItem
		if err := json.NewDecoder(r.Body).Decode(&item); err != nil || strings.TrimSpace(item.Text) == "" || item.ListID <= 0 {
			jsonError(w, "An item and list are required", 400)
			return
		}
		result, err := app.Store.DB.Exec("INSERT INTO list_items(list_id,text) VALUES(?,?)", item.ListID, item.Text)
		if err != nil {
			jsonError(w, "Could not add item to list", 400)
			return
		}
		id, err := result.LastInsertId()
		if err != nil {
			jsonError(w, "Could not add item", 500)
			return
		}
		item.ID = int(id)
		item.Completed = false
		app.Broker.Notify("update")
		jsonResponse(w, item)
		return
	}
	id, err := pathID(r.URL.Path)
	if err != nil {
		jsonError(w, "Invalid item ID", 400)
		return
	}
	if r.Method == "DELETE" {
		app.deleteRow(w, "list_items", id)
		return
	}
	if r.Method == "POST" && strings.HasSuffix(r.URL.Path, "/toggle") {
		var body struct {
			Completed bool `json:"completed"`
		}
		if err = json.NewDecoder(r.Body).Decode(&body); err != nil {
			jsonError(w, "Invalid completion", 400)
			return
		}
		result, err := app.Store.DB.Exec("UPDATE list_items SET completed=? WHERE id=?", body.Completed, id)
		if err != nil {
			jsonError(w, "Could not update item", 500)
			return
		}
		count, _ := result.RowsAffected()
		if count == 0 {
			jsonError(w, "Item not found", 404)
			return
		}
		app.Broker.Notify("update")
		jsonResponse(w, map[string]bool{"success": true})
		return
	}
	jsonError(w, "Method not allowed", 405)
}

func (app *App) deleteRow(w http.ResponseWriter, table string, id int) {
	// Table names are internal constants, never request input.
	result, err := app.Store.DB.Exec("DELETE FROM "+table+" WHERE id=?", id)
	if err != nil {
		jsonError(w, "Could not delete item", 500)
		return
	}
	count, err := result.RowsAffected()
	if err != nil {
		jsonError(w, "Could not confirm deletion", 500)
		return
	}
	if count == 0 {
		jsonError(w, "Item not found", 404)
		return
	}
	app.Broker.Notify("update")
	jsonResponse(w, map[string]bool{"success": true})
}

func (app *App) handleMealDetail(w http.ResponseWriter, r *http.Request) {
	if r.Method == "PUT" {
		app.handleMealMove(w, r)
		return
	}
	if r.Method != "DELETE" {
		jsonError(w, "Method not allowed", 405)
		return
	}
	id, err := pathID(r.URL.Path)
	if err != nil {
		jsonError(w, "Invalid meal ID", 400)
		return
	}
	app.deleteRow(w, "meals", id)
}

func (app *App) handlePhotoDetail(w http.ResponseWriter, r *http.Request) {
	if r.Method != "DELETE" {
		jsonError(w, "Method not allowed", 405)
		return
	}
	id, err := pathID(r.URL.Path)
	if err != nil {
		jsonError(w, "Invalid photo ID", 400)
		return
	}
	app.deleteRow(w, "photos", id)
}
