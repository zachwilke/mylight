import { useEffect, useRef } from "react";
import { addDays, format, startOfDay } from "date-fns";
import { Event } from "../../../types";
import { useCalendarEvents } from "../../../hooks/useCalendarEvents";
import { AllDayEvents } from "./AllDayEvents";
import { CalendarLoadState } from "./CalendarLoadState";
import { TimedEventCards } from "./TimedEventCards";
import {
  CalendarFamilyFilters,
  type FamilyFilterProps,
} from "./CalendarFamilyFilters";
import { filterFamilyEvents } from "../../../lib/calendarFilters";

interface DayViewProps extends FamilyFilterProps {
  currentDate: Date;
  onEventClick: (event: Event) => void;
  refreshTrigger: number;
}
export function DayView({
  currentDate,
  onEventClick,
  refreshTrigger,
  familySelection = null,
  onFamilySelectionChange,
}: DayViewProps) {
  const day = startOfDay(currentDate);
  const {
    events: allEvents,
    members,
    ...loadState
  } = useCalendarEvents(day, addDays(day, 1), refreshTrigger);
  const events = filterFamilyEvents(allEvents, familySelection);
  const scroll = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (scroll.current) scroll.current.scrollTop = 7 * 60;
  }, []);
  const hours = Array.from({ length: 24 }, (_, i) => i);
  return (
    <div className="flex flex-col h-full overflow-hidden bg-white dark:bg-gray-900 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-800">
      <CalendarLoadState {...loadState} />
      {onFamilySelectionChange && (
        <CalendarFamilyFilters
          members={members}
          selection={familySelection}
          onChange={onFamilySelectionChange}
          empty={!loadState.loading && !loadState.error && events.length === 0}
        />
      )}
      {/* Header */}
      <div className="p-4 border-b border-gray-100 dark:border-gray-800 text-center">
        <div className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-1">
          {format(currentDate, "EEEE")}
        </div>
        <h2 className="text-3xl font-bold text-gray-900 dark:text-white">
          {format(currentDate, "MMMM do")}
        </h2>
      </div>

      {/* Scrollable Grid */}
      <AllDayEvents events={events} days={[day]} onEventClick={onEventClick} />
      <div
        ref={scroll}
        className="flex-1 overflow-y-auto custom-scrollbar relative"
      >
        <div className="flex relative min-h-[1470px]">
          {/* Time Column */}
          <div className="w-20 flex-shrink-0 border-r border-gray-100 dark:border-gray-800 bg-gray-50/30 dark:bg-gray-800/20 text-xs font-medium text-gray-400">
            {hours.map((hour) => (
              <div
                key={hour}
                className="h-[60px] border-b border-gray-50 dark:border-gray-800/50 text-center pt-2 relative"
              >
                <span className="-top-3 relative">
                  {format(new Date().setHours(hour, 0, 0, 0), "h a")}
                </span>
              </div>
            ))}
          </div>

          {/* Events Area */}
          <div className="flex-1 relative">
            {/* Hour Lines */}
            {hours.map((h) => (
              <div
                key={h}
                className="h-[60px] border-b border-gray-100 dark:border-gray-800/50"
              ></div>
            ))}

            {/* Events */}
            <TimedEventCards
              events={events.filter((event) => !event.is_all_day)}
              onEventClick={onEventClick}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
