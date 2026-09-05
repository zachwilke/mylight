import { format, isSameDay } from "date-fns";
import type { Event, FamilyMember } from "../../../types";

interface AgendaEvent extends Event {
  date: Date;
  original_id: Event["id"];
  member?: Pick<FamilyMember, "name" | "color">;
}

/** A seven-column time grid is unreadable on a phone; keep the same week as an agenda. */
export function WeekAgenda({
  events,
  days,
  onEventClick,
  forceVisible = false,
}: {
  events: AgendaEvent[];
  days: Date[];
  onEventClick: (event: Event) => void;
  forceVisible?: boolean;
}) {
  return (
    <div
      className={`${forceVisible ? "" : "md:hidden"} h-full overflow-y-auto bg-[#F7F5F0] dark:bg-stone-950 p-4 space-y-4`}
    >
      {days.map((day) => {
        const dayEvents = events.filter((event) => isSameDay(event.date, day));
        return (
          <section
            key={day.toISOString()}
            className="rounded-2xl bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-800 p-4"
          >
            <h3 className="font-semibold mb-3">
              {format(day, "EEEE, MMM d")}
              {isSameDay(day, new Date()) ? " · Today" : ""}
            </h3>
            {!dayEvents.length && (
              <p className="text-sm text-stone-500">No plans yet.</p>
            )}
            <div className="space-y-2">
              {dayEvents.map((event) => (
                <button
                  key={event.id}
                  onClick={() =>
                    onEventClick({ ...event, id: event.original_id })
                  }
                  className={
                    "w-full text-left rounded-xl p-3 " +
                    (event.color ||
                      event.member?.color ||
                      "bg-stone-100 text-stone-800 dark:bg-stone-800 dark:text-stone-100")
                  }
                >
                  <span className="block text-xs opacity-75 mb-1">
                    {event.is_all_day ? "All day" : format(event.date, "p")}
                    {event.source_name || event.member?.name
                      ? " · " + (event.source_name || event.member?.name)
                      : ""}
                  </span>
                  <span className="block text-sm font-medium break-words">
                    {event.title}
                  </span>
                </button>
              ))}
            </div>
          </section>
        );
      })}
    </div>
  );
}
