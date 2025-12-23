import React from 'react';
import { Calendar, CheckSquare, Utensils, List, Settings } from 'lucide-react';
import { cn } from '../../lib/utils';

const NAV_ITEMS = [
    { id: 'calendar', label: 'Calendar', icon: Calendar },
    { id: 'chores', label: 'Chores', icon: CheckSquare },
    { id: 'meals', label: 'Meal Plan', icon: Utensils },
    { id: 'lists', label: 'Lists', icon: List },
    { id: 'settings', label: 'Settings', icon: Settings },
];

export function Sidebar({ activeTab, onTabChange }) {
    return (
        <aside className="hidden md:flex w-24 md:w-64 bg-white border-r border-gray-100 flex-col items-center md:items-stretch py-8 h-full shadow-sm z-20">
            <div className="mb-10 px-4 flex justify-center md:justify-start">
                <h1 className="text-2xl font-bold text-charcoal hidden md:block tracking-tight text-center w-full">
                    MyLight
                </h1>
                {/* Mobile/Collapsed Logo Fallback */}
                <div className="w-10 h-10 bg-sky-blue rounded-xl md:hidden flex items-center justify-center">
                    <span className="font-bold text-gray-700">S</span>
                </div>
            </div>

            <nav className="flex-1 w-full px-2 space-y-2">
                {NAV_ITEMS.map((item) => {
                    const Icon = item.icon;
                    const isActive = activeTab === item.id;

                    return (
                        <button
                            key={item.id}
                            onClick={() => onTabChange(item.id)}
                            className={cn(
                                "w-full flex items-center gap-4 px-4 py-3 rounded-r-2xl md:rounded-r-none md:border-r-4 transition-all duration-200 group relative",
                                isActive
                                    ? "bg-primary/5 text-primary border-primary font-semibold"
                                    : "border-transparent text-gray-500 hover:bg-gray-50 hover:text-gray-900"
                            )}
                        >
                            <Icon
                                size={24}
                                className={cn(
                                    "transition-colors",
                                    isActive ? "text-primary" : "text-gray-400 group-hover:text-gray-600"
                                )}
                            />
                            <span className="hidden md:block text-sm">{item.label}</span>
                        </button>
                    );
                })}
            </nav>

            <div className="mt-auto px-4">
                {/* Placeholder for small sync status or similar */}
                <div className="hidden md:flex items-center gap-2 text-xs text-gray-400 justify-center">
                    <div className="w-2 h-2 rounded-full bg-green-400"></div>
                    <span>Synced</span>
                </div>
            </div>
        </aside>
    );
}
