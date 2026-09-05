import type { Event } from "../types";
import { addDays, format, parseISO, startOfDay } from "date-fns";

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
      .replace(/\r?\n/g, "\\n")
      .replace(/;/g, "\\;")
      .replace(/,/g, "\\,");

  let startProperty = `DTSTART:${formatDate(start)}`;
  let endProperty = `DTEND:${formatDate(end)}`;
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
    "BEGIN:VEVENT",
    `UID:${event.id || Date.now()}@mylight.app`,
    `DTSTAMP:${formatDate(now)}`,
    startProperty,
    endProperty,
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

  return lines.join("\r\n");
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
