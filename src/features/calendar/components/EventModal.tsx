import React, { useState, useEffect } from 'react';
import { X, Calendar as CalendarIcon, Clock, User, Share, MapPin, AlignLeft, ToggleLeft, ToggleRight } from 'lucide-react';
import { cn } from '../../../lib/utils';
import { format, addHours, parseISO } from 'date-fns';
import { downloadICS } from '../../../lib/icsUtils';
import { Event, FamilyMember } from '../../../types';

interface EventModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSave: (event: Partial<Event>) => void;
    currentEvent: Event | null;
    onDelete: (id: number | string) => void;
}

export function EventModal({ isOpen, onClose, onSave, currentEvent, onDelete }: EventModalProps) {
    const [title, setTitle] = useState('');

    // Date/Time State
    const [startDate, setStartDate] = useState(format(new Date(), 'yyyy-MM-dd'));
    const [startTime, setStartTime] = useState('12:00');
    const [endDate, setEndDate] = useState(format(new Date(), 'yyyy-MM-dd'));
    const [endTime, setEndTime] = useState('13:00');
    const [isAllDay, setIsAllDay] = useState(false);

    const [memberId, setMemberId] = useState<number | string>('');
    const [recurrence, setRecurrence] = useState('');
    const [location, setLocation] = useState('');
    const [description, setDescription] = useState('');

    const [members, setMembers] = useState<FamilyMember[]>([]);

    useEffect(() => {
        if (isOpen) {
            fetch('/api/family', { cache: 'no-store' })
                .then(res => res.json())
                .then(data => {
                    setMembers(data);
                    if (!currentEvent && data.length > 0 && !memberId) setMemberId(data[0].id);
                });

            if (currentEvent) {
                setTitle(currentEvent.title);
                const start = new Date(currentEvent.start_date);
                setStartDate(format(start, 'yyyy-MM-dd'));
                setStartTime(format(start, 'HH:mm'));

                if (currentEvent.end_date) {
                    const end = new Date(currentEvent.end_date);
                    setEndDate(format(end, 'yyyy-MM-dd'));
                    setEndTime(format(end, 'HH:mm'));
                } else {
                    // Default end is +1 hour from start
                    const end = addHours(start, 1);
                    setEndDate(format(end, 'yyyy-MM-dd'));
                    setEndTime(format(end, 'HH:mm'));
                }

                setMemberId(currentEvent.member_id || (members.length > 0 ? members[0].id : ''));
                setRecurrence(currentEvent.recurrence || '');
                setLocation(currentEvent.location || '');
                setDescription(currentEvent.description || '');
                setIsAllDay(!!currentEvent.is_all_day);
            } else {
                // Reset for new event
                setTitle('');
                const now = new Date();
                const nextHour = addHours(now, 1);

                setStartDate(format(now, 'yyyy-MM-dd'));
                setStartTime(format(now, 'HH:mm'));
                setEndDate(format(now, 'yyyy-MM-dd'));
                setEndTime(format(nextHour, 'HH:mm'));

                setRecurrence('');
                setLocation('');
                setDescription('');
                setIsAllDay(false);
            }
        }
    }, [isOpen, currentEvent]);

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();

        let startIso: string;
        let endIso: string | undefined;

        if (isAllDay) {
            // For all day, usually sending just YYYY-MM-DD or T00:00:00 with flag
            // Let's stick to valid ISO timestamps for DB consistency
            startIso = new Date(`${startDate}T00:00:00`).toISOString();
            // End date is usually inclusive or exclusive depending on spec. 
            // For simple calendar, let's treat end date as the day it ends on.
            endIso = new Date(`${endDate}T23:59:59`).toISOString();
        } else {
            startIso = new Date(`${startDate}T${startTime}`).toISOString();
            endIso = new Date(`${endDate}T${endTime}`).toISOString();
        }

        onSave({
            title,
            start_date: startIso,
            end_date: endIso,
            member_id: Number(memberId),
            recurrence,
            location,
            description,
            is_all_day: isAllDay
        });
        onClose();
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/20 dark:bg-black/50 backdrop-blur-sm p-4">
            <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto custom-scrollbar animate-in fade-in zoom-in-95 duration-200">

                {/* Header */}
                <div className="px-6 py-4 border-b border-gray-100 dark:border-gray-700 flex items-center justify-between sticky top-0 bg-white dark:bg-gray-800 z-10">
                    <h3 className="text-xl font-bold text-gray-800 dark:text-gray-100">{currentEvent ? 'Edit Event' : 'New Event'}</h3>
                    <div className="flex items-center gap-2">
                        {currentEvent && (
                            <button
                                onClick={() => downloadICS(currentEvent)}
                                className="p-2 text-sky-500 hover:text-sky-600 hover:bg-sky-50 rounded-full transition-colors"
                                title="Download Invite (ICS)"
                            >
                                <Share size={20} />
                            </button>
                        )}
                        <button onClick={onClose} className="p-2 text-gray-400 hover:text-gray-600 rounded-full hover:bg-gray-50 transition-colors">
                            <X size={20} />
                        </button>
                    </div>
                </div>

                <form onSubmit={handleSubmit} className="p-6 space-y-6">
                    {/* Title Input */}
                    <div>
                        <input
                            type="text"
                            placeholder="Add Title"
                            className="w-full text-2xl font-semibold border-b-2 border-gray-100 dark:border-gray-700 py-2 focus:border-blue-500 focus:outline-none bg-transparent placeholder:text-gray-300 dark:placeholder:text-gray-600 dark:text-gray-100 transition-colors"
                            value={title}
                            onChange={e => setTitle(e.target.value)}
                            autoFocus
                            required
                        />
                    </div>

                    {/* All Day Toggle */}
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2 text-gray-600 dark:text-gray-300">
                            <Clock size={18} />
                            <span className="text-sm font-medium">All Day</span>
                        </div>
                        <button
                            type="button"
                            onClick={() => setIsAllDay(!isAllDay)}
                            className={cn(
                                "relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2",
                                isAllDay ? "bg-blue-600" : "bg-gray-200 dark:bg-gray-700"
                            )}
                        >
                            <span
                                className={cn(
                                    "inline-block h-4 w-4 transform rounded-full bg-white transition-transform",
                                    isAllDay ? "translate-x-6" : "translate-x-1"
                                )}
                            />
                        </button>
                    </div>

                    {/* Date & Time Picker Group */}
                    <div className="space-y-3">
                        {/* Start */}
                        <div className="flex items-center gap-3">
                            <div className="flex-1">
                                <label className="block text-xs font-bold text-gray-400 uppercase mb-1">Starts</label>
                                <div className="flex gap-2">
                                    <div className="relative flex-1">
                                        <input
                                            type="date"
                                            className="w-full bg-gray-50 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-lg py-2 px-3 text-sm font-medium dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500/50"
                                            value={startDate}
                                            onChange={e => setStartDate(e.target.value)}
                                            required
                                        />
                                    </div>
                                    {!isAllDay && (
                                        <div className="relative w-32">
                                            <input
                                                type="time"
                                                className="w-full bg-gray-50 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-lg py-2 px-3 text-sm font-medium dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500/50"
                                                value={startTime}
                                                onChange={e => setStartTime(e.target.value)}
                                            />
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>

                        {/* End */}
                        <div className="flex items-center gap-3">
                            <div className="flex-1">
                                <label className="block text-xs font-bold text-gray-400 uppercase mb-1">Ends</label>
                                <div className="flex gap-2">
                                    <div className="relative flex-1">
                                        <input
                                            type="date"
                                            className="w-full bg-gray-50 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-lg py-2 px-3 text-sm font-medium dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500/50"
                                            value={endDate}
                                            onChange={e => setEndDate(e.target.value)}
                                            required
                                        />
                                    </div>
                                    {!isAllDay && (
                                        <div className="relative w-32">
                                            <input
                                                type="time"
                                                className="w-full bg-gray-50 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-lg py-2 px-3 text-sm font-medium dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500/50"
                                                value={endTime}
                                                onChange={e => setEndTime(e.target.value)}
                                            />
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Recurrence */}
                    <div>
                        <label className="block text-xs font-bold text-gray-400 uppercase mb-1">Repeat</label>
                        <select
                            className="w-full bg-gray-50 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-lg py-2 px-3 text-sm font-medium dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500/50 appearance-none"
                            value={recurrence}
                            onChange={e => setRecurrence(e.target.value)}
                        >
                            <option value="" className="dark:bg-gray-800">Does not repeat</option>
                            <option value="FREQ=DAILY" className="dark:bg-gray-800">Daily</option>
                            <option value="FREQ=WEEKLY" className="dark:bg-gray-800">Weekly</option>
                            <option value="FREQ=MONTHLY" className="dark:bg-gray-800">Monthly</option>
                            <option value="FREQ=YEARLY" className="dark:bg-gray-800">Yearly</option>
                        </select>
                    </div>

                    <div className="border-t border-gray-100 dark:border-gray-700 pt-4 space-y-4">
                        {/* Member / Calendar */}
                        <div>
                            <div className="relative">
                                <User size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                                <select
                                    className="w-full bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-600 rounded-lg py-2 pl-10 pr-4 text-sm font-medium dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500/50"
                                    value={memberId}
                                    onChange={e => setMemberId(e.target.value)}
                                >
                                    {members.map(m => (
                                        <option key={m.id} value={m.id} className="dark:bg-gray-800">{m.name}</option>
                                    ))}
                                </select>
                            </div>
                        </div>

                        {/* Location */}
                        <div>
                            <div className="relative">
                                <MapPin size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                                <input
                                    type="text"
                                    placeholder="Add Location"
                                    className="w-full bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-600 rounded-lg py-2 pl-10 pr-4 text-sm font-medium dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500/50"
                                    value={location}
                                    onChange={e => setLocation(e.target.value)}
                                />
                            </div>
                        </div>

                        {/* Description */}
                        <div>
                            <div className="relative">
                                <AlignLeft size={16} className="absolute left-3 top-3 text-gray-400" />
                                <textarea
                                    placeholder="Add Description"
                                    className="w-full bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-600 rounded-lg py-2 pl-10 pr-4 text-sm font-medium dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500/50 min-h-[80px]"
                                    value={description}
                                    onChange={e => setDescription(e.target.value)}
                                />
                            </div>
                        </div>
                    </div>


                    {/* Action Buttons */}
                    <div className="pt-2 flex gap-3">
                        {currentEvent && (
                            <button
                                type="button"
                                onClick={() => onDelete(currentEvent.id)}
                                className="px-5 py-3 bg-red-50 text-red-500 hover:bg-red-100 rounded-xl font-bold transition-colors text-sm"
                            >
                                Delete
                            </button>
                        )}
                        <button
                            type="submit"
                            className="flex-1 bg-charcoal dark:bg-white text-white dark:text-charcoal rounded-xl py-3 font-bold hover:bg-gray-800 dark:hover:bg-gray-200 transition-transform active:scale-[0.98] shadow-lg shadow-gray-200 dark:shadow-none"
                        >
                            {currentEvent ? 'Save Changes' : 'Save Event'}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}
