import React, { useState } from 'react';
import { cn } from '../../lib/utils';
import { useAuth } from '../../context/AuthContext';
import { Calendar, CheckSquare, Settings, CloudSun, TrendingUp, LayoutDashboard, Search, Bell, LogOut } from 'lucide-react';
import { NotificationPopover } from '../Notifications/NotificationPopover';
import { NavLink, Outlet } from 'react-router-dom';

interface DesktopLayoutProps {
    children?: React.ReactNode;
}

const NAV_ITEMS = [
    { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard, path: '/' },
    { id: 'calendar', label: 'Calendar', icon: Calendar, path: '/calendar' },
    { id: 'chores', label: 'Chores', icon: CheckSquare, path: '/chores' },
    { id: 'history', label: 'History', icon: TrendingUp, path: '/history' },
    { id: 'weather', label: 'Weather', icon: CloudSun, path: '/weather' },
    { id: 'settings', label: 'Settings', icon: Settings, path: '/settings' },
];

export function DesktopLayout({ children }: DesktopLayoutProps) {
    const { user, logout } = useAuth();
    const [isNotificationsOpen, setIsNotificationsOpen] = useState(false);

    return (
        <div className="flex h-screen w-full bg-slate-50 dark:bg-slate-950 font-sans text-sm antialiased text-slate-900 dark:text-slate-100 selection:bg-blue-100 selection:text-blue-900">
            {/* Backdrop for click-outside */}
            {isNotificationsOpen && (
                <div
                    className="fixed inset-0 z-40 bg-transparent"
                    onClick={() => setIsNotificationsOpen(false)}
                />
            )}

            {/* Sidebar */}
            <aside className="w-64 bg-white dark:bg-slate-900 border-r border-slate-200 dark:border-slate-800 flex flex-col">
                <div className="h-16 flex items-center px-6 border-b border-slate-100 dark:border-slate-800/50">
                    <span className="text-lg font-bold tracking-tight text-slate-900 dark:text-white">
                        🗓️ MyLight
                    </span>
                </div>

                <nav className="flex-1 p-4 space-y-1 overflow-y-auto">
                    {NAV_ITEMS.map((item) => {
                        const Icon = item.icon;
                        return (
                            <NavLink
                                key={item.id}
                                to={item.path}
                                className={({ isActive }) => cn(
                                    "w-full flex items-center gap-3 px-3 py-2 rounded-lg transition-all duration-200 group text-sm font-medium",
                                    isActive
                                        ? "bg-blue-50 text-blue-700 dark:bg-blue-900/20 dark:text-blue-200"
                                        : "text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-slate-900 dark:hover:text-slate-200"
                                )}
                            >
                                {({ isActive }) => (
                                    <>
                                        <Icon size={18} className={cn(isActive ? "text-blue-600 dark:text-blue-400" : "text-slate-400 group-hover:text-slate-600 dark:text-slate-500")} />
                                        {item.label}
                                    </>
                                )}
                            </NavLink>
                        );
                    })}
                </nav>

                <div className="p-4 border-t border-slate-200 dark:border-slate-800">
                    <div className="flex items-center gap-3 mb-2">
                        <div className={`w-8 h-8 rounded-full flex items-center justify-center text-white font-bold ${user?.color ? `bg-${user.color.replace('step-', '')}-500` : 'bg-blue-500'}`}>
                            {user?.avatar ? <img src={user.avatar} alt={user.name} className="w-full h-full rounded-full object-cover" /> : user?.name?.[0]}
                        </div>
                        <div className="flex flex-col overflow-hidden">
                            <span className="text-xs font-semibold truncate">{user?.name}</span>
                            <span className="text-[10px] text-slate-500 truncate">{user?.email}</span>
                        </div>
                    </div>
                    <button
                        onClick={logout}
                        className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-slate-500 hover:bg-red-50 hover:text-red-600 transition-colors text-xs font-medium"
                    >
                        <LogOut size={14} />
                        Sign Out
                    </button>
                </div>
            </aside>

            {/* Main Content */}
            <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
                {/* Header */}
                <header className="h-16 bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between px-6 z-10">
                    <div className="relative w-96">
                        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                        <input
                            type="text"
                            placeholder="Search..."
                            className="w-full pl-10 pr-4 py-2 bg-slate-100 dark:bg-slate-800 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/50 transition-all placeholder:text-slate-400"
                        />
                    </div>
                    <div className="flex items-center gap-4 relative">
                        <button
                            onClick={() => setIsNotificationsOpen(!isNotificationsOpen)}
                            className={`p-2 rounded-full transition-colors relative z-50 ${isNotificationsOpen ? 'bg-slate-100 dark:bg-slate-800 text-blue-600' : 'text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800'}`}
                        >
                            <Bell size={20} />
                            <span className="absolute top-2 right-2 w-2 h-2 bg-red-500 rounded-full border-2 border-white dark:border-slate-900" />
                        </button>

                        <NotificationPopover
                            isOpen={isNotificationsOpen}
                            onClose={() => setIsNotificationsOpen(false)}
                        />
                    </div>
                </header>

                {/* Page Content */}
                <main className="flex-1 overflow-auto p-6 md:p-8">
                    <div className="mx-auto h-full max-w-7xl">
                        <Outlet />
                    </div>
                </main>
            </div>
        </div>
    );
}
