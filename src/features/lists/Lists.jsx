import React, { useState, useEffect } from 'react';
import { ShoppingCart, CheckSquare, Plus, Trash2, List as ListIcon, Loader2, Share2, Check, ChevronDown, ChevronRight } from 'lucide-react';
import { cn } from '../../lib/utils';
import { UserAvatar } from '../../components/UserAvatar';

const LIST_COLORS = {
    'shopping-cart': 'bg-orange-400 text-white',
    'check-square': 'bg-blue-500 text-white',
    'list': 'bg-green-500 text-white',
    'default': 'bg-gray-400 text-white'
};

const TEXT_COLORS = {
    'shopping-cart': 'text-orange-400',
    'check-square': 'text-blue-500',
    'list': 'text-green-500',
    'default': 'text-gray-400'
};

export function Lists() {
    const [lists, setLists] = useState([]);
    const [activeList, setActiveList] = useState(null);
    const [items, setItems] = useState([]);
    const [loading, setLoading] = useState(true);
    const [newItemText, setNewItemText] = useState('');
    const [showNewListInput, setShowNewListInput] = useState(false);
    const [newListTitle, setNewListTitle] = useState('');
    const [showCompleted, setShowCompleted] = useState(false);

    // Chat Features
    const [sendingChat, setSendingChat] = useState(false);
    const [chatStatus, setChatStatus] = useState(null);

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

    const sendToChat = async () => {
        setSendingChat(true);
        setChatStatus(null);

        const incompleteItems = items.filter(i => !i.completed).map(i => `- ${i.text}`);
        const text = `*${activeList.title} List from MyLight:*\n\n${incompleteItems.join('\n')}`;

        try {
            const res = await fetch('/api/chat/send', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ text })
            });
            const data = await res.json();
            if (data.success) {
                setChatStatus('success');
                setTimeout(() => setChatStatus(null), 3000);
            } else {
                setChatStatus('error');
            }
        } catch (err) {
            console.error(err);
            setChatStatus('error');
        } finally {
            setSendingChat(false);
        }
    };

    const getIcon = (iconName) => {
        if (iconName === 'shopping-cart') return <ShoppingCart size={16} strokeWidth={2.5} />;
        if (iconName === 'check-square') return <CheckSquare size={16} strokeWidth={2.5} />;
        return <ListIcon size={16} strokeWidth={2.5} />;
    };

    const getColorClass = (iconName) => LIST_COLORS[iconName] || LIST_COLORS['default'];
    const getTextColorClass = (iconName) => TEXT_COLORS[iconName] || TEXT_COLORS['default'];

    if (loading) return <div className="p-8">Loading lists...</div>;

    const incompleteItems = items.filter(i => !i.completed);
    const completedItems = items.filter(i => i.completed);

    return (
        <div className="flex flex-col md:flex-row h-full bg-[#F2F2F7] dark:bg-gray-950 md:bg-[#F2F2F7] dark:md:bg-gray-950 relative">
            {/* Sidebar */}
            <div className="w-full md:w-[280px] bg-[#F2F2F7] dark:bg-gray-950 flex flex-col pt-6 md:pt-8 md:h-full border-r border-gray-300/50 dark:border-gray-800 shrink-0">
                <div className="px-4 mb-2">
                    <h2 className="text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wide px-2 mb-2">My Lists</h2>
                </div>

                <div className="flex md:flex-col overflow-x-auto md:overflow-visible px-4 gap-1 pb-4 md:pb-0 scrollbar-hide">
                    {lists.map(list => (
                        <button
                            key={list.id}
                            onClick={() => setActiveList(list)}
                            className={cn(
                                "flex items-center gap-3 px-3 py-2 rounded-lg transition-all text-left shrink-0 group relative",
                                activeList?.id === list.id ? "bg-[#dcdce1] dark:bg-gray-800" : "hover:bg-[#eaeaee] dark:hover:bg-gray-900"
                            )}
                        >
                            <div className={cn(
                                "w-7 h-7 rounded-full flex items-center justify-center shadow-sm",
                                getColorClass(list.icon)
                            )}>
                                {getIcon(list.icon)}
                            </div>
                            <span className="text-[15px] font-medium text-gray-700 dark:text-gray-300 flex-1 truncate">{list.title}</span>
                        </button>
                    ))}

                    {!showNewListInput ? (
                        <button
                            onClick={() => setShowNewListInput(true)}
                            className="flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-[#eaeaee] dark:hover:bg-gray-900 text-gray-500 dark:text-gray-400 transition-all shrink-0"
                        >
                            <div className="w-7 h-7 rounded-full bg-gray-300 dark:bg-gray-700 text-white dark:text-gray-300 flex items-center justify-center">
                                <Plus size={16} strokeWidth={3} />
                            </div>
                            <span className="text-[15px] font-medium">Add List</span>
                        </button>
                    ) : (
                        <form onSubmit={createList} className="px-3 bg-white dark:bg-gray-800 rounded-lg shadow-sm p-2 animate-in zoom-in-95">
                            <input
                                autoFocus
                                className="w-full text-sm outline-none bg-transparent dark:text-gray-100 dark:placeholder:text-gray-500"
                                placeholder="List Name"
                                value={newListTitle}
                                onChange={e => setNewListTitle(e.target.value)}
                                onBlur={() => !newListTitle && setShowNewListInput(false)}
                            />
                        </form>
                    )}
                </div>
            </div>

            {/* Main Content */}
            <div className="flex-1 flex flex-col h-full bg-white dark:bg-gray-900 relative">
                {activeList ? (
                    <div className="flex flex-col h-full max-w-4xl mx-auto w-full">
                        {/* Header */}
                        <div className="p-8 pb-4 flex items-center justify-between shrink-0">
                            <h1 className={cn("text-3xl font-bold tracking-tight", getTextColorClass(activeList.icon))}>
                                {activeList.title}
                            </h1>
                            <div className="flex items-center gap-2">
                                {chatStatus === 'success' && <span className="text-sm text-green-500 font-medium animate-in fade-in">Sent!</span>}
                                {chatStatus === 'error' && <span className="text-sm text-red-500 font-medium animate-in fade-in">Failed</span>}
                                {chatStatus !== 'success' && (
                                    <button
                                        onClick={sendToChat}
                                        disabled={sendingChat}
                                        className="text-blue-500 hover:bg-blue-50 rounded-full p-2 transition-colors disabled:opacity-50"
                                        title="Share to Google Chat"
                                    >
                                        {sendingChat ? <Loader2 size={24} className="animate-spin" /> : <Share2 size={24} />}
                                    </button>
                                )}
                            </div>
                        </div>

                        {/* List Items */}
                        <div className="flex-1 overflow-y-auto px-8 pb-32">
                            {/* Incomplete */}
                            <div className="space-y-0.5">
                                {incompleteItems.map(item => (
                                    <div key={item.id} className="group flex items-start gap-4 py-3 border-b border-gray-100 dark:border-gray-800 items-center">
                                        <button
                                            onClick={() => toggleItem(item.id, item.completed)}
                                            className={cn(
                                                "w-5 h-5 rounded-full border-[1.5px] transition-all flex items-center justify-center shrink-0 mt-0.5",
                                                "border-gray-300 dark:border-gray-600 hover:border-gray-400 dark:hover:border-gray-500 text-transparent"
                                            )}
                                        >
                                            {/* Empty Circle usually for incomplete */}
                                        </button>
                                        <span className="text-[17px] text-gray-800 dark:text-gray-200 flex-1 leading-snug">{item.text}</span>
                                        <button onClick={() => deleteItem(item.id)} className="text-gray-300 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity">
                                            <Trash2 size={16} />
                                        </button>
                                    </div>
                                ))}
                            </div>

                            {/* New Item Input (Inline Style) */}
                            <form onSubmit={addItem} className="flex items-center gap-4 py-3 border-b border-transparent">
                                <Plus size={20} className="text-gray-300 dark:text-gray-600" />
                                <input
                                    className="flex-1 text-[17px] outline-none bg-transparent placeholder:text-gray-400 dark:placeholder:text-gray-500 dark:text-gray-200"
                                    placeholder="New Item"
                                    value={newItemText}
                                    onChange={e => setNewItemText(e.target.value)}
                                />
                            </form>

                            {/* Completed Section */}
                            {completedItems.length > 0 && (
                                <div className="mt-8">
                                    <button
                                        onClick={() => setShowCompleted(!showCompleted)}
                                        className="flex items-center gap-1 text-sm font-medium text-gray-400 mb-2 uppercase tracking-wide hover:text-gray-600 transition-colors"
                                    >
                                        {showCompleted ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                                        {completedItems.length} Completed
                                    </button>

                                    {showCompleted && (
                                        <div className="space-y-0.5 animate-in slide-in-from-top-2 fade-in duration-200">
                                            {completedItems.map(item => (
                                                <div key={item.id} className="group flex items-center gap-4 py-3 border-b border-gray-50 dark:border-gray-800 opacity-60">
                                                    <button
                                                        onClick={() => toggleItem(item.id, item.completed)}
                                                        className={cn(
                                                            "w-5 h-5 rounded-full border-[1.5px] transition-all flex items-center justify-center shrink-0",
                                                            getColorClass(activeList.icon).replace('text-white', ''), // Keep bg color
                                                            "border-transparent text-white"
                                                        )}
                                                    >
                                                        <Check size={12} strokeWidth={4} />
                                                    </button>
                                                    <span className="text-[17px] text-gray-500 dark:text-gray-400 line-through flex-1 leading-snug">{item.text}</span>
                                                    <button onClick={() => deleteItem(item.id)} className="text-gray-300 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity">
                                                        <Trash2 size={16} />
                                                    </button>
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>
                    </div>
                ) : (
                    <div className="flex-1 flex items-center justify-center text-gray-300 dark:text-gray-700">
                        Select a list
                    </div>
                )}
            </div>
        </div>
    );
}
