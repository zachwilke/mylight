import React, { useState, useEffect } from 'react';
import { format, startOfWeek, endOfWeek, startOfMonth, endOfMonth, eachDayOfInterval, isSameMonth, isSameDay } from 'date-fns';
import { cn } from '../../../lib/utils';
import { UserAvatar } from '../../../components/UserAvatar';
import { RRule } from 'rrule';

export function MonthGrid({ currentDate, onEventClick, refreshTrigger }) {
    const [events, setEvents] = useState([]);

    const monthStart = startOfMonth(currentDate);
    const monthEnd = endOfMonth(monthStart);
    const startDate = startOfWeek(monthStart);
    const endDate = endOfWeek(monthEnd);

    const days = eachDayOfInterval({ start: startDate, end: endDate });
    const weekDays = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

    useEffect(() => {
        Promise.all([
            fetch('/api/family', { cache: 'no-store' }).then(res => res.json()),
            fetch('/api/events', { cache: 'no-store' }).then(res => res.json())
        ]).then(([familyData, eventsData]) => {
            // Map family data
            const memberMap = {};
            familyData.forEach(m => memberMap[m.id] = m);

            const allEvents = [];

            eventsData.forEach(evt => {
                const evtDate = new Date(evt.start_date);
                const member = memberMap[evt.member_id] || (evt.is_external ? { color: evt.color } : { color: 'bg-gray-100 text-gray-700' });

                // Check for recurrence rule (from local 'recurrence' or external 'rrule')
                const recurrenceRule = evt.recurrence || evt.rrule;

                if (recurrenceRule) {
                    try {
                        const rule = RRule.fromString(recurrenceRule);
                        // RRule dates are usually UTC, need to handle timezone carefully.
                        // Ideally we pass `dtstart`.
                        // rrule library typically operates on UTC or local dates depending on input.
                        // We'll simplisticly assume simplistic expansion for MVP.
                        // For rrule.between, we need a range. Let's expand for the visible range (start - buffer, end + buffer).

                        // We need to set dtstart on the rule options if not in string, or if using fromString, it might need it.
                        // If recurrenceRule doesn't have DTSTART, we should construct options. 
                        // But simpler: use rule options + dtstart.

                        const options = RRule.parseString(recurrenceRule);
                        options.dtstart = evtDate;
                        const rruleObj = new RRule(options);

                        const dates = rruleObj.between(startDate, endDate, true);
                        dates.forEach(d => {
                            allEvents.push({
                                ...evt,
                                id: `${evt.id}-${d.toISOString()}`, // Unique ID for instance
                                date: d,
                                member,
                                original_id: evt.id
                            });
                        });
                    } catch (e) {
                        console.error("Failed to parse recurrence", e);
                        // Fallback to single event
                        allEvents.push({ ...evt, date: evtDate, member });
                    }
                } else {
                    allEvents.push({ ...evt, date: evtDate, member });
                }
            });

            setEvents(allEvents);
        }).catch(err => console.error(err));
    }, [currentDate, refreshTrigger]); // Re-fetch or re-calc when currentDate or refreshTrigger changes
    // Ideally we fetch once and expand, but if we change months we might need to expand more if we paginate fetch. 
    // Here we fetch ALL events every time (MVP), so we should depend on refreshTrigger from parent passed down or just runs once.
    // Wait, the original code had `useEffect(..., [])`. 
    // This means it only runs ONCE on mount. That's bad if we change months and want to see recurring events in that month.
    // Since we fetch ALL events, we have the rules. So we can just re-calc expansion when `currentDate` changes.
    // I added `currentDate` to deps. But I don't want to re-fetch on date change if I have all events.
    // But for MVP fetching all is fine.

    // Actually, `formattedEvents` logic was inside the fetch `.then`. If I rely on `currentDate` for expansion range, I need to re-run expansion.
    // So I should separate fetch and expansion.
    // For now, I'll just re-fetch and re-expand.

    return (
        <div className="h-full flex flex-col">
            {/* Weekday Headers */}
            <div className="grid grid-cols-7 border-b border-gray-100 dark:border-gray-700">
                {weekDays.map((day) => (
                    <div key={day} className="py-3 text-center text-xs md:text-sm font-semibold text-gray-400 uppercase tracking-wider">
                        {day}
                    </div>
                ))}
            </div>

            {/* Days Grid */}
            <div className="flex-1 grid grid-cols-7 grid-rows-5 md:grid-rows-6">
                {days.map((day, dayIdx) => {
                    // Find events for this day
                    const dayEvents = events.filter(e => isSameDay(e.date, day));
                    const isToday = isSameDay(day, new Date());

                    return (
                        <div
                            key={day.toString()}
                            className={cn(
                                "border-r border-b border-gray-50 dark:border-gray-700 p-1 md:p-2 relative flex flex-col gap-1 transition-colors hover:bg-gray-50/50 dark:hover:bg-gray-700/50 cursor-pointer",
                                !isSameMonth(day, monthStart) && "bg-gray-50/30 dark:bg-gray-900/30 text-gray-300 dark:text-gray-600",
                                dayIdx % 7 === 6 && "border-r-0"
                            )}
                        >
                            <div className="flex justify-between items-start">
                                <span className={cn(
                                    "text-sm md:text-xl font-medium w-7 h-7 md:w-10 md:h-10 flex items-center justify-center rounded-full",
                                    isToday ? "bg-charcoal dark:bg-gray-100 text-white dark:text-charcoal" : "text-gray-700 dark:text-gray-300"
                                )}>
                                    {format(day, 'd')}
                                </span>
                            </div>

                            {/* Events List */}
                            <div className="flex-1 flex flex-col gap-1 overflow-y-auto mt-1 custom-scrollbar">
                                {dayEvents.map(event => (
                                    <div
                                        key={event.id}
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            // Handle clicking an instance. Pass original ID for editing?
                                            // Or pass the instance and handle in modal.
                                            // Modal currently expects 'evt'. If we pass instance, it has expanded date.
                                            // Backend update needs original ID.
                                            // I added `original_id`.
                                            onEventClick({ ...event, id: event.original_id || event.id });
                                        }}
                                        className={cn(
                                            "px-1 py-1 md:px-3 md:py-2 rounded-md text-[9px] md:text-sm font-semibold truncate border border-transparent shadow-sm flex items-center gap-1 md:gap-2",
                                            event.member?.color || 'bg-gray-100 text-gray-700'
                                        )}
                                    >
                                        <UserAvatar member={event.member} size="sm" className="w-3 h-3 md:w-5 md:h-5 text-[6px] md:text-[10px]" />
                                        <div className="flex flex-col leading-tight min-w-0">
                                            <span className="opacity-75 text-[0.85em] hidden md:block">{format(event.date, 'h:mm a')}</span>
                                            <span className="truncate">{event.title}</span>
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
