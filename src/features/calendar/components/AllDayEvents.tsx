import { format, isSameDay } from "date-fns";
import type { Event, FamilyMember } from "../../../types";

interface AllDayEvent extends Event {
  date: Date;
  original_id: Event["id"];
  member?: Pick<FamilyMember, "name" | "color">;
}
export function AllDayEvents({
  events,
  days,
  onEventClick,
}: {
  events: AllDayEvent[];
  days: Date[];
  onEventClick: (event: Event) => void;
}) {
  const allDay = events.filter((event) => event.is_all_day);
  if (!allDay.length) return null;
  return (
    <div
      className="grid border-b border-stone-200 dark:border-stone-800 bg-stone-50 dark:bg-stone-900 max-h-40 overflow-y-auto"
      style={{
        gridTemplateColumns: `4rem repeat(${days.length},minmax(0,1fr))`,
      }}
    >
      <span className="text-xs text-stone-500 p-2">All day</span>
      {days.map((day) => (
        <div
          key={day.toISOString()}
          className="min-w-0 p-1 space-y-1 border-l border-stone-200 dark:border-stone-800"
        >
          {allDay
            .filter((event) => isSameDay(event.date, day))
            .map((event) => (
              <button
                key={event.id}
                onClick={() =>
                  onEventClick({ ...event, id: event.original_id })
                }
                title={
                  event.title +
                  " · " +
                  format(day, "PPP") +
                  (event.member ? " · " + event.member.name : "")
                }
                className={
                  "text-left w-full rounded-md p-2 text-xs truncate " +
                  (event.color ||
                    event.member?.color ||
                    "bg-emerald-100 text-emerald-800")
                }
              >
                {event.title}
              </button>
            ))}
        </div>
      ))}
    </div>
  );
}
