import { describe, expect, it } from "vitest";
import { layoutTimedEvents } from "./calendarLayout";

const entry = (id: string, startMinutes: number, durationMinutes: number) => ({
  id,
  startMinutes,
  durationMinutes,
});
describe("timed calendar columns", () => {
  it("gives overlapping events separate columns and resets for a later group", () => {
    const result = layoutTimedEvents([
      entry("a", 540, 60),
      entry("b", 550, 30),
      entry("c", 560, 60),
      entry("d", 660, 60),
    ]);
    expect(result.map((e) => [e.column, e.columns])).toEqual([
      [0, 3],
      [1, 3],
      [2, 3],
      [0, 1],
    ]);
  });
  it("reuses a free column without overlapping a long spanning event", () => {
    const result = layoutTimedEvents([
      entry("a", 540, 180),
      entry("b", 540, 60),
      entry("c", 600, 60),
    ]);
    expect(result.map((e) => [e.column, e.columns])).toEqual([
      [0, 2],
      [1, 2],
      [1, 2],
    ]);
  });
  it("allows back-to-back events but separates visibly overlapping short cards", () => {
    expect(
      layoutTimedEvents([entry("a", 540, 60), entry("b", 600, 60)]).every(
        (e) => e.columns === 1,
      ),
    ).toBe(true);
    expect(
      layoutTimedEvents([entry("a", 540, 0), entry("b", 555, 5)]).every(
        (e) => e.columns === 2,
      ),
    ).toBe(true);
  });
  it("is deterministic without mutating input and retains a late-night minimum target", () => {
    const input = [
      entry("b", 540, 60),
      entry("a", 540, 60),
      entry("night", 1439, 0),
    ];
    const copy = structuredClone(input);
    expect(layoutTimedEvents(input)).toEqual(
      layoutTimedEvents([...input].reverse()),
    );
    expect(input).toEqual(copy);
    const result = layoutTimedEvents(input);
    expect(result[result.length - 1]).toMatchObject({
      top: 1439,
      height: 30,
    });
  });
  it("never assigns intersecting visible intervals to the same column", () => {
    const result = layoutTimedEvents(
      Array.from({ length: 100 }, (_, i) =>
        entry(String(i), (i * 137) % 1400, (i * 31) % 180),
      ),
    );
    for (let i = 0; i < result.length; i++)
      for (let j = i + 1; j < result.length; j++) {
        const a = result[i],
          b = result[j];
        if (a.top < b.top + b.height && b.top < a.top + a.height)
          expect(a.column).not.toBe(b.column);
      }
  });
});
