package main

import (
	"fmt"
	"strings"
	"time"

	"github.com/teambition/rrule-go"
)

// Local events currently expand at daily-or-coarser granularity. Reject rules
// outside that contract on writes rather than storing an invisible schedule.
// Existing records are not rewritten; ICS feeds retain their separate validator.
func validateLocalRecurrence(body *eventBody, start time.Time) error {
	rule := strings.TrimPrefix(strings.TrimSpace(body.Recurrence), "RRULE:")
	if rule == "" {
		if strings.TrimSpace(body.Recurrence) != "" {
			return fmt.Errorf("recurrence rule is empty")
		}
		body.Recurrence = ""
		return nil
	}
	if strings.ContainsAny(rule, "\r\n") {
		return fmt.Errorf("recurrence must contain one rule, without embedded dates or exceptions")
	}
	fields := map[string]string{}
	for _, part := range strings.Split(rule, ";") {
		key, value, ok := strings.Cut(part, "=")
		if !ok || value == "" || fields[key] != "" {
			return fmt.Errorf("recurrence has a missing or duplicate field")
		}
		switch key {
		case "FREQ", "INTERVAL", "COUNT", "UNTIL", "BYDAY", "BYMONTH", "BYMONTHDAY", "BYSETPOS", "BYYEARDAY", "BYWEEKNO", "WKST":
		default:
			return fmt.Errorf("recurrence field %s is not supported for local events", key)
		}
		fields[key] = value
	}
	options, err := rrule.StrToROption(rule)
	if err != nil {
		return fmt.Errorf("invalid recurrence rule")
	}
	if options.Freq > rrule.DAILY {
		return fmt.Errorf("local events support daily, weekly, monthly or yearly recurrence")
	}
	if (fields["INTERVAL"] != "" && options.Interval < 1) || options.Interval > 1000 {
		return fmt.Errorf("recurrence interval must be between 1 and 1000")
	}
	if fields["COUNT"] != "" && (options.Count < 1 || options.Count > 10000) {
		return fmt.Errorf("recurrence count must be between 1 and 10000")
	}
	if fields["COUNT"] != "" && fields["UNTIL"] != "" {
		return fmt.Errorf("choose a recurrence count or an end date, not both")
	}
	if until := fields["UNTIL"]; until != "" {
		layout := "20060102T150405Z"
		if body.AllDay {
			layout = "20060102"
		}
		end, err := time.Parse(layout, until)
		if err != nil || end.Before(start) {
			return fmt.Errorf("recurrence end must not precede the start; use a date for all-day events or a UTC timestamp for timed events")
		}
	}
	if options.Wkst.N() != 0 {
		return fmt.Errorf("week start must be an unnumbered weekday")
	}
	for _, day := range options.Byweekday {
		if day.N() != 0 && (options.Freq != rrule.MONTHLY && options.Freq != rrule.YEARLY || len(options.Byweekno) > 0) {
			return fmt.Errorf("numbered weekdays require monthly or yearly recurrence without week numbers")
		}
	}
	if len(options.Bymonthday) > 0 && options.Freq == rrule.WEEKLY {
		return fmt.Errorf("month-day selection is not supported with weekly recurrence")
	}
	if len(options.Byyearday) > 0 && options.Freq != rrule.YEARLY {
		return fmt.Errorf("year-day selection requires yearly recurrence")
	}
	if len(options.Byweekno) > 0 && options.Freq != rrule.YEARLY {
		return fmt.Errorf("week-number selection requires yearly recurrence")
	}
	if len(options.Bysetpos) > 0 && len(options.Byweekday)+len(options.Bymonth)+len(options.Bymonthday)+len(options.Byyearday)+len(options.Byweekno) == 0 {
		return fmt.Errorf("recurrence positions require a day, month or week selection")
	}
	options.Dtstart = start
	if _, err := rrule.NewRRule(*options); err != nil {
		return fmt.Errorf("recurrence contains an out-of-range value")
	}
	body.Recurrence = rule
	return nil
}
