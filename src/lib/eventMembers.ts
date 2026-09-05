import type { Event, FamilyMember } from "../types";

export function eventMembers(
  event: Event,
  members: FamilyMember[],
): FamilyMember[] {
  const ids = event.member_ids ?? (event.member_id ? [event.member_id] : []);
  return [...new Set(ids)].flatMap((id) => {
    const member = members.find((value) => value.id === id);
    return member ? [member] : [];
  });
}

export function eventMemberLabel(
  event: Event,
  members: FamilyMember[],
): string {
  return (
    event.source_name ||
    eventMembers(event, members)
      .map((member) =>
        members.some(
          (other) => other.id !== member.id && other.name === member.name,
        )
          ? `${member.name} · #${member.id}`
          : member.name,
      )
      .join(" & ") ||
    "Family"
  );
}
