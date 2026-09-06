import type { FamilyMember } from "../types";

// null means everyone, including members added after the calendar was opened.
// An empty selection intentionally means nobody, not a reset to everyone.
export type FamilySelection = readonly number[] | null;

export function filterFamilyEvents<
  T extends {
    member: Pick<FamilyMember, "id">;
    participants?: Pick<FamilyMember, "id">[];
  },
>(events: T[], selection: FamilySelection): T[] {
  if (selection === null) return events;
  const selected = new Set(selection);
  return events.filter((event) =>
    event.participants?.length
      ? event.participants.some((member) => selected.has(member.id))
      : selected.has(event.member.id),
  );
}

export function toggleFamilySelection(
  selection: FamilySelection,
  id: number,
): number[] {
  if (selection === null) return [id];
  return selection.includes(id)
    ? selection.filter((value) => value !== id)
    : [...selection, id];
}
