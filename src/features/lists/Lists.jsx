import React, { useState, useEffect } from 'react';
import { ShoppingCart, CheckSquare, Plus, Trash2, Check, List as ListIcon } from 'lucide-react';
import { cn } from '../../lib/utils';

export function Lists() {
    const [lists, setLists] = useState([]);
    const [activeList, setActiveList] = useState(null);
    const [items, setItems] = useState([]);
    const [loading, setLoading] = useState(true);
    const [newItemText, setNewItemText] = useState('');
    const [showNewListInput, setShowNewListInput] = useState(false);
    const [newListTitle, setNewListTitle] = useState('');

    // Fetch Lists
    useEffect(() => {
        fetch('/api/lists')
            .then(res => res.json())
            .then(data => {
                setLists(data);
                if (data.length > 0) setActiveList(data[0]);
                setLoading(false);
            });
    }, []);

    // Fetch Items when Active List Changes
    useEffect(() => {
        if (activeList) {
            fetch(`/api/lists/${activeList.id}/items`)
                .then(res => res.json())
                .then(setItems);
        }
    }, [activeList]);

    const addItem = async (e) => {
        e.preventDefault();
        if (!newItemText.trim() || !activeList) return;

        try {
            const res = await fetch('/api/items', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ list_id: activeList.id, text: newItemText })
            });
            const newItem = await res.json();
            setItems([...items, newItem]);
            setNewItemText('');
        } catch (err) {
            console.error(err);
        }
    };

    const toggleItem = async (id, currentStatus) => {
        // Optimistic update
        const updatedItems = items.map(i => i.id === id ? { ...i, completed: !currentStatus } : i);
        setItems(updatedItems);

        try {
            await fetch(`/api/items/${id}/toggle`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ completed: !currentStatus })
            });
        } catch (err) {
            console.error(err);
        }
    };

    const deleteItem = async (id) => {
        const updatedItems = items.filter(i => i.id !== id);
        setItems(updatedItems);
        try {
            await fetch(`/api/items/${id}`, { method: 'DELETE' });
        } catch (err) {
            console.error(err);
        }
    };

    const createList = async (e) => {
        e.preventDefault();
        if (!newListTitle.trim()) return;

        try {
            const res = await fetch('/api/lists', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ title: newListTitle, icon: 'list' })
            });
            const newList = await res.json();
            setLists([...lists, newList]);
            setActiveList(newList);
            setNewListTitle('');
            setShowNewListInput(false);
        } catch (err) {
            console.error(err);
        }
    };

    const getIcon = (iconName) => {
        if (iconName === 'shopping-cart') return <ShoppingCart size={20} />;
        if (iconName === 'check-square') return <CheckSquare size={20} />;
        return <ListIcon size={20} />;
    };

    if (loading) return <div className="p-8">Loading lists...</div>;

    return (
        <div className="flex h-full bg-white">
            {/* Sidebar */}
            <div className="w-1/4 min-w-[250px] bg-gray-50 border-r border-gray-100 p-6 flex flex-col">
                <h2 className="text-xl font-bold text-gray-800 mb-6 px-2">My Lists</h2>

                <div className="space-y-2 flex-1 overflow-y-auto">
                    {lists.map(list => (
                        <button
                            key={list.id}
                            onClick={() => setActiveList(list)}
                            className={cn(
                                "w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all text-left",
                                activeList?.id === list.id ? "bg-white shadow-sm ring-1 ring-gray-100 text-charcoal font-semibold" : "text-gray-500 hover:bg-gray-100/50 hover:text-gray-700"
                            )}
                        >
                            <span className={activeList?.id === list.id ? "text-sky-blue" : "text-gray-400"}>
                                {getIcon(list.icon)}
                            </span>
                            {list.title}
                        </button>
                    ))}
                </div>

                <div className="pt-4 border-t border-gray-100">
                    {showNewListInput ? (
                        <form onSubmit={createList} className="space-y-2">
                            <input
                                type="text"
                                placeholder="List Name"
                                className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:border-sky-blue"
                                value={newListTitle}
                                onChange={e => setNewListTitle(e.target.value)}
                                autoFocus
                            />
                            <div className="flex gap-2">
                                <button type="submit" className="flex-1 bg-charcoal text-white text-xs py-2 rounded-lg font-bold">Add</button>
                                <button type="button" onClick={() => setShowNewListInput(false)} className="flex-1 bg-gray-100 text-gray-500 text-xs py-2 rounded-lg font-bold">Cancel</button>
                            </div>
                        </form>
                    ) : (
                        <button
                            onClick={() => setShowNewListInput(true)}
                            className="w-full flex items-center justify-center gap-2 text-sm font-bold text-gray-500 hover:text-sky-blue bg-white border border-gray-200 hover:border-sky-blue py-3 rounded-xl transition-all"
                        >
                            <Plus size={16} />
                            New List
                        </button>
                    )}
                </div>
            </div>

            {/* Main Content */}
            <div className="flex-1 flex flex-col h-full bg-white">
                {activeList ? (
                    <>
                        <div className="px-8 py-6 border-b border-gray-100 flex items-center justify-between">
                            <h2 className="text-2xl font-bold text-charcoal flex items-center gap-3">
                                <span className="text-sky-blue">{getIcon(activeList.icon)}</span>
                                {activeList.title}
                            </h2>
                        </div>

                        <div className="flex-1 p-8 overflow-y-auto">
                            <div className="max-w-3xl mx-auto space-y-3">
                                {/* Add Item Input */}
                                <form onSubmit={addItem} className="relative mb-6">
                                    <input
                                        type="text"
                                        className="w-full pl-5 pr-14 py-4 bg-gray-50 border border-gray-100 rounded-2xl text-lg focus:outline-none focus:ring-2 focus:ring-sky-blue/30 focus:bg-white transition-all placeholder:text-gray-400"
                                        placeholder={`Add to ${activeList.title}...`}
                                        value={newItemText}
                                        onChange={e => setNewItemText(e.target.value)}
                                    />
                                    <button
                                        type="submit"
                                        className="absolute right-3 top-1/2 -translate-y-1/2 p-2 bg-sky-blue text-charcoal rounded-xl hover:scale-105 active:scale-95 transition-all shadow-md shadow-sky-blue/20"
                                        disabled={!newItemText.trim()}
                                    >
                                        <Plus size={20} />
                                    </button>
                                </form>

                                {/* Items List */}
                                <div className="space-y-2">
                                    {items.map(item => (
                                        <div
                                            key={item.id}
                                            className="group flex items-center gap-4 p-4 bg-white border border-gray-100 rounded-2xl hover:border-gray-200 hover:shadow-sm transition-all animate-in fade-in slide-in-from-bottom-2 duration-200"
                                        >
                                            <button
                                                onClick={() => toggleItem(item.id, item.completed)}
                                                className={cn(
                                                    "w-8 h-8 rounded-full border-2 flex items-center justify-center transition-all",
                                                    item.completed ? "bg-sage-green border-sage-green text-white" : "border-gray-200 text-transparent hover:border-sage-green"
                                                )}
                                            >
                                                <Check size={16} strokeWidth={3} />
                                            </button>

                                            <span className={cn(
                                                "flex-1 text-lg font-medium transition-all select-none",
                                                item.completed ? "text-gray-300 line-through decoration-2 decoration-gray-200" : "text-gray-700"
                                            )}>
                                                {item.text}
                                            </span>

                                            <button
                                                onClick={() => deleteItem(item.id)}
                                                className="p-2 text-gray-300 hover:text-red-400 hover:bg-red-50 rounded-xl opacity-0 group-hover:opacity-100 transition-all font-bold"
                                            >
                                                <Trash2 size={18} />
                                            </button>
                                        </div>
                                    ))}

                                    {items.length === 0 && (
                                        <div className="text-center py-20 text-gray-300">
                                            <div className="w-16 h-16 bg-gray-50 rounded-full flex items-center justify-center mx-auto mb-4 text-gray-300">
                                                <ListIcon size={32} />
                                            </div>
                                            <p>Your list is empty. Add something above!</p>
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>
                    </>
                ) : (
                    <div className="flex-1 flex items-center justify-center text-gray-400">Select a list to view items</div>
                )}
            </div>
        </div>
    );
}
