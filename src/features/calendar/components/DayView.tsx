import React, { useState, useEffect } from 'react';
import { format, getHours, getMinutes, differenceInMinutes, isSameDay } from 'date-fns';
import { cn } from '../../../lib/utils';
import { UserAvatar } from '../../../components/UserAvatar';
import { RRule } from 'rrule';
import { Event, FamilyMember } from '../../../types';

interface DayViewProps {
    currentDate: Date;
    onEventClick: (event: Event) => void;
    refreshTrigger: number;
}

interface CalendarEvent extends Omit<Event, 'id'> {
    id: number | string;
    date: Date;
    member?: FamilyMember;
    original_id?: number;
    startMinutes?: number;
    durationMinutes?: number;
}

export function DayView({ currentDate, onEventClick, refreshTrigger }: DayViewProps) {
    const [events, setEvents] = useState<CalendarEvent[]>([]);
    const hours = Array.from({ length: 24 }, (_, i) => i);

    useEffect(() => {
        Promise.all([
            fetch('/api/family', { cache: 'no-store' }).then(res => res.json()),
            fetch('/api/events', { cache: 'no-store' }).then(res => res.json())
        ]).then(([familyData, eventsData]: [FamilyMember[], Event[]]) => {
            const memberMap: Record<number, FamilyMember> = {};
            familyData.forEach(m => memberMap[m.id as number] = m);

            const allEvents: CalendarEvent[] = [];

            eventsData.forEach(evt => {
                const evtDate = new Date(evt.start_date);
                const endDate = evt.end_date ? new Date(evt.end_date) : new Date(evtDate.getTime() + 60 * 60 * 1000);

                const member = memberMap[evt.member_id as number] || (evt.is_external ? {
                    id: -1,
                    name: 'External',
                    color: evt.color || '',
                    visible: true,
                    avatar: null,
                    stars: 0,
                    phone: null
                } as unknown as FamilyMember : {
                    id: -1,
                    name: evt.member_id === 0 || !evt.member_id ? 'Family' : 'Unknown',
                    color: 'bg-gray-100 text-gray-700',
                    visible: true,
                    avatar: null,
                    stars: 0,
                    phone: null
                } as unknown as FamilyMember);

                const recurrenceRule = evt.recurrence || evt.rrule;
                const duration = differenceInMinutes(endDate, evtDate);

                if (recurrenceRule) {
                    try {
                        const options = RRule.parseString(recurrenceRule);
                        options.dtstart = evtDate;
                        const rruleObj = new RRule(options);
                        // Just need events for this day
                        // Expand with tiny buffer around current date
                        const dStart = new Date(currentDate); dStart.setHours(0, 0, 0, 0);
                        const dEnd = new Date(currentDate); dEnd.setHours(23, 59, 59, 999);

                        const dates = rruleObj.between(dStart, dEnd, true);

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
                        // Fallback check if simple date matches
                        if (isSameDay(evtDate, currentDate)) {
                            allEvents.push({
                                ...evt,
                                date: evtDate,
                                member,
                                original_id: evt.id as number,
                                startMinutes: getHours(evtDate) * 60 + getMinutes(evtDate),
                                durationMinutes: duration
                            });
                        }
                    }
                } else {
                    if (isSameDay(evtDate, currentDate)) {
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
                }
            });

            setEvents(allEvents);
        }).catch(err => console.error(err));
    }, [currentDate, refreshTrigger]);

    // Simple overlapping events logic:
    // Sort by start time.
    // If overlap, width = 50%? 
    // For MVP, just full width opacity overlay.

    return (
        <div className="flex flex-col h-full overflow-hidden bg-white dark:bg-gray-900 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-800">
            {/* Header */}
            <div className="p-4 border-b border-gray-100 dark:border-gray-800 text-center">
                <div className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-1">{format(currentDate, 'EEEE')}</div>
                <h2 className="text-3xl font-bold text-gray-900 dark:text-white">{format(currentDate, 'MMMM do')}</h2>
            </div>

            {/* Scrollable Grid */}
            <div className="flex-1 overflow-y-auto custom-scrollbar relative">
                <div className="flex relative min-h-[1440px]">
                    {/* Time Column */}
                    <div className="w-20 flex-shrink-0 border-r border-gray-100 dark:border-gray-800 bg-gray-50/30 dark:bg-gray-800/20 text-xs font-medium text-gray-400">
                        {hours.map(hour => (
                            <div key={hour} className="h-[60px] border-b border-gray-50 dark:border-gray-800/50 text-center pt-2 relative">
                                <span className="-top-3 relative">{format(new Date().setHours(hour, 0, 0, 0), 'h a')}</span>
                            </div>
                        ))}
                    </div>

                    {/* Events Area */}
                    <div className="flex-1 relative">
                        {/* Hour Lines */}
                        {hours.map(h => (
                            <div key={h} className="h-[60px] border-b border-gray-100 dark:border-gray-800/50"></div>
                        ))}

                        {/* Events */}
                        {events.map(event => {
                            const top = event.startMinutes || 0;
                            const height = Math.max(event.durationMinutes || 60, 30);

                            return (
                                <div
                                    key={event.id}
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        onEventClick({ ...event, id: event.original_id || event.id } as Event);
                                    }}
                                    className={cn(
                                        "absolute left-2 right-2 rounded-xl p-3 border border-white/20 shadow-md cursor-pointer overflow-hidden transition-all hover:scale-[1.01] hover:z-10",
                                        event.member?.color || "bg-blue-100 text-blue-700 dark:bg-blue-900/50 dark:text-blue-200"
                                    )}
                                    style={{
                                        top: `${top}px`,
                                        height: `${height}px`
                                    }}
                                >
                                    <div className="flex items-start justify-between">
                                        <div>
                                            <div className="font-bold text-base">{event.title}</div>
                                            <div className="text-sm opacity-90">{event.description}</div>
                                            <div className="flex items-center gap-2 opacity-80 mt-1 text-sm">
                                                <span>{format(event.date, 'h:mm a')}</span>
                                                <span>•</span>
                                                <span>{event.location || 'No location'}</span>
                                            </div>
                                        </div>
                                        <UserAvatar member={event.member} size="sm" />
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>
            </div>
        </div>
    );
}
