import React, { useState, useEffect, useRef } from 'react';
import { Plus, Trash2, Save, User, Upload, MapPin, Edit2, X, Check, Moon, Sun, Monitor, Clock, Lock } from 'lucide-react';
import { UserAvatar } from '../../components/UserAvatar';
import { CalendarSettings } from './CalendarSettings';
import { ConfirmDialog } from '../../components/ConfirmDialog';
import { useTheme } from '../../hooks/useTheme';

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

    const [members, setMembers] = useState([]);
    const [screensaverTimeout, setScreensaverTimeout] = useState(1);
    const [loading, setLoading] = useState(true);

    // Add Member State
    const [newMemberName, setNewMemberName] = useState('');
    const [newMemberPhone, setNewMemberPhone] = useState('');
    const [selectedColor, setSelectedColor] = useState(COLORS[0].value);

    // Edit Member State
    const [editingMember, setEditingMember] = useState(null); // { id, name, phone, color }

    const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
    const [pendingDeleteId, setPendingDeleteId] = useState(null);

    // Fetch initial data
    useEffect(() => {
        Promise.all([
            fetch('/api/settings').then(res => res.json()),
            fetch('/api/family').then(res => res.json())
        ]).then(([settingsData, familyData]) => {
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

    const [webhookUrl, setWebhookUrl] = useState('');

    useEffect(() => {
        if (!loading) {
            // Already fetched settings in initial effect.
            // But I didn't save it to state. I should update the initial fetch to set this.
        }
    }, [loading]);

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

    const addMember = async (e) => {
        e.preventDefault();
        if (!newMemberName.trim()) return;

        try {
            const res = await fetch('/api/family', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name: newMemberName, phone: newMemberPhone, color: selectedColor })
            });
            const newMember = await res.json();
            setMembers([...members, newMember]);
            setNewMemberName('');
            setNewMemberPhone('');
            setSelectedColor(COLORS[0].value);
        } catch (err) {
            console.error(err);
        }
    };

    const startEditing = (member) => {
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

    const handleDeleteMember = (id) => {
        setPendingDeleteId(id);
        setShowDeleteConfirm(true);
    };

    const fileInputRefs = useRef({});

    const handleAvatarUpload = async (id, file) => {
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

    const triggerFileInput = (id) => {
        if (fileInputRefs.current[id]) {
            fileInputRefs.current[id].click();
        }
    };

    if (loading) return <div className="p-8">Loading settings...</div>;

    return (
        <div className="h-full overflow-y-auto bg-gray-50/50 dark:bg-black/20 custom-scrollbar">
            <ConfirmDialog
                isOpen={showDeleteConfirm}
                onClose={() => setShowDeleteConfirm(false)}
                onConfirm={confirmDeleteMember}
                title="Delete Family Member"
                message="Are you sure you want to delete this member? All their assigned chores and events will be deleted as well."
            />
            <div className="max-w-4xl mx-auto p-6 md:p-10 space-y-10 md:space-y-14 pb-24">
                <div className="space-y-8">
                    <div className="pl-1">
                        <h2 className="text-3xl font-extrabold text-gray-900 dark:text-white mb-2 tracking-tight">General Settings</h2>
                        <p className="text-base text-gray-500 dark:text-gray-400">Update your family's profile and preferences.</p>
                    </div>

                    <div className="bg-white dark:bg-gray-900 shadow-sm shadow-black/5 p-8 rounded-[2rem] border border-gray-100 dark:border-gray-800 space-y-8">
                        <div>
                            <label className="block text-base font-bold text-gray-900 dark:text-gray-100 mb-3 ml-1">Family Name</label>
                            <div className="flex gap-4">
                                <input
                                    type="text"
                                    value={familyName}
                                    onChange={(e) => setFamilyName(e.target.value)}
                                    className="flex-1 px-6 py-4 rounded-2xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 text-lg text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary/50 transition-all placeholder:text-gray-400"
                                    placeholder="e.g. The Miller Family"
                                />
                                <button
                                    onClick={saveFamilyName}
                                    className="bg-primary text-white px-8 py-4 rounded-2xl font-bold text-lg hover:bg-primary/90 transition-all active:scale-95 flex items-center gap-3 shadow-lg shadow-primary/20"
                                >
                                    <Save size={22} />
                                    Save
                                </button>
                            </div>
                        </div>

                        <div>
                            <label className="block text-base font-bold text-gray-900 dark:text-gray-100 mb-3 ml-1">Display Theme</label>
                            <div className="flex gap-4">
                                {[
                                    { id: 'light', label: 'Light', icon: Sun },
                                    { id: 'dark', label: 'Dark', icon: Moon },
                                    { id: 'system', label: 'System', icon: Monitor },
                                ].map((option) => (
                                    <button
                                        key={option.id}
                                        onClick={() => setTheme(option.id)}
                                        className={`flex-1 flex items-center justify-center gap-3 px-6 py-5 rounded-2xl border-2 transition-all active:scale-95 ${theme === option.id
                                            ? 'bg-primary/10 border-primary text-primary'
                                            : 'bg-gray-50 dark:bg-gray-800 text-gray-600 dark:text-gray-400 border-transparent hover:bg-gray-100 dark:hover:bg-gray-700'
                                            }`}
                                    >
                                        <option.icon size={24} className={theme === option.id ? "fill-current" : ""} />
                                        <span className="font-bold text-lg">{option.label}</span>
                                    </button>
                                ))}
                            </div>
                        </div>

                        <div>
                            <label className="block text-base font-bold text-gray-900 dark:text-gray-100 mb-3 ml-1">Weather Location (Coordinates)</label>
                            <div className="flex gap-4">
                                <div className="flex-1 flex gap-4">
                                    <div className="flex-1 relative">
                                        <MapPin size={20} className="absolute left-5 top-1/2 -translate-y-1/2 text-gray-400" />
                                        <input
                                            type="text"
                                            inputMode="decimal"
                                            value={latitude}
                                            onChange={(e) => setLatitude(e.target.value)}
                                            className="w-full pl-12 pr-6 py-4 rounded-2xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 text-lg text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary/50 transition-all placeholder:text-gray-400"
                                            placeholder="Lat"
                                        />
                                    </div>
                                    <div className="flex-1 relative">
                                        <MapPin size={20} className="absolute left-5 top-1/2 -translate-y-1/2 text-gray-400" />
                                        <input
                                            type="text"
                                            inputMode="decimal"
                                            value={longitude}
                                            onChange={(e) => setLongitude(e.target.value)}
                                            className="w-full pl-12 pr-6 py-4 rounded-2xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 text-lg text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary/50 transition-all placeholder:text-gray-400"
                                            placeholder="Lng"
                                        />
                                    </div>
                                </div>
                                <button
                                    onClick={saveLocation}
                                    className="bg-primary text-white px-8 py-4 rounded-2xl font-bold text-lg hover:bg-primary/90 transition-all active:scale-95 flex items-center gap-3 shadow-lg shadow-primary/20"
                                >
                                    <Save size={22} />
                                    Save
                                </button>
                            </div>
                        </div>
                    </div>

                    <div className="bg-white dark:bg-gray-900 shadow-sm shadow-black/5 p-8 rounded-[2rem] border border-gray-100 dark:border-gray-800 space-y-8">
                        <div>
                            <label className="block text-base font-bold text-gray-900 dark:text-gray-100 mb-2 ml-1">Chore Reset Time</label>
                            <p className="text-sm text-gray-500 dark:text-gray-400 mb-4 ml-1">Set the time when chores automatically reset.</p>
                            <div className="flex flex-col md:flex-row gap-4">
                                <div className="flex-1 relative">
                                    <Clock size={20} className="absolute left-5 top-1/2 -translate-y-1/2 text-gray-400" />
                                    <input
                                        type="time"
                                        value={choreResetTime}
                                        onChange={(e) => setChoreResetTime(e.target.value)}
                                        className="w-full pl-12 pr-6 py-4 rounded-2xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 text-lg text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary/50 transition-all"
                                    />
                                </div>
                                <div className="flex gap-3">
                                    <button
                                        onClick={saveChoreResetTime}
                                        className="flex-1 md:flex-none bg-primary text-white px-8 py-4 rounded-2xl font-bold text-lg hover:bg-primary/90 transition-all active:scale-95 flex items-center justify-center gap-3 shadow-lg shadow-primary/20"
                                    >
                                        <Save size={22} />
                                        Save
                                    </button>
                                    <button
                                        onClick={manualResetChores}
                                        className="flex-1 md:flex-none bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 border border-red-200 dark:border-red-800 px-8 py-4 rounded-2xl font-bold text-lg hover:bg-red-100 dark:hover:bg-red-900/30 transition-all active:scale-95 flex items-center justify-center gap-3 shadow-lg shadow-red-500/10"
                                    >
                                        <Trash2 size={22} />
                                        Reset Now
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>

                    <div className="bg-white dark:bg-gray-900 shadow-sm shadow-black/5 p-8 rounded-[2rem] border border-gray-100 dark:border-gray-800 space-y-8">
                        <div>
                            <label className="block text-base font-bold text-gray-900 dark:text-gray-100 mb-2 ml-1">Edit Passcode</label>
                            <p className="text-sm text-gray-500 dark:text-gray-400 mb-4 ml-1">Set a code to protect editing chores (leave empty for no protection).</p>
                            <div className="flex gap-4">
                                <div className="flex-1 relative">
                                    <Lock size={20} className="absolute left-5 top-1/2 -translate-y-1/2 text-gray-400" />
                                    <input
                                        type="text"
                                        inputMode="numeric"
                                        pattern="[0-9]*"
                                        value={editCode}
                                        onChange={(e) => setEditCode(e.target.value)}
                                        className="w-full pl-12 pr-6 py-4 rounded-2xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 text-lg text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary/50 transition-all placeholder:text-gray-400"
                                        placeholder="e.g. 1234"
                                    />
                                </div>
                                <button
                                    onClick={saveEditCode}
                                    className="bg-primary text-white px-8 py-4 rounded-2xl font-bold text-lg hover:bg-primary/90 transition-all active:scale-95 flex items-center gap-3 shadow-lg shadow-primary/20"
                                >
                                    <Save size={22} />
                                    Save
                                </button>
                            </div>
                        </div>
                    </div>

                    <div className="bg-white dark:bg-gray-900 shadow-sm shadow-black/5 p-8 rounded-[2rem] border border-gray-100 dark:border-gray-800 space-y-8">
                        <div>
                            <label className="block text-base font-bold text-gray-900 dark:text-gray-100 mb-3 ml-1">Screensaver Settings</label>
                            <div className="flex flex-col md:flex-row gap-4">
                                <div className="flex-1 flex gap-4">
                                    <input
                                        type="number"
                                        min="1"
                                        inputMode="numeric"
                                        value={screensaverTimeout}
                                        onChange={(e) => setScreensaverTimeout(e.target.value)}
                                        className="flex-1 px-6 py-4 rounded-2xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 text-lg text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary/50 transition-all"
                                        placeholder="Timeout (minutes)"
                                    />
                                    <button
                                        onClick={saveScreensaverTimeout}
                                        className="bg-primary text-white px-8 py-4 rounded-2xl font-bold text-lg hover:bg-primary/90 transition-all active:scale-95 flex items-center gap-3 shadow-lg shadow-primary/20 whitespace-nowrap"
                                    >
                                        <Save size={22} />
                                        Save Timeout
                                    </button>
                                </div>
                                <button
                                    onClick={triggerScreensaver}
                                    className="bg-charcoal dark:bg-gray-700 text-white px-8 py-4 rounded-2xl font-bold text-lg hover:bg-charcoal/90 dark:hover:bg-gray-600 transition-all active:scale-95 flex items-center justify-center gap-3 shadow-lg whitespace-nowrap"
                                >
                                    <Monitor size={22} />
                                    Go to Screensaver
                                </button>
                            </div>
                        </div>
                    </div>

                    <div className="bg-white dark:bg-gray-900 shadow-sm shadow-black/5 p-8 rounded-[2rem] border border-gray-100 dark:border-gray-800 space-y-8">
                        <div>
                            <label className="block text-base font-bold text-gray-900 dark:text-gray-100 mb-2 ml-1">Google Chat Webhook</label>
                            <p className="text-sm text-gray-500 dark:text-gray-400 mb-4 ml-1">Paste the webhook URL for your family chat space.</p>
                            <div className="flex gap-4">
                                <input
                                    type="url"
                                    value={webhookUrl}
                                    onChange={(e) => setWebhookUrl(e.target.value)}
                                    className="flex-1 px-6 py-4 rounded-2xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 text-lg text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary/50 transition-all placeholder:text-gray-400"
                                    placeholder="https://chat.googleapis.com..."
                                />
                                <button
                                    onClick={saveWebhookUrl}
                                    className="bg-primary text-white px-8 py-4 rounded-2xl font-bold text-lg hover:bg-primary/90 transition-all active:scale-95 flex items-center gap-3 shadow-lg shadow-primary/20"
                                >
                                    <Save size={22} />
                                    Save
                                </button>
                            </div>
                        </div>
                    </div>
                </div>

                <div className="space-y-8">
                    <div className="pl-1">
                        <h2 className="text-3xl font-extrabold text-gray-900 dark:text-white mb-2 tracking-tight">Family Members</h2>
                        <p className="text-base text-gray-500 dark:text-gray-400">Manage who appears on the chore chart and calendar.</p>
                    </div>

                    <div className="space-y-4">
                        {members.map(member => (
                            <div key={member.id} className="flex items-center justify-between p-5 bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700 rounded-[1.5rem] shadow-sm active:scale-[0.99] transition-transform duration-200">
                                {editingMember && editingMember.id === member.id ? (
                                    <div className="flex-1 flex items-center gap-4">
                                        <div className="flex-1 space-y-3">
                                            <input
                                                type="text"
                                                value={editingMember.name}
                                                onChange={(e) => setEditingMember({ ...editingMember, name: e.target.value })}
                                                className="w-full px-4 py-3 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-900 dark:text-white text-lg"
                                                placeholder="Name"
                                            />
                                            <input
                                                type="tel"
                                                value={editingMember.phone}
                                                onChange={(e) => setEditingMember({ ...editingMember, phone: e.target.value })}
                                                className="w-full px-4 py-3 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-900 dark:text-white text-lg"
                                                placeholder="Phone (+1...)"
                                            />
                                            <div className="flex gap-2">
                                                {COLORS.map(c => (
                                                    <button
                                                        key={c.value}
                                                        onClick={() => setEditingMember({ ...editingMember, color: c.value })}
                                                        className={`w-10 h-10 rounded-full ${c.hex} border-[3px] ${editingMember.color === c.value ? 'border-gray-600 dark:border-white' : 'border-transparent'}`}
                                                    />
                                                ))}
                                            </div>
                                        </div>
                                        <div className="flex flex-col gap-3">
                                            <button onClick={saveEditing} className="p-4 bg-green-100 text-green-700 rounded-xl hover:bg-green-200 active:scale-90 transition-all"><Check size={24} /></button>
                                            <button onClick={() => setEditingMember(null)} className="p-4 bg-gray-100 text-gray-600 rounded-xl hover:bg-gray-200 active:scale-90 transition-all"><X size={24} /></button>
                                        </div>
                                    </div>
                                ) : (
                                    <>
                                        <div className="flex items-center gap-5 min-w-0">
                                            <div className="relative group cursor-pointer" onClick={() => triggerFileInput(member.id)}>
                                                <UserAvatar member={member} size="xl" />
                                                <div className="absolute inset-0 bg-black/40 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                                                    <Upload size={20} className="text-white" />
                                                </div>
                                                <input
                                                    type="file"
                                                    ref={el => fileInputRefs.current[member.id] = el}
                                                    className="hidden"
                                                    accept="image/*"
                                                    onChange={(e) => handleAvatarUpload(member.id, e.target.files[0])}
                                                />
                                            </div>
                                            <div className="flex flex-col">
                                                <span className="font-bold text-xl text-gray-900 dark:text-white truncate mb-0.5">{member.name}</span>
                                                {member.phone && <span className="text-sm text-gray-400 dark:text-gray-500 font-medium">{member.phone}</span>}
                                            </div>
                                        </div>
                                        <div className="flex items-center gap-3">
                                            <button
                                                onClick={() => startEditing(member)}
                                                className="p-4 text-gray-400 hover:text-primary hover:bg-primary/10 rounded-2xl transition-all active:scale-90"
                                            >
                                                <Edit2 size={24} />
                                            </button>
                                            <button
                                                onClick={() => handleDeleteMember(member.id)}
                                                className="p-4 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-2xl transition-all active:scale-90"
                                            >
                                                <Trash2 size={24} />
                                            </button>
                                        </div>
                                    </>
                                )}
                            </div>
                        ))}

                        <form onSubmit={addMember} className="pt-6 space-y-6 bg-white dark:bg-gray-900 shadow-sm shadow-black/5 p-8 rounded-[2rem] border border-gray-100 dark:border-gray-800">
                            <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-2">Add New Member</h3>
                            <div className="flex gap-3 mb-4">
                                {COLORS.map(c => (
                                    <button
                                        key={c.value}
                                        type="button"
                                        onClick={() => setSelectedColor(c.value)}
                                        className={`w-12 h-12 rounded-full ${c.hex} border-[3px] transition-all ${selectedColor === c.value ? 'border-gray-600 dark:border-white scale-110' : 'border-transparent hover:scale-105'}`}
                                        title={c.label}
                                    />
                                ))}
                            </div>

                            <div className="flex flex-col md:flex-row gap-4">
                                <input
                                    type="text"
                                    value={newMemberName}
                                    onChange={(e) => setNewMemberName(e.target.value)}
                                    className="flex-1 px-6 py-4 rounded-2xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 text-lg text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary/50 transition-all"
                                    placeholder="Name"
                                />
                                <input
                                    type="tel"
                                    value={newMemberPhone}
                                    onChange={(e) => setNewMemberPhone(e.target.value)}
                                    className="flex-1 px-6 py-4 rounded-2xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 text-lg text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary/50 transition-all"
                                    placeholder="Phone"
                                />
                                <button
                                    type="submit"
                                    className="bg-primary text-white px-8 py-4 rounded-2xl font-bold text-lg hover:bg-primary/90 transition-all active:scale-95 flex items-center justify-center gap-3 shadow-lg shadow-primary/20"
                                >
                                    <Plus size={24} />
                                    Add
                                </button>
                            </div>
                        </form>
                    </div>
                </div>

                <div className="space-y-8">
                    <div className="pl-1">
                        <h2 className="text-3xl font-extrabold text-gray-900 dark:text-white mb-2 tracking-tight">Calendar Sync</h2>
                        <p className="text-base text-gray-500 dark:text-gray-400">Subscribe to external calendars (iCal).</p>
                    </div>
                    <CalendarSettings />
                </div>

                <div className="space-y-8 pb-32">
                    <div className="pl-1">
                        <h2 className="text-3xl font-extrabold text-gray-900 dark:text-white mb-2 tracking-tight">Screensaver Photos</h2>
                        <p className="text-base text-gray-500 dark:text-gray-400">Upload photos to display when the screen is idle.</p>
                    </div>
                    <PhotosSettings />
                </div>
            </div>
        </div>
    );
}

function PhotosSettings() {
    const [photos, setPhotos] = useState([]);
    const fileInputRef = useRef(null);
    const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
    const [pendingDeleteId, setPendingDeleteId] = useState(null);

    useEffect(() => {
        fetchPhotos();
    }, []);

    const fetchPhotos = () => {
        fetch('/api/photos')
            .then(res => res.json())
            .then(data => setPhotos(data || []))
            .catch(console.error);
    };

    const handleUpload = async (e) => {
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
            e.target.value = null; // reset input
        } catch (err) { console.error(err); }
    };

    const confirmDelete = async () => {
        if (!pendingDeleteId) return;
        try {
            await fetch(`/api/photos/${pendingDeleteId}`, { method: 'DELETE' });
            setPhotos(photos.filter(p => p.id !== pendingDeleteId));
            setPendingDeleteId(null);
        } catch (err) { console.error(err); }
    };

    const handleDelete = (id) => {
        setPendingDeleteId(id);
        setShowDeleteConfirm(true);
    };

    return (
        <div className="space-y-6">
            <ConfirmDialog
                isOpen={showDeleteConfirm}
                onClose={() => setShowDeleteConfirm(false)}
                onConfirm={confirmDelete}
                title="Remove Photo"
                message="Are you sure you want to remove this photo?"
                confirmText="Remove"
            />
            <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
                <div
                    onClick={() => fileInputRef.current?.click()}
                    className="aspect-square rounded-[1.5rem] border-4 border-dashed border-gray-200 dark:border-gray-800 flex flex-col items-center justify-center text-gray-400 dark:text-gray-600 cursor-pointer hover:border-primary hover:text-primary transition-colors bg-gray-50 dark:bg-gray-900/50 hover:bg-white dark:hover:bg-gray-900 active:scale-95"
                >
                    <Upload size={32} />
                    <span className="text-base font-bold mt-3">Upload</span>
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
                    <div key={photo.id} className="relative group aspect-square rounded-[1.5rem] overflow-hidden border border-gray-200 dark:border-gray-800 shadow-sm">
                        <img src={photo.url} alt="Screensaver" className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105" />
                        <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                            <button
                                onClick={() => handleDelete(photo.id)}
                                className="p-4 bg-white dark:bg-gray-800 rounded-full text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 active:scale-90 transition-all shadow-lg"
                            >
                                <Trash2 size={24} />
                            </button>
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
}
