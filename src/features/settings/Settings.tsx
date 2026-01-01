import React, { useState, useEffect, useRef } from 'react';
import { Plus, Trash2, Save, Upload, MapPin, Edit2, Moon, Sun, Monitor, Clock, Lock, Sparkles, Zap, Eye, EyeOff } from 'lucide-react';
import { UserAvatar } from '../../components/UserAvatar';
import { CalendarSettings } from './CalendarSettings';
import { ConfirmDialog } from '../../components/ConfirmDialog';
import { useTheme } from '../../hooks/useTheme';

import { FamilyMember, Photo } from '../../types';

const COLORS = [
    { label: 'Blue', value: 'bg-blue-100 text-blue-800', hex: 'bg-blue-100' },
    { label: 'Pink', value: 'bg-pink-100 text-pink-800', hex: 'bg-pink-100' },
    { label: 'Green', value: 'bg-green-100 text-green-800', hex: 'bg-green-100' },
    { label: 'Purple', value: 'bg-purple-100 text-purple-800', hex: 'bg-purple-100' },
    { label: 'Orange', value: 'bg-orange-100 text-orange-800', hex: 'bg-orange-100' },
    { label: 'Teal', value: 'bg-teal-100 text-teal-800', hex: 'bg-teal-100' },
];

export function Settings() {
    const [theme, setTheme] = useTheme();
    const [familyName, setFamilyName] = useState('');

    // Coordinate States
    const [latitude, setLatitude] = useState('');
    const [longitude, setLongitude] = useState('');
    const [choreResetTime, setChoreResetTime] = useState('00:00');
    const [editCode, setEditCode] = useState('');
    const [enableConfetti, setEnableConfetti] = useState(true);
    const [enableMajorCelebration, setEnableMajorCelebration] = useState(true);

    const [members, setMembers] = useState<FamilyMember[]>([]);
    const [screensaverTimeout, setScreensaverTimeout] = useState<number | string>(1);
    const [loading, setLoading] = useState(true);

    // Add Member State
    const [newMemberName, setNewMemberName] = useState('');
    const [newMemberEmail, setNewMemberEmail] = useState('');
    const [newMemberPassword, setNewMemberPassword] = useState('');
    const [newMemberPhone, setNewMemberPhone] = useState('');
    const [selectedColor, setSelectedColor] = useState(COLORS[0].value);

    // Edit Member State
    const [editingMember, setEditingMember] = useState<FamilyMember | null>(null); // { id, name, phone, color }

    const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
    const [pendingDeleteId, setPendingDeleteId] = useState<number | null>(null);

    const [webhookUrl, setWebhookUrl] = useState('');

    // Fetch initial data
    useEffect(() => {
        Promise.all([
            fetch('/api/settings').then(res => res.json()),
            fetch('/api/family').then(res => res.json())
        ]).then(([settingsData, familyData]: [any, FamilyMember[]]) => {
            if (settingsData.family_name) setFamilyName(settingsData.family_name);

            if (settingsData.weather_location) {
                if (settingsData.weather_location.includes(',')) {
                    const parts = settingsData.weather_location.split(',');
                    setLatitude(parts[0].trim());
                    setLongitude(parts[1].trim());
                }
            }

            if (settingsData.screensaver_timeout) {
                setScreensaverTimeout(settingsData.screensaver_timeout);
            }
            if (settingsData.google_chat_webhook) {
                setWebhookUrl(settingsData.google_chat_webhook);
            }
            if (settingsData.chore_reset_time) {
                setChoreResetTime(settingsData.chore_reset_time);
            }
            if (settingsData.edit_code) {
                setEditCode(settingsData.edit_code);
            }
            if (settingsData.enable_confetti !== undefined) {
                setEnableConfetti(settingsData.enable_confetti === 'true');
            }
            if (settingsData.enable_major_celebration !== undefined) {
                setEnableMajorCelebration(settingsData.enable_major_celebration === 'true');
            }

            setMembers(familyData);
            setLoading(false);
        });
    }, []);

    const saveFamilyName = async () => {
        try {
            await fetch('/api/settings', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ key: 'family_name', value: familyName })
            });
            window.location.reload();
        } catch (err) {
            console.error(err);
        }
    };


    const saveWebhookUrl = async () => {
        if (!webhookUrl) return;
        try {
            await fetch('/api/settings', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ key: 'google_chat_webhook', value: webhookUrl })
            });
            alert("Webhook Saved!");
        } catch (err) {
            console.error(err);
        }
    };

    const saveLocation = async () => {
        if (!latitude || !longitude) return;
        const locationString = `${latitude.trim()},${longitude.trim()}`;
        try {
            await fetch('/api/settings', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ key: 'weather_location', value: locationString })
            });
            window.location.reload();
        } catch (err) {
            console.error(err);
        }
    };

    const saveChoreResetTime = async () => {
        try {
            await fetch('/api/settings', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ key: 'chore_reset_time', value: choreResetTime })
            });
            alert("Reset Time Saved!");
        } catch (err) {
            console.error(err);
        }
    };

    const manualResetChores = async () => {
        if (!confirm("Are you sure you want to uncheck all chores for everyone?")) return;
        try {
            await fetch('/api/chores/reset', { method: 'POST' });
            alert("Chores have been reset!");
        } catch (err) {
            console.error(err);
            alert("Failed to reset chores");
        }
    };

    const saveEditCode = async () => {
        try {
            await fetch('/api/settings', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ key: 'edit_code', value: editCode })
            });
            alert("Passcode Saved!");
        } catch (err) {
            console.error(err);
        }
    };

    const saveAnimations = async () => {
        try {
            await Promise.all([
                fetch('/api/settings', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ key: 'enable_confetti', value: enableConfetti.toString() })
                }),
                fetch('/api/settings', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ key: 'enable_major_celebration', value: enableMajorCelebration.toString() })
                })
            ]);
            alert("Animation Settings Saved!");
        } catch (err) {
            console.error(err);
        }
    };



    const saveScreensaverTimeout = async () => {
        try {
            await fetch('/api/settings', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ key: 'screensaver_timeout', value: screensaverTimeout.toString() })
            });
            alert("Timeout Saved!");
            // No reload needed as App.jsx will refetch or we can use a shared state/event if needed.
            // But App.jsx refetches on mount. For instant update we could dispatch an event.
            window.dispatchEvent(new CustomEvent('update-timeout', { detail: screensaverTimeout }));
        } catch (err) {
            console.error(err);
        }
    };

    const triggerScreensaver = () => {
        window.dispatchEvent(new CustomEvent('trigger-screensaver'));
    };

    const addMember = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!newMemberName.trim() || !newMemberPassword.trim()) return;

        try {
            const res = await fetch('/api/family', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    name: newMemberName,
                    phone: newMemberPhone,
                    email: newMemberEmail,
                    password: newMemberPassword,
                    color: selectedColor
                })
            });
            const newMember = await res.json();
            setMembers([...members, newMember]);
            setNewMemberName('');
            setNewMemberEmail('');
            setNewMemberPassword('');
            setNewMemberPhone('');
            setSelectedColor(COLORS[0].value);
        } catch (err) {
            console.error(err);
        }
    };

    const startEditing = (member: FamilyMember) => {
        setEditingMember({ ...member });
    };

    const saveEditing = async () => {
        if (!editingMember) return;
        try {
            await fetch(`/api/family/${editingMember.id}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name: editingMember.name, phone: editingMember.phone, color: editingMember.color })
            });
            setMembers(members.map(m => m.id === editingMember.id ? editingMember : m));
            setEditingMember(null);
        } catch (err) {
            console.error(err);
        }
    };

    const confirmDeleteMember = async () => {
        if (!pendingDeleteId) return;
        try {
            await fetch(`/api/family/${pendingDeleteId}`, { method: 'DELETE' });
            setMembers(members.filter(m => m.id !== pendingDeleteId));
            setPendingDeleteId(null);
            setShowDeleteConfirm(false);
        } catch (err) {
            console.error(err);
        }
    };

    const handleDeleteMember = (id: number) => {
        setPendingDeleteId(id);
        setShowDeleteConfirm(true);
    };

    const fileInputRefs = useRef<Record<number, HTMLInputElement | null>>({});

    const handleAvatarUpload = async (id: number, file: File) => {
        if (!file) return;
        const formData = new FormData();
        formData.append('avatar', file);
        try {
            const res = await fetch(`/api/family/${id}/avatar`, {
                method: 'POST',
                body: formData
            });
            const data = await res.json();
            if (data.success) {
                setMembers(members.map(m => m.id === id ? { ...m, avatar: data.avatar } : m));
            }
        } catch (err) {
            console.error(err);
        }
    };

    const triggerFileInput = (id: number) => {
        if (fileInputRefs.current[id]) {
            fileInputRefs.current[id].click();
        }
    };

    if (loading) return <div className="p-8">Loading settings...</div>;

    return (
        <div className="h-full overflow-y-auto bg-slate-50 dark:bg-slate-950 custom-scrollbar p-6">
            <ConfirmDialog
                isOpen={showDeleteConfirm}
                onClose={() => setShowDeleteConfirm(false)}
                onConfirm={confirmDeleteMember}
                title="Delete Family Member"
                message="Are you sure you want to delete this member? All their assigned chores and events will be deleted as well."
            />
            <div className="max-w-4xl mx-auto space-y-8 pb-24">

                {/* General Settings Section */}
                <div className="space-y-4">
                    <div className="flex items-center justify-between">
                        <div>
                            <h2 className="text-xl font-semibold text-slate-900 dark:text-white tracking-tight">General Settings</h2>
                            <p className="text-sm text-slate-500 dark:text-slate-400">Update your family's profile and preferences.</p>
                        </div>
                    </div>

                    <div className="bg-white dark:bg-slate-900 rounded-lg border border-slate-200 dark:border-slate-800 p-6 space-y-6 shadow-sm">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            <div>
                                <label className="block text-sm font-medium text-slate-700 dark:text-slate-200 mb-1.5">Family Name</label>
                                <div className="flex gap-2">
                                    <input
                                        type="text"
                                        value={familyName}
                                        onChange={(e) => setFamilyName(e.target.value)}
                                        className="flex-1 px-3 py-2 rounded-md border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all placeholder:text-slate-400"
                                        placeholder="e.g. The Miller Family"
                                    />
                                    <button
                                        onClick={saveFamilyName}
                                        className="bg-blue-600 text-white px-4 py-2 rounded-md font-medium text-sm hover:bg-blue-700 transition-colors flex items-center gap-2"
                                    >
                                        <Save size={16} />
                                        Save
                                    </button>
                                </div>
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-slate-700 dark:text-slate-200 mb-1.5">Display Theme</label>
                                <div className="flex gap-2 bg-slate-100 dark:bg-slate-800 p-1 rounded-md">
                                    {[
                                        { id: 'light', label: 'Light', icon: Sun },
                                        { id: 'dark', label: 'Dark', icon: Moon },
                                        { id: 'system', label: 'System', icon: Monitor },
                                    ].map((option) => (
                                        <button
                                            key={option.id}
                                            onClick={() => setTheme(option.id)}
                                            className={`flex-1 flex items-center justify-center gap-2 px-3 py-1.5 rounded text-sm font-medium transition-all ${theme === option.id
                                                ? 'bg-white dark:bg-slate-700 text-blue-600 dark:text-blue-400 shadow-sm'
                                                : 'text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
                                                }`}
                                        >
                                            <option.icon size={16} />
                                            {option.label}
                                        </button>
                                    ))}
                                </div>
                            </div>
                        </div>

                        <div className="border-t border-slate-100 dark:border-slate-800 pt-6">
                            <label className="block text-sm font-medium text-slate-700 dark:text-slate-200 mb-1.5">Weather Location (Coordinates)</label>
                            <div className="flex gap-2">
                                <div className="flex-1 flex gap-2">
                                    <div className="flex-1 relative">
                                        <MapPin size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                                        <input
                                            type="text"
                                            inputMode="decimal"
                                            value={latitude}
                                            onChange={(e) => setLatitude(e.target.value)}
                                            className="w-full pl-9 pr-3 py-2 rounded-md border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all placeholder:text-slate-400"
                                            placeholder="Latitude"
                                        />
                                    </div>
                                    <div className="flex-1 relative">
                                        <MapPin size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                                        <input
                                            type="text"
                                            inputMode="decimal"
                                            value={longitude}
                                            onChange={(e) => setLongitude(e.target.value)}
                                            className="w-full pl-9 pr-3 py-2 rounded-md border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all placeholder:text-slate-400"
                                            placeholder="Longitude"
                                        />
                                    </div>
                                </div>
                                <button
                                    onClick={saveLocation}
                                    className="bg-blue-600 text-white px-4 py-2 rounded-md font-medium text-sm hover:bg-blue-700 transition-colors flex items-center gap-2"
                                >
                                    <Save size={16} />
                                    Save
                                </button>
                            </div>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 border-t border-slate-100 dark:border-slate-800 pt-6">
                            <div>
                                <label className="block text-sm font-medium text-slate-700 dark:text-slate-200 mb-1.5">Chore Reset Time</label>
                                <div className="flex gap-2">
                                    <div className="relative flex-1">
                                        <Clock size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                                        <input
                                            type="time"
                                            value={choreResetTime}
                                            onChange={(e) => setChoreResetTime(e.target.value)}
                                            className="w-full pl-9 pr-3 py-2 rounded-md border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                                        />
                                    </div>
                                    <button
                                        onClick={saveChoreResetTime}
                                        className="bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 px-3 py-2 rounded-md font-medium text-sm hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors"
                                    >
                                        <Save size={16} />
                                    </button>
                                    <button
                                        onClick={manualResetChores}
                                        className="bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 px-3 py-2 rounded-md font-medium text-sm hover:bg-red-100 dark:hover:bg-red-900/40 transition-colors"
                                        title="Reset All Chores Now"
                                    >
                                        <Trash2 size={16} />
                                    </button>
                                </div>
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-slate-700 dark:text-slate-200 mb-1.5">Edit Passcode</label>
                                <div className="flex gap-2">
                                    <div className="relative flex-1">
                                        <Lock size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                                        <input
                                            type="text"
                                            inputMode="numeric"
                                            pattern="[0-9]*"
                                            value={editCode}
                                            onChange={(e) => setEditCode(e.target.value)}
                                            className="w-full pl-9 pr-3 py-2 rounded-md border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 placeholder:text-slate-400"
                                            placeholder="e.g. 1234"
                                        />
                                    </div>
                                    <button
                                        onClick={saveEditCode}
                                        className="bg-blue-600 text-white px-4 py-2 rounded-md font-medium text-sm hover:bg-blue-700 transition-colors flex items-center gap-2"
                                    >
                                        <Save size={16} />
                                        Save
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Animations Section */}
                <div className="space-y-4">
                    <div className="flex items-center justify-between">
                        <h2 className="text-xl font-semibold text-slate-900 dark:text-white tracking-tight">Animations</h2>
                    </div>
                    <div className="bg-white dark:bg-slate-900 rounded-lg border border-slate-200 dark:border-slate-800 p-6 space-y-4 shadow-sm">
                        <div className="flex items-center justify-between py-2">
                            <div className="flex items-center gap-3">
                                <div className="p-2 bg-blue-50 dark:bg-blue-900/20 rounded-md text-blue-600 dark:text-blue-400">
                                    <Sparkles size={18} />
                                </div>
                                <div>
                                    <p className="text-sm font-medium text-slate-900 dark:text-white">Confetti on Checkoff</p>
                                    <p className="text-xs text-slate-500">Play small confetti effect when completing a task.</p>
                                </div>
                            </div>
                            <button
                                onClick={() => setEnableConfetti(!enableConfetti)}
                                className={`w-11 h-6 rounded-full transition-colors relative focus:outline-none focus:ring-2 focus:ring-blue-500/50 ${enableConfetti ? 'bg-blue-600' : 'bg-slate-200 dark:bg-slate-700'}`}
                            >
                                <div className={`absolute top-1 w-4 h-4 rounded-full bg-white transition-transform ${enableConfetti ? 'left-6' : 'left-1'}`} />
                            </button>
                        </div>
                        <div className="border-t border-slate-100 dark:border-slate-800 my-2" />
                        <div className="flex items-center justify-between py-2">
                            <div className="flex items-center gap-3">
                                <div className="p-2 bg-purple-50 dark:bg-purple-900/20 rounded-md text-purple-600 dark:text-purple-400">
                                    <Zap size={18} />
                                </div>
                                <div>
                                    <p className="text-sm font-medium text-slate-900 dark:text-white">Major Celebration</p>
                                    <p className="text-xs text-slate-500">Fireworks and light show when all chores are done.</p>
                                </div>
                            </div>
                            <button
                                onClick={() => setEnableMajorCelebration(!enableMajorCelebration)}
                                className={`w-11 h-6 rounded-full transition-colors relative focus:outline-none focus:ring-2 focus:ring-purple-500/50 ${enableMajorCelebration ? 'bg-purple-600' : 'bg-slate-200 dark:bg-slate-700'}`}
                            >
                                <div className={`absolute top-1 w-4 h-4 rounded-full bg-white transition-transform ${enableMajorCelebration ? 'left-6' : 'left-1'}`} />
                            </button>
                        </div>
                        <div className="pt-4 flex justify-end border-t border-slate-100 dark:border-slate-800">
                            <button
                                onClick={saveAnimations}
                                className="bg-slate-900 dark:bg-slate-700 text-white px-4 py-2 rounded-md font-medium text-sm hover:bg-slate-800 transition-colors flex items-center gap-2"
                            >
                                <Save size={16} />
                                Save Preferences
                            </button>
                        </div>
                    </div>
                </div>

                {/* Screensaver & Integrations */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="space-y-4">
                        <h2 className="text-xl font-semibold text-slate-900 dark:text-white tracking-tight">Screensaver</h2>
                        <div className="bg-white dark:bg-slate-900 rounded-lg border border-slate-200 dark:border-slate-800 p-6 space-y-4 shadow-sm h-full">
                            <div>
                                <label className="block text-sm font-medium text-slate-700 dark:text-slate-200 mb-1.5">Idle Timeout (Minutes)</label>
                                <div className="flex gap-2">
                                    <input
                                        type="number"
                                        min="1"
                                        value={screensaverTimeout}
                                        onChange={(e) => setScreensaverTimeout(e.target.value)}
                                        className="w-20 px-3 py-2 rounded-md border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                                    />
                                    <button
                                        onClick={saveScreensaverTimeout}
                                        className="bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 px-3 py-2 rounded-md font-medium text-sm hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors"
                                    >
                                        <Save size={16} />
                                    </button>
                                    <button
                                        onClick={triggerScreensaver}
                                        className="flex-1 bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 px-3 py-2 rounded-md font-medium text-sm hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors flex items-center justify-center gap-2"
                                    >
                                        <Monitor size={16} />
                                        Test
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>

                    <div className="space-y-4">
                        <h2 className="text-xl font-semibold text-slate-900 dark:text-white tracking-tight">Integrations</h2>
                        <div className="bg-white dark:bg-slate-900 rounded-lg border border-slate-200 dark:border-slate-800 p-6 space-y-4 shadow-sm h-full">
                            <div>
                                <label className="block text-sm font-medium text-slate-700 dark:text-slate-200 mb-1.5">Google Chat Webhook</label>
                                <div className="flex gap-2">
                                    <input
                                        type="url"
                                        value={webhookUrl}
                                        onChange={(e) => setWebhookUrl(e.target.value)}
                                        className="flex-1 px-3 py-2 rounded-md border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 placeholder:text-slate-400"
                                        placeholder="https://chat.googleapis.com..."
                                    />
                                    <button
                                        onClick={saveWebhookUrl}
                                        className="bg-blue-600 text-white px-4 py-2 rounded-md font-medium text-sm hover:bg-blue-700 transition-colors flex items-center gap-2"
                                    >
                                        <Save size={16} />
                                        Save
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Family Members */}
                {/* Family Members */}
                <div className="space-y-6 pt-12 border-t border-slate-200 dark:border-slate-800">
                    <div className="flex items-center justify-between">
                        <h2 className="text-xl font-semibold text-slate-900 dark:text-white tracking-tight">Family Members</h2>
                        <span className="text-sm text-slate-500">Manage your household</span>
                    </div>

                    <div className="bg-white dark:bg-slate-900 rounded-lg border border-slate-200 dark:border-slate-800 overflow-hidden shadow-sm">
                        <div className="overflow-x-auto">
                            <table className="w-full text-sm text-left">
                                <thead className="bg-slate-50 dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700 text-slate-500 dark:text-slate-400 font-medium">
                                    <tr>
                                        <th className="px-6 py-3">Member</th>
                                        <th className="px-6 py-3">Contact</th>
                                        <th className="px-6 py-3 text-center">Visible</th>
                                        <th className="px-6 py-3 text-right">Actions</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                                    {members.map(member => (
                                        <tr key={member.id} className="group hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors">
                                            {editingMember && editingMember.id === member.id ? (
                                                <td colSpan={4} className="px-4 py-3 bg-blue-50/50 dark:bg-blue-900/10">
                                                    <div className="flex items-center gap-3">
                                                        <input
                                                            type="text"
                                                            value={editingMember.name}
                                                            onChange={(e) => setEditingMember({ ...editingMember, name: e.target.value })}
                                                            className="w-40 px-3 py-2 rounded-md border border-slate-300 text-sm"
                                                            placeholder="Name"
                                                        />
                                                        <input
                                                            type="tel"
                                                            value={editingMember.phone || ''}
                                                            onChange={(e) => setEditingMember({ ...editingMember, phone: e.target.value })}
                                                            className="w-40 px-3 py-2 rounded-md border border-slate-300 text-sm"
                                                            placeholder="Phone"
                                                        />
                                                        <div className="flex gap-1">
                                                            {COLORS.map(c => (
                                                                <button
                                                                    key={c.value}
                                                                    onClick={() => setEditingMember({ ...editingMember, color: c.value })}
                                                                    className={`w-6 h-6 rounded-full ${c.hex} border-2 ${editingMember.color === c.value ? 'border-slate-600' : 'border-transparent'}`}
                                                                />
                                                            ))}
                                                        </div>
                                                        <div className="flex gap-2 ml-auto">
                                                            <button onClick={saveEditing} className="px-3 py-1.5 bg-green-600 text-white rounded text-xs font-bold hover:bg-green-700">Save</button>
                                                            <button onClick={() => setEditingMember(null)} className="px-3 py-1.5 bg-slate-200 text-slate-700 rounded text-xs font-bold hover:bg-slate-300">Cancel</button>
                                                        </div>
                                                    </div>
                                                </td>
                                            ) : (
                                                <>
                                                    <td className="px-6 py-3">
                                                        <div className="flex items-center gap-3">
                                                            <div className="relative group/avatar cursor-pointer" onClick={() => triggerFileInput(member.id)}>
                                                                <UserAvatar member={member} size="sm" />
                                                                <div className="absolute inset-0 bg-black/40 rounded-full flex items-center justify-center opacity-0 group-hover/avatar:opacity-100 transition-opacity">
                                                                    <Upload size={12} className="text-white" />
                                                                </div>
                                                                <input
                                                                    type="file"
                                                                    ref={el => { fileInputRefs.current[member.id] = el; }}
                                                                    className="hidden"
                                                                    accept="image/*"
                                                                    onChange={(e) => {
                                                                        if (e.target.files && e.target.files[0]) {
                                                                            handleAvatarUpload(member.id, e.target.files[0]);
                                                                        }
                                                                    }}
                                                                />
                                                            </div>
                                                            <span className={`font-medium transition-colors ${member.visible === false ? 'text-slate-400 dark:text-slate-600 decoration-slate-400 line-through decoration-2' : 'text-slate-900 dark:text-white'}`}>{member.name}</span>
                                                        </div>
                                                    </td>
                                                    <td className="px-6 py-3 text-slate-500 dark:text-slate-400">
                                                        {member.phone || '-'}
                                                    </td>
                                                    <td className="px-6 py-3 text-center">
                                                        <button
                                                            onClick={async () => {
                                                                const newVisible = member.visible === false ? true : false;
                                                                console.log(`[Settings] Toggling visibility for ${member.name} (ID: ${member.id}) to ${newVisible}`);
                                                                try {
                                                                    const res = await fetch(`/api/family/${member.id}`, {
                                                                        method: 'PUT',
                                                                        headers: { 'Content-Type': 'application/json' },
                                                                        body: JSON.stringify({ visible: newVisible })
                                                                    });
                                                                    const data = await res.json();
                                                                    console.log('[Settings] Toggle response:', data);

                                                                    if (res.ok) {
                                                                        setMembers(members.map(m => m.id === member.id ? { ...m, visible: newVisible } : m));
                                                                    } else {
                                                                        console.error('[Settings] Toggle failed:', data);
                                                                    }
                                                                } catch (err) { console.error('[Settings] Toggle error:', err); }
                                                            }}
                                                            className={`p-1.5 rounded-md transition-colors ${member.visible !== false ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' : 'bg-slate-100 text-slate-400 dark:bg-slate-800 dark:text-slate-500'}`}
                                                            title={member.visible !== false ? "Visible" : "Hidden"}
                                                        >
                                                            {member.visible !== false ? <Eye size={16} /> : <EyeOff size={16} />}
                                                        </button>
                                                    </td>
                                                    <td className="px-6 py-3 text-right">
                                                        <div className="flex justify-end gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                                            <button onClick={() => startEditing(member)} className="p-1.5 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded transition-colors" title="Edit">
                                                                <Edit2 size={16} />
                                                            </button>
                                                            <button onClick={() => handleDeleteMember(member.id)} className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded transition-colors" title="Delete">
                                                                <Trash2 size={16} />
                                                            </button>
                                                        </div>
                                                    </td>
                                                </>
                                            )}
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                        <div className="bg-slate-50 dark:bg-slate-800/50 px-6 py-4 border-t border-slate-200 dark:border-slate-800">
                            <form onSubmit={addMember} className="grid grid-cols-1 lg:grid-cols-3 gap-6 w-full">
                                <div className="space-y-3">
                                    <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider">Basic Info</label>
                                    <div className="space-y-3">
                                        <input
                                            type="text"
                                            value={newMemberName}
                                            onChange={(e) => setNewMemberName(e.target.value)}
                                            className="w-full px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 focus:outline-none transition-all"
                                            placeholder="Name"
                                            required
                                        />
                                        <input
                                            type="tel"
                                            value={newMemberPhone}
                                            onChange={(e) => setNewMemberPhone(e.target.value)}
                                            className="w-full px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 focus:outline-none transition-all"
                                            placeholder="Phone (Optional)"
                                        />
                                    </div>
                                </div>
                                <div className="space-y-3">
                                    <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider">Credentials</label>
                                    <div className="space-y-3">
                                        <input
                                            type="email"
                                            value={newMemberEmail}
                                            onChange={(e) => setNewMemberEmail(e.target.value)}
                                            className="w-full px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 focus:outline-none transition-all"
                                            placeholder="Email"
                                            required
                                        />
                                        <input
                                            type="password"
                                            value={newMemberPassword}
                                            onChange={(e) => setNewMemberPassword(e.target.value)}
                                            className="w-full px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 focus:outline-none transition-all"
                                            placeholder="Password"
                                            required
                                        />
                                    </div>
                                </div>
                                <div className="flex flex-col justify-between">
                                    <div className="space-y-3">
                                        <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider">Appearance</label>
                                        <div className="flex flex-wrap gap-3">
                                            {COLORS.map(c => (
                                                <button
                                                    key={c.value}
                                                    type="button"
                                                    onClick={() => setSelectedColor(c.value)}
                                                    className={`w-10 h-10 rounded-full ${c.hex} transition-all ${selectedColor === c.value ? 'ring-2 ring-offset-2 ring-slate-400 scale-110' : 'hover:scale-110'}`}
                                                    title={c.label}
                                                />
                                            ))}
                                        </div>
                                    </div>
                                    <button type="submit" className="mt-6 w-full bg-slate-900 dark:bg-white text-white dark:text-slate-900 h-[46px] rounded-xl font-bold hover:bg-slate-800 dark:hover:bg-slate-100 transition-all active:scale-95 shadow-lg shadow-slate-200 dark:shadow-none flex items-center justify-center gap-2">
                                        <Plus size={18} />
                                        Add Member
                                    </button>
                                </div>
                            </form>
                        </div>
                    </div>
                </div>

                <div className="space-y-4">
                    <h2 className="text-xl font-semibold text-slate-900 dark:text-white tracking-tight">External Calendars</h2>
                    <CalendarSettings />
                </div>

                <div className="space-y-4 pb-20">
                    <h2 className="text-xl font-semibold text-slate-900 dark:text-white tracking-tight">Screensaver Photos</h2>
                    <PhotosSettings />
                </div>
            </div>
        </div>
    );
}

