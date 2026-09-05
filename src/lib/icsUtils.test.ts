import { describe, expect, it } from "vitest";
import { generateICS } from "./icsUtils";
import { occurrences } from "./calendar";

describe("all-day calendar contract", () => {
  it("exports floating dates with an exclusive end", () => {
    const ics = generateICS({
      id: 1,
      title: "Trip",
      start_date: "2026-03-07",
      end_date: "2026-03-10",
      is_all_day: true,
    });
    expect(ics).toContain(
      "DTSTART;VALUE=DATE:20260307\r\nDTEND;VALUE=DATE:20260310",
    );
  });
  it("defaults a missing all-day end to the following civil date", () => {
    expect(
      generateICS({
        id: 1,
        title: "Birthday",
        start_date: "2026-11-01",
        is_all_day: true,
      }),
    ).toContain("DTEND;VALUE=DATE:20261102");
  });
  it("preserves UTC timestamp export for timed events", () => {
    expect(
      generateICS({
        id: 1,
        title: "Meeting",
        start_date: "2026-03-08T09:00:00-05:00",
      }),
    ).toContain("DTSTART:20260308T140000Z\r\nDTEND:20260308T150000Z");
  });
  it("rejects invalid start dates clearly", () => {
    expect(() =>
      generateICS({ id: 1, title: "Broken", start_date: "invalid" }),
    ).toThrow("invalid start date");
  });
  it("keeps repeating all-day occurrences at midnight through both DST transitions", () => {
    for (const month of [2, 10]) {
      const first = month === 2 ? 7 : 1;
      const start = new Date(2026, month, first);
      const end = new Date(2026, month, first + 4);
      const events = occurrences(
        [
          {
            id: 1,
            title: "Daily",
            start_date: `2026-${month === 2 ? "03-07" : "11-01"}`,
            is_all_day: true,
            recurrence: "FREQ=DAILY;COUNT=4",
          },
        ],
        start,
        end,
      );
      expect(events).toHaveLength(4);
      expect(events.map((e) => e.date.getDate())).toEqual([
        first,
        first + 1,
        first + 2,
        first + 3,
      ]);
      expect(
        events.every((e) => e.date.getHours() === 0 && e.end.getHours() === 0),
      ).toBe(true);
    }
  });
});
