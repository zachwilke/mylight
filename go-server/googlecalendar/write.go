package googlecalendar

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"net/url"
)

var ErrVersion = errors.New("this appointment changed in Google; review both versions")
var ErrGone = errors.New("this appointment was removed from Google")
var ErrPermission = errors.New("Google editing permission is unavailable; reconnect with editing or check calendar access")
var ErrRejected = errors.New("Google rejected this edit; review the appointment in Google")

// Draft deliberately excludes attendees, recurrence, organizer, reminders and
// attachments. An outgoing edit changes only the selected appointment's details.
type Draft struct {
	Title       string `json:"title"`
	Start       string `json:"start_date"`
	End         string `json:"end_date"`
	AllDay      bool   `json:"is_all_day"`
	Description string `json:"description"`
	Location    string `json:"location"`
}
type View struct {
	Draft
	ETag      string `json:"etag"`
	Editable  bool   `json:"editable"`
	Recurring bool   `json:"recurring"`
}

func (e Event) Editable() bool {
	return e.Status != "cancelled" && len(e.Recurrence) == 0 && !e.Locked && (e.EventType == "" || e.EventType == "default")
}
func (e Event) View() (View, error) {
	start, err := eventDate(e.Start)
	if err != nil {
		return View{}, err
	}
	end, err := eventDate(e.End)
	if err != nil {
		return View{}, err
	}
	if (e.Start.Date != "") != (e.End.Date != "") || end < start || (e.Start.Date != "" && end == start) {
		return View{}, errors.New("Google returned an invalid event interval")
	}
	return View{Draft: Draft{Title: e.Summary, Start: start, End: end, AllDay: e.Start.Date != "", Description: e.Description, Location: e.Location}, ETag: e.ETag, Editable: e.Editable(), Recurring: e.RecurringEventID != ""}, nil
}
func (c Client) GetEvent(ctx context.Context, calendar, id string) (Event, error) {
	req, err := http.NewRequestWithContext(ctx, "GET", "https://www.googleapis.com/calendar/v3/calendars/"+url.PathEscape(calendar)+"/events/"+url.PathEscape(id), nil)
	if err != nil {
		return Event{}, ErrRejected
	}
	return c.eventRequest(req, id)
}
func (c Client) eventRequest(req *http.Request, id string) (Event, error) {
	resp, err := c.HTTP.Do(req)
	if err != nil {
		return Event{}, ErrBusy
	}
	defer resp.Body.Close()
	switch resp.StatusCode {
	case 200:
	case 404, 410:
		return Event{}, ErrGone
	case 412:
		return Event{}, ErrVersion
	case 401:
		return Event{}, ErrPermission
	case 403:
		if rateLimited(resp.Body) {
			return Event{}, ErrBusy
		}
		return Event{}, ErrPermission
	case 429, 500, 502, 503, 504:
		return Event{}, ErrBusy
	default:
		return Event{}, ErrRejected
	}
	raw, err := io.ReadAll(io.LimitReader(resp.Body, (2<<20)+1))
	if err != nil || len(raw) > 2<<20 {
		return Event{}, ErrBusy
	}
	var e Event
	if json.Unmarshal(raw, &e) != nil || e.Kind != "calendar#event" || e.ID != id || e.ETag == "" {
		return Event{}, ErrBusy
	}
	return e, nil
}

const OperationProperty = "mylightOperation"

func (e Event) Operation() string { return e.ExtendedProperties.Private[OperationProperty] }
func (c Client) PatchEvent(ctx context.Context, calendar string, base Event, draft Draft, operation string) (Event, error) {
	if !base.Editable() || base.ETag == "" || operation == "" {
		return Event{}, ErrRejected
	}
	private := map[string]string{}
	for k, v := range base.ExtendedProperties.Private {
		private[k] = v
	}
	private[OperationProperty] = operation
	date := func(value string, original Date) map[string]interface{} {
		if draft.AllDay {
			return map[string]interface{}{"date": value, "dateTime": nil, "timeZone": nil}
		}
		var zone interface{}
		if original.TimeZone != "" {
			zone = original.TimeZone
		}
		return map[string]interface{}{"date": nil, "dateTime": value, "timeZone": zone}
	}
	payload := map[string]interface{}{"summary": draft.Title, "start": date(draft.Start, base.Start), "end": date(draft.End, base.End), "description": draft.Description, "location": draft.Location, "extendedProperties": map[string]interface{}{"private": private, "shared": base.ExtendedProperties.Shared}}
	raw, err := json.Marshal(payload)
	if err != nil {
		return Event{}, ErrRejected
	}
	req, err := http.NewRequestWithContext(ctx, "PATCH", "https://www.googleapis.com/calendar/v3/calendars/"+url.PathEscape(calendar)+"/events/"+url.PathEscape(base.ID)+"?sendUpdates=none&conferenceDataVersion=1", bytes.NewReader(raw))
	if err != nil {
		return Event{}, ErrRejected
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("If-Match", base.ETag)
	return c.eventRequest(req, base.ID)
}

// Google uses 403 for both access denials and rate limits. Inspect only the
// bounded machine-readable reason; never surface the provider's private body.
func rateLimited(body io.Reader) bool {
	data, err := io.ReadAll(io.LimitReader(body, (64<<10)+1))
	if err != nil || len(data) > 64<<10 {
		return false
	}
	var response struct {
		Error struct {
			Errors []struct {
				Reason string `json:"reason"`
			} `json:"errors"`
		} `json:"error"`
	}
	if json.Unmarshal(data, &response) != nil {
		return false
	}
	for _, issue := range response.Error.Errors {
		if issue.Reason == "rateLimitExceeded" || issue.Reason == "userRateLimitExceeded" {
			return true
		}
	}
	return false
}
