import React, { useState, useEffect } from 'react';
import { Check, Star, Settings, Trash2, Plus } from 'lucide-react';
import { cn } from '../../lib/utils';
// import { motion, AnimatePresence } from 'framer-motion';
import { UserAvatar } from '../../components/UserAvatar';
import { ChoreModal } from './components/ChoreModal';

export function ChoreChart() {
    const [chores, setChores] = useState({});
    const [members, setMembers] = useState([]);
    const [stars, setStars] = useState({ Max: 15, Mia: 22 });
    const [loading, setLoading] = useState(true);
    const [isModalOpen, setIsModalOpen] = useState(false);

    const fetchData = async () => {
        try {
            const [choresRes, familyRes] = await Promise.all([
                fetch('http://localhost:3000/api/chores'),
                fetch('http://localhost:3000/api/family')
            ]);
            const choresData = await choresRes.json();
            const familyData = await familyRes.json();

            setChores(choresData);
            setMembers(familyData);
            setLoading(false);
        } catch (err) {
            console.error("Failed to fetch data", err);
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
            await fetch(`http://localhost:3000/api/chores/${choreId}/toggle`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ completed: !currentStatus })
            });
        } catch (err) {
            console.error("Failed to update chore", err);
        }
    };

    const handleAddChore = async (choreData) => {
        await fetch('http://localhost:3000/api/chores', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(choreData)
        });
        fetchData();
    };

    const handleDeleteChore = async (e, choreId) => {
        e.stopPropagation(); // Prevent toggling
        if (!confirm('Delete this chore?')) return;

        try {
            await fetch(`http://localhost:3000/api/chores/${choreId}`, {
                method: 'DELETE'
            });
            fetchData();
        } catch (err) {
            console.error("Failed to delete", err);
        }
    };

    if (loading) return <div className="p-8 text-center text-gray-400">Loading chores...</div>;

    return (
        <div className="flex h-full bg-white p-6">
            {Object.entries(chores).map(([name, personChores]) => {
                const member = getMemberByName(name);
                return (
                    <div key={name} className="flex-1 px-4 border-r last:border-0 border-gray-100 flex flex-col">
                        {/* Header */}
                        <div className="text-center mb-6 flex flex-col items-center">
                            <div className="mb-3">
                                <UserAvatar member={member} size="xl" />
                            </div>
                            <h3 className="text-2xl font-bold text-gray-800 mb-1">{name}</h3>
                            <div className="inline-flex items-center gap-1.5 bg-yellow-50 px-3 py-1 rounded-full border border-yellow-100">
                                <Star size={14} className="fill-yellow-400 text-yellow-400" />
                                <span className="text-sm font-bold text-yellow-700">{stars[name] || 0} Stars</span>
                            </div>
                        </div>

                        {/* Chores List */}
                        <div className="space-y-6">
                            {['Morning', 'Evening'].map((time) => (
                                <div key={time}>
                                    <h4 className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-3">{time}</h4>
                                    <div className="space-y-3">
                                        {personChores.filter(c => c.time_of_day === time).map(chore => (
                                            <div key={chore.id} className="relative group">
                                                <button
                                                    onClick={() => toggleChore(name, chore.id, chore.completed)}
                                                    className={cn(
                                                        "w-full text-left p-4 rounded-2xl border-2 transition-all duration-200 flex items-center justify-between group/btn",
                                                        chore.completed
                                                            ? "bg-gray-50 border-gray-100 opacity-60"
                                                            : "bg-white border-gray-100 hover:border-primary/50 hover:shadow-sm"
                                                    )}
                                                >
                                                    <span className={cn(
                                                        "font-medium text-lg",
                                                        chore.completed ? "text-gray-400 line-through" : "text-gray-700"
                                                    )}>
                                                        {chore.title}
                                                    </span>

                                                    <div className={cn(
                                                        "w-8 h-8 rounded-full border-2 flex items-center justify-center transition-colors",
                                                        chore.completed
                                                            ? "bg-green-400 border-green-400 text-white"
                                                            : "border-gray-200 group-hover/btn:border-primary/50"
                                                    )}>
                                                        {chore.completed && <Check size={18} strokeWidth={4} />}
                                                    </div>
                                                </button>

                                                {/* Delete Button (Visible on Hover) */}
                                                <div className="absolute -right-2 -top-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                                    <button
                                                        onClick={(e) => handleDeleteChore(e, chore.id)}
                                                        className="bg-white text-red-400 border border-red-100 p-1.5 rounded-full shadow-sm hover:bg-red-50 hover:text-red-600 transition-colors"
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

            {/* Add Chore / Edit Button */}
            <button
                onClick={() => setIsModalOpen(true)}
                className="w-24 group flex flex-col items-center justify-center border-l border-gray-100 bg-gray-50/50 hover:bg-white hover:border-l-primary/20 transition-all cursor-pointer relative overflow-hidden"
            >
                <div className="absolute inset-x-0 bottom-0 h-1 bg-primary scale-x-0 group-hover:scale-x-100 transition-transform origin-left"></div>
                <div className="text-center text-gray-400 group-hover:text-primary transition-colors">
                    <div className="w-10 h-10 rounded-full bg-white border-2 border-dashed border-gray-300 group-hover:border-primary group-hover:bg-primary/5 mb-2 flex items-center justify-center transition-colors">
                        <Plus className="opacity-50 group-hover:opacity-100" />
                    </div>
                    <span className="text-xs font-bold">Add Chore</span>
                </div>
            </button>

            <ChoreModal
                isOpen={isModalOpen}
                onClose={() => setIsModalOpen(false)}
                members={members}
                onSave={handleAddChore}
            />
        </div>
    );
}