function PhotosSettings() {
    const [photos, setPhotos] = useState<Photo[]>([]);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
    const [pendingDeleteId, setPendingDeleteId] = useState<number | null>(null);

    useEffect(() => {
        fetchPhotos();
    }, []);

    const fetchPhotos = () => {
        fetch('/api/photos')
            .then(res => res.json())
            .then(data => setPhotos(data || []))
            .catch(console.error);
    };

    const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const files = e.target.files;
        if (!files || files.length === 0) return;

        const formData = new FormData();
        Array.from(files).forEach(file => {
            formData.append('photos', file);
        });

        try {
            await fetch('/api/photos', {
                method: 'POST',
                body: formData
            });
            fetchPhotos();
            e.target.value = ''; // reset input
        } catch (err) { console.error(err); }
    };

    const confirmDelete = async () => {
        if (!pendingDeleteId) return;
        try {
            await fetch(`/api/photos/${pendingDeleteId}`, { method: 'DELETE' });
            setPhotos(photos.filter(p => p.id !== pendingDeleteId));
            setPendingDeleteId(null);
            setShowDeleteConfirm(false);
        } catch (err) { console.error(err); }
    };

    const handleDelete = (id: number) => {
        setPendingDeleteId(id);
        setShowDeleteConfirm(true);
    };

    return (
        <div className="bg-white dark:bg-slate-900 rounded-lg border border-slate-200 dark:border-slate-800 p-6 shadow-sm">
            <ConfirmDialog
                isOpen={showDeleteConfirm}
                onClose={() => setShowDeleteConfirm(false)}
                onConfirm={confirmDelete}
                title="Remove Photo"
                message="Are you sure you want to remove this photo?"
                confirmText="Remove"
            />
            <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
                <div
                    onClick={() => fileInputRef.current?.click()}
                    className="aspect-square rounded-lg border-2 border-dashed border-slate-200 dark:border-slate-700 flex flex-col items-center justify-center text-slate-400 hover:border-blue-500 hover:text-blue-500 hover:bg-blue-50/50 cursor-pointer transition-all"
                >
                    <Upload size={24} />
                    <span className="text-xs font-semibold mt-2">Upload</span>
                    <input
                        type="file"
                        multiple
                        accept="image/*"
                        className="hidden"
                        ref={fileInputRef}
                        onChange={handleUpload}
                    />
                </div>
                {photos.map(photo => (
                    <div key={photo.id} className="relative group aspect-square rounded-lg overflow-hidden bg-slate-100 border border-slate-200">
                        <img src={photo.url} alt="Screensaver" className="w-full h-full object-cover" />
                        <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                            <button
                                onClick={() => handleDelete(photo.id)}
                                className="p-2 bg-white rounded-full text-red-600 hover:bg-red-50 transition-colors shadow-sm"
                            >
                                <Trash2 size={16} />
                            </button>
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
}
