import React, { useState, useEffect, useMemo } from 'react';
import { format, startOfWeek, endOfWeek, eachDayOfInterval, isSameDay, addDays, getHours, getMinutes, differenceInMinutes, startOfDay } from 'date-fns';
import { cn } from '../../../lib/utils';
import { UserAvatar } from '../../../components/UserAvatar';
import { RRule } from 'rrule';
import { Event, FamilyMember } from '../../../types';

interface WeekViewProps {
    currentDate: Date;
    onEventClick: (event: Event) => void;
    refreshTrigger: number;
}

interface CalendarEvent extends Omit<Event, 'id'> {
    id: number | string;
    date: Date;
    member?: FamilyMember;
    original_id?: number;
    // Helper for layout
    startMinutes?: number;
    durationMinutes?: number;
}

export function WeekView({ currentDate, onEventClick, refreshTrigger }: WeekViewProps) {
    const [events, setEvents] = useState<CalendarEvent[]>([]);
    const [familyMembers, setFamilyMembers] = useState<FamilyMember[]>([]);

    const weekStart = startOfWeek(currentDate);
    const weekEnd = endOfWeek(currentDate);
    const days = eachDayOfInterval({ start: weekStart, end: weekEnd });
    const hours = Array.from({ length: 24 }, (_, i) => i);

    useEffect(() => {
        Promise.all([
            fetch('/api/family', { cache: 'no-store' }).then(res => res.json()),
            fetch('/api/events', { cache: 'no-store' }).then(res => res.json())
        ]).then(([familyData, eventsData]: [FamilyMember[], Event[]]) => {
            setFamilyMembers(familyData);
            const memberMap: Record<number, FamilyMember> = {};
            familyData.forEach(m => memberMap[m.id as number] = m);

            const allEvents: CalendarEvent[] = [];

            eventsData.forEach(evt => {
                const evtDate = new Date(evt.start_date);
                const endDate = evt.end_date ? new Date(evt.end_date) : new Date(evtDate.getTime() + 60 * 60 * 1000); // Default 1h

                const member = memberMap[evt.member_id as number] || (evt.is_external ? {
                    id: -1,
                    name: 'External',
                    color: evt.color || '',
                    avatar: undefined,
                    stars: 0,
                    phone: '',
                    visible: true
                } : {
                    id: -1,
                    // Handle "All Family" (0/NULL) or Unknown
                    name: evt.member_id === 0 || !evt.member_id ? 'Family' : 'Unknown',
                    color: 'bg-gray-100 text-gray-700',
                    avatar: undefined,
                    stars: 0,
                    phone: '',
                    visible: true
                });

                const recurrenceRule = evt.recurrence || evt.rrule;

                // Calculate duration once
                const duration = differenceInMinutes(endDate, evtDate);

                if (recurrenceRule) {
                    try {
                        const options = RRule.parseString(recurrenceRule);
                        options.dtstart = evtDate;
                        const rruleObj = new RRule(options);
                        // Expand for the week plus buffer
                        const dates = rruleObj.between(addDays(weekStart, -1), addDays(weekEnd, 1), true);

                        dates.forEach(d => {
                            allEvents.push({
                                ...evt,
                                id: `${evt.id}-${d.toISOString()}`,
                                date: d,
                                member,
                                original_id: evt.id as number,
                                startMinutes: getHours(d) * 60 + getMinutes(d),
                                durationMinutes: duration
                            });
                        });
                    } catch (e) {
                        allEvents.push({
                            ...evt,
                            date: evtDate,
                            member,
                            original_id: evt.id as number,
                            startMinutes: getHours(evtDate) * 60 + getMinutes(evtDate),
                            durationMinutes: duration
                        });
                    }
                } else {
                    allEvents.push({
                        ...evt,
                        date: evtDate,
                        member,
                        id: evt.id,
                        original_id: evt.id as number,
                        startMinutes: getHours(evtDate) * 60 + getMinutes(evtDate),
                        durationMinutes: duration
                    });
                }
            });

            setEvents(allEvents);
        }).catch(err => console.error(err));
    }, [currentDate, refreshTrigger, weekStart]);

    // Helper: Scroll to 8am on mount? (Optional enhancement)

    return (
        <div className="flex flex-col h-full overflow-hidden bg-white dark:bg-gray-900 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-800">
            {/* Header */}
            <div className="flex border-b border-gray-100 dark:border-gray-800">
                <div className="w-16 flex-shrink-0 border-r border-gray-100 dark:border-gray-800 bg-gray-50/50 dark:bg-gray-800/50"></div>
                {days.map(day => {
                    const isToday = isSameDay(day, new Date());
                    return (
                        <div key={day.toISOString()} className="flex-1 py-3 text-center border-r border-gray-100 dark:border-gray-800 last:border-r-0">
                            <div className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1">{format(day, 'EEE')}</div>
                            <div className={cn(
                                "text-xl font-bold w-8 h-8 flex items-center justify-center rounded-full mx-auto",
                                isToday ? "bg-charcoal dark:bg-white text-white dark:text-charcoal" : "text-gray-900 dark:text-white"
                            )}>
                                {format(day, 'd')}
                            </div>
                        </div>
                    );
                })}
            </div>

            {/* Scrollable Grid */}
            <div className="flex-1 overflow-y-auto custom-scrollbar relative">
                <div className="flex relative min-h-[1440px]"> {/* 60px per hour * 24 = 1440 */}
                    {/* Time Column */}
                    <div className="w-16 flex-shrink-0 border-r border-gray-100 dark:border-gray-800 bg-gray-50/30 dark:bg-gray-800/20 text-xs font-medium text-gray-400">
                        {hours.map(hour => (
                            <div key={hour} className="h-[60px] border-b border-gray-50 dark:border-gray-800/50 text-center pt-2 relative">
                                <span className="-top-3 relative">{format(new Date().setHours(hour, 0, 0, 0), 'h a')}</span>
                            </div>
                        ))}
                    </div>

                    {/* Day Columns */}
                    {days.map(day => {
                        // Filter events for this day
                        const dayEvents = events.filter(e => isSameDay(e.date, day));

                        return (
                            <div key={day.toISOString()} className="flex-1 border-r border-gray-100 dark:border-gray-800 last:border-r-0 relative">
                                {/* Hour Lines */}
                                {hours.map(h => (
                                    <div key={h} className="h-[60px] border-b border-gray-100 dark:border-gray-800/50"></div>
                                ))}

                                {/* Events */}
                                {dayEvents.map(event => {
                                    // Calculate top and height
                                    // Simple logic: no overlapping handling for MVP
                                    // Top: events starting at 00:00 are at 0. 1 min = 1px (since 60px/hr)
                                    const top = event.startMinutes || 0;
                                    const height = Math.max(event.durationMinutes || 60, 30); // Min 30 mins

                                    return (
                                        <div
                                            key={event.id}
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                onEventClick({ ...event, id: event.original_id || event.id } as Event);
                                            }}
                                            className={cn(
                                                "absolute inset-x-1 rounded-md p-1.5 text-xs border border-white/20 shadow-sm cursor-pointer overflow-hidden transition-all hover:z-10 hover:shadow-md",
                                                event.member?.color || "bg-blue-100 text-blue-700 dark:bg-blue-900/50 dark:text-blue-200"
                                            )}
                                            style={{
                                                top: `${top}px`,
                                                height: `${height}px`
                                            }}
                                            title={event.title}
                                        >
                                            <div className="font-semibold truncate">{event.title}</div>
                                            <div className="flex items-center gap-1 opacity-90 mt-0.5">
                                                <UserAvatar member={event.member} size="sm" className="w-3 h-3 text-[8px]" />
                                                <span className="truncate">{format(event.date, 'h:mm a')}</span>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        );
                    })}
                </div>
            </div>
        </div>
    );
}
