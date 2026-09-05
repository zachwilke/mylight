import { format } from "date-fns";
import { cn } from "../../../lib/utils";
import { layoutTimedEvents } from "../../../lib/calendarLayout";
import type { Event, FamilyMember } from "../../../types";
import type { segments } from "../../../lib/calendar";

type Segment = ReturnType<typeof segments>[number] & { member: FamilyMember };
export function TimedEventCards({
  events,
  onEventClick,
  compact = false,
}: {
  events: Segment[];
  onEventClick: (event: Event) => void;
  compact?: boolean;
}) {
  return layoutTimedEvents(events).map(
    ({ event, top, height, column, columns }) => {
      const label = `${event.title} · ${format(event.date, "h:mm a")}–${format(event.end, "h:mm a")} · ${event.member.name}`;
      return (
        <button
          key={event.id}
          type="button"
          aria-label={label}
          title={label}
          onClick={() =>
            onEventClick({ ...event, id: event.original_id ?? event.id })
          }
          className={cn(
            "absolute rounded-lg border border-white/40 text-left overflow-hidden shadow-sm hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-700 focus-visible:ring-offset-2 focus-visible:z-20",
            compact ? "px-1.5 py-1 text-xs" : "px-3 py-1.5 text-sm",
            event.member.color ||
              "bg-stone-100 text-stone-800 dark:bg-stone-800 dark:text-stone-100",
          )}
          style={{
            top,
            height,
            left: `calc(${(column / columns) * 100}% + 3px)`,
            width: `calc(${100 / columns}% - 6px)`,
          }}
        >
          <span className="block font-semibold truncate">{event.title}</span>
          {height >= 45 && (
            <span className="block truncate opacity-90 text-xs">
              {format(event.date, "h:mm a")} · {event.member.name}
            </span>
          )}
          {!compact && height >= 75 && event.location && (
            <span className="block truncate opacity-90 text-xs mt-1">
              {event.location}
            </span>
          )}
        </button>
      );
    },
  );
}
