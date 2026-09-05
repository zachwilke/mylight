package calendarfeed

import (
	"context"
	"net/netip"
	"strings"
	"testing"
	"time"
)

func feed(events string) []byte {
	return []byte("BEGIN:VCALENDAR\r\nVERSION:2.0\r\nPRODID:-//MyLight tests//EN\r\n" + strings.ReplaceAll(events, "\n", "\r\n") + "\r\nEND:VCALENDAR\r\n")
}
func mustTime(s string) time.Time {
	t, err := time.Parse(time.RFC3339, s)
	if err != nil {
		panic(err)
	}
	return t
}

func TestDSTExclusionsAndMovedOccurrence(t *testing.T) {
	loc, _ := time.LoadLocation("America/Chicago")
	data := feed(`BEGIN:VEVENT
UID:school
DTSTART;TZID=America/Chicago:20260306T090000
DTEND;TZID=America/Chicago:20260306T100000
RRULE:FREQ=DAILY;COUNT=5
EXDATE;TZID=America/Chicago:20260307T090000,20260309T090000
SUMMARY:School
END:VEVENT
BEGIN:VEVENT
UID:school
RECURRENCE-ID;TZID=America/Chicago:20260310T090000
DTSTART;TZID=America/Chicago:20260310T110000
DTEND;TZID=America/Chicago:20260310T120000
SUMMARY:Moved school
END:VEVENT`)
	events, err := Parse(data, loc, mustTime("2026-03-01T00:00:00Z"), mustTime("2026-04-01T00:00:00Z"))
	if err != nil {
		t.Fatal(err)
	}
	if len(events) != 3 {
		t.Fatalf("expected 3 occurrences, got %#v", events)
	}
	seen := map[string]bool{}
	for _, e := range events {
		seen[e.Start] = true
	}
	for _, date := range []string{"2026-03-06T09:00:00-06:00", "2026-03-08T09:00:00-05:00", "2026-03-10T11:00:00-05:00"} {
		if !seen[date] {
			t.Fatal("wrong DST or override expansion", events)
		}
	}
}

func TestAllDayAndCancellation(t *testing.T) {
	loc, _ := time.LoadLocation("America/Chicago")
	data := feed(`BEGIN:VEVENT
UID:trip
DTSTART;VALUE=DATE:20260307
DTEND;VALUE=DATE:20260310
SUMMARY:Trip
END:VEVENT
BEGIN:VEVENT
UID:single
DTSTART;VALUE=DATE:20260308
SUMMARY:Spring forward
END:VEVENT
BEGIN:VEVENT
UID:cancelled
STATUS:CANCELLED
END:VEVENT
BEGIN:VEVENT
UID:weekly
DTSTART:20260308T150000Z
DTEND:20260308T160000Z
RRULE:FREQ=WEEKLY;COUNT=2
SUMMARY:Weekly
END:VEVENT
BEGIN:VEVENT
UID:weekly
RECURRENCE-ID:20260315T150000Z
STATUS:CANCELLED
END:VEVENT`)
	events, err := Parse(data, loc, mustTime("2026-03-01T00:00:00Z"), mustTime("2026-04-01T00:00:00Z"))
	if err != nil || len(events) != 3 {
		t.Fatal(err, events)
	}
	for _, e := range events {
		if e.Title == "Trip" && (!e.AllDay || e.Start != "2026-03-07" || e.End != "2026-03-10") {
			t.Fatal("lost exclusive all-day dates", e)
		}
		if e.Title == "Spring forward" && (!e.AllDay || e.End != "2026-03-09") {
			t.Fatal("DST added wrong day", e)
		}
	}
}

