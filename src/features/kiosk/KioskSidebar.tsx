import { CloudSun, Calendar, CheckSquare, Menu } from 'lucide-react';
import { cn } from '../../lib/utils';
import { NavLink } from 'react-router-dom';

interface KioskSidebarProps {
    isCollapsed: boolean;
    onToggleCollapse: () => void;
}

export function KioskSidebar({ isCollapsed, onToggleCollapse }: KioskSidebarProps) {
    const navItems = [
        { id: 'weather', label: 'Weather', icon: CloudSun, color: 'text-blue-500', path: '/kiosk/weather' },
        { id: 'calendar', label: 'Calendar', icon: Calendar, color: 'text-purple-500', path: '/kiosk/calendar' },
        { id: 'chores', label: 'Chores', icon: CheckSquare, color: 'text-green-500', path: '/kiosk/chores' },
    ];

    return (
        <div
            className={cn(
                "h-full bg-white dark:bg-gray-900 border-r border-gray-200 dark:border-gray-800 transition-all duration-300 ease-in-out flex flex-col shadow-xl z-20 relative",
                isCollapsed ? "w-24" : "w-80"
            )}
        >
            {/* Header / Toggle */}
            <div className="p-6 border-b border-gray-100 dark:border-gray-800 flex items-center justify-between shrink-0 h-24">
                {!isCollapsed && (
                    <h1 className="text-3xl font-bold bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent">
                        MyLight
                    </h1>
                )}
                <button
                    onClick={onToggleCollapse}
                    className="p-4 rounded-2xl hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors mx-auto"
                >
                    <Menu size={32} className="text-gray-600 dark:text-gray-400" />
                </button>
            </div>

            {/* Navigation */}
            <nav className="flex-1 p-4 space-y-4 overflow-y-auto">
                {navItems.map((item) => (
                    <NavLink
                        key={item.id}
                        to={item.path}
                        className={({ isActive }) => cn(
                            "w-full flex items-center justify-start p-6 rounded-3xl transition-all duration-200 group relative overflow-hidden",
                            isCollapsed ? "justify-center p-0 h-16 w-16 mx-auto" : "gap-6",
                            isActive
                                ? "bg-gray-100 dark:bg-gray-800 shadow-inner"
                                : "hover:bg-gray-50 dark:hover:bg-gray-800/50"
                        )}
                    >
                        {({ isActive }) => (
                            <>
                                <div className={cn(
                                    "p-3 rounded-2xl transition-transform duration-300 flex items-center justify-center shrink-0",
                                    isActive ? "bg-white dark:bg-gray-700 shadow-sm scale-110" : "bg-gray-100 dark:bg-gray-800",
                                    item.color
                                )}>
                                    <item.icon size={32} strokeWidth={2.5} />
                                </div>

                                {!isCollapsed && (
                                    <span className={cn(
                                        "text-2xl font-bold tracking-tight text-gray-700 dark:text-gray-200",
                                        isActive && "text-gray-900 dark:text-white"
                                    )}>
                                        {item.label}
                                    </span>
                                )}

                                {isActive && (
                                    <div className="absolute left-0 top-1/2 -translate-y-1/2 w-1.5 h-12 bg-blue-500 rounded-r-full" />
                                )}
                            </>
                        )}
                    </NavLink>
                ))}
            </nav>

            {/* Footer / Status? */}
            {!isCollapsed && (
                <div className="p-6 text-center text-gray-400 text-sm">
                    Kiosk Mode
                </div>
            )}
        </div>
    );
}
