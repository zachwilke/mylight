package googlecalendar

import (
	"context"
	"encoding/json"
	"io"
	"net/http"
	"strings"
	"testing"
	"time"
)

type roundTrip func(*http.Request) (*http.Response, error)

func (f roundTrip) RoundTrip(r *http.Request) (*http.Response, error) { return f(r) }
func client(t *testing.T, f func(*http.Request) (int, string)) Client {
	t.Helper()
	return Client{HTTP: &http.Client{Transport: roundTrip(func(r *http.Request) (*http.Response, error) {
		if r.URL.Host != "www.googleapis.com" || r.Method != "GET" {
			t.Fatal("unexpected destination or write", r.Method, r.URL)
		}
		status, body := f(r)
		return &http.Response{StatusCode: status, Body: io.NopCloser(strings.NewReader(body)), Header: http.Header{}}, nil
	})}}
}
func TestPaginatedIncrementalPull(t *testing.T) {
	calls := 0
	c := client(t, func(r *http.Request) (int, string) {
		calls++
		q := r.URL.Query()
		if q.Get("syncToken") != "old" || q.Get("singleEvents") != "false" || q.Get("showDeleted") != "true" || q.Get("timeMin") != "" {
			t.Fatal(q)
		}
		if calls == 1 {
			return 200, `{"kind":"calendar#events","items":[{"id":"series","etag":"v2","recurrence":["RRULE:FREQ=DAILY"]}],"nextPageToken":"page2"}`
		}
		if q.Get("pageToken") != "page2" {
			t.Fatal(q)
		}
		return 200, `{"kind":"calendar#events","items":[{"id":"exception","status":"cancelled","recurringEventId":"series","originalStartTime":{"date":"2026-09-07"}}],"nextSyncToken":"new"}`
	})
	previous := map[string]json.RawMessage{"unmodified": json.RawMessage(`{"id":"unmodified","etag":"v1"}`)}
	result, cursor, changed, err := c.Pull(context.Background(), "a/b@example.test", "old", previous)
	if err != nil || cursor != "new" || !changed || len(result) != 3 || len(previous) != 1 {
		t.Fatal(result, cursor, changed, err)
	}
	if !strings.Contains(string(result["exception"]), "originalStartTime") {
		t.Fatal("lost original identity")
	}
}
func TestExpiredCursorReconciliationAndFailure(t *testing.T) {
	for _, fail := range []bool{false, true} {
		t.Run(map[bool]string{false: "complete", true: "failed second page"}[fail], func(t *testing.T) {
			calls := 0
			c := client(t, func(r *http.Request) (int, string) {
				calls++
				q := r.URL.Query()
				if calls == 1 {
					return 410, `secret provider body`
				}
				if q.Get("syncToken") != "" {
					t.Fatal(q)
				}
				if calls == 2 {
					return 200, `{"kind":"calendar#events","items":[{"id":"replacement"}],"nextPageToken":"next"}`
				}
				if fail {
					return 503, "secret"
				}
				return 200, `{"kind":"calendar#events","items":[],"nextSyncToken":"fresh"}`
			})
			previous := map[string]json.RawMessage{"deleted": json.RawMessage(`{"id":"deleted"}`)}
			result, cursor, _, err := c.Pull(context.Background(), "primary", "expired", previous)
			if fail {
				if err != ErrBusy || result != nil || cursor != "" {
					t.Fatal(result, cursor, err)
				}
			} else if err != nil || len(result) != 1 || result["deleted"] != nil || cursor != "fresh" {
				t.Fatal(result, cursor, err)
			}
			if len(previous) != 1 {
				t.Fatal("modified last good state")
			}
		})
	}
}
func TestPullRejectsIncompleteAndUnboundedResponses(t *testing.T) {
	for _, body := range []string{`{"kind":"calendar#events","items":[]}`, `{"kind":"calendar#events","items":[{"summary":"no ID"}],"nextSyncToken":"s"}`, `{"kind":"calendar#events","items":[],"nextPageToken":"same"}`, strings.Repeat("x", (2<<20)+1), `not json`} {
		c := client(t, func(*http.Request) (int, string) { return 200, body })
		if _, _, _, err := c.Pull(context.Background(), "primary", "", nil); err == nil {
			t.Fatal("accepted invalid snapshot")
		}
	}
}
func TestGoogleExpandedInstancesPreserveMovedAndAllDay(t *testing.T) {
	start := time.Date(2026, 9, 1, 0, 0, 0, 0, time.UTC)
	c := client(t, func(r *http.Request) (int, string) {
		q := r.URL.Query()
		if q.Get("singleEvents") != "true" || q.Get("syncToken") != "" || q.Get("timeMin") != start.Format(time.RFC3339) {
			t.Fatal(q)
		}
		return 200, `{"kind":"calendar#events","items":[
  {"id":"series_original","recurringEventId":"series","originalStartTime":{"dateTime":"2026-09-07T09:00:00-05:00"},"summary":"Moved class","start":{"dateTime":"2026-09-10T11:00:00-05:00"},"end":{"dateTime":"2026-09-10T12:00:00-05:00"}},
  {"id":"holiday","start":{"date":"2026-09-08"},"end":{"date":"2026-09-10"}},
  {"id":"cancelled","status":"cancelled"}]}`
	})
	events, err := c.Window(context.Background(), "primary", start, start.AddDate(0, 1, 0))
	if err != nil || len(events) != 2 {
		t.Fatal(events, err)
	}
	if events[0].Key != "series_original" || events[0].Start != "2026-09-10T16:00:00.000Z" || events[1].Start != "2026-09-08" || !events[1].AllDay || events[1].End != "2026-09-10" {
		t.Fatal(events)
	}
}
func TestWindowNeverReturnsPartialOnInvalidLaterPage(t *testing.T) {
	calls := 0
	c := client(t, func(*http.Request) (int, string) {
		calls++
		if calls == 1 {
			return 200, `{"kind":"calendar#events","items":[{"id":"ok","start":{"date":"2026-09-07"},"end":{"date":"2026-09-08"}}],"nextPageToken":"two"}`
		}
		return 200, `{"kind":"calendar#events","items":[{"id":"broken","start":{"dateTime":"local-without-offset"}}]}`
	})
	events, err := c.Window(context.Background(), "primary", time.Now(), time.Now().AddDate(1, 0, 0))
	if err == nil || events != nil {
		t.Fatal(events, err)
	}
}

func TestWindowRejectsMissingPageEnvelope(t *testing.T) {
	for _, body := range []string{`null`, `{}`, `{"items":[]}`, `{"kind":"calendar#calendarList","items":[]}`} {
		c := client(t, func(*http.Request) (int, string) { return 200, body })
		if events, err := c.Window(context.Background(), "primary", time.Now(), time.Now().AddDate(1, 0, 0)); err == nil || events != nil {
			t.Fatal("accepted incomplete window", body)
		}
	}
}
