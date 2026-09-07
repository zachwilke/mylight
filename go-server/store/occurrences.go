package store

import (
	"fmt"
	"github.com/teambition/rrule-go"
	"strings"
	"time"
)

// Recurrence identity always uses the ORIGINAL start, never a moved start or a
// per-day display slice. Timed keys are canonical UTC; all-day keys are civil dates.
func occurrenceKey(t time.Time, allDay bool) string {
	if allDay {
		return t.Format("2006-01-02")
	}
	return t.UTC().Format("2006-01-02T15:04:05.000Z")
}

// resolveClock matches Temporal's earlier-fold / skip-gap semantics. Go's
// time.Date alone does not promise which side of a daylight-saving fold it picks.
func resolveClock(clock time.Time, zone *time.Location) (time.Time, bool) {
	offsets := map[int]bool{}
	for _, delta := range []time.Duration{-48 * time.Hour, -24 * time.Hour, 0, 24 * time.Hour, 48 * time.Hour} {
		_, offset := clock.Add(delta).In(zone).Zone()
		offsets[offset] = true
	}
	var first time.Time
	for offset := range offsets {
		candidate := clock.Add(-time.Duration(offset) * time.Second)
		local := candidate.In(zone)
		if local.Year() == clock.Year() && local.Month() == clock.Month() && local.Day() == clock.Day() && local.Hour() == clock.Hour() && local.Minute() == clock.Minute() && local.Second() == clock.Second() {
			if first.IsZero() || candidate.Before(first) {
				first = candidate
			}
		}
	}
	return first, !first.IsZero()
}

func floatingClock(t time.Time) time.Time {
	return time.Date(t.Year(), t.Month(), t.Day(), t.Hour(), t.Minute(), t.Second(), 0, time.UTC)
}

// LocateOccurrence validates against the rule and returns the zero-based ordinal
// BEFORE exclusions. COUNT counts actual occurrences, including individually
// skipped ones, but excludes nonexistent spring-forward clock times.
func LocateOccurrence(e Event, key string) (int, Event, error) {
	invalid := func(message string) (int, Event, error) {
		return 0, Event{}, fmt.Errorf("%w: %s", ErrInvalidOccurrence, message)
	}
	if e.Recurrence == nil || *e.Recurrence == "" {
		return invalid("this event is not a recurring series")
	}
	layout := time.RFC3339Nano
	if e.IsAllDay {
		layout = "2006-01-02"
	}
	first, err := time.Parse(layout, e.StartDate)
	if err != nil {
		return invalid("convert legacy all-day dates before editing individual occurrences")
	}
	target, err := time.Parse(layout, key)
	if err != nil {
		return invalid("choose an original occurrence start")
	}
	if target.Before(first) || target.Year() > first.Year()+200 || first.Year() < 1 || target.Year() > 9998 {
		return invalid("occurrence is outside the supported 200-year range")
	}
	options, err := rrule.StrToROption(strings.TrimPrefix(*e.Recurrence, "RRULE:"))
	if err != nil || options.Freq > rrule.DAILY {
		return invalid("unsupported repeat schedule")
	}
	count, until := options.Count, options.Until
	seed := first.UTC()
	zone := time.UTC
	zoned := e.Timezone != "" && !e.IsAllDay
	if zoned {
		zone, err = time.LoadLocation(e.Timezone)
		if err != nil {
			return invalid("unknown event timezone")
		}
		seed = floatingClock(first.In(zone))
	}
	options.Dtstart = seed
	options.Count = 0
	// Bound yielded dates to the requested occurrence; the iterator also has its own maximum year.
	options.Until = target.Add(48 * time.Hour)
	rule, err := rrule.NewRRule(*options)
	if err != nil {
		return invalid("unsupported repeat schedule")
	}
	next := rule.Iterator()
	ordinal := 0
	for work := 0; work < 20000; work++ {
		candidate, ok := next()
		if !ok {
			break
		}
		actual := candidate
		if !zoned {
			actual = candidate.Add(time.Duration(first.Nanosecond()))
		}
		if zoned {
			if candidate.Equal(seed) {
				actual = first
			} else {
				actual, ok = resolveClock(candidate, zone)
				if !ok {
					continue
				}
			}
		}
		if (!until.IsZero() && actual.After(until)) || (count > 0 && ordinal >= count) || actual.After(target) {
			break
		}
		if actual.Equal(target) {
			occurrence := e
			occurrence.StartDate = occurrenceKey(actual, e.IsAllDay)
			finish := first.Add(time.Hour)
			if e.IsAllDay {
				finish = first.AddDate(0, 0, 1)
			}
			if e.EndDate != nil && *e.EndDate != "" {
				finish, err = time.Parse(layout, *e.EndDate)
				if err != nil {
					return invalid("invalid series end")
				}
			}
			end := occurrenceKey(actual.Add(finish.Sub(first)), e.IsAllDay)
			occurrence.EndDate = &end
			occurrence.Recurrence = nil
			return ordinal, occurrence, nil
		}
		ordinal++
	}
	return invalid("date is not an occurrence, or the series exceeds the 20,000-occurrence work limit")
}

func recurrenceCount(rule string, count int) string {
	fields := []string{}
	for _, field := range strings.Split(strings.TrimPrefix(rule, "RRULE:"), ";") {
		if !strings.HasPrefix(field, "COUNT=") && !strings.HasPrefix(field, "UNTIL=") {
			fields = append(fields, field)
		}
	}
	return strings.Join(append(fields, fmt.Sprintf("COUNT=%d", count)), ";")
}

func remainingRecurrence(e Event, ordinal int) string {
	rule := *e.Recurrence
	if options, err := rrule.StrToROption(rule); err == nil && options.Count > 0 {
		return recurrenceCount(rule, options.Count-ordinal)
	}
	return rule
}