func TestMonthlyAdditionalDatesAndStableIdentity(t *testing.T) {
	data := feed(`BEGIN:VEVENT
UID:meeting
DTSTART:20260112T090000Z
DTEND:20260112T100000Z
RRULE:FREQ=MONTHLY;BYDAY=2MO;COUNT=3
RDATE:20260220T090000Z,20260221T090000Z
SUMMARY:Team\, planning
END:VEVENT`)
	events, err := Parse(data, time.UTC, mustTime("2026-02-01T00:00:00Z"), mustTime("2026-04-01T00:00:00Z"))
	if err != nil || len(events) != 4 {
		t.Fatal(err, events)
	}
	again, err := Parse(data, time.UTC, mustTime("2026-02-01T00:00:00Z"), mustTime("2026-04-01T00:00:00Z"))
	if err != nil {
		t.Fatal(err)
	}
	for i, e := range events {
		if e.Key != again[i].Key || e.Title != "Team, planning" {
			t.Fatal("unstable key or escaped text", e)
		}
	}
}

func TestRejectUnsupportedAndUnsafeFeeds(t *testing.T) {
	for _, event := range []string{
		"BEGIN:VEVENT\nUID:bad\nDTSTART;TZID=Made/Up:20260301T090000\nEND:VEVENT",
		"BEGIN:VEVENT\nUID:bad\nDTSTART:20260301T090000Z\nRRULE:FREQ=SECONDLY\nEND:VEVENT",
		"BEGIN:VEVENT\nUID:bad\nDTSTART:20260301T090000Z\nRRULE:FREQ=DAILY;INTERVAL=-1\nEND:VEVENT",
		"BEGIN:VEVENT\nUID:bad\nDTSTART:20260301T090000Z\nRECURRENCE-ID;RANGE=THISANDFUTURE:20260301T090000Z\nEND:VEVENT",
		"BEGIN:VEVENT\nUID:unfinished",
	} {
		if _, err := Parse(feed(event), time.UTC, mustTime("2026-03-01T00:00:00Z"), mustTime("2026-04-01T00:00:00Z")); err == nil {
			t.Fatal("accepted unsupported feed", event)
		}
	}
}

func TestFeedURLAndAddressProtection(t *testing.T) {
	for _, raw := range []string{"http://example.com/feed.ics", "https://127.0.0.1/x", "https://[::1]/x", "https://192.168.0.1/x", "https://100.100.100.200/x", "https://user:password@example.com/x", "https://example.com:8080/x", "file:///tmp/calendar.ics"} {
		if _, err := NormalizeURL(raw); err == nil {
			t.Fatal("accepted unsafe URL", raw)
		}
	}
	for _, ip := range []string{"::ffff:127.0.0.1", "169.254.169.254", "fc00::1", "64:ff9b::7f00:1", "198.18.0.1", "100.64.0.1", "2002:7f00:1::"} {
		if PublicIP(netip.MustParseAddr(ip)) {
			t.Fatal("accepted reserved address", ip)
		}
	}
	if _, err := NormalizeURL("webcal://calendar.example.com/feed.ics?token=example"); err != nil {
		t.Fatal(err)
	}
	if _, err := Fetch(context.Background(), "https://127.0.0.1/x"); err == nil {
		t.Fatal("fetched private address")
	}
}

func TestAllDayDurationAcrossFallDST(t *testing.T) {
	loc, _ := time.LoadLocation("America/Chicago")
	events, err := Parse(feed("BEGIN:VEVENT\nUID:day\nDTSTART;VALUE=DATE:20261101\nDURATION:P1D\nEND:VEVENT"), loc,
		mustTime("2026-11-01T00:00:00Z"), mustTime("2026-11-03T00:00:00Z"))
	if err != nil || len(events) != 1 || events[0].End != "2026-11-02" {
		t.Fatalf("calendar-day duration shifted at DST: %#v, %v", events, err)
	}
}

func FuzzParse(f *testing.F) {
	f.Add(feed("BEGIN:VEVENT\nUID:test\nDTSTART:20260301T090000Z\nEND:VEVENT"))
	f.Add(feed("BEGIN:VEVENT\nUID:test\nDTSTART:20260301T090000Z\nRRULE:FREQ=DAILY;COUNT=3\nEND:VEVENT"))
	f.Add([]byte("not a calendar"))
	f.Fuzz(func(t *testing.T, data []byte) {
		if len(data) > 16384 {
			t.Skip()
		}
		Parse(data, time.UTC, mustTime("2026-03-01T00:00:00Z"), mustTime("2026-04-01T00:00:00Z"))
	})
}
