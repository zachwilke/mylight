import { describe, expect, it } from "vitest";
import { calendarSegments, occurrences, segments } from "./calendar";
import type { Event } from "../types";

process.env.TZ = "America/Chicago";
const base: Event = {
  id: 1,
  title: "Trip",
  start_date: "2026-03-07",
  end_date: "2026-03-10",
  is_all_day: true,
};
describe("shared calendar occurrence model", () => {
  it("reports timezone failures without rendering a partial calendar", () => {
    const result = calendarSegments(
      [
        {
          id: 1,
          title: "Broken zone",
          start_date: "2026-09-05T09:00:00Z",
          timezone: "Mars/Olympus",
          recurrence: "FREQ=DAILY",
        },
      ],
      new Date("2026-09-05"),
      new Date("2026-09-07"),
    );
    expect(result.events).toEqual([]);
    expect(result.error).toContain("Calendar unavailable");
  });
  it("keeps date-only events on their civil day and uses an exclusive end", () => {
    const days = segments([base], new Date(2026, 2, 1), new Date(2026, 3, 1));
    expect(days.map((e) => e.date.getDate())).toEqual([7, 8, 9]);
    expect(days.every((e) => e.date.getHours() === 0)).toBe(true);
  });
  it("includes a multi-day event starting before the visible range", () => {
    expect(
      segments([base], new Date(2026, 2, 8), new Date(2026, 2, 9)),
    ).toHaveLength(1);
  });
  it("splits overnight events without covering the exclusive end day", () => {
    const event: Event = {
      id: 2,
      title: "Travel",
      start_date: "2026-09-05T23:00:00-05:00",
      end_date: "2026-09-07T00:00:00-05:00",
    };
    const days = segments([event], new Date(2026, 8, 5), new Date(2026, 8, 8));
    expect(days.map((e) => e.date.getDate())).toEqual([5, 6]);
    expect(days.map((e) => e.durationMinutes)).toEqual([60, 1440]);
  });
  it("preserves series identity while providing unique instance keys", () => {
    const event: Event = {
      id: 3,
      title: "Walk",
      start_date: "2026-09-05T14:00:00Z",
      end_date: "2026-09-05T15:00:00Z",
      recurrence: "FREQ=DAILY;COUNT=3",
    };
    const days = segments([event], new Date(2026, 8, 5), new Date(2026, 8, 9));
    expect(days).toHaveLength(3);
    expect(new Set(days.map((e) => e.id)).size).toBe(3);
    expect(
      days.every(
        (e) => e.original_id === 3 && e.start_date === event.start_date,
      ),
    ).toBe(true);
  });
  it("does not duplicate already expanded feed events", () => {
    const event: Event = { ...base, id: "feed-1-stable", is_external: true };
    expect(
      occurrences([event], new Date(2026, 2, 1), new Date(2026, 3, 1)),
    ).toHaveLength(1);
  });
  it("skips invalid dates and sub-daily recurrence", () => {
    expect(
      occurrences(
        [
          { ...base, start_date: "invalid" },
          { ...base, recurrence: "FREQ=SECONDLY" },
        ],
        new Date(2026, 2, 1),
        new Date(2026, 3, 1),
      ),
    ).toEqual([]);
  });
});
