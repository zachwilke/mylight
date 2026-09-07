import { describe, expect, it } from "vitest";
import { addDays, format, parseISO } from "date-fns";
import { occurrences, segments } from "./calendar";
import cases from "../../testdata/recurrence.json";
import type { Event } from "../types";

describe("browser/server recurrence contract", () => {
  for (const fixture of cases)
    it(fixture.name, () => {
      const event: Event = fixture.event;
      const start = parseISO(fixture.starts[0]);
      const end = addDays(parseISO(fixture.starts.slice(-1)[0]!), 2);
      const expanded = occurrences([event], start, end);
      expect(expanded.map((e) => e.occurrence_key)).toEqual(fixture.starts);
    });
});

it("suppresses changed/cancelled originals and includes a moved occurrence independently", () => {
  const master: Event = {
    id: 1,
    title: "Original",
    start_date: "2026-09-07T14:00:00Z",
    recurrence: "FREQ=DAILY;COUNT=4",
    timezone: "America/Chicago",
    exdates: ["2026-09-08T14:00:00Z", "2026-09-09T14:00:00.000Z"],
  };
  const moved: Event = {
    id: 2,
    title: "Moved",
    start_date: "2026-08-01T14:00:00Z",
    series_id: 1,
    recurrence_id: "2026-09-08T14:00:00.000Z",
  };
  const originalWeek = occurrences(
    [master, moved],
    new Date("2026-09-07T00:00:00Z"),
    new Date("2026-09-12T00:00:00Z"),
  );
  expect(originalWeek.map((e) => e.date.toISOString())).toEqual([
    "2026-09-07T14:00:00.000Z",
    "2026-09-10T14:00:00.000Z",
  ]);
  const earlierWeek = occurrences(
    [moved],
    new Date("2026-08-01T00:00:00Z"),
    new Date("2026-08-02T00:00:00Z"),
  );
  expect(earlierWeek[0].occurrence_key).toBe("2026-09-08T14:00:00.000Z");
  expect(earlierWeek[0].series_id).toBe(1);
});
it("keeps original identity on every slice of an overnight event", () => {
  const event: Event = {
    id: 1,
    title: "Overnight",
    start_date: "2026-09-07T23:00:00Z",
    end_date: "2026-09-09T02:00:00Z",
    recurrence: "FREQ=WEEKLY;COUNT=2",
  };
  const slices = segments(
    [event],
    new Date("2026-09-14T00:00:00Z"),
    new Date("2026-09-18T00:00:00Z"),
  );
  expect(slices.length).toBeGreaterThan(1);
  expect(new Set(slices.map((e) => e.occurrence_key))).toEqual(
    new Set(["2026-09-14T23:00:00.000Z"]),
  );
  expect(new Set(slices.map((e) => e.occurrence_start))).toEqual(
    new Set(["2026-09-14T23:00:00.000Z"]),
  );
});
it("excludes an entire multi-day all-day occurrence using a civil key", () => {
  const event: Event = {
    id: 1,
    title: "Trip",
    start_date: "2026-03-07",
    end_date: "2026-03-10",
    is_all_day: true,
    recurrence: "FREQ=WEEKLY;COUNT=2",
    exdates: ["2026-03-14"],
  };
  const values = occurrences(
    [event],
    parseISO("2026-03-01"),
    parseISO("2026-04-01"),
  );
  expect(values.map((e) => format(e.date, "yyyy-MM-dd"))).toEqual([
    "2026-03-07",
  ]);
  expect(format(values[0].end, "yyyy-MM-dd")).toBe("2026-03-10");
});
