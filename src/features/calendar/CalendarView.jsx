import React, { useState } from 'react';
import { format, addMonths, subMonths, startOfWeek, endOfWeek, eachDayOfInterval, startOfMonth, endOfMonth, isSameMonth, isSameDay, addDays } from 'date-fns';
import { ChevronLeft, ChevronRight, Plus } from 'lucide-react';
import { cn } from '../../lib/utils';
import { MonthGrid } from './components/MonthGrid';
import { ConfirmDialog } from '../../components/ConfirmDialog';
import { EventModal } from './components/EventModal';

export function CalendarView({ kiosk = false }) {
    const [currentDate, setCurrentDate] = useState(new Date());
    const [view, setView] = useState('month'); // 'month' | 'week' | 'day'
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [refreshTrigger, setRefreshTrigger] = useState(0);

    const [currentEvent, setCurrentEvent] = useState(null);
    const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
    const [pendingDeleteId, setPendingDeleteId] = useState(null);

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
            const isEdit = !!currentEvent;
            const url = isEdit ? `/api/events/${currentEvent.id}` : '/api/events';
            const method = isEdit ? 'PUT' : 'POST';

            await fetch(url, {
                method,
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(eventData)
            });

            setIsModalOpen(false);
            setCurrentEvent(null);
            setRefreshTrigger(prev => prev + 1);
        } catch (err) {
            console.error(err);
        }
    };

    const confirmDelete = async () => {
        if (!pendingDeleteId) return;
        try {
            await fetch(`/api/events/${pendingDeleteId}`, { method: 'DELETE' });
            setCurrentEvent(null);
            setIsModalOpen(false);
            setRefreshTrigger(prev => prev + 1);
            setPendingDeleteId(null);
            setShowDeleteConfirm(false);
        } catch (err) {
            console.error(err);
        }
    };

    const handleDeleteEvent = (id) => {
        setPendingDeleteId(id);
        setShowDeleteConfirm(true);
    };

    return (
        <div className="flex flex-col h-full bg-white dark:bg-gray-800 relative">
            <ConfirmDialog
                isOpen={showDeleteConfirm}
                onClose={() => setShowDeleteConfirm(false)}
                onConfirm={confirmDelete}
                title="Delete Event"
                message="Are you sure you want to delete this event? This action cannot be undone."
            />
            <EventModal
                isOpen={isModalOpen}
                onClose={() => { setIsModalOpen(false); setCurrentEvent(null); }}
                onSave={handleSaveEvent}
                currentEvent={currentEvent}
                onDelete={handleDeleteEvent}
            />

            {/* Calendar Header / Toolbar */}
            {!kiosk && (
                <div className="flex flex-col md:flex-row items-center justify-between px-4 md:px-6 py-4 border-b border-gray-100 dark:border-gray-700 shrink-0 gap-4 md:gap-0">
                    <div className="flex items-center justify-between w-full md:w-auto gap-4">
                        <h2 className="text-xl md:text-2xl font-bold text-gray-800 dark:text-gray-100 tracking-tight min-w-[150px] md:min-w-[200px]">
                            {format(currentDate, 'MMMM yyyy')}
                        </h2>
                        <div className="flex items-center bg-gray-100 dark:bg-gray-700 rounded-xl p-1">
                            <button onClick={prevPeriod} className="p-1.5 md:p-2 hover:bg-white dark:hover:bg-gray-600 rounded-lg transition-all text-gray-600 dark:text-gray-300">
                                <ChevronLeft size={20} />
                            </button>
                            <button onClick={today} className="px-3 py-1 text-xs md:text-sm font-semibold text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white">
                                Today
                            </button>
                            <button onClick={nextPeriod} className="p-1.5 md:p-2 hover:bg-white dark:hover:bg-gray-600 rounded-lg transition-all text-gray-600 dark:text-gray-300">
                                <ChevronRight size={20} />
                            </button>
                        </div>
                    </div>

                    <div className="flex items-center gap-3 w-full md:w-auto justify-between md:justify-end">
                        {/* View Toggles */}
                        <div className="flex bg-gray-100 dark:bg-gray-700 p-1 rounded-xl flex-1 md:flex-none justify-center">
                            {['month', 'week', 'day'].map((v) => (
                                <button
                                    key={v}
                                    onClick={() => setView(v)}
                                    className={cn(
                                        "px-3 md:px-4 py-1.5 md:py-2 capitalize text-xs md:text-sm font-medium rounded-lg transition-all flex-1 md:flex-none text-center",
                                        view === v ? "bg-white dark:bg-gray-600 shadow-sm text-gray-900 dark:text-white" : "text-gray-500 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200"
                                    )}
                                >
                                    {v}
                                </button>
                            ))}
                        </div>

                        <button
                            onClick={() => setIsModalOpen(true)}
                            className="flex items-center gap-2 bg-charcoal dark:bg-gray-100 text-white dark:text-charcoal px-4 md:px-5 py-2 md:py-2.5 rounded-xl hover:bg-gray-800 dark:hover:bg-white transition-colors shadow-lg shadow-gray-200 dark:shadow-none whitespace-nowrap"
                        >
                            <Plus size={18} />
                            <span className="font-medium text-sm hidden md:inline">New Event</span>
                            <span className="font-medium text-sm md:hidden">New</span>
                        </button>
                    </div>
                </div>
            )}

            {kiosk && (
                <div className="p-6 pb-2 shrink-0 flex items-center justify-between">
                    <h2 className="text-xl font-bold text-gray-800 dark:text-gray-100 tracking-tight">
                        {format(currentDate, 'MMMM yyyy')}
                    </h2>
                </div>
            )}

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
