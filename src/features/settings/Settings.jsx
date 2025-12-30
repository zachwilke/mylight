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
        <div className="h-full overflow-y-auto">
            <ConfirmDialog
                isOpen={showDeleteConfirm}
                onClose={() => setShowDeleteConfirm(false)}
                onConfirm={confirmDeleteMember}
                title="Delete Family Member"
                message="Are you sure you want to delete this member? All their assigned chores and events will be deleted as well."
            />
            <div className="max-w-3xl mx-auto p-4 md:p-8 space-y-8 md:space-y-12">
                <div className="space-y-6">
                    <div>
                        <h2 className="text-2xl font-bold text-gray-800 dark:text-gray-100 mb-2">General Settings</h2>
                        <p className="text-gray-500 dark:text-gray-400 text-sm">Update your family's profile and preferences.</p>
                    </div>

                    <div className="bg-gray-50 dark:bg-gray-900/50 p-6 rounded-2xl border border-gray-100 dark:border-gray-800 space-y-4">
                        <div>
                            <label className="block text-sm font-bold text-gray-700 dark:text-gray-300 mb-2">Family Name</label>
                            <div className="flex gap-3">
                                <input
                                    type="text"
                                    value={familyName}
                                    onChange={(e) => setFamilyName(e.target.value)}
                                    className="flex-1 px-4 py-3 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-primary/50"
                                    placeholder="e.g. The Miller Family"
                                />
                                <button
                                    onClick={saveFamilyName}
                                    className="bg-primary text-white px-6 py-3 rounded-xl font-medium hover:bg-primary/90 transition-colors flex items-center gap-2 shadow-sm shadow-primary/20"
                                >
                                    <Save size={18} />
                                    Save
                                </button>
                            </div>
                        </div>

                        <div>
                            <label className="block text-sm font-bold text-gray-700 dark:text-gray-300 mb-2">Display Theme</label>
                            <div className="flex gap-3">
                                {[
                                    { id: 'light', label: 'Light', icon: Sun },
                                    { id: 'dark', label: 'Dark', icon: Moon },
                                    { id: 'system', label: 'System', icon: Monitor },
                                ].map((option) => (
                                    <button
                                        key={option.id}
                                        onClick={() => setTheme(option.id)}
                                        className={`flex-1 flex items-center justify-center gap-2 px-4 py-3 rounded-xl border transition-all ${theme === option.id
                                            ? 'bg-primary text-white border-primary shadow-sm shadow-primary/20'
                                            : 'bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-400 border-gray-200 dark:border-gray-700 hover:border-primary/50'
                                            }`}
                                    >
                                        <option.icon size={18} />
                                        <span className="font-medium">{option.label}</span>
                                    </button>
                                ))}
                            </div>
                        </div>

                        <div>
                            <label className="block text-sm font-bold text-gray-700 dark:text-gray-300 mb-2">Weather Location (Coordinates)</label>
                            <div className="flex gap-3">
                                <div className="flex-1 flex gap-3">
                                    <div className="flex-1 relative">
                                        <MapPin size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                                        <input
                                            type="text"
                                            value={latitude}
                                            onChange={(e) => setLatitude(e.target.value)}
                                            className="w-full pl-9 pr-4 py-3 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-primary/50"
                                            placeholder="Lat"
                                        />
                                    </div>
                                    <div className="flex-1 relative">
                                        <MapPin size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                                        <input
                                            type="text"
                                            value={longitude}
                                            onChange={(e) => setLongitude(e.target.value)}
                                            className="w-full pl-9 pr-4 py-3 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-primary/50"
                                            placeholder="Lng"
                                        />
                                    </div>
                                </div>
                                <button
                                    onClick={saveLocation}
                                    className="bg-primary text-white px-6 py-3 rounded-xl font-medium hover:bg-primary/90 transition-colors flex items-center gap-2 shadow-sm shadow-primary/20"
                                >
                                    <Save size={18} />
                                    Save
                                </button>
                            </div>
                        </div>
                    </div>

                    <div className="bg-gray-50 dark:bg-gray-900/50 p-6 rounded-2xl border border-gray-100 dark:border-gray-800 space-y-4">
                        <div>
                            <label className="block text-sm font-bold text-gray-700 dark:text-gray-300 mb-2">Chore Reset Time</label>
                            <p className="text-xs text-gray-500 dark:text-gray-400 mb-2">Set the time when chores automatically reset.</p>
                            <div className="flex gap-3">
                                <div className="flex-1 relative">
                                    <Clock size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                                    <input
                                        type="time"
                                        value={choreResetTime}
                                        onChange={(e) => setChoreResetTime(e.target.value)}
                                        className="w-full pl-9 pr-4 py-3 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-primary/50"
                                    />
                                </div>
                                <button
                                    onClick={saveChoreResetTime}
                                    className="bg-primary text-white px-6 py-3 rounded-xl font-medium hover:bg-primary/90 transition-colors flex items-center gap-2 shadow-sm shadow-primary/20"
                                >
                                    <Save size={18} />
                                    Save
                                </button>
                            </div>
                        </div>
                    </div>

                    <div className="bg-gray-50 dark:bg-gray-900/50 p-6 rounded-2xl border border-gray-100 dark:border-gray-800 space-y-4">
                        <div>
                            <label className="block text-sm font-bold text-gray-700 dark:text-gray-300 mb-2">Edit Passcode</label>
                            <p className="text-xs text-gray-500 dark:text-gray-400 mb-2">Set a code to protect editing chores (leave empty for no protection).</p>
                            <div className="flex gap-3">
                                <div className="flex-1 relative">
                                    <Lock size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                                    <input
                                        type="text"
                                        value={editCode}
                                        onChange={(e) => setEditCode(e.target.value)}
                                        className="w-full pl-9 pr-4 py-3 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-primary/50"
                                        placeholder="e.g. 1234"
                                    />
                                </div>
                                <button
                                    onClick={saveEditCode}
                                    className="bg-primary text-white px-6 py-3 rounded-xl font-medium hover:bg-primary/90 transition-colors flex items-center gap-2 shadow-sm shadow-primary/20"
                                >
                                    <Save size={18} />
                                    Save
                                </button>
                            </div>
                        </div>
                    </div>

                    <div className="bg-gray-50 dark:bg-gray-900/50 p-6 rounded-2xl border border-gray-100 dark:border-gray-800 space-y-4">
                        <div>
                            <label className="block text-sm font-bold text-gray-700 dark:text-gray-300 mb-2">Screensaver Settings</label>
                            <div className="flex flex-col md:flex-row gap-3">
                                <div className="flex-1 flex gap-3">
                                    <input
                                        type="number"
                                        min="1"
                                        value={screensaverTimeout}
                                        onChange={(e) => setScreensaverTimeout(e.target.value)}
                                        className="flex-1 px-4 py-3 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-primary/50"
                                        placeholder="Timeout (minutes)"
                                    />
                                    <button
                                        onClick={saveScreensaverTimeout}
                                        className="bg-primary text-white px-6 py-3 rounded-xl font-medium hover:bg-primary/90 transition-colors flex items-center gap-2 shadow-sm shadow-primary/20 whitespace-nowrap"
                                    >
                                        <Save size={18} />
                                        Save Timeout
                                    </button>
                                </div>
                                <button
                                    onClick={triggerScreensaver}
                                    className="bg-charcoal dark:bg-gray-700 text-white px-6 py-3 rounded-xl font-medium hover:bg-charcoal/90 dark:hover:bg-gray-600 transition-colors flex items-center justify-center gap-2 shadow-sm whitespace-nowrap"
                                >
                                    <Monitor size={18} />
                                    Go to Screensaver
                                </button>
                            </div>
                        </div>
                    </div>

                    <div className="bg-gray-50 dark:bg-gray-900/50 p-6 rounded-2xl border border-gray-100 dark:border-gray-800 space-y-4">
                        <div>
                            <label className="block text-sm font-bold text-gray-700 dark:text-gray-300 mb-2">Google Chat Webhook</label>
                            <p className="text-xs text-gray-500 dark:text-gray-400 mb-2">Paste the webhook URL for your family chat space.</p>
                            <div className="flex gap-3">
                                <input
                                    type="text"
                                    value={webhookUrl}
                                    onChange={(e) => setWebhookUrl(e.target.value)}
                                    className="flex-1 px-4 py-3 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-primary/50"
                                    placeholder="https://chat.googleapis.com..."
                                />
                                <button
                                    onClick={saveWebhookUrl}
                                    className="bg-primary text-white px-6 py-3 rounded-xl font-medium hover:bg-primary/90 transition-colors flex items-center gap-2 shadow-sm shadow-primary/20"
                                >
                                    <Save size={18} />
                                    Save
                                </button>
                            </div>
                        </div>
                    </div>
                </div>

                <div className="space-y-6">
                    <div>
                        <h2 className="text-2xl font-bold text-gray-800 dark:text-gray-100 mb-2">Family Members</h2>
                        <p className="text-gray-500 dark:text-gray-400 text-sm">Manage who appears on the chore chart and calendar. Add phone numbers to enable SMS sharing.</p>
                    </div>

                    <div className="space-y-3">
                        {members.map(member => (
                            <div key={member.id} className="flex items-center justify-between p-4 bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700 rounded-xl shadow-sm">
                                {editingMember && editingMember.id === member.id ? (
                                    <div className="flex-1 flex items-center gap-3">
                                        <div className="flex-1 space-y-2">
                                            <input
                                                type="text"
                                                value={editingMember.name}
                                                onChange={(e) => setEditingMember({ ...editingMember, name: e.target.value })}
                                                className="w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 text-sm"
                                                placeholder="Name"
                                            />
                                            <input
                                                type="text"
                                                value={editingMember.phone}
                                                onChange={(e) => setEditingMember({ ...editingMember, phone: e.target.value })}
                                                className="w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 text-sm"
                                                placeholder="Phone (+1...)"
                                            />
                                            <div className="flex gap-1">
                                                {COLORS.map(c => (
                                                    <button
                                                        key={c.value}
                                                        onClick={() => setEditingMember({ ...editingMember, color: c.value })}
                                                        className={`w-6 h-6 rounded-full ${c.hex} border-2 ${editingMember.color === c.value ? 'border-gray-600 dark:border-white' : 'border-transparent'}`}
                                                    />
                                                ))}
                                            </div>
                                        </div>
                                        <div className="flex flex-col gap-2">
                                            <button onClick={saveEditing} className="p-2 bg-green-100 text-green-700 rounded-lg hover:bg-green-200"><Check size={16} /></button>
                                            <button onClick={() => setEditingMember(null)} className="p-2 bg-gray-100 text-gray-600 rounded-lg hover:bg-gray-200"><X size={16} /></button>
                                        </div>
                                    </div>
                                ) : (
                                    <>
                                        <div className="flex items-center gap-4 min-w-0">
                                            <div className="relative group cursor-pointer" onClick={() => triggerFileInput(member.id)}>
                                                <UserAvatar member={member} size="md" />
                                                <div className="absolute inset-0 bg-black/40 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                                                    <Upload size={14} className="text-white" />
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
                                                <span className="font-semibold text-gray-800 dark:text-gray-200 truncate">{member.name}</span>
                                                {member.phone && <span className="text-xs text-gray-400 dark:text-gray-500">{member.phone}</span>}
                                            </div>
                                        </div>
                                        <div className="flex items-center gap-2">
                                            <button
                                                onClick={() => startEditing(member)}
                                                className="p-2 text-gray-400 hover:text-primary hover:bg-primary/10 rounded-lg transition-colors"
                                            >
                                                <Edit2 size={18} />
                                            </button>
                                            <button
                                                onClick={() => handleDeleteMember(member.id)}
                                                className="p-2 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                                            >
                                                <Trash2 size={18} />
                                            </button>
                                        </div>
                                    </>
                                )}
                            </div>
                        ))}

                        <form onSubmit={addMember} className="pt-4 space-y-4 bg-gray-50 dark:bg-gray-900/50 p-4 rounded-xl border border-gray-200/50 dark:border-gray-800">
                            <h3 className="text-sm font-bold text-gray-700 dark:text-gray-300">Add New Member</h3>
                            <div className="flex gap-2">
                                {COLORS.map(c => (
                                    <button
                                        key={c.value}
                                        type="button"
                                        onClick={() => setSelectedColor(c.value)}
                                        className={`w-8 h-8 rounded-full ${c.hex} border-2 transition-all ${selectedColor === c.value ? 'border-gray-600 dark:border-white scale-110' : 'border-transparent hover:scale-105'}`}
                                        title={c.label}
                                    />
                                ))}
                            </div>

                            <div className="flex flex-col md:flex-row gap-3">
                                <input
                                    type="text"
                                    value={newMemberName}
                                    onChange={(e) => setNewMemberName(e.target.value)}
                                    className="flex-1 px-4 py-3 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-primary/50"
                                    placeholder="Name"
                                />
                                <input
                                    type="text"
                                    value={newMemberPhone}
                                    onChange={(e) => setNewMemberPhone(e.target.value)}
                                    className="flex-1 px-4 py-3 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-primary/50"
                                    placeholder="Phone (e.g. +1...)"
                                />
                                <button
                                    type="submit"
                                    className="bg-primary text-white px-6 py-3 rounded-xl font-medium hover:bg-primary/90 transition-colors flex items-center justify-center gap-2 shadow-sm shadow-primary/20"
                                >
                                    <Plus size={18} />
                                    Add
                                </button>
                            </div>
                        </form>
                    </div>
                </div>

                <div className="space-y-6">
                    <div>
                        <h2 className="text-2xl font-bold text-gray-800 dark:text-gray-100 mb-2">Calendar Sync</h2>
                        <p className="text-gray-500 dark:text-gray-400 text-sm">Subscribe to external calendars (iCal).</p>
                    </div>
                    <CalendarSettings />
                </div>

                <div className="space-y-6 pb-12">
                    <div>
                        <h2 className="text-2xl font-bold text-gray-800 dark:text-gray-100 mb-2">Screensaver Photos</h2>
                        <p className="text-gray-500 dark:text-gray-400 text-sm">Upload photos to display when the screen is idle.</p>
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
        <div className="space-y-4">
            <ConfirmDialog
                isOpen={showDeleteConfirm}
                onClose={() => setShowDeleteConfirm(false)}
                onConfirm={confirmDelete}
                title="Remove Photo"
                message="Are you sure you want to remove this photo?"
                confirmText="Remove"
            />
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div
                    onClick={() => fileInputRef.current?.click()}
                    className="aspect-square rounded-xl border-2 border-dashed border-gray-300 dark:border-gray-700 flex flex-col items-center justify-center text-gray-400 dark:text-gray-600 cursor-pointer hover:border-primary hover:text-primary transition-colors bg-gray-50 dark:bg-gray-900/50 hover:bg-white dark:hover:bg-gray-900"
                >
                    <Upload size={24} />
                    <span className="text-sm font-medium mt-2">Upload</span>
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
                    <div key={photo.id} className="relative group aspect-square rounded-xl overflow-hidden border border-gray-200 dark:border-gray-800">
                        <img src={photo.url} alt="Screensaver" className="w-full h-full object-cover" />
                        <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                            <button
                                onClick={() => handleDelete(photo.id)}
                                className="p-2 bg-white dark:bg-gray-800 rounded-full text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20"
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
