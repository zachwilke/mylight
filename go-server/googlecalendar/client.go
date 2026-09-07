// Package googlecalendar reads Google Calendar without flattening its stored
// resources. Google expands the display window; local recurrence rules never
// guess how a provider-specific exception should behave.
package googlecalendar

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"mylight/calendarfeed"
	"net/http"
	"net/url"
	"strings"
	"time"
)

const MaxResources = 10000
const MaxSnapshotBytes = 16 << 20

var ErrExpiredCursor = errors.New("Google requires a full calendar refresh")
var ErrReconnect = errors.New("Google access expired or was revoked; reconnect the account")
var ErrBusy = errors.New("Google is temporarily unavailable or rate limited; try again later")

type Client struct{ HTTP *http.Client }
type Calendar struct {
	ID         string `json:"id"`
	Summary    string `json:"summary"`
	AccessRole string `json:"accessRole"`
}
type Date struct {
	Date     string `json:"date,omitempty"`
	DateTime string `json:"dateTime,omitempty"`
	TimeZone string `json:"timeZone,omitempty"`
}
type Event struct {
	Kind               string   `json:"kind"`
	Recurrence         []string `json:"recurrence"`
	Locked             bool     `json:"locked"`
	EventType          string   `json:"eventType"`
	ExtendedProperties struct {
		Private map[string]string `json:"private"`
		Shared  map[string]string `json:"shared"`
	} `json:"extendedProperties"`

	ID                string `json:"id"`
	ETag              string `json:"etag"`
	Status            string `json:"status"`
	Summary           string `json:"summary"`
	Description       string `json:"description"`
	Location          string `json:"location"`
	Start             Date   `json:"start"`
	End               Date   `json:"end"`
	RecurringEventID  string `json:"recurringEventId"`
	OriginalStartTime Date   `json:"originalStartTime"`
}

func (c Client) get(ctx context.Context, path string, query url.Values, out interface{}) error {
	req, err := http.NewRequestWithContext(ctx, "GET", "https://www.googleapis.com/calendar/v3/"+path+"?"+query.Encode(), nil)
	if err != nil {
		return errors.New("invalid Google request")
	}
	resp, err := c.HTTP.Do(req)
	if err != nil {
		return ErrBusy
	} // Never expose URLs, provider bodies or credentials.
	defer resp.Body.Close()
	switch resp.StatusCode {
	case 200:
	case 410:
		return ErrExpiredCursor
	case 401:
		return ErrReconnect
	case 429, 500, 502, 503, 504:
		return ErrBusy
	case 403:
		if rateLimited(resp.Body) {
			return ErrBusy
		}
		return errors.New("Google denied calendar access; check permissions or quota, then reconnect if needed")
	default:
		return fmt.Errorf("Google calendar request failed (HTTP %d)", resp.StatusCode)
	}
	data, err := io.ReadAll(io.LimitReader(resp.Body, (2<<20)+1))
	if err != nil || len(data) > 2<<20 {
		return errors.New("Google response exceeds the safe page size or is incomplete")
	}
	if json.Unmarshal(data, out) != nil {
		return errors.New("Google returned an invalid response")
	}
	return nil
}
func (c Client) Calendars(ctx context.Context) ([]Calendar, error) {
	result := []Calendar{}
	token := ""
	seen := map[string]bool{}
	for page := 0; page < 100; page++ {
		var response struct {
			Kind  string     `json:"kind"`
			Items []Calendar `json:"items"`
			Next  string     `json:"nextPageToken"`
		}
		if err := c.get(ctx, "users/me/calendarList", url.Values{"maxResults": {"250"}, "pageToken": {token}}, &response); err != nil {
			return nil, err
		}
		if response.Kind != "calendar#calendarList" {
			return nil, errors.New("Google returned an incomplete calendar list")
		}
		for _, item := range response.Items {
			if item.ID != "" && item.AccessRole != "freeBusyReader" {
				result = append(result, item)
			}
		}
		if len(result) > 1000 {
			return nil, errors.New("Google account exceeds 1,000 calendars")
		}
		if response.Next == "" {
			return result, nil
		}
		if seen[response.Next] {
			break
		}
		seen[response.Next] = true
		token = response.Next
	}
	return nil, errors.New("Google calendar pagination exceeded its limit")
}

