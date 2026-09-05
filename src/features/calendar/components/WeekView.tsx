import { useEffect, useRef, useState } from "react";
import {
  addDays,
  eachDayOfInterval,
  endOfWeek,
  format,
  isSameDay,
  startOfWeek,
} from "date-fns";
import { cn } from "../../../lib/utils";
import { Event } from "../../../types";
import { useCalendarEvents } from "../../../hooks/useCalendarEvents";
import { CalendarLoadState } from "./CalendarLoadState";
import { TimedEventCards } from "./TimedEventCards";
import { AllDayEvents } from "./AllDayEvents";
import { WeekAgenda } from "./WeekAgenda";
import {
  CalendarFamilyFilters,
  type FamilyFilterProps,
} from "./CalendarFamilyFilters";
import { filterFamilyEvents } from "../../../lib/calendarFilters";

interface WeekViewProps extends FamilyFilterProps {
  currentDate: Date;
  onEventClick: (event: Event) => void;
  refreshTrigger: number;
}
export function WeekView({
  currentDate,
  onEventClick,
  refreshTrigger,
  familySelection = null,
  onFamilySelectionChange,
}: WeekViewProps) {
  const [agenda, setAgenda] = useState(false);
  const weekStart = startOfWeek(currentDate);
  const days = eachDayOfInterval({
    start: weekStart,
    end: endOfWeek(currentDate),
  });
  const scroll = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (scroll.current) scroll.current.scrollTop = 7 * 60;
  }, [agenda]);
  const hours = Array.from({ length: 24 }, (_, i) => i);
  const {
    events: allEvents,
    members,
    ...loadState
  } = useCalendarEvents(weekStart, addDays(weekStart, 7), refreshTrigger);
  const events = filterFamilyEvents(allEvents, familySelection);
  return (
    <div className="flex flex-col h-full overflow-hidden">
      <CalendarLoadState {...loadState} />
      {onFamilySelectionChange && (
        <CalendarFamilyFilters
          members={members}
          selection={familySelection}
          onChange={onFamilySelectionChange}
          empty={!loadState.loading && !loadState.error && events.length === 0}
        />
      )}
      <div
        className="hidden md:flex justify-end gap-1 px-3 py-2 bg-[#F7F5F0] dark:bg-stone-950"
        role="group"
        aria-label="Week layout"
      >
        <button
          type="button"
          aria-pressed={!agenda}
          onClick={() => setAgenda(false)}
          className={`min-h-11 px-4 rounded-xl text-sm ${!agenda ? "bg-white dark:bg-stone-800 shadow-sm" : "text-stone-600 dark:text-stone-400"}`}
        >
          Time grid
        </button>
        <button
          type="button"
          aria-pressed={agenda}
          onClick={() => setAgenda(true)}
          className={`min-h-11 px-4 rounded-xl text-sm ${agenda ? "bg-white dark:bg-stone-800 shadow-sm" : "text-stone-600 dark:text-stone-400"}`}
        >
          Agenda
        </button>
      </div>
      <WeekAgenda
        events={events}
        days={days}
        onEventClick={onEventClick}
        forceVisible={agenda}
      />
      {!agenda && (
        <div className="hidden md:flex flex-col flex-1 min-h-0 overflow-hidden bg-white dark:bg-gray-900 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-800">
          {/* Header */}
          <div className="flex border-b border-gray-100 dark:border-gray-800">
            <div className="w-16 flex-shrink-0 border-r border-gray-100 dark:border-gray-800 bg-gray-50/50 dark:bg-gray-800/50"></div>
            {days.map((day) => {
              const isToday = isSameDay(day, new Date());
              return (
                <div
                  key={day.toISOString()}
                  className="flex-1 py-3 text-center border-r border-gray-100 dark:border-gray-800 last:border-r-0"
                >
                  <div className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1">
                    {format(day, "EEE")}
                  </div>
                  <div
                    className={cn(
                      "text-xl font-bold w-8 h-8 flex items-center justify-center rounded-full mx-auto",
                      isToday
                        ? "bg-charcoal dark:bg-white text-white dark:text-charcoal"
                        : "text-gray-900 dark:text-white",
                    )}
                  >
                    {format(day, "d")}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Scrollable Grid */}
          <AllDayEvents
            events={events}
            days={days}
            onEventClick={onEventClick}
          />
          <div
            ref={scroll}
            className="flex-1 overflow-y-auto custom-scrollbar relative"
          >
            <div className="flex relative min-h-[1470px]">
              {" "}
              {/* 60px per hour * 24 = 1440 */}
              {/* Time Column */}
              <div className="w-16 flex-shrink-0 border-r border-gray-100 dark:border-gray-800 bg-gray-50/30 dark:bg-gray-800/20 text-xs font-medium text-gray-400">
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
              {/* Day Columns */}
              {days.map((day) => {
                // Filter events for this day
                const dayEvents = events.filter(
                  (e) => !e.is_all_day && isSameDay(e.date, day),
                );

                return (
                  <div
                    key={day.toISOString()}
                    className="flex-1 border-r border-gray-100 dark:border-gray-800 last:border-r-0 relative"
                  >
                    {/* Hour Lines */}
                    {hours.map((h) => (
                      <div
                        key={h}
                        className="h-[60px] border-b border-gray-100 dark:border-gray-800/50"
                      ></div>
                    ))}

                    {/* Events */}
                    <TimedEventCards
                      events={dayEvents}
                      onEventClick={onEventClick}
                      compact
                    />
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
