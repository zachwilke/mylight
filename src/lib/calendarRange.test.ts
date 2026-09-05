import { describe, expect, it } from "vitest";
import { calendarEventsURL } from "./calendarRange";

describe("calendar range requests", () => {
  it("retains civil-date fields and round-trips the instant including milliseconds", () => {
    const start = new Date(2026, 2, 8, 0, 0, 0, 123);
    const end = new Date(2026, 2, 9);
    const url = new URL(calendarEventsURL(start, end), "http://example.test");
    expect(url.searchParams.get("start")).toMatch(
      /^2026-03-08T00:00:00\.123[+-]/,
    );
    expect(new Date(url.searchParams.get("start")!).getTime()).toBe(
      start.getTime(),
    );
    expect(new Date(url.searchParams.get("end")!).getTime()).toBe(
      end.getTime(),
    );
  });
  it("rejects invalid and non-positive bounds", () => {
    expect(() => calendarEventsURL(new Date(NaN), new Date())).toThrow();
    expect(() => calendarEventsURL(new Date(100), new Date(100))).toThrow();
    expect(() => calendarEventsURL(new Date(200), new Date(100))).toThrow();
  });
});
