// Package calendarfeed imports a bounded, read-only snapshot of an iCalendar feed.
package calendarfeed

import (
	"bytes"
	"crypto/sha256"
	"fmt"
	"io"
	"strings"
	"time"

	ical "github.com/emersion/go-ical"
	"github.com/teambition/rrule-go"
)

const MaxBytes = 2 << 20

type Event struct {
	Key         string `json:"key"`
	Title       string `json:"title"`
	Start       string `json:"start_date"`
	End         string `json:"end_date"`
	AllDay      bool   `json:"is_all_day"`
	Description string `json:"description"`
	Location    string `json:"location"`
}

// Parse rejects unsupported semantics rather than silently changing a schedule.
// Window endpoints are inclusive/exclusive. Date-only events remain date-only.
func Parse(data []byte, loc *time.Location, windowStart, windowEnd time.Time) (parsed []Event, parseErr error) {
	// Third-party decoders can panic on malformed parameters. Treat all input as
	// untrusted: fail the entire snapshot so the caller retains its last good cache.
	defer func() {
		if recover() != nil {
			parsed = nil
			parseErr = fmt.Errorf("could not parse iCalendar feed")
		}
	}()
	if len(data) > MaxBytes {
		return nil, fmt.Errorf("feed exceeds 2 MiB")
	}
	// Validate logical (unfolded) lines too, so folding cannot bypass nesting limits.
	normalized := strings.ReplaceAll(string(data), "\r\n", "\n")
	normalized = strings.ReplaceAll(strings.ReplaceAll(normalized, "\n ", ""), "\n\t", "")
	data = []byte(normalized)
	depth := 0
	for _, line := range strings.Split(string(data), "\n") {
		line = strings.TrimSuffix(line, "\r")
		if len(line) > 16384 {
			return nil, fmt.Errorf("feed contains an oversized line")
		}
		if strings.HasPrefix(strings.ToUpper(line), "BEGIN:") {
			depth++
		}
		if depth > 16 {
			return nil, fmt.Errorf("feed nesting is too deep")
		}
		if strings.HasPrefix(strings.ToUpper(line), "END:") {
			depth--
		}
		if depth < 0 {
			return nil, fmt.Errorf("invalid feed structure")
		}
	}
	if depth != 0 {
		return nil, fmt.Errorf("feed is incomplete")
	}
	decoder := ical.NewDecoder(bytes.NewReader(data))
	cal, err := decoder.Decode()
	if err != nil {
		return nil, fmt.Errorf("could not parse iCalendar feed")
	}
	if version := cal.Props.Get("VERSION"); version == nil || version.Value != "2.0" {
		return nil, fmt.Errorf("feed must declare iCalendar VERSION:2.0")
	}
	if _, err := decoder.Decode(); err != io.EOF {
		return nil, fmt.Errorf("expected one complete calendar snapshot")
	}
	events := cal.Events()
	if len(events) > 10000 {
		return nil, fmt.Errorf("feed exceeds 10,000 event definitions")
	}
	recurring := 0
	for _, event := range events {
		if event.Props.Get("RRULE") != nil {
			recurring++
		}
	}
	if recurring > 500 {
		return nil, fmt.Errorf("feed exceeds 500 recurring series")
	}
	masters := map[string]ical.Event{}
	overrides := map[string]map[string]ical.Event{}
	text := func(e ical.Event, key string) string { value, _ := e.Props.Text(key); return value }
	for _, event := range events {
		uid := text(event, "UID")
		if uid == "" {
			return nil, fmt.Errorf("event has no stable UID")
		}
		if event.Props.Get("EXRULE") != nil {
			return nil, fmt.Errorf("EXRULE is not supported; use EXDATE")
		}
		if rid := event.Props.Get("RECURRENCE-ID"); rid != nil {
			if rid.Params.Get("RANGE") != "" {
				return nil, fmt.Errorf("range-based recurrence overrides are not supported")
			}
			date, err := rid.DateTime(loc)
			if err != nil {
				return nil, fmt.Errorf("invalid recurrence override date or timezone")
			}
			if overrides[uid] == nil {
				overrides[uid] = map[string]ical.Event{}
			}
			key := date.UTC().Format(time.RFC3339)
			if _, exists := overrides[uid][key]; exists {
				return nil, fmt.Errorf("duplicate recurrence override")
			}
			overrides[uid][key] = event
		} else {
			if _, exists := masters[uid]; exists {
				return nil, fmt.Errorf("duplicate event UID")
			}
			masters[uid] = event
		}
	}
	result := []Event{}
	snapshotBytes := 0
	budget := 100000
	appendEvent := func(event ical.Event, uid, identity string, start, end time.Time, allDay bool) error {
		if strings.EqualFold(text(event, "STATUS"), "CANCELLED") {
			return nil
		}
		if !start.Before(windowEnd) || end.Before(windowStart) || (end.Equal(windowStart) && !end.Equal(start)) {
			return nil
		}
		sum := sha256.Sum256([]byte(uid + "\x00" + identity))
		e := Event{Key: fmt.Sprintf("%x", sum[:16]), Title: text(event, "SUMMARY"), Description: text(event, "DESCRIPTION"), Location: text(event, "LOCATION"), AllDay: allDay, Start: start.Format(time.RFC3339), End: end.Format(time.RFC3339)}
		if e.Title == "" {
			e.Title = "Untitled event"
		}
		if allDay {
			e.Start = start.Format("2006-01-02")
			e.End = end.Format("2006-01-02")
		}
		snapshotBytes += len(e.Title) + len(e.Description) + len(e.Location) + 256
		if snapshotBytes > 2<<20 {
			return fmt.Errorf("expanded calendar exceeds the 2 MiB snapshot budget")
		}
		result = append(result, e)
		if len(result) > 10000 {
			return fmt.Errorf("feed expands beyond 10,000 occurrences")
		}
		return nil
	}
	for uid, master := range masters {
		if strings.EqualFold(text(master, "STATUS"), "CANCELLED") {
			continue
		}
		start, end, allDay, err := eventTimes(master, loc)
		if err != nil {
			return nil, err
		}
		duration := end.Sub(start)
		days := int(time.Date(end.Year(), end.Month(), end.Day(), 0, 0, 0, 0, time.UTC).Sub(time.Date(start.Year(), start.Month(), start.Day(), 0, 0, 0, 0, time.UTC)).Hours() / 24)
		set := &rrule.Set{}
		set.RDate(start)
		if prop := master.Props.Get("RRULE"); prop != nil {
			option, err := rrule.StrToROptionInLocation(prop.Value, start.Location())
			if err != nil {
				return nil, fmt.Errorf("invalid recurrence rule")
			}
			if option.Freq > rrule.DAILY || option.Interval < 0 || option.Interval > 1000 || len(option.Byhour) > 0 || len(option.Byminute) > 0 || len(option.Bysecond) > 0 {
				return nil, fmt.Errorf("sub-daily or oversized recurrence rules are not supported")
			}
			option.Dtstart = start
			if option.Until.IsZero() || option.Until.After(windowEnd) {
				option.Until = windowEnd
			}
			rule, err := rrule.NewRRule(*option)
			if err != nil {
				return nil, fmt.Errorf("invalid recurrence rule")
			}
			set.RRule(rule)
		}
		for _, name := range []string{"EXDATE", "RDATE"} {
			for _, prop := range master.Props[name] {
				if prop.ValueType() == ical.ValuePeriod {
					return nil, fmt.Errorf("period-valued RDATE is not supported")
				}
				for _, value := range strings.Split(prop.Value, ",") {
					copy := prop
					copy.Value = value
					date, err := copy.DateTime(loc)
					if err != nil {
						return nil, fmt.Errorf("invalid additional or excluded date")
					}
					if name == "EXDATE" {
						set.ExDate(date)
					} else {
						set.RDate(date)
					}
				}
			}
		}
		iter := set.Iterator()
		for date, ok := iter(); ok; date, ok = iter() {
			budget--
			if budget < 0 {
				return nil, fmt.Errorf("feed recurrence work limit exceeded")
			}
			if !date.Before(windowEnd) {
				break
			}
			identity := date.UTC().Format(time.RFC3339)
			if _, replaced := overrides[uid][identity]; replaced {
				continue
			}
			finish := date.Add(duration)
			if allDay {
				finish = date.AddDate(0, 0, days)
			}
			if err := appendEvent(master, uid, identity, date, finish, allDay); err != nil {
				return nil, err
			}
		}
	}
	// Detached overrides can be moved into the window from outside it.
	for uid, instances := range overrides {
		if master, ok := masters[uid]; ok && strings.EqualFold(text(master, "STATUS"), "CANCELLED") {
			continue
		}
		for identity, event := range instances {
			if strings.EqualFold(text(event, "STATUS"), "CANCELLED") {
				continue
			}
			start, end, allDay, err := eventTimes(event, loc)
			if err != nil {
				return nil, err
			}
			if err := appendEvent(event, uid, identity, start, end, allDay); err != nil {
				return nil, err
			}
		}
	}
	return result, nil
}

