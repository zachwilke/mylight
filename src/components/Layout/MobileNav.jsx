import React from 'react';
import { Calendar, CheckSquare, Utensils, List, Settings } from 'lucide-react';
import { cn } from '../../lib/utils';

const NAV_ITEMS = [
    { id: 'calendar', label: 'Calendar', icon: Calendar },
    { id: 'chores', label: 'Chores', icon: CheckSquare },
    { id: 'meals', label: 'Meals', icon: Utensils },
    { id: 'lists', label: 'Lists', icon: List },
    { id: 'settings', label: 'Settings', icon: Settings },
];

export function MobileNav({ activeTab, onTabChange }) {
    return (
        <nav className="md:hidden fixed bottom-0 left-0 right-0 bg-white border-t border-gray-100 px-6 py-2 pb-safe flex justify-between items-center z-50 shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.05)]">
            {NAV_ITEMS.map((item) => {
                const Icon = item.icon;
                const isActive = activeTab === item.id;

                return (
                    <button
                        key={item.id}
                        onClick={() => onTabChange(item.id)}
                        className="flex flex-col items-center gap-1 p-2"
                    >
                        <div className={cn(
                            "p-1.5 rounded-xl transition-all duration-200",
                            isActive ? "bg-primary/10 text-primary" : "text-gray-400"
                        )}>
                            <Icon
                                size={24}
                                className={cn(
                                    isActive && "text-primary"
                                )}
                                strokeWidth={isActive ? 2.5 : 2}
                            />
                        </div>
                        <span className={cn(
                            "text-[10px] font-medium transition-colors",
                            isActive ? "text-primary" : "text-gray-400"
                        )}>
                            {item.label}
                        </span>
                    </button>
                );
            })}
        </nav>
    );
}
