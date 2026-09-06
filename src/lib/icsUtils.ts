import type { Event } from "../types";
import { addDays, format, parseISO, startOfDay } from "date-fns";
import { clockInstant, eventClock } from "./eventTimezone";
import { tzlib_get_ical_block } from "timezones-ical-library";

export function generateICS(event: Event) {
  const formatDate = (date: string | Date) => {
    const d = typeof date === "string" ? new Date(date) : date;
    return d.toISOString().replace(/[-:]/g, "").split(".")[0] + "Z";
  };

  const now = new Date();
  const start = new Date(event.start_date);
  if (!Number.isFinite(start.getTime())) {
    throw new Error(
      "This event has an invalid start date and cannot be exported.",
    );
  }
  const parsedEnd = new Date(event.end_date || "");
  const end = Number.isFinite(parsedEnd.getTime())
    ? parsedEnd
    : new Date(start.getTime() + 60 * 60 * 1000);
  const escape = (value: string) =>
    value
      .replace(/\\/g, "\\\\")
      .replace(/\r\n|\r|\n/g, "\\n")
      .replace(/;/g, "\\;")
      .replace(/,/g, "\\,");

  let startProperty = `DTSTART:${formatDate(start)}`;
  let endProperty = `DTEND:${formatDate(end)}`;
  let timezoneBlock: string[] = [];
  const firstOverride: string[] = [];
  if (
    !event.is_all_day &&
    (event.recurrence || event.rrule) &&
    event.timezone &&
    event.timezone !== "UTC"
  ) {
    // Bundled tzurl-style components describe contemporary rules, not the full
    // historical transition database. Never rewrite old series with today's rules.
    if (eventClock(start, event.timezone).year < 2026)
      throw new Error(
        "Historical timezone-series export is not supported yet; the bundled timezone rules cover contemporary schedules starting in 2026 or later",
      );
    const block = tzlib_get_ical_block(event.timezone);
    if (
      !Array.isArray(block) ||
      !block[0]?.startsWith("BEGIN:VTIMEZONE") ||
      !block[1]?.startsWith("TZID=")
    )
      throw new Error("This event timezone cannot be exported safely");
    const clock = (value: Date) =>
      eventClock(value, event.timezone!)
        .toString({ smallestUnit: "second" })
        .replace(/[-:]/g, "");
    startProperty = `DTSTART;${block[1]}:${clock(start)}`;
    // Exact elapsed duration also preserves ends crossing DST changes.
    endProperty = `DURATION:PT${Math.max(0, Math.round((+end - +start) / 1000))}S`;
    timezoneBlock = block[0].split(/\r?\n/);
    // TZID resolves ambiguous times to the first occurrence. Preserve a stored
    // second fold explicitly instead of moving it an hour during export.
    const first = clockInstant(
      eventClock(start, event.timezone),
      event.timezone,
    );
    if (first && +first !== +start)
      firstOverride.push(
        `EXDATE:${formatDate(first)}`,
        `RDATE:${formatDate(start)}`,
      );
  }
  if (event.is_all_day) {
    const day = startOfDay(parseISO(event.start_date));
    let last = event.end_date ? parseISO(event.end_date) : addDays(day, 1);
    if (!Number.isFinite(last.getTime())) last = addDays(day, 1);
    // Legacy all-day records ended at 23:59:59; retain their displayed last
    // day when exporting, without rewriting stored household data.
    if (last.getTime() !== startOfDay(last).getTime())
      last = addDays(startOfDay(last), 1);
    if (last <= day)
      throw new Error("All-day events must end after their start date.");
    startProperty = `DTSTART;VALUE=DATE:${format(day, "yyyyMMdd")}`;
    endProperty = `DTEND;VALUE=DATE:${format(last, "yyyyMMdd")}`;
  }

  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//MyLight//NONSGML v1.0//EN",
    ...timezoneBlock,
    "BEGIN:VEVENT",
    `UID:${event.id || Date.now()}@mylight.app`,
    `DTSTAMP:${formatDate(now)}`,
    startProperty,
    endProperty,
    ...firstOverride,
    `SUMMARY:${escape(event.title)}`,
    `DESCRIPTION:${escape(event.description || "")}`,
    `LOCATION:${escape(event.location || "")}`,
    "END:VEVENT",
    "END:VCALENDAR",
  ];

  const recurrence = event.recurrence || event.rrule;
  if (recurrence) {
    // Insert RRULE before END:VEVENT
    // RRULE string from DB usually looks like "FREQ=WEEKLY;..."
    // We just need to make sure it's valid for ICS.
    // Assuming simplistic RRULE storage that is compatible.
    lines.splice(
      lines.length - 2,
      0,
      `RRULE:${recurrence.replace(/^RRULE:/, "").replace(/[\r\n]/g, "")}`,
    );
  }

  // RFC 5545's 75-octet limit counts UTF-8 bytes, not JavaScript characters.
  return (
    lines
      .map((line) => {
        let folded = "",
          bytes = 0;
        for (const character of line) {
          const size = new TextEncoder().encode(character).length;
          if (bytes + size > 75) {
            folded += "\r\n ";
            bytes = 1;
          }
          folded += character;
          bytes += size;
        }
        return folded;
      })
      .join("\r\n") + "\r\n"
  );
}

export function downloadICS(event: Event) {
  const icsContent = generateICS(event);
  const blob = new Blob([icsContent], { type: "text/calendar;charset=utf-8" });
  const link = document.createElement("a");
  link.href = window.URL.createObjectURL(blob);
  link.setAttribute("download", `${event.title.replace(/\s+/g, "_")}.ics`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  setTimeout(() => URL.revokeObjectURL(link.href), 1000);
}
