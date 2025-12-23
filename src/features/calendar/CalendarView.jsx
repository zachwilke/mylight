import React, { useState } from 'react';
import { format, addMonths, subMonths, startOfWeek, endOfWeek, eachDayOfInterval, startOfMonth, endOfMonth, isSameMonth, isSameDay, addDays } from 'date-fns';
import { ChevronLeft, ChevronRight, Plus } from 'lucide-react';
import { cn } from '../../lib/utils';
import { MonthGrid } from './components/MonthGrid';
import { EventModal } from './components/EventModal';

export function CalendarView() {
    const [currentDate, setCurrentDate] = useState(new Date());
    const [view, setView] = useState('month'); // 'month' | 'week' | 'day'
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [refreshTrigger, setRefreshTrigger] = useState(0);

    const [currentEvent, setCurrentEvent] = useState(null);

    const nextPeriod = () => {
        if (view === 'month') setCurrentDate(addMonths(currentDate, 1));
        else if (view === 'week') setCurrentDate(addDays(currentDate, 7));
        else setCurrentDate(addDays(currentDate, 1));
    };

    const prevPeriod = () => {
        if (view === 'month') setCurrentDate(subMonths(currentDate, 1));
        else if (view === 'week') setCurrentDate(addDays(currentDate, -7));
        else setCurrentDate(addDays(currentDate, -1));
    };

    const today = () => setCurrentDate(new Date());

    const handleSaveEvent = async (eventData) => {
        try {
            await fetch('/api/events', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(eventData)
            });
            setCurrentEvent(null);
            setRefreshTrigger(prev => prev + 1);
        } catch (err) {
            console.error(err);
        }
    };

    const handleDeleteEvent = async (id) => {
        if (!confirm("Delete this event?")) return;
        try {
            await fetch(`/api/events/${id}`, { method: 'DELETE' });
            setCurrentEvent(null);
            setIsModalOpen(false);
            setRefreshTrigger(prev => prev + 1);
        } catch (err) {
            console.error(err);
        }
    };

    return (
        <div className="flex flex-col h-full bg-white relative">
            <EventModal
                isOpen={isModalOpen}
                onClose={() => { setIsModalOpen(false); setCurrentEvent(null); }}
                onSave={handleSaveEvent}
                currentEvent={currentEvent}
                onDelete={handleDeleteEvent}
            />

            {/* Calendar Header / Toolbar */}
            <div className="flex flex-col md:flex-row items-center justify-between px-4 md:px-6 py-4 border-b border-gray-100 shrink-0 gap-4 md:gap-0">
                <div className="flex items-center justify-between w-full md:w-auto gap-4">
                    <h2 className="text-xl md:text-2xl font-bold text-gray-800 tracking-tight min-w-[150px] md:min-w-[200px]">
                        {format(currentDate, 'MMMM yyyy')}
                    </h2>
                    <div className="flex items-center bg-gray-100 rounded-xl p-1">
                        <button onClick={prevPeriod} className="p-1.5 md:p-2 hover:bg-white rounded-lg transition-all text-gray-600">
                            <ChevronLeft size={20} />
                        </button>
                        <button onClick={today} className="px-3 py-1 text-xs md:text-sm font-semibold text-gray-600 hover:text-gray-900">
                            Today
                        </button>
                        <button onClick={nextPeriod} className="p-1.5 md:p-2 hover:bg-white rounded-lg transition-all text-gray-600">
                            <ChevronRight size={20} />
                        </button>
                    </div>
                </div>

                <div className="flex items-center gap-3 w-full md:w-auto justify-between md:justify-end">
                    {/* View Toggles */}
                    <div className="flex bg-gray-100 p-1 rounded-xl flex-1 md:flex-none justify-center">
                        {['month', 'week', 'day'].map((v) => (
                            <button
                                key={v}
                                onClick={() => setView(v)}
                                className={cn(
                                    "px-3 md:px-4 py-1.5 md:py-2 capitalize text-xs md:text-sm font-medium rounded-lg transition-all flex-1 md:flex-none text-center",
                                    view === v ? "bg-white shadow-sm text-gray-900" : "text-gray-500 hover:text-gray-800"
                                )}
                            >
                                {v}
                            </button>
                        ))}
                    </div>

                    <button
                        onClick={() => setIsModalOpen(true)}
                        className="flex items-center gap-2 bg-charcoal text-white px-4 md:px-5 py-2 md:py-2.5 rounded-xl hover:bg-gray-800 transition-colors shadow-lg shadow-gray-200 whitespace-nowrap"
                    >
                        <Plus size={18} />
                        <span className="font-medium text-sm hidden md:inline">New Event</span>
                        <span className="font-medium text-sm md:hidden">New</span>
                    </button>
                </div>
            </div>

            {/* Calendar Grid Content */}
            <div className="flex-1 overflow-hidden">
                {view === 'month' && (
                    <MonthGrid
                        currentDate={currentDate}
                        key={refreshTrigger}
                        onEventClick={(evt) => {
                            setCurrentEvent(evt);
                            setIsModalOpen(true);
                        }}
                    />
                )}
                {view === 'week' && <div className="p-10 text-center text-gray-400">Week View Placeholder</div>}
                {view === 'day' && <div className="p-10 text-center text-gray-400">Day View Placeholder</div>}
            </div>
        </div>
    );
}
