import { RRule } from "rrule";
import {
  addDays,
  differenceInCalendarDays,
  parseISO,
  startOfDay,
} from "date-fns";
import type { Event } from "../types";

export interface Occurrence extends Event {
  date: Date;
  occurrenceId: string;
  end: Date;
}
export function occurrences(
  events: Event[],
  start: Date,
  end: Date,
): Occurrence[] {
  const result: Occurrence[] = [];
  for (const event of events) {
    const date = parseISO(event.start_date);
    if (!Number.isFinite(date.getTime())) continue;
    const parsedEnd = event.end_date ? parseISO(event.end_date) : new Date(NaN);
    const finish = Number.isFinite(parsedEnd.getTime())
      ? parsedEnd
      : event.is_all_day
        ? addDays(date, 1)
        : new Date(date.getTime() + 3600000);
    const duration = Math.max(0, finish.getTime() - date.getTime());
    const dayCount = Math.max(1, differenceInCalendarDays(finish, date));
    let dates = [date];
    if (event.recurrence || event.rrule) {
      try {
        const options = RRule.parseString(
          event.recurrence || event.rrule || "",
        );
        if (options.freq !== undefined && options.freq > RRule.DAILY) continue;
        const floatingAllDay =
          event.is_all_day && event.start_date.length === 10;
        const floating = (value: Date) =>
          new Date(
            Date.UTC(
              value.getFullYear(),
              value.getMonth(),
              value.getDate(),
              value.getHours(),
              value.getMinutes(),
              value.getSeconds(),
            ),
          );
        dates = new RRule({
          ...options,
          dtstart: floatingAllDay ? floating(date) : date,
        }).between(
          floatingAllDay
            ? floating(addDays(start, -dayCount))
            : new Date(start.getTime() - duration),
          floatingAllDay ? floating(end) : end,
          true,
          (_date, index) => index < 2000,
        );
        if (floatingAllDay) {
          dates = dates.map(
            (value) =>
              new Date(
                value.getUTCFullYear(),
                value.getUTCMonth(),
                value.getUTCDate(),
              ),
          );
        }
      } catch {
        dates = [date];
      }
    }
    for (const date of dates) {
      const finish =
        event.is_all_day && event.start_date.length === 10
          ? addDays(date, dayCount)
          : new Date(date.getTime() + duration);
      if (
        date < end &&
        (finish > start ||
          (finish.getTime() === date.getTime() && date >= start))
      )
        result.push({
          ...event,
          date,
          end: finish,
          occurrenceId: `${event.id}-${date.toISOString()}`,
        });
    }
  }
  return result.sort((a, b) => a.date.getTime() - b.date.getTime());
}

/** Per-day slices let multi-day events appear on every covered day; ends are exclusive. */
export function segments(events: Event[], start: Date, end: Date) {
  return occurrences(events, start, end).flatMap((event) => {
    const pieces: (Occurrence & {
      original_id: Event["id"];
      startMinutes: number;
      durationMinutes: number;
    })[] = [];
    for (
      let day = startOfDay(event.date > start ? event.date : start);
      day < end &&
      (day < event.end ||
        (day.getTime() === startOfDay(event.date).getTime() &&
          event.end.getTime() === event.date.getTime()));
      day = addDays(day, 1)
    ) {
      const next = addDays(day, 1);
      const date = event.date > day ? event.date : day;
      const finish = event.end < next ? event.end : next;
      const startMinutes = date.getHours() * 60 + date.getMinutes();
      const endMinutes =
        finish.getTime() === next.getTime()
          ? 1440
          : finish.getHours() * 60 + finish.getMinutes();
      pieces.push({
        ...event,
        id: event.occurrenceId + "-" + day.toISOString(),
        original_id: event.id,
        date,
        startMinutes,
        durationMinutes: Math.max(0, endMinutes - startMinutes),
      });
    }
    return pieces;
  });
}
