import { describe, expect, it } from "vitest";
import { generateICS } from "./icsUtils";
import { occurrences } from "./calendar";

describe("all-day calendar contract", () => {
  it("does not export historical series using contemporary timezone rules", () => {
    expect(() =>
      generateICS({
        id: 1,
        title: "Historic",
        start_date: "2000-03-15T15:00:00Z",
        timezone: "America/Chicago",
        recurrence: "FREQ=DAILY",
      }),
    ).toThrow("Historical timezone-series export");
  });
  it("preserves a second folded DTSTART using an explicit first-occurrence override", () => {
    const ics = generateICS({
      id: 1,
      title: "Late fold",
      start_date: "2026-11-01T07:30:00Z",
      timezone: "America/Chicago",
      recurrence: "FREQ=DAILY;COUNT=3",
    });
    expect(ics).toContain("EXDATE:20261101T063000Z\r\nRDATE:20261101T073000Z");
  });
  it("escapes all newline forms in event text", () => {
    const ics = generateICS({
      id: 1,
      title: "One\rTwo\r\nThree\nFour",
      start_date: "2026-09-05T09:00:00Z",
    });
    expect(ics).toContain("SUMMARY:One\\nTwo\\nThree\\nFour\r\n");
  });
  it("exports zoned series with timezone rules and elapsed duration", () => {
    const ics = generateICS({
      id: 1,
      title: "Practice",
      start_date: "2026-03-07T15:00:00Z",
      end_date: "2026-03-07T16:00:00Z",
      timezone: "America/Chicago",
      recurrence: "FREQ=DAILY;COUNT=3",
    });
    expect(ics).toContain("BEGIN:VTIMEZONE\r\nTZID:America/Chicago");
    expect(ics).toContain(
      "DTSTART;TZID=America/Chicago:20260307T090000\r\nDURATION:PT3600S",
    );
    expect(ics).toContain("RRULE:FREQ=DAILY;COUNT=3");
  });
  it("folds UTF-8 lines without splitting multi-byte characters", () => {
    const title = "🎉".repeat(60);
    const ics = generateICS({ id: 1, title, start_date: "2026-09-05" });
    expect(
      ics
        .split("\r\n")
        .every((line) => new TextEncoder().encode(line).length <= 75),
    ).toBe(true);
    expect(ics.replace(/\r\n /g, "")).toContain(`SUMMARY:${title}`);
  });
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

it("exports cancellations and moved instances with the same UID and original recurrence identity", () => {
  const content = generateICS({
    id: 12,
    title: "Weekly class",
    start_date: "2026-09-07T14:00:00Z",
    end_date: "2026-09-07T15:00:00Z",
    timezone: "America/Chicago",
    recurrence: "FREQ=WEEKLY;COUNT=4",
    exdates: ["2026-09-14T14:00:00.000Z"],
    overrides: [
      {
        id: 13,
        title: "Moved class",
        start_date: "2026-10-01T16:00:00Z",
        end_date: "2026-10-01T17:00:00Z",
        recurrence_id: "2026-09-21T14:00:00.000Z",
      },
    ],
  });
  expect(content.match(/BEGIN:VEVENT/g)).toHaveLength(2);
  expect(content.match(/UID:12@mylight.app/g)).toHaveLength(2);
  expect(content).toContain("EXDATE:20260914T140000Z");
  expect(content).toContain(
    "RECURRENCE-ID;TZID=America/Chicago:20260921T090000",
  );
  expect(content).toContain("DTSTART:20261001T160000Z");
  expect(
    content
      .split("BEGIN:VEVENT")
      .slice(1)
      .join("")
      .match(/RRULE:/g),
  ).toHaveLength(1);
});
it("exports all-day exceptions as dates", () => {
  const content = generateICS({
    id: 1,
    title: "Trip",
    start_date: "2026-09-07",
    is_all_day: true,
    recurrence: "FREQ=DAILY;COUNT=3",
    exdates: ["2026-09-08"],
    overrides: [
      {
        id: 2,
        title: "Moved trip",
        start_date: "2026-09-15",
        is_all_day: true,
        recurrence_id: "2026-09-09",
      },
    ],
  });
  expect(content).toContain("EXDATE;VALUE=DATE:20260908");
  expect(content).toContain("RECURRENCE-ID;VALUE=DATE:20260909");
  expect(content).toContain("DTSTART;VALUE=DATE:20260915");
});
