import React, { useState } from 'react';
import { X, Plus, Clock, User } from 'lucide-react';
import { cn } from '../../../lib/utils';

export function ChoreModal({ isOpen, onClose, members, onSave }) {
    const [title, setTitle] = useState('');
    const [memberId, setMemberId] = useState(members.length > 0 ? members[0].id : '');
    const [timeOfDay, setTimeOfDay] = useState('Morning');
    const [loading, setLoading] = useState(false);

    if (!isOpen) return null;

    const handleSubmit = async (e) => {
        e.preventDefault();
        setLoading(true);
        try {
            await onSave({ title, member_id: memberId, time_of_day: timeOfDay });
            setTitle('');
            onClose();
        } catch (error) {
            console.error(error);
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/20 backdrop-blur-sm">
            <div className="bg-white rounded-3xl shadow-xl w-full max-w-md overflow-hidden animate-in fade-in zoom-in-95 duration-200">
                <div className="p-6 border-b border-gray-100 flex items-center justify-between bg-gray-50/50">
                    <h3 className="text-xl font-bold text-gray-800">Add New Chore</h3>
                    <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded-full transition-colors text-gray-500">
                        <X size={20} />
                    </button>
                </div>

                <form onSubmit={handleSubmit} className="p-6 space-y-6">
                    <div>
                        <label className="block text-sm font-bold text-gray-700 mb-2">Chore Description</label>
                        <input
                            type="text"
                            value={title}
                            onChange={(e) => setTitle(e.target.value)}
                            placeholder="e.g. Make Bed"
                            className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-primary/50"
                            autoFocus
                            required
                        />
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="block text-sm font-bold text-gray-700 mb-2 flex items-center gap-2">
                                <User size={14} className="text-gray-400" />
                                Assign To
                            </label>
                            <select
                                value={memberId}
                                onChange={(e) => setMemberId(Number(e.target.value))}
                                className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-primary/50 bg-white"
                            >
                                {members.map(m => (
                                    <option key={m.id} value={m.id}>{m.name}</option>
                                ))}
                            </select>
                        </div>

                        <div>
                            <label className="block text-sm font-bold text-gray-700 mb-2 flex items-center gap-2">
                                <Clock size={14} className="text-gray-400" />
                                Time
                            </label>
                            <select
                                value={timeOfDay}
                                onChange={(e) => setTimeOfDay(e.target.value)}
                                className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-primary/50 bg-white"
                            >
                                <option value="Morning">Morning</option>
                                <option value="Evening">Evening</option>
                            </select>
                        </div>
                    </div>

                    <div className="pt-2">
                        <button
                            type="submit"
                            disabled={loading || !title || !memberId}
                            className={cn(
                                "w-full py-4 rounded-xl font-bold text-white flex items-center justify-center gap-2 transition-all",
                                loading ? "bg-gray-400" : "bg-primary hover:bg-primary/90 shadow-lg shadow-primary/20 hover:shadow-xl hover:-translate-y-0.5"
                            )}
                        >
                            <Plus size={20} />
                            {loading ? 'Adding...' : 'Add Chore'}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}
