import { useState, useEffect } from 'react';
import { Star, Check, Plus, Trash2, X, Sparkles, Lock, Unlock } from 'lucide-react';
import confetti from 'canvas-confetti';
import { cn } from '../../lib/utils';
import { UserAvatar } from '../../components/UserAvatar';
import { ConfirmDialog } from '../../components/ConfirmDialog';

import { Chore, FamilyMember } from '@/types';

interface Celebration {
    x: number;
    y: number;
    id: number;
}

export function ChoreChart({ kiosk = false }: { kiosk?: boolean }) {
    const [chores, setChores] = useState<Record<string, Chore[]>>({});
    const [members, setMembers] = useState<FamilyMember[]>([]);
    const [stars, setStars] = useState<Record<string, number>>({});
    const [loading, setLoading] = useState(true);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
    const [pendingDeleteId, setPendingDeleteId] = useState<number | null>(null);
    const [celebration, setCelebration] = useState<Celebration | null>(null); // { x, y, id }

    const [showMajorCelebration, setShowMajorCelebration] = useState(false);

    const [isEditMode, setIsEditMode] = useState(false);
    const [editCode, setEditCode] = useState<string | null>(null); // The correct code from settings
    const [showUnlockModal, setShowUnlockModal] = useState(false);
    const [unlockInput, setUnlockInput] = useState('');

    const fetchData = async () => {
        try {
            const [choresRes, familyRes, settingsRes] = await Promise.all([
                fetch('/api/chores'),
                fetch('/api/family'),
                fetch('/api/settings')
            ]);
            const choresData: Record<string, Chore[]> = await choresRes.json();
            const familyData: FamilyMember[] = await familyRes.json();
            const settingsData: Record<string, string> = await settingsRes.json();

            setEditCode(settingsData.edit_code || null);

            setChores(choresData);
            setMembers(familyData);

            // Use stars from member data
            const initialStars: Record<string, number> = {};
            familyData.forEach(m => {
                initialStars[m.name] = m.stars || 0;
            });
            setStars(initialStars);

        } catch (err) {
            console.error("Failed to fetch data", err);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchData();

        window.addEventListener('system-update', fetchData);
        return () => window.removeEventListener('system-update', fetchData);
    }, []);

    // Helper to get member by name
    const getMemberByName = (name: string) => members.find(m => m.name === name);

    const triggerCelebration = (x: number, y: number) => {
        const id = Date.now();
        setCelebration({ x, y, id });

        // Fire confetti from the click position
        const normalizedX = x / window.innerWidth;
        const normalizedY = y / window.innerHeight;

        confetti({
            particleCount: 100,
            spread: 70,
            origin: { x: normalizedX, y: normalizedY },
            zIndex: 100 // Ensure it's above other elements
        });

        setTimeout(() => setCelebration(null), 1000);
    };

    const triggerMajorCelebration = () => {
        setShowMajorCelebration(true);
        const duration = 3000;
        const end = Date.now() + duration;

        // Fireworks effect
        (function frame() {
            confetti({
                particleCount: 5,
                angle: 60,
                spread: 55,
                origin: { x: 0 },
                colors: ['#ff0000', '#00ff00', '#0000ff']
            });
            confetti({
                particleCount: 5,
                angle: 120,
                spread: 55,
                origin: { x: 1 },
                colors: ['#ff0000', '#00ff00', '#0000ff']
            });

            if (Date.now() < end) {
                requestAnimationFrame(frame);
            } else {
                setShowMajorCelebration(false);
            }
        }());
    };

    const toggleChore = async (person: string, choreId: number, currentStatus: boolean, event: React.MouseEvent) => {
        if (isEditMode) return; // Disable toggling in edit mode to prevent accidental checks while managing
        const newStatus = !currentStatus;

        // Optimistic UI Update
        setChores(prev => {
            const personChores = prev[person]?.map(chore => {
                if (chore.id === choreId) {
                    return { ...chore, completed: newStatus };
                }
                return chore;
            }) || [];

            return { ...prev, [person]: personChores };
        });

        // Update Stars (Optimistically)
        setStars(prev => ({
            ...prev,
            [person]: Math.max(0, (prev[person] || 0) + (newStatus ? 1 : -1))
        }));

        // Celebration if completing
        if (newStatus && event) {
            // We need to check completion status based on the NEW state
            // The state update hasn't happened yet in this closure, but we calculated it above.
            // However `setChores` is functional so we can't extract the value out easily unless we duplicate logic
            // or use a ref/effect.
            // SIMPLER APPROACH: replicate the check locally
            const personChores = chores[person] || [];
            const updatedPersonChores = personChores.map(chore =>
                chore.id === choreId ? { ...chore, completed: newStatus } : chore
            );

            if (updatedPersonChores.length > 0 && updatedPersonChores.every(c => c.completed)) {
                triggerMajorCelebration();
            } else {
                triggerCelebration(event.clientX, event.clientY);
            }
        }

        try {
            await fetch(`/api/chores/${choreId}/toggle`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ completed: newStatus })
            });
        } catch (err) {
            console.error("Failed to update chore", err);
        }
    };

    const handleAddChore = async (choreData: Partial<Chore>) => {
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

    const handleDeleteChore = (e: React.MouseEvent, choreId: number) => {
        e.stopPropagation(); // Prevent toggling
        setPendingDeleteId(choreId);
        setShowDeleteConfirm(true);
    };

    const handleUnlock = (e: React.FormEvent) => {
        e.preventDefault();
        if (unlockInput === editCode) {
            setIsEditMode(true);
            setShowUnlockModal(false);
            setUnlockInput('');
        } else {
            alert("Incorrect Code");
            setUnlockInput('');
        }
    };

    const requestEditMode = () => {
        if (isEditMode) {
            setIsEditMode(false);
            return;
        }

        if (!editCode) {
            setIsEditMode(true);
        } else {
            setShowUnlockModal(true);
        }
    };

    if (loading) return <div className="p-8 text-center text-gray-400">Loading chores...</div>;

    return (
        <div className="h-full overflow-hidden flex flex-col bg-transparent">
            {showMajorCelebration && <div className="celebration-overlay" />}
            {celebration && (
                <div
                    className="fixed pointer-events-none z-50 animate-ping opacity-0"
                    style={{ left: celebration.x, top: celebration.y }}
                >
                    <div className="absolute -top-4 -left-4 text-yellow-500"><Star size={32} fill="currentColor" /></div>
                    <div className="absolute -top-8 left-2 text-blue-500"><Sparkles size={24} /></div>
                    <div className="absolute top-2 -right-6 text-purple-500"><Sparkles size={20} /></div>
                </div>
            )}

            <ConfirmDialog
                isOpen={showDeleteConfirm}
                onClose={() => setShowDeleteConfirm(false)}
                onConfirm={confirmDeleteChore}
                title="Delete Chore"
                message="Are you sure you want to delete this chore?"
            />
            {/* Header / Toolbar */}
            {/* Unlock Modal */}
            {showUnlockModal && (
                <div className="fixed inset-0 z-[60] flex items-center justify-center p-6 bg-black/40 backdrop-blur-sm animate-in fade-in">
                    <div className="bg-white dark:bg-gray-900 p-6 rounded-2xl shadow-xl w-full max-w-xs space-y-4">
                        <h3 className="text-lg font-bold text-center dark:text-white">Enter Passcode</h3>
                        <form onSubmit={handleUnlock}>
                            <input
                                type="password"
                                inputMode="numeric"
                                autoFocus
                                value={unlockInput}
                                onChange={(e) => setUnlockInput(e.target.value)}
                                className="w-full text-center text-2xl tracking-widest p-3 rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 dark:text-white mb-4"
                                placeholder=""
                            />
                            <div className="flex gap-2">
                                <button type="button" onClick={() => setShowUnlockModal(false)} className="flex-1 py-3 bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 rounded-xl font-medium">Cancel</button>
                                <button type="submit" className="flex-1 py-3 bg-primary text-white rounded-xl font-medium">Unlock</button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {!kiosk && (
                <div className="flex items-center justify-between px-6 py-6 shrink-0">
                    <h2 className="text-3xl font-bold text-gray-900 dark:text-white tracking-tight drop-shadow-sm">Chore Chart</h2>
                    <div className="flex items-center gap-3">
                        <button
                            onClick={requestEditMode}
                            className={cn(
                                "flex items-center gap-2 px-5 py-2.5 rounded-2xl transition-all font-semibold shadow-sm border ring-1 ring-black/5",
                                isEditMode
                                    ? "bg-amber-100 text-amber-800 border-amber-200 hover:bg-amber-200"
                                    : "bg-white/50 dark:bg-white/10 text-gray-900 dark:text-white border-white/40 hover:bg-white/80 dark:hover:bg-white/20"
                            )}
                        >
                            {isEditMode ? <Unlock size={18} /> : <Lock size={18} />}
                            <span className="font-medium text-sm">{isEditMode ? "Done" : "Edit"}</span>
                        </button>

                        {isEditMode && (
                            <button
                                onClick={() => setIsModalOpen(true)}
                                className="flex items-center gap-2 bg-primary text-white px-5 py-2.5 rounded-2xl hover:bg-primary/90 transition-all font-semibold shadow-sm shadow-primary/20"
                            >
                                <Plus size={18} />
                                <span className="font-medium text-sm">Add Chore</span>
                            </button>
                        )}
                    </div>
                </div>
            )}

            <div className={cn(
                "flex-1 flex flex-col md:flex-row overflow-y-auto md:overflow-y-hidden md:overflow-x-auto px-6 gap-6 pb-6 snap-x md:snap-none custom-scrollbar",
                kiosk && "pt-6"
            )}>
                {Object.entries(chores).map(([name, personChores]) => {
                    const member = getMemberByName(name);
                    if (!member || member.visible === false) return null;
                    return (
                        <div
                            key={name}
                            className="w-full md:w-[320px] md:min-w-[320px] lg:flex-1 p-0 flex flex-col shrink-0 snap-center"
                        >
                            {/* Glass Card for Member */}
                            <div className="h-full bg-white/40 dark:bg-gray-800/40 backdrop-blur-xl rounded-[2rem] border border-white/50 dark:border-white/10 shadow-lg shadow-black/5 flex flex-col overflow-hidden">

                                {/* Member Header */}
                                <div className="p-6 pb-4 flex flex-col items-center shrink-0 border-b border-black/5 dark:border-white/5 bg-white/30 dark:bg-black/20">
                                    <div className="mb-3 transform hover:scale-105 transition-transform duration-300">
                                        <UserAvatar member={member} size="xl" />
                                    </div>
                                    <h3 className="text-3xl font-bold text-gray-900 dark:text-white mb-2">{name}</h3>
                                    <div className="inline-flex items-center gap-2 bg-white/80 dark:bg-black/40 px-4 py-1.5 rounded-full border border-yellow-200/50 dark:border-yellow-500/20 shadow-sm">
                                        <Star size={16} className="fill-yellow-400 text-yellow-400 drop-shadow-sm" />
                                        <span className="text-sm font-bold text-yellow-700 dark:text-yellow-400 tabular-nums">{stars[name] || 0}</span>
                                    </div>
                                </div>

                                {/* Chores Scroll Area */}
                                <div className="flex-1 overflow-y-auto p-4 space-y-6 custom-scrollbar">
                                    {['Morning', 'Evening'].map((time) => (
                                        <div key={time}>
                                            <h4 className="text-sm font-black text-gray-400 dark:text-gray-500 uppercase tracking-widest mb-3 pl-2 opacity-80">{time}</h4>
                                            <div className="space-y-2.5">
                                                {personChores
                                                    .filter(c => c.time_of_day === time)
                                                    .sort((a, b) => {
                                                        // Sort by completion status (completed last)
                                                        if (a.completed !== b.completed) return a.completed ? 1 : -1;
                                                        // Then by ID to keep stable
                                                        return a.id - b.id;
                                                    })
                                                    .map(chore => (
                                                        <div key={chore.id} className="relative group">
                                                            <button
                                                                onClick={(e) => toggleChore(name, chore.id, chore.completed, e)}
                                                                className={cn(
                                                                    "w-full text-left p-4 rounded-2xl border transition-all duration-300 flex items-center justify-between group/btn relative overflow-hidden kiosk-touch",
                                                                    chore.completed
                                                                        ? "bg-black/5 dark:bg-white/5 border-transparent opacity-60"
                                                                        : "bg-white/60 dark:bg-white/5 border-white/50 dark:border-white/5 hover:bg-white/80 dark:hover:bg-white/10 hover:shadow-md hover:scale-[1.02]"
                                                                )}
                                                            >
                                                                <span className={cn(
                                                                    "font-bold text-xl leading-snug line-clamp-2 transition-all relative z-10",
                                                                    chore.completed ? "text-gray-500 line-through" : "text-gray-800 dark:text-gray-100"
                                                                )}>
                                                                    {chore.title}
                                                                </span>

                                                                <div className={cn(
                                                                    "w-10 h-10 rounded-full border-2 flex items-center justify-center transition-all shrink-0 ml-4 shadow-inner relative z-10",
                                                                    chore.completed
                                                                        ? "bg-green-500 border-green-500 text-white scale-110"
                                                                        : "bg-white/50 border-gray-300 dark:border-gray-500 group-hover/btn:border-primary group-hover/btn:scale-110"
                                                                )}>
                                                                    {chore.completed && <Check size={24} strokeWidth={4} />}
                                                                </div>
                                                            </button>

                                                            {/* Delete Button (Visible in Edit Mode) */}
                                                            {isEditMode && (
                                                                <div className="absolute right-2 top-1/2 -translate-y-1/2 z-20">
                                                                    <button
                                                                        onClick={(e) => handleDeleteChore(e, chore.id)}
                                                                        className="bg-white/90 dark:bg-red-900/90 text-red-500 border border-red-100 dark:border-red-800 p-2 rounded-xl shadow-sm hover:bg-red-50 hover:scale-105 transition-all"
                                                                        title="Delete Chore"
                                                                    >
                                                                        <Trash2 size={16} />
                                                                    </button>
                                                                </div>
                                                            )}
                                                        </div>
                                                    ))}
                                                {personChores.filter(c => c.time_of_day === time).length === 0 && (
                                                    <div className="text-center py-4 border-2 border-dashed border-black/5 dark:border-white/5 rounded-2xl">
                                                        <p className="text-base text-gray-400 italic">No chores</p>
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    ))}
                                </div>
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

interface ChoreModalProps {
    isOpen: boolean;
    onClose: () => void;
    members: FamilyMember[];
    onSave: (chore: Partial<Chore>) => void;
}

function ChoreModal({ isOpen, onClose, members, onSave }: ChoreModalProps) {
    const [title, setTitle] = useState('');
    const [timeOfDay, setTimeOfDay] = useState<'Morning' | 'Evening'>('Morning');
    const [selectedMember, setSelectedMember] = useState<number>(members[0]?.id);

    // Reset when opening
    useEffect(() => {
        if (isOpen && members.length > 0) {
            setTitle('');
            setTimeOfDay('Morning');
            if (members.length > 0) setSelectedMember(members[0].id);
        }
    }, [isOpen, members]);

    if (!isOpen) return null;

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (selectedMember) {
            onSave({ title, time_of_day: timeOfDay, member_id: selectedMember });
            onClose();
        }
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-6 bg-black/20 dark:bg-black/60 backdrop-blur-md animate-in fade-in duration-200">
            <div className="bg-white/80 dark:bg-gray-900/80 backdrop-blur-2xl rounded-[2rem] shadow-2xl border border-white/40 dark:border-white/10 w-full max-w-sm overflow-hidden animate-in zoom-in-95 duration-200">
                <div className="p-6 border-b border-black/5 dark:border-white/5 flex items-center justify-between">
                    <h3 className="text-xl font-bold text-gray-900 dark:text-white">Add New Chore</h3>
                    <button onClick={onClose} className="p-2 hover:bg-black/5 dark:hover:bg-white/10 rounded-full transition-colors text-gray-500">
                        <X size={20} />
                    </button>
                </div>

                <form onSubmit={handleSubmit} className="p-6 space-y-5">
                    <div>
                        <label className="block text-sm font-bold text-gray-700 dark:text-gray-300 mb-2 ml-1">Chore Name</label>
                        <input
                            type="text"
                            value={title}
                            onChange={(e) => setTitle(e.target.value)}
                            className="w-full px-4 py-3.5 rounded-xl border border-black/10 dark:border-white/10 bg-white/50 dark:bg-black/20 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary/50 placeholder:text-gray-400"
                            placeholder="e.g. Empty Dishwasher"
                            autoFocus
                        />
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="block text-sm font-bold text-gray-700 dark:text-gray-300 mb-2 ml-1">Time</label>
                            <div className="relative">
                                <select
                                    value={timeOfDay}
                                    onChange={(e) => setTimeOfDay(e.target.value as 'Morning' | 'Evening')}
                                    className="w-full px-4 py-3.5 rounded-xl border border-black/10 dark:border-white/10 focus:outline-none focus:ring-2 focus:ring-primary/50 appearance-none bg-white/50 dark:bg-black/20 text-gray-900 dark:text-white"
                                >
                                    <option value="Morning" className="dark:bg-gray-800">Morning</option>
                                    <option value="Evening" className="dark:bg-gray-800">Evening</option>
                                </select>
                            </div>
                        </div>
                        <div>
                            <label className="block text-sm font-bold text-gray-700 dark:text-gray-300 mb-2 ml-1">Assign To</label>
                            <div className="relative">
                                <select
                                    value={selectedMember}
                                    onChange={(e) => setSelectedMember(Number(e.target.value))}
                                    className="w-full px-4 py-3.5 rounded-xl border border-black/10 dark:border-white/10 focus:outline-none focus:ring-2 focus:ring-primary/50 appearance-none bg-white/50 dark:bg-black/20 text-gray-900 dark:text-white"
                                >
                                    {members.map(m => (
                                        <option key={m.id} value={m.id} className="dark:bg-gray-800">{m.name}</option>
                                    ))}
                                </select>
                            </div>
                        </div>
                    </div>

                    <div className="pt-2">
                        <button
                            type="submit"
                            disabled={!title}
                            className="w-full py-4 bg-primary text-white rounded-xl font-bold shadow-lg shadow-primary/20 hover:bg-primary/90 hover:scale-[1.02] transition-all disabled:opacity-50 disabled:hover:scale-100"
                        >
                            Add Chore
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}
