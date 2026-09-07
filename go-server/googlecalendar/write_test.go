package googlecalendar

import (
	"context"
	"encoding/json"
	"io"
	"net/http"
	"strings"
	"testing"
)

func TestPatchPreservesZonesAndUnrelatedFields(t *testing.T) {
	base := Event{Kind: "calendar#event", ID: "instance", ETag: `"base"`, Status: "confirmed", RecurringEventID: "master", Start: Date{DateTime: "2026-11-01T01:30:00-06:00", TimeZone: "America/Chicago"}, End: Date{DateTime: "2026-11-01T02:30:00-06:00", TimeZone: "America/Chicago"}}
	c := Client{HTTP: &http.Client{Transport: roundTrip(func(r *http.Request) (*http.Response, error) {
		if r.Method != "PATCH" || r.Header.Get("If-Match") != base.ETag {
			t.Fatal(r.Method, r.Header)
		}
		var body map[string]json.RawMessage
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
			t.Fatal(err)
		}
		for _, field := range []string{"start", "end"} {
			var date map[string]interface{}
			json.Unmarshal(body[field], &date)
			if date["timeZone"] != "America/Chicago" || date["date"] != nil {
				t.Fatal(field, date)
			}
		}
		if len(body) != 6 || body["recurrence"] != nil || body["attendees"] != nil {
			t.Fatal(body)
		}
		base.ExtendedProperties.Private = map[string]string{OperationProperty: "operation"}
		base.ETag = `"new"`
		raw, _ := json.Marshal(base)
		return &http.Response{StatusCode: 200, Body: io.NopCloser(strings.NewReader(string(raw))), Header: http.Header{}}, nil
	})}}
	updated, err := c.PatchEvent(context.Background(), "calendar@example.test", base, Draft{Title: "Moved", Start: "2026-11-01T07:30:00Z", End: "2026-11-01T08:30:00Z"}, "operation")
	if err != nil || updated.Operation() != "operation" {
		t.Fatal(updated, err)
	}
}

func TestGoogle403RateLimitsRetryWithoutExposingProviderBodies(t *testing.T) {
	for _, reason := range []string{"rateLimitExceeded", "userRateLimitExceeded", "forbidden"} {
		c := Client{HTTP: &http.Client{Transport: roundTrip(func(*http.Request) (*http.Response, error) {
			return &http.Response{StatusCode: 403, Header: http.Header{}, Body: io.NopCloser(strings.NewReader(`{"error":{"errors":[{"reason":"` + reason + `","message":"private account details"}]}}`))}, nil
		})}}
		_, err := c.GetEvent(context.Background(), "primary", "event")
		expected := ErrBusy
		if reason == "forbidden" {
			expected = ErrPermission
		}
		if err != expected || strings.Contains(err.Error(), "private") {
			t.Fatal(reason, err)
		}
	}
}
