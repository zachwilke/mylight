import React, { useState, useEffect } from 'react';
import { format, startOfWeek, endOfWeek, startOfMonth, endOfMonth, eachDayOfInterval, isSameMonth, isSameDay } from 'date-fns';
import { cn } from '../../../lib/utils';
import { UserAvatar } from '../../../components/UserAvatar';

export function MonthGrid({ currentDate }) {
    const [events, setEvents] = useState([]);

    const monthStart = startOfMonth(currentDate);
    const monthEnd = endOfMonth(monthStart);
    const startDate = startOfWeek(monthStart);
    const endDate = endOfWeek(monthEnd);

    const days = eachDayOfInterval({ start: startDate, end: endDate });
    const weekDays = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

    useEffect(() => {
        Promise.all([
            fetch('/api/family').then(res => res.json()),
            fetch('/api/events').then(res => res.json())
        ]).then(([familyData, eventsData]) => {
            // Map family data
            const memberMap = {};
            familyData.forEach(m => memberMap[m.id] = m);

            const formattedEvents = eventsData.map(evt => ({
                ...evt,
                date: new Date(evt.start_date),
                member: memberMap[evt.member_id] || { color: 'bg-gray-100 text-gray-700' }
            }));
            setEvents(formattedEvents);
        }).catch(err => console.error(err));
    }, []);

    return (
        <div className="h-full flex flex-col">
            {/* Weekday Headers */}
            <div className="grid grid-cols-7 border-b border-gray-100">
                {weekDays.map((day) => (
                    <div key={day} className="py-3 text-center text-xs font-semibold text-gray-400 uppercase tracking-wider">
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
                                "border-r border-b border-gray-50 p-2 relative flex flex-col gap-1 transition-colors hover:bg-gray-50/50 cursor-pointer",
                                !isSameMonth(day, monthStart) && "bg-gray-50/30 text-gray-300",
                                dayIdx % 7 === 6 && "border-r-0" // remove right border for last col if needed, though grid handles it usually
                            )}
                        >
                            <div className="flex justify-between items-start">
                                <span className={cn(
                                    "text-sm font-medium w-7 h-7 flex items-center justify-center rounded-full",
                                    isToday ? "bg-charcoal text-white" : "text-gray-700"
                                )}>
                                    {format(day, 'd')}
                                </span>
                            </div>

                            {/* Events List */}
                            <div className="flex-1 flex flex-col gap-1 overflow-y-auto mt-1 custom-scrollbar">
                                {dayEvents.map(event => (
                                    <div
                                        key={event.id}
                                        className={cn(
                                            "px-2 py-1.5 rounded-md text-[10px] md:text-xs font-semibold truncate border border-transparent shadow-sm flex items-center gap-1.5",
                                            event.member?.color || 'bg-gray-100 text-gray-700'
                                        )}
                                    >
                                        <UserAvatar member={event.member} size="sm" className="w-4 h-4 text-[8px]" />
                                        <div className="flex flex-col leading-tight min-w-0">
                                            <span className="opacity-75 text-[0.85em]">{format(event.date, 'h:mm a')}</span>
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
