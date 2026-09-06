import { Check, Users } from "lucide-react";
import type { FamilyMember } from "../../../types";
import { cn } from "../../../lib/utils";
import {
  toggleFamilySelection,
  type FamilySelection,
} from "../../../lib/calendarFilters";

export interface FamilyFilterProps {
  familySelection?: FamilySelection;
  onFamilySelectionChange?: (selection: FamilySelection) => void;
}

export function CalendarFamilyFilters({
  members,
  selection,
  onChange,
  empty,
}: {
  members: FamilyMember[];
  selection: FamilySelection;
  onChange: (selection: FamilySelection) => void;
  empty: boolean;
}) {
  const options = [
    {
      id: 0,
      name: "Shared",
      color:
        "bg-stone-100 text-stone-700 dark:bg-stone-800 dark:text-stone-200",
    },
    ...members,
    ...(selection || [])
      .filter((id) => id !== 0 && !members.some((member) => member.id === id))
      .map((id) => ({ id, name: `Unavailable member #${id}`, color: null })),
  ];
  return (
    <div className="shrink-0 border-b border-stone-100 dark:border-stone-800 bg-[#FCFBF8] dark:bg-stone-950 px-3 md:px-5 py-3">
      <div
        role="group"
        aria-label="Filter calendar by family member"
        className="flex flex-wrap items-center gap-2"
      >
        <button
          type="button"
          aria-pressed={selection === null}
          onClick={() => onChange(null)}
          className={cn(
            "min-h-11 flex items-center gap-2 rounded-full px-4 text-sm font-semibold border focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600 focus-visible:ring-offset-2",
            selection === null
              ? "bg-stone-800 text-white border-stone-800 dark:bg-stone-100 dark:text-stone-900"
              : "border-stone-300 dark:border-stone-700 text-stone-700 dark:text-stone-200",
          )}
        >
          <Users size={16} aria-hidden="true" /> Everyone
        </button>
        {options.map((member) => {
          const selected = selection !== null && selection.includes(member.id);
          const duplicate = options.some(
            (other) => other.id !== member.id && other.name === member.name,
          );
          const label = duplicate
            ? `${member.name} · #${member.id}`
            : member.name;
          return (
            <button
              key={member.id}
              type="button"
              aria-pressed={selected}
              onClick={() =>
                onChange(toggleFamilySelection(selection, member.id))
              }
              className={cn(
                "min-h-11 max-w-full flex items-center gap-2 rounded-full border px-3 text-sm font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600 focus-visible:ring-offset-2",
                selected
                  ? "border-stone-500 dark:border-stone-300 shadow-sm"
                  : "border-transparent",
                member.color ||
                  "bg-stone-100 text-stone-700 dark:bg-stone-800 dark:text-stone-200",
              )}
            >
              <span className="w-4 shrink-0" aria-hidden="true">
                {selected ? (
                  <Check size={16} />
                ) : (
                  <span className="block w-2 h-2 rounded-full bg-current opacity-40 mx-auto" />
                )}
              </span>
              <span className="break-words min-w-0 text-left">{label}</span>
            </button>
          );
        })}
      </div>
      {selection !== null && (
        <p
          role="status"
          className="mt-2 text-xs text-stone-600 dark:text-stone-400"
        >
          {selection.length === 0
            ? "Nobody selected."
            : empty
              ? "No events match this selection in this date range."
              : "Showing selected schedules."}{" "}
          Choose Everyone to reset. Shared includes unassigned events and
          subscribed calendars.
        </p>
      )}
    </div>
  );
}
