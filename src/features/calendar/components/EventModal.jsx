import React, { useState, useEffect } from 'react';
import { X, Calendar as CalendarIcon, Clock, User } from 'lucide-react';
import { cn } from '../../../lib/utils';
import { format } from 'date-fns';

export function EventModal({ isOpen, onClose, onSave, currentEvent, onDelete }) {
    const [title, setTitle] = useState('');
    const [date, setDate] = useState(format(new Date(), 'yyyy-MM-dd'));
    const [time, setTime] = useState('12:00');
    const [memberId, setMemberId] = useState('');
    const [members, setMembers] = useState([]);

    useEffect(() => {
        if (isOpen) {
            if (currentEvent) {
                setTitle(currentEvent.title);
                const evtDate = new Date(currentEvent.date);
                setDate(format(evtDate, 'yyyy-MM-dd'));
                setTime(format(evtDate, 'HH:mm'));
                setMemberId(currentEvent.member_id);
            } else {
                setTitle('');
                setDate(format(new Date(), 'yyyy-MM-dd'));
                setTime('12:00');
                if (members.length > 0) setMemberId(members[0].id);
            }

            fetch('/api/family')
                .then(res => res.json())
                .then(data => {
                    setMembers(data);
                    if (!currentEvent && data.length > 0 && !memberId) setMemberId(data[0].id);
                });
        }
    }, [isOpen, currentEvent]);

    const handleSubmit = (e) => {
        e.preventDefault();
        const fullDate = time ? new Date(`${date}T${time}`) : new Date(date);
        onSave({ title, date: fullDate.toISOString(), member_id: Number(memberId) });
        onClose();
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/20 backdrop-blur-sm p-4">
            <div className="bg-white rounded-3xl shadow-xl w-full max-w-md overflow-hidden animate-in fade-in zoom-in-95 duration-200">
                <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
                    <h3 className="text-xl font-bold text-gray-800">{currentEvent ? 'Edit Event' : 'New Event'}</h3>
                    <button onClick={onClose} className="p-2 text-gray-400 hover:text-gray-600 rounded-full hover:bg-gray-50 transition-colors">
                        <X size={20} />
                    </button>
                </div>

                <form onSubmit={handleSubmit} className="p-6 space-y-6">
                    {/* ... (inputs same as before) ... */}
                    <div className="space-y-4">
                        <div>
                            <label className="block text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">Event Title</label>
                            <input
                                type="text"
                                placeholder="e.g. Soccer Practice"
                                className="w-full text-lg font-medium border-b-2 border-gray-100 py-2 focus:border-sky-blue focus:outline-none bg-transparent placeholder:text-gray-300 transition-colors"
                                value={title}
                                onChange={e => setTitle(e.target.value)}
                                autoFocus
                                required
                            />
                        </div>

                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <label className="block text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">Date</label>
                                <div className="relative">
                                    <CalendarIcon size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                                    <input
                                        type="date"
                                        className="w-full bg-gray-50 border border-gray-200 rounded-xl py-2.5 pl-10 pr-4 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-sky-blue/50"
                                        value={date}
                                        onChange={e => setDate(e.target.value)}
                                        required
                                    />
                                </div>
                            </div>
                            <div>
                                <label className="block text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">Time</label>
                                <div className="relative">
                                    <Clock size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                                    <input
                                        type="time"
                                        className="w-full bg-gray-50 border border-gray-200 rounded-xl py-2.5 pl-10 pr-4 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-sky-blue/50"
                                        value={time}
                                        onChange={e => setTime(e.target.value)}
                                    />
                                </div>
                            </div>
                        </div>

                        <div>
                            <label className="block text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">Assign To</label>
                            <div className="relative">
                                <User size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                                <select
                                    className="w-full bg-gray-50 border border-gray-200 rounded-xl py-2.5 pl-10 pr-4 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-sky-blue/50 appearance-none"
                                    value={memberId}
                                    onChange={e => setMemberId(e.target.value)}
                                >
                                    {members.map(m => (
                                        <option key={m.id} value={m.id}>{m.name}</option>
                                    ))}
                                </select>
                            </div>
                        </div>
                    </div>

                    <div className="pt-2 flex gap-3">
                        {currentEvent && (
                            <button
                                type="button"
                                onClick={() => onDelete(currentEvent.id)}
                                className="px-5 py-3.5 bg-red-50 text-red-500 hover:bg-red-100 rounded-xl font-bold transition-colors"
                            >
                                Delete
                            </button>
                        )}
                        <button
                            type="submit"
                            className="flex-1 bg-charcoal text-white rounded-xl py-3.5 font-bold hover:bg-gray-800 transition-transform active:scale-[0.98] shadow-lg shadow-gray-200"
                        >
                            {currentEvent ? 'Save Changes' : 'Create Event'}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}
