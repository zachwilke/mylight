import { describe, expect, it } from "vitest";
import { eventClock, eventInstant, zonedRepeatDates } from "./eventTimezone";
import { occurrences } from "./calendar";
import { readRepeat, writeRepeat } from "./recurrenceEditor";

describe("timezone-aware calendar", () => {
  it("produces identical occurrence instants for viewers in different timezones", () => {
    const previous = process.env.TZ;
    try {
      for (const viewer of ["UTC", "America/Los_Angeles", "Asia/Tokyo"]) {
        process.env.TZ = viewer;
        const dates = zonedRepeatDates(
          "FREQ=DAILY;COUNT=3",
          new Date("2026-03-07T15:00:00Z"),
          "America/Chicago",
          new Date("2026-03-07"),
          new Date("2026-03-12"),
        );
        expect(dates.map((d) => d.toISOString())).toEqual([
          "2026-03-07T15:00:00.000Z",
          "2026-03-08T14:00:00.000Z",
          "2026-03-09T14:00:00.000Z",
        ]);
      }
    } finally {
      if (previous === undefined) delete process.env.TZ;
      else process.env.TZ = previous;
    }
  });
  it("keeps 9am through spring and fall, independent of the viewer timezone", () => {
    for (const [start, hours] of [
      ["2026-03-07T15:00:00Z", [15, 14, 14]],
      ["2026-10-31T14:00:00Z", [14, 15, 15]],
    ] as const) {
      const first = new Date(start);
      const dates = zonedRepeatDates(
        "FREQ=DAILY;COUNT=3",
        first,
        "America/Chicago",
        first,
        new Date(+first + 5 * 86400000),
      );
      expect(dates.map((d) => d.getUTCHours())).toEqual(hours);
      expect(dates.map((d) => eventClock(d, "America/Chicago").hour)).toEqual([
        9, 9, 9,
      ]);
    }
  });
  it("skips nonexistent times without spending COUNT and chooses the first folded time", () => {
    const spring = zonedRepeatDates(
      "FREQ=DAILY;COUNT=3",
      new Date("2026-03-07T08:30:00Z"),
      "America/Chicago",
      new Date("2026-03-07"),
      new Date("2026-03-12"),
    );
    expect(spring.map((d) => d.toISOString())).toEqual([
      "2026-03-07T08:30:00.000Z",
      "2026-03-09T07:30:00.000Z",
      "2026-03-10T07:30:00.000Z",
    ]);
    expect(eventInstant("2026-11-01", "01:30", "America/Chicago")).toBe(
      "2026-11-01T06:30:00.000Z",
    );
    expect(() =>
      eventInstant("2026-03-08", "02:30", "America/Chicago"),
    ).toThrow("does not exist");
  });
  it("retains an explicitly stored second folded first occurrence", () => {
    const dates = zonedRepeatDates(
      "FREQ=DAILY;COUNT=2",
      new Date("2026-11-01T07:30:00Z"),
      "America/Chicago",
      new Date("2026-11-01"),
      new Date("2026-11-04"),
    );
    expect(dates.map((d) => d.toISOString())).toEqual([
      "2026-11-01T07:30:00.000Z",
      "2026-11-02T07:30:00.000Z",
    ]);
  });
  it("uses event-zone weekday selectors even when the UTC date differs", () => {
    const dates = zonedRepeatDates(
      "FREQ=WEEKLY;BYDAY=MO;COUNT=2",
      new Date("2026-09-06T15:30:00Z"),
      "Asia/Tokyo",
      new Date("2026-09-01"),
      new Date("2026-09-20"),
    );
    expect(dates.map((d) => d.toISOString())).toEqual([
      "2026-09-06T15:30:00.000Z",
      "2026-09-13T15:30:00.000Z",
    ]);
  });
  it("honors UTC UNTIL and range overlap while preserving elapsed duration", () => {
    const result = occurrences(
      [
        {
          id: 1,
          title: "Overnight",
          start_date: "2026-03-07T05:00:00Z",
          end_date: "2026-03-07T08:00:00Z",
          timezone: "America/Chicago",
          recurrence: "FREQ=DAILY;UNTIL=20260309T035959Z",
        },
      ],
      new Date("2026-03-08T06:00:00Z"),
      new Date("2026-03-10"),
    );
    expect(result.map((d) => d.date.toISOString())).toEqual([
      "2026-03-08T05:00:00.000Z",
    ]);
    expect(+result[0].end - +result[0].date).toBe(3 * 3600000);
  });
  it("supports half-hour transitions and valid occurrence counts after the gap", () => {
    const dates = zonedRepeatDates(
      "FREQ=DAILY;COUNT=3",
      new Date(eventInstant("2026-10-03", "02:15", "Australia/Lord_Howe")),
      "Australia/Lord_Howe",
      new Date("2026-10-01"),
      new Date("2026-10-08"),
    );
    expect(dates.map((d) => eventClock(d, "Australia/Lord_Howe").day)).toEqual([
      3, 5, 6,
    ]);
  });
  it("uses the event timezone for editor cutoffs instead of the device zone", () => {
    const draft = {
      ...readRepeat("FREQ=DAILY", false),
      original: undefined,
      ending: "until" as const,
      until: "2026-03-08",
    };
    const rule = writeRepeat(draft, false, "2026-03-07", "Asia/Tokyo");
    expect(rule).toBe("FREQ=DAILY;UNTIL=20260308T145959Z");
    expect(readRepeat(rule, false, "Asia/Tokyo").until).toBe("2026-03-08");
  });
  it("does not reset COUNT when loading a later range", () => {
    expect(
      zonedRepeatDates(
        "FREQ=DAILY;COUNT=3",
        new Date("2026-03-07T15:00:00Z"),
        "America/Chicago",
        new Date("2026-03-10"),
        new Date("2026-03-15"),
      ),
    ).toEqual([]);
  });
});
