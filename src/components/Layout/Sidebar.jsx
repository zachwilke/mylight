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
        <aside className="hidden md:flex w-20 lg:w-64 bg-white border-r border-gray-100 flex-col items-center lg:items-stretch py-8 h-full shadow-sm z-20 transition-all duration-300">
            <div className="mb-10 px-4 flex justify-center lg:justify-start items-center">
                <h1 className="text-2xl font-bold text-charcoal hidden lg:block tracking-tight text-center w-full">
                    MyLight
                </h1>
                {/* Tablet Icon Logo */}
                <div className="w-10 h-10 bg-primary/10 text-primary rounded-xl lg:hidden flex items-center justify-center">
                    <span className="font-bold text-lg">M</span>
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
                                "w-full flex items-center justify-center lg:justify-start gap-4 px-0 lg:px-4 py-3 rounded-xl lg:rounded-r-none lg:border-r-4 transition-all duration-200 group relative",
                                isActive
                                    ? "bg-primary/5 text-primary lg:border-primary font-semibold"
                                    : "border-transparent text-gray-500 hover:bg-gray-50 hover:text-gray-900"
                            )}
                            title={item.label}
                        >
                            <Icon
                                size={24}
                                className={cn(
                                    "transition-colors",
                                    isActive ? "text-primary" : "text-gray-400 group-hover:text-gray-600"
                                )}
                            />
                            <span className="hidden lg:block text-sm">{item.label}</span>
                        </button>
                    );
                })}
            </nav>

            <div className="mt-auto px-4">
                {/* Sync Status */}
                <div className="hidden lg:flex items-center gap-2 text-xs text-gray-400 justify-center">
                    <div className="w-2 h-2 rounded-full bg-green-400"></div>
                    <span>Synced</span>
                </div>
                <div className="lg:hidden flex justify-center text-green-400">
                    <div className="w-2 h-2 rounded-full bg-green-400"></div>
                </div>
            </div>
        </aside>
    );
}
