import { expect, it } from "vitest";
import { eventMembers, eventMemberLabel } from "./eventMembers";
import { filterFamilyEvents } from "./calendarFilters";
import type { FamilyMember } from "../types";

const members: FamilyMember[] = [1, 2].map((id) => ({
  id,
  name: "Alex",
  color: null,
  avatar: null,
  stars: 0,
  phone: null,
  visible: true,
}));
const event = {
  id: 1,
  title: "Together",
  start_date: "2026-09-05",
  member_id: 1,
  member_ids: [1, 2],
};
it("resolves legacy IDs, explicit shared assignments and duplicate-name labels", () => {
  expect(eventMembers({ ...event, member_ids: undefined }, members)).toEqual([
    members[0],
  ]);
  expect(eventMembers({ ...event, member_ids: [] }, members)).toEqual([]);
  expect(eventMembers({ ...event, member_ids: [1, 999, 1] }, members)).toEqual([
    members[0],
  ]);
  expect(eventMemberLabel(event, members)).toBe("Alex · #1 & Alex · #2");
});
it("matches any participant without duplicating an event or treating it as unassigned", () => {
  const events = [{ ...event, member: members[0], participants: members }];
  expect(filterFamilyEvents(events, [2])).toEqual(events);
  expect(filterFamilyEvents(events, [1, 2])).toHaveLength(1);
  expect(filterFamilyEvents(events, [0])).toEqual([]);
});
