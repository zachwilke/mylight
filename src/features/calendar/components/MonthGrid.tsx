import {
  addDays,
  eachDayOfInterval,
  endOfMonth,
  endOfWeek,
  format,
  isSameDay,
  isSameMonth,
  startOfMonth,
  startOfWeek,
} from "date-fns";
import { UserAvatar } from "../../../components/UserAvatar";
import { cn } from "../../../lib/utils";
import { Event } from "../../../types";
import { useCalendarEvents } from "../../../hooks/useCalendarEvents";
import { CalendarLoadState } from "./CalendarLoadState";
import {
  CalendarFamilyFilters,
  type FamilyFilterProps,
} from "./CalendarFamilyFilters";
import { filterFamilyEvents } from "../../../lib/calendarFilters";

interface MonthGridProps extends FamilyFilterProps {
  currentDate: Date;
  onEventClick: (event: Event) => void;
  refreshTrigger: number;
  onDayDoubleClick?: (date: Date) => void;
}
export function MonthGrid({
  currentDate,
  onEventClick,
  refreshTrigger,
  onDayDoubleClick,
  familySelection = null,
  onFamilySelectionChange,
}: MonthGridProps) {
  const monthStart = startOfMonth(currentDate);
  const startDate = startOfWeek(monthStart);
  const endDate = endOfWeek(endOfMonth(monthStart));
  const days = eachDayOfInterval({ start: startDate, end: endDate });
  const weekDays = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const {
    events: allEvents,
    members,
    ...loadState
  } = useCalendarEvents(
    startDate,
    addDays(days[days.length - 1], 1),
    refreshTrigger,
  );
  const events = filterFamilyEvents(allEvents, familySelection);
  return (
    <div className="h-full flex flex-col">
      <CalendarLoadState {...loadState} />
      {onFamilySelectionChange && (
        <CalendarFamilyFilters
          members={members}
          selection={familySelection}
          onChange={onFamilySelectionChange}
          empty={!loadState.loading && !loadState.error && events.length === 0}
        />
      )}
      {/* Weekday Headers */}
      <div className="grid grid-cols-7 border-b border-gray-100 dark:border-gray-700">
        {weekDays.map((day) => (
          <div
            key={day}
            className="py-3 text-center text-xs md:text-sm font-semibold text-gray-400 uppercase tracking-wider"
          >
            {day}
          </div>
        ))}
      </div>

      {/* Days Grid */}
      <div
        className="flex-1 grid grid-cols-7"
        style={{
          gridTemplateRows: `repeat(${days.length / 7}, minmax(100px,1fr))`,
        }}
      >
        {days.map((day, dayIdx) => {
          // Find events for this day
          const dayEvents = events.filter((e) => isSameDay(e.date, day));
          const isToday = isSameDay(day, new Date());

          return (
            <div
              key={day.toString()}
              onDoubleClick={() => onDayDoubleClick && onDayDoubleClick(day)}
              className={cn(
                "border-r border-b border-gray-50 dark:border-gray-700 p-1 md:p-2 relative flex flex-col gap-1 transition-colors hover:bg-gray-50/50 dark:hover:bg-gray-700/50 cursor-pointer",
                !isSameMonth(day, monthStart) &&
                  "bg-gray-50/30 dark:bg-gray-900/30 text-gray-300 dark:text-gray-600",
                dayIdx % 7 === 6 && "border-r-0",
              )}
            >
              <div className="flex justify-between items-start">
                <span
                  className={cn(
                    "text-sm md:text-xl font-medium w-7 h-7 md:w-10 md:h-10 flex items-center justify-center rounded-full",
                    isToday
                      ? "bg-charcoal dark:bg-gray-100 text-white dark:text-charcoal"
                      : "text-gray-700 dark:text-gray-300",
                  )}
                >
                  {format(day, "d")}
                </span>
              </div>

              {/* Events List */}
              <div className="flex-1 flex flex-col gap-1 overflow-y-auto mt-1 custom-scrollbar">
                {dayEvents.map((event) => (
                  <div
                    key={event.id}
                    role="button"
                    tabIndex={0}
                    aria-label={event.title}
                    title={`${event.title} · ${event.member.name}`}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        onEventClick({
                          ...event,
                          id: event.original_id || event.id,
                        });
                      }
                    }}
                    onClick={(e) => {
                      e.stopPropagation();
                      // Handle clicking an instance. Pass original ID for editing?
                      // Or pass the instance and handle in modal.
                      // Modal currently expects 'evt'. If we pass instance, it has expanded date.
                      // Backend update needs original ID.
                      // I added `original_id`.
                      onEventClick({
                        ...event,
                        id: event.original_id || event.id,
                      });
                    }}
                    className={cn(
                      "px-1 py-1 md:px-3 md:py-2 rounded-md text-[9px] md:text-sm font-semibold truncate border border-transparent shadow-sm flex items-center gap-1 md:gap-2",
                      event.member?.color || "bg-gray-100 text-gray-700",
                    )}
                  >
                    <UserAvatar
                      member={event.member}
                      size="sm"
                      className="w-3 h-3 md:w-5 md:h-5 text-[6px] md:text-[10px]"
                    />
                    <div className="flex flex-col leading-tight min-w-0">
                      <span className="opacity-75 text-[0.85em] hidden md:block">
                        {event.is_all_day
                          ? "All day"
                          : format(event.date, "h:mm a")}
                      </span>
                      <span className="truncate">{event.title}</span>
                      {event.participants && event.participants.length > 1 && (
                        <span className="truncate text-[0.8em] opacity-75 hidden md:block">
                          {event.member.name}
                        </span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
