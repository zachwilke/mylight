import React, { useState, useEffect } from 'react';
import { Star, Check, Plus, Trash2, X } from 'lucide-react';
import { cn } from '../../lib/utils';
import { UserAvatar } from '../../components/UserAvatar';
import { ConfirmDialog } from '../../components/ConfirmDialog';

export function ChoreChart() {
    const [chores, setChores] = useState({});
    const [members, setMembers] = useState([]);
    const [stars, setStars] = useState({ Max: 15, Mia: 22 });
    const [loading, setLoading] = useState(true);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
    const [pendingDeleteId, setPendingDeleteId] = useState(null);

    const fetchData = async () => {
        try {
            const [choresRes, familyRes] = await Promise.all([
                fetch('/api/chores'),
                fetch('/api/family')
            ]);
            const choresData = await choresRes.json();
            const familyData = await familyRes.json();

            setChores(choresData);
            setMembers(familyData);
        } catch (err) {
            console.error("Failed to fetch data", err);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchData();
    }, []);

    // Helper to get member by name (since chores are keyed by name currently)
    const getMemberByName = (name) => members.find(m => m.name === name);

    const toggleChore = async (person, choreId, currentStatus) => {
        // Optimistic UI Update
        setChores(prev => {
            const personChores = prev[person].map(chore => {
                if (chore.id === choreId) {
                    const newStatus = !currentStatus;
                    // Optimistic update for stars can remain if we track stars in DB later, keeping it local for now or simple
                    return { ...chore, completed: newStatus };
                }
                return chore;
            });
            return { ...prev, [person]: personChores };
        });

        try {
            await fetch(`/api/chores/${choreId}/toggle`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ completed: !currentStatus })
            });
        } catch (err) {
            console.error("Failed to update chore", err);
        }
    };

    const handleAddChore = async (choreData) => {
        await fetch('/api/chores', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(choreData)
        });
        fetchData();
    };

    const confirmDeleteChore = async () => {
        if (!pendingDeleteId) return;
        try {
            await fetch(`/api/chores/${pendingDeleteId}`, {
                method: 'DELETE'
            });
            fetchData();
            setPendingDeleteId(null);
            setShowDeleteConfirm(false);
        } catch (err) {
            console.error("Failed to delete", err);
        }
    };

    const handleDeleteChore = (e, choreId) => {
        e.stopPropagation(); // Prevent toggling
        setPendingDeleteId(choreId);
        setShowDeleteConfirm(true);
    };

    if (loading) return <div className="p-8 text-center text-gray-400">Loading chores...</div>;

    return (
        <div className="h-full overflow-hidden flex flex-col">
            <ConfirmDialog
                isOpen={showDeleteConfirm}
                onClose={() => setShowDeleteConfirm(false)}
                onConfirm={confirmDeleteChore}
                title="Delete Chore"
                message="Are you sure you want to delete this chore?"
            />
            {/* Header / Toolbar */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 dark:border-gray-700 shrink-0">
                <h2 className="text-2xl font-bold text-gray-800 dark:text-gray-100 tracking-tight">Chore Chart</h2>
                <button
                    onClick={() => setIsModalOpen(true)}
                    className="flex items-center gap-2 bg-charcoal dark:bg-gray-100 text-white dark:text-charcoal px-5 py-2.5 rounded-xl hover:bg-gray-800 dark:hover:bg-white transition-colors shadow-lg shadow-gray-200 dark:shadow-none"
                >
                    <Plus size={18} />
                    <span className="font-medium text-sm">Add Chore</span>
                </button>
            </div>

            <div className="flex-1 flex flex-col md:flex-row overflow-y-auto md:overflow-y-hidden md:overflow-x-auto bg-white dark:bg-gray-800 snap-x md:snap-none">
                {Object.entries(chores).map(([name, personChores]) => {
                    const member = getMemberByName(name);
                    return (
                        <div
                            key={name}
                            className="w-full md:w-[300px] md:min-w-[300px] lg:flex-1 p-6 md:px-4 border-b md:border-b-0 md:border-r last:border-0 border-gray-100 dark:border-gray-700 flex flex-col md:overflow-y-auto shrink-0 snap-center"
                        >
                            {/* Header */}
                            <div className="text-center mb-6 flex flex-col items-center shrink-0">
                                <div className="mb-3">
                                    <UserAvatar member={member} size="xl" />
                                </div>
                                <h3 className="text-2xl font-bold text-gray-800 dark:text-gray-100 mb-1">{name}</h3>
                                <div className="inline-flex items-center gap-1.5 bg-yellow-50 dark:bg-yellow-900/20 px-3 py-1 rounded-full border border-yellow-100 dark:border-yellow-700/30">
                                    <Star size={14} className="fill-yellow-400 text-yellow-400" />
                                    <span className="text-sm font-bold text-yellow-700 dark:text-yellow-400">{stars[name] || 0} Stars</span>
                                </div>
                            </div>

                            {/* Chores List */}
                            <div className="space-y-6 flex-1">
                                {['Morning', 'Evening'].map((time) => (
                                    <div key={time}>
                                        <h4 className="text-xs font-bold text-gray-400 dark:text-gray-500 uppercase tracking-widest mb-3 sticky top-0 bg-white dark:bg-gray-800 z-10 py-1">{time}</h4>
                                        <div className="space-y-3">
                                            {personChores.filter(c => c.time_of_day === time).map(chore => (
                                                <div key={chore.id} className="relative group">
                                                    <button
                                                        onClick={() => toggleChore(name, chore.id, chore.completed)}
                                                        className={cn(
                                                            "w-full text-left p-4 rounded-2xl border-2 transition-all duration-200 flex items-center justify-between group/btn",
                                                            chore.completed
                                                                ? "bg-gray-50 dark:bg-gray-900 border-gray-100 dark:border-gray-800 opacity-60"
                                                                : "bg-white dark:bg-gray-800 border-gray-100 dark:border-gray-700 hover:border-primary/50 hover:shadow-sm"
                                                        )}
                                                    >
                                                        <span className={cn(
                                                            "font-medium text-lg line-clamp-2",
                                                            chore.completed ? "text-gray-400 line-through" : "text-gray-700"
                                                        )}>
                                                            {chore.title}
                                                        </span>

                                                        <div className={cn(
                                                            "w-8 h-8 rounded-full border-2 flex items-center justify-center transition-colors shrink-0 ml-2",
                                                            chore.completed
                                                                ? "bg-green-400 border-green-400 text-white"
                                                                : "border-gray-200 dark:border-gray-600 group-hover/btn:border-primary/50"
                                                        )}>
                                                            {chore.completed && <Check size={18} strokeWidth={4} />}
                                                        </div>
                                                    </button>

                                                    {/* Delete Button (Visible on Hover) */}
                                                    <div className="absolute -right-2 -top-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                                        <button
                                                            onClick={(e) => handleDeleteChore(e, chore.id)}
                                                            className="bg-white dark:bg-gray-700 text-red-400 border border-red-100 dark:border-red-900/50 p-1.5 rounded-full shadow-sm hover:bg-red-50 dark:hover:bg-red-900/20 hover:text-red-600 transition-colors"
                                                            title="Delete Chore"
                                                        >
                                                            <Trash2 size={14} />
                                                        </button>
                                                    </div>
                                                </div>
                                            ))}
                                            {personChores.filter(c => c.time_of_day === time).length === 0 && (
                                                <p className="text-sm text-gray-300 italic pl-1">No {time.toLowerCase()} chores</p>
                                            )}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    );
                })}
            </div>

            <ChoreModal
                isOpen={isModalOpen}
                onClose={() => setIsModalOpen(false)}
                members={members}
                onSave={handleAddChore}
            />
        </div>
    );
}

function ChoreModal({ isOpen, onClose, members, onSave }) {
    const [title, setTitle] = useState('');
    const [timeOfDay, setTimeOfDay] = useState('Morning');
    const [selectedMember, setSelectedMember] = useState(members[0]?.id);

    // Reset when opening
    useEffect(() => {
        if (isOpen && members.length > 0) {
            setTitle('');
            setTimeOfDay('Morning');
            if (members.length > 0) setSelectedMember(members[0].id);
        }
    }, [isOpen, members]);

    if (!isOpen) return null;

    const handleSubmit = (e) => {
        e.preventDefault();
        onSave({ title, time_of_day: timeOfDay, member_id: selectedMember });
        onClose();
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/20 dark:bg-black/50 backdrop-blur-sm">
            <div className="bg-white dark:bg-gray-800 rounded-3xl shadow-xl w-full max-w-sm overflow-hidden animate-in fade-in zoom-in-95 duration-200">
                <div className="p-6 border-b border-gray-100 dark:border-gray-700 flex items-center justify-between bg-gray-50/50 dark:bg-gray-900/50">
                    <h3 className="text-xl font-bold text-gray-800 dark:text-gray-100">Add New Chore</h3>
                    <button onClick={onClose} className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-full transition-colors text-gray-500">
                        <X size={20} />
                    </button>
                </div>

                <form onSubmit={handleSubmit} className="p-6 space-y-4">
                    <div>
                        <label className="block text-sm font-bold text-gray-700 dark:text-gray-300 mb-2">Chore Name</label>
                        <input
                            type="text"
                            value={title}
                            onChange={(e) => setTitle(e.target.value)}
                            className="w-full px-4 py-3 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-primary/50"
                            placeholder="e.g. Empty Dishwasher"
                            autoFocus
                        />
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="block text-sm font-bold text-gray-700 dark:text-gray-300 mb-2">Time</label>
                            <select
                                value={timeOfDay}
                                onChange={(e) => setTimeOfDay(e.target.value)}
                                className="w-full px-4 py-3 rounded-xl border border-gray-200 dark:border-gray-700 focus:outline-none focus:ring-2 focus:ring-primary/50 appearance-none bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100"
                            >
                                <option value="Morning" className="dark:bg-gray-800">Morning</option>
                                <option value="Evening" className="dark:bg-gray-800">Evening</option>
                            </select>
                        </div>
                        <div>
                            <label className="block text-sm font-bold text-gray-700 dark:text-gray-300 mb-2">Assign To</label>
                            <select
                                value={selectedMember}
                                onChange={(e) => setSelectedMember(Number(e.target.value))}
                                className="w-full px-4 py-3 rounded-xl border border-gray-200 dark:border-gray-700 focus:outline-none focus:ring-2 focus:ring-primary/50 appearance-none bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100"
                            >
                                {members.map(m => (
                                    <option key={m.id} value={m.id} className="dark:bg-gray-800">{m.name}</option>
                                ))}
                            </select>
                        </div>
                    </div>

                    <div className="pt-4">
                        <button
                            type="submit"
                            disabled={!title}
                            className="w-full py-3.5 bg-primary text-white rounded-xl font-bold shadow-lg shadow-primary/20 hover:bg-primary/90 hover:scale-[1.02] transition-all disabled:opacity-50 disabled:hover:scale-100"
                        >
                            Add Chore
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}
