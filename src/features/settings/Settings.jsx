import React, { useState, useEffect, useRef } from 'react';
import { Plus, Trash2, Save, User, Upload } from 'lucide-react';
import { UserAvatar } from '../../components/UserAvatar';

const COLORS = [
    { label: 'Blue', value: 'bg-blue-100 text-blue-800', hex: 'bg-blue-100' },
    { label: 'Pink', value: 'bg-pink-100 text-pink-800', hex: 'bg-pink-100' },
    { label: 'Green', value: 'bg-green-100 text-green-800', hex: 'bg-green-100' },
    { label: 'Purple', value: 'bg-purple-100 text-purple-800', hex: 'bg-purple-100' },
    { label: 'Orange', value: 'bg-orange-100 text-orange-800', hex: 'bg-orange-100' },
    { label: 'Teal', value: 'bg-teal-100 text-teal-800', hex: 'bg-teal-100' },
];

export function Settings() {
    const [familyName, setFamilyName] = useState('');
    const [location, setLocation] = useState('');
    const [members, setMembers] = useState([]);
    const [loading, setLoading] = useState(true);
    const [newMemberName, setNewMemberName] = useState('');
    const [selectedColor, setSelectedColor] = useState(COLORS[0].value);

    // Fetch initial data
    useEffect(() => {
        Promise.all([
            fetch('/api/settings').then(res => res.json()),
            fetch('/api/family').then(res => res.json())
        ]).then(([settingsData, familyData]) => {
            if (settingsData.family_name) setFamilyName(settingsData.family_name);
            if (settingsData.weather_location) setLocation(settingsData.weather_location);
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

    const saveLocation = async () => {
        try {
            await fetch('/api/settings', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ key: 'weather_location', value: location })
            });
            window.location.reload();
        } catch (err) {
            console.error(err);
        }
    };

    const addMember = async (e) => {
        e.preventDefault();
        if (!newMemberName.trim()) return;

        try {
            const res = await fetch('/api/family', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name: newMemberName, color: selectedColor })
            });
            const newMember = await res.json();
            setMembers([...members, newMember]);
            setNewMemberName('');
            setSelectedColor(COLORS[0].value); // Reset
        } catch (err) {
            console.error(err);
        }
    };

    const deleteMember = async (id) => {
        if (!window.confirm("Delete this member? Current chores/events may break.")) return;
        try {
            await fetch(`/api/family/${id}`, { method: 'DELETE' });
            setMembers(members.filter(m => m.id !== id));
        } catch (err) {
            console.error(err);
        }
    };

    // Layout and State Refs
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
            <div className="max-w-3xl mx-auto p-4 md:p-8 space-y-8 md:space-y-12">
                <div className="space-y-6">
                    <div>
                        <h2 className="text-2xl font-bold text-gray-800 mb-2">General Settings</h2>
                        <p className="text-gray-500 text-sm">Update your family's profile and preferences.</p>
                    </div>

                    <div className="bg-gray-50 p-6 rounded-2xl border border-gray-100 space-y-4">
                        <div>
                            <label className="block text-sm font-bold text-gray-700 mb-2">Family Name</label>
                            <div className="flex gap-3">
                                <input
                                    type="text"
                                    value={familyName}
                                    onChange={(e) => setFamilyName(e.target.value)}
                                    className="flex-1 px-4 py-3 rounded-xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-primary/50"
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
                            <label className="block text-sm font-bold text-gray-700 mb-2">Location (City)</label>
                            <div className="flex gap-3">
                                <input
                                    type="text"
                                    value={location}
                                    onChange={(e) => setLocation(e.target.value)}
                                    className="flex-1 px-4 py-3 rounded-xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-primary/50"
                                    placeholder="e.g. New York"
                                />
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
                </div>

                <div className="space-y-6">
                    <div>
                        <h2 className="text-2xl font-bold text-gray-800 mb-2">Family Members</h2>
                        <p className="text-gray-500 text-sm">Manage who appears on the chore chart and calendar.</p>
                    </div>

                    <div className="space-y-3">
                        {members.map(member => (
                            <div key={member.id} className="flex items-center justify-between p-4 bg-white border border-gray-100 rounded-xl shadow-sm">
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
                                    <span className="font-semibold text-gray-800 truncate">{member.name}</span>
                                </div>
                                <button
                                    onClick={() => deleteMember(member.id)}
                                    className="p-2 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                                >
                                    <Trash2 size={18} />
                                </button>
                            </div>
                        ))}

                        <form onSubmit={addMember} className="pt-4 space-y-4">
                            <div className="flex gap-2">
                                {COLORS.map(c => (
                                    <button
                                        key={c.value}
                                        type="button"
                                        onClick={() => setSelectedColor(c.value)}
                                        className={`w-8 h-8 rounded-full ${c.hex} border-2 transition-all ${selectedColor === c.value ? 'border-gray-600 scale-110' : 'border-transparent hover:scale-105'}`}
                                        title={c.label}
                                    />
                                ))}
                            </div>

                            <div className="flex gap-3">
                                <input
                                    type="text"
                                    value={newMemberName}
                                    onChange={(e) => setNewMemberName(e.target.value)}
                                    className="flex-1 px-4 py-3 rounded-xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-primary/50"
                                    placeholder="Add new member name..."
                                />
                                <button
                                    type="submit"
                                    className="bg-primary text-white px-6 py-3 rounded-xl font-medium hover:bg-primary/90 transition-colors flex items-center gap-2 shadow-sm shadow-primary/20"
                                >
                                    <Plus size={18} />
                                    Add
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            </div>
        </div>
    );

}
