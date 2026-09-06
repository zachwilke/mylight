import { describe, expect, it } from "vitest";
import { readRepeat, writeRepeat, type RepeatDraft } from "./recurrenceEditor";
import { occurrences } from "./calendar";

process.env.TZ = "America/Chicago";
const draft = (patch: Partial<RepeatDraft> = {}): RepeatDraft => ({
  ...readRepeat("", false),
  frequency: "WEEKLY",
  original: undefined,
  ...patch,
});

describe("repeat schedule editor", () => {
  it("builds interval/count schedules and counts the first occurrence", () => {
    const rule = writeRepeat(
      draft({ interval: "2", ending: "count", count: "3" }),
      true,
      "2026-09-05",
    );
    expect(rule).toBe("FREQ=WEEKLY;INTERVAL=2;COUNT=3");
    const dates = occurrences(
      [
        {
          id: 1,
          title: "Practice",
          start_date: "2026-09-05",
          is_all_day: true,
          recurrence: rule,
        },
      ],
      new Date(2026, 8, 1),
      new Date(2026, 10, 1),
    );
    expect(dates.map((e) => e.date.getDate())).toEqual([5, 19, 3]);
  });

  it("preserves simple, prefixed and complex existing rules exactly until edited", () => {
    for (const rule of [
      "",
      "RRULE:FREQ=DAILY;INTERVAL=1",
      "COUNT=8;FREQ=MONTHLY;INTERVAL=2",
      "FREQ=WEEKLY;BYDAY=MO,WE",
      "FREQ=MONTHLY;BYDAY=-1FR",
      "FREQ=DAILY;UNTIL=20260908T120000Z",
      "legacy",
    ]) {
      expect(writeRepeat(readRepeat(rule, false), false, "2026-09-05")).toBe(
        rule,
      );
    }
    expect(readRepeat("COUNT=8;FREQ=MONTHLY;INTERVAL=2", false)).toMatchObject({
      frequency: "MONTHLY",
      interval: "2",
      ending: "count",
      count: "8",
    });
  });

  it("leaves unsupported or malformed rules in custom mode", () => {
    for (const rule of [
      "FREQ=WEEKLY;BYDAY=MO",
      "FREQ=DAILY;COUNT=0",
      "FREQ=DAILY;COUNT=",
      "FREQ=DAILY;INTERVAL=1001",
      "FREQ=DAILY;COUNT=2;UNTIL=20260908",
      "FREQ=DAILY;FREQ=WEEKLY",
      "FREQ=DAILY;UNTIL=20260230",
      "FREQ=DAILY;UNTIL=20260908T120000Z",
    ]) {
      expect(readRepeat(rule, true).frequency).toBe("custom");
    }
    expect(
      readRepeat("FREQ=DAILY;UNTIL=20260908T120000Z", false).frequency,
    ).toBe("custom");
  });

  it("uses an inclusive civil cutoff for all-day repeats across DST", () => {
    const rule = writeRepeat(
      draft({ frequency: "DAILY", ending: "until", until: "2026-03-09" }),
      true,
      "2026-03-07",
    );
    expect(rule).toBe("FREQ=DAILY;UNTIL=20260309");
    expect(readRepeat(rule, true)).toMatchObject({
      ending: "until",
      until: "2026-03-09",
    });
    const dates = occurrences(
      [
        {
          id: 1,
          title: "Trip",
          start_date: "2026-03-07",
          is_all_day: true,
          recurrence: rule,
        },
      ],
      new Date(2026, 2, 1),
      new Date(2026, 2, 12),
    );
    expect(dates.map((e) => e.date.getDate())).toEqual([7, 8, 9]);
    expect(dates.every((e) => e.date.getHours() === 0)).toBe(true);
  });

  it("encodes local end-of-day as UTC using the cutoff day's offset", () => {
    for (const [until, expected] of [
      ["2026-03-08", "20260309T045959Z"],
      ["2026-11-01", "20261102T055959Z"],
    ]) {
      const rule = writeRepeat(
        draft({ ending: "until", until }),
        false,
        "2026-01-01",
      );
      expect(rule).toBe(`FREQ=WEEKLY;UNTIL=${expected}`);
      expect(readRepeat(rule, false)).toMatchObject({ ending: "until", until });
    }
  });

  it("rejects invalid limits and cutoffs, even without browser validation", () => {
    for (const interval of ["", "0", "-1", "1.5", "1001", "1e2"])
      expect(() =>
        writeRepeat(draft({ interval }), false, "2026-09-05"),
      ).toThrow("interval");
    for (const count of ["", "0", "-1", "1.5", "10001"])
      expect(() =>
        writeRepeat(draft({ ending: "count", count }), false, "2026-09-05"),
      ).toThrow("count");
    for (const until of ["", "invalid", "2026-02-30", "2026-09-04"])
      expect(() =>
        writeRepeat(draft({ ending: "until", until }), false, "2026-09-05"),
      ).toThrow("end date");
    expect(
      writeRepeat(
        draft({ interval: "1000", ending: "count", count: "10000" }),
        true,
        "2026-09-05",
      ),
    ).toBe("FREQ=WEEKLY;INTERVAL=1000;COUNT=10000");
  });

  it("clears repetition and does not include inactive endings", () => {
    expect(
      writeRepeat(
        draft({ frequency: "", ending: "count", count: "invalid" }),
        false,
        "2026-09-05",
      ),
    ).toBe("");
    expect(
      writeRepeat(
        draft({ ending: "never", count: "invalid", until: "invalid" }),
        false,
        "2026-09-05",
      ),
    ).toBe("FREQ=WEEKLY");
  });
});