func eventTimes(event ical.Event, loc *time.Location) (time.Time, time.Time, bool, error) {
	start, err := event.DateTimeStart(loc)
	if err != nil || start.IsZero() || start.Year() < 1900 || start.Year() > 2200 {
		return time.Time{}, time.Time{}, false, fmt.Errorf("invalid event start or unsupported timezone/year")
	}
	prop := event.Props.Get("DTSTART")
	allDay := prop != nil && prop.ValueType() == ical.ValueDate
	end, err := event.DateTimeEnd(loc)
	if allDay {
		if endProp := event.Props.Get("DTEND"); endProp != nil && endProp.ValueType() != ical.ValueDate {
			return time.Time{}, time.Time{}, false, fmt.Errorf("all-day event end must be a date")
		}
		if duration := event.Props.Get("DURATION"); duration != nil {
			// RFC 5545 all-day durations use calendar days/weeks, not elapsed
			// 24-hour periods, which can end on the wrong date across DST.
			if strings.Contains(duration.Value, "T") {
				return time.Time{}, time.Time{}, false, fmt.Errorf("all-day duration must use days or weeks")
			}
			end = start.AddDate(0, 0, int(end.Sub(start)/(24*time.Hour)))
		} else if event.Props.Get("DTEND") == nil {
			end = start.AddDate(0, 0, 1)
		}
	}
	if err != nil || end.Before(start) || end.Sub(start) > 366*24*time.Hour {
		return time.Time{}, time.Time{}, false, fmt.Errorf("invalid event duration")
	}
	return start, end, allDay, nil
}