// Pull stages every page before returning the next cursor. A 410 restarts once
// from an empty map; callers commit resources and cursor together only on success.
func (c Client) Pull(ctx context.Context, calendar, cursor string, previous map[string]json.RawMessage) (map[string]json.RawMessage, string, bool, error) {
	result, next, changed, err := c.pull(ctx, calendar, cursor, previous)
	if errors.Is(err, ErrExpiredCursor) && cursor != "" {
		return c.pull(ctx, calendar, "", nil)
	}
	return result, next, changed, err
}
func (c Client) pull(ctx context.Context, calendar, cursor string, previous map[string]json.RawMessage) (map[string]json.RawMessage, string, bool, error) {
	result := map[string]json.RawMessage{}
	if cursor != "" {
		for id, raw := range previous {
			result[id] = raw
		}
	}
	token := ""
	seen := map[string]bool{}
	changed := cursor == ""
	total := 0
	for page := 0; page < 100; page++ {
		q := url.Values{"maxResults": {"250"}, "singleEvents": {"false"}, "showDeleted": {"true"}}
		if cursor != "" {
			q.Set("syncToken", cursor)
		}
		if token != "" {
			q.Set("pageToken", token)
		}
		var response struct {
			Kind  string            `json:"kind"`
			Items []json.RawMessage `json:"items"`
			Next  string            `json:"nextPageToken"`
			Sync  string            `json:"nextSyncToken"`
		}
		if err := c.get(ctx, "calendars/"+url.PathEscape(calendar)+"/events", q, &response); err != nil {
			return nil, "", false, err
		}
		if response.Kind != "calendar#events" {
			return nil, "", false, errors.New("Google returned an incomplete event page")
		}
		for _, raw := range response.Items {
			total += len(raw)
			if total > MaxSnapshotBytes {
				return nil, "", false, errors.New("Google changes exceed 16 MiB")
			}
			var e Event
			if json.Unmarshal(raw, &e) != nil || e.ID == "" {
				return nil, "", false, errors.New("Google event has no stable identity")
			}
			if string(result[e.ID]) != string(raw) {
				changed = true
			}
			result[e.ID] = raw
		}
		if len(result) > MaxResources {
			return nil, "", false, errors.New("Google calendar exceeds 10,000 stored resources")
		}
		if response.Next == "" {
			if response.Sync == "" {
				return nil, "", false, errors.New("Google did not return a complete sync cursor")
			}
			raw, _ := json.Marshal(result)
			if len(raw) > MaxSnapshotBytes {
				return nil, "", false, errors.New("Google calendar exceeds 16 MiB")
			}
			return result, response.Sync, changed, nil
		}
		if response.Sync != "" || seen[response.Next] {
			break
		}
		seen[response.Next] = true
		token = response.Next
	}
	return nil, "", false, errors.New("Google event pagination exceeded its limit")
}

// Window requests expanded instances so unusual provider recurrence and moved
// instances are displayed as Google defines them, including detached originals.
func (c Client) Window(ctx context.Context, calendar string, start, end time.Time) ([]calendarfeed.Event, error) {
	result := []calendarfeed.Event{}
	token := ""
	seen := map[string]bool{}
	ids := map[string]bool{}
	size := 0
	for page := 0; page < 100; page++ {
		q := url.Values{"maxResults": {"250"}, "singleEvents": {"true"}, "showDeleted": {"false"}, "timeMin": {start.Format(time.RFC3339)}, "timeMax": {end.Format(time.RFC3339)}, "timeZone": {"UTC"}}
		if token != "" {
			q.Set("pageToken", token)
		}
		var response struct {
			Kind  string  `json:"kind"`
			Items []Event `json:"items"`
			Next  string  `json:"nextPageToken"`
		}
		if err := c.get(ctx, "calendars/"+url.PathEscape(calendar)+"/events", q, &response); err != nil {
			return nil, err
		}
		if response.Kind != "calendar#events" {
			return nil, errors.New("Google returned an incomplete instance page")
		}
		for _, e := range response.Items {
			if e.ID == "" || ids[e.ID] {
				return nil, errors.New("Google returned missing or duplicate instance identities")
			}
			ids[e.ID] = true
			if e.Status == "cancelled" {
				continue
			}
			s, err := eventDate(e.Start)
			if err != nil {
				return nil, err
			}
			until, err := eventDate(e.End)
			if err != nil {
				return nil, err
			}
			allDay := e.Start.Date != ""
			if allDay != (e.End.Date != "") || until < s || (allDay && until == s) {
				return nil, errors.New("Google returned an invalid event interval")
			}
			title := e.Summary
			if strings.TrimSpace(title) == "" {
				title = "Untitled event"
			}
			result = append(result, calendarfeed.Event{Key: e.ID, Title: title, Start: s, End: until, AllDay: allDay, Description: e.Description, Location: e.Location})
			size += len(title) + len(e.Description) + len(e.Location) + len(e.ID) + 256
			if len(result) > 10000 || size > 2<<20 {
				return nil, errors.New("Google display window exceeds 10,000 instances or 2 MiB")
			}
		}
		if response.Next == "" {
			return result, nil
		}
		if seen[response.Next] {
			break
		}
		seen[response.Next] = true
		token = response.Next
	}
	return nil, errors.New("Google instance pagination exceeded its limit")
}
func eventDate(d Date) (string, error) {
	if d.Date != "" && d.DateTime == "" {
		if t, e := time.Parse("2006-01-02", d.Date); e == nil && t.Format("2006-01-02") == d.Date {
			return d.Date, nil
		}
	}
	if d.DateTime != "" && d.Date == "" {
		if t, e := time.Parse(time.RFC3339Nano, d.DateTime); e == nil {
			return t.UTC().Format("2006-01-02T15:04:05.000Z"), nil
		}
	}
	return "", errors.New("Google returned an invalid event date")
}
