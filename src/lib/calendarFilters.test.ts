import { expect, it } from "vitest";
import { filterFamilyEvents, toggleFamilySelection } from "./calendarFilters";

const events = [
  { id: 1, member: { id: 10, name: "Alex" } },
  { id: 2, member: { id: 20, name: "Alex" } },
  { id: 3, member: { id: 0, name: "Family" } },
  { id: "feed", member: { id: 0, name: "Holidays" } },
];

it("filters by stable member IDs rather than duplicate names", () => {
  expect(filterFamilyEvents(events, [20]).map((event) => event.id)).toEqual([
    2,
  ]);
  expect(filterFamilyEvents(events, [10, 20]).map((event) => event.id)).toEqual(
    [1, 2],
  );
});

it("distinguishes everyone, nobody and shared calendars without changing input", () => {
  expect(filterFamilyEvents(events, null)).toBe(events);
  expect(filterFamilyEvents(events, [])).toEqual([]);
  expect(filterFamilyEvents(events, [0]).map((event) => event.id)).toEqual([
    3,
    "feed",
  ]);
  expect(events).toHaveLength(4);
});

it("starts a focused selection, supports multiple people, and allows deselecting the last", () => {
  expect(toggleFamilySelection(null, 10)).toEqual([10]);
  const original = [10];
  expect(toggleFamilySelection(original, 20)).toEqual([10, 20]);
  expect(toggleFamilySelection(original, 10)).toEqual([]);
  expect(original).toEqual([10]);
});
