import React, { useState, useEffect, useRef } from 'react';
import { cn } from '../../lib/utils';
import { useAuth } from '../../context/AuthContext';
import { Calendar, CheckSquare, Settings, CloudSun, TrendingUp, LayoutDashboard, Search, LogOut, User as UserIcon } from 'lucide-react';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { format } from 'date-fns';

interface SearchResultItem {
    id: number;
    title?: string;
    name?: string;
    type: 'event' | 'chore' | 'member';
    details?: string;
}

function SearchResults() {
    const [query, setQuery] = useState('');
    const [results, setResults] = useState<{ events: any[], chores: any[], members: any[] } | null>(null);
    const [isOpen, setIsOpen] = useState(false);
    const navigate = useNavigate();
    const containerRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
                setIsOpen(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    useEffect(() => {
        if (!query.trim()) {
            setResults(null);
            return;
        }

        const timer = setTimeout(() => {
            fetch(`/api/search?q=${encodeURIComponent(query)}`)
                .then(res => res.json())
                .then(data => {
                    setResults(data);
                    setIsOpen(true);
                })
                .catch(err => console.error(err));
        }, 300);

        return () => clearTimeout(timer);
    }, [query]);

    const handleSelect = (type: string, id: number) => {
        setIsOpen(false);
        setQuery('');
        if (type === 'event') navigate('/calendar');
        if (type === 'chore') navigate('/chores');
        if (type === 'member') navigate('/settings'); // Or profile if we had one
    };

    return (
        <div ref={containerRef} className="relative w-96">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
                type="text"
                value={query}
                onChange={(e) => {
                    setQuery(e.target.value);
                    if (!e.target.value) setIsOpen(false);
                }}
                onFocus={() => {
                    if (results) setIsOpen(true);
                }}
                placeholder="Search..."
                className="w-full pl-10 pr-4 py-2 bg-slate-100 dark:bg-slate-800 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/50 transition-all placeholder:text-slate-400"
            />

            {isOpen && results && (
                <div className="absolute top-full left-0 right-0 mt-2 bg-white dark:bg-slate-900 rounded-xl shadow-xl border border-slate-100 dark:border-slate-800 overflow-hidden z-50 max-h-96 overflow-y-auto">
                    {/* Events */}
                    {results.events?.length > 0 && (
                        <div className="p-2">
                            <div className="text-xs font-semibold text-slate-400 px-2 py-1 uppercase tracking-wider">Events</div>
                            {results.events.map((e: any) => (
                                <button
                                    key={`e-${e.id}`}
                                    onClick={() => handleSelect('event', e.id)}
                                    className="w-full text-left px-2 py-2 hover:bg-slate-50 dark:hover:bg-slate-800 rounded-lg flex items-center gap-3 transition-colors"
                                >
                                    <div className="p-2 bg-purple-50 dark:bg-purple-900/20 text-purple-600 rounded-lg">
                                        <Calendar size={14} />
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <div className="text-sm font-medium text-slate-700 dark:text-slate-200 truncate">{e.title}</div>
                                        <div className="text-xs text-slate-400">{format(new Date(e.start_date), 'MMM d, h:mm a')}</div>
                                    </div>
                                </button>
                            ))}
                        </div>
                    )}

                    {/* Chores */}
                    {results.chores?.length > 0 && (
                        <div className="p-2 border-t border-slate-100 dark:border-slate-800">
                            <div className="text-xs font-semibold text-slate-400 px-2 py-1 uppercase tracking-wider">Chores</div>
                            {results.chores.map((c: any) => (
                                <button
                                    key={`c-${c.id}`}
                                    onClick={() => handleSelect('chore', c.id)}
                                    className="w-full text-left px-2 py-2 hover:bg-slate-50 dark:hover:bg-slate-800 rounded-lg flex items-center gap-3 transition-colors"
                                >
                                    <div className={`p-2 rounded-lg ${c.completed ? 'bg-green-50 text-green-600' : 'bg-slate-100 text-slate-500'}`}>
                                        <CheckSquare size={14} />
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <div className="text-sm font-medium text-slate-700 dark:text-slate-200 truncate">{c.title}</div>
                                        <div className="text-xs text-slate-400">{c.completed ? 'Completed' : 'Pending'}</div>
                                    </div>
                                </button>
                            ))}
                        </div>
                    )}

                    {/* Members */}
                    {results.members?.length > 0 && (
                        <div className="p-2 border-t border-slate-100 dark:border-slate-800">
                            <div className="text-xs font-semibold text-slate-400 px-2 py-1 uppercase tracking-wider">Family</div>
                            {results.members.map((m: any) => (
                                <button
                                    key={`m-${m.id}`}
                                    onClick={() => handleSelect('member', m.id)}
                                    className="w-full text-left px-2 py-2 hover:bg-slate-50 dark:hover:bg-slate-800 rounded-lg flex items-center gap-3 transition-colors"
                                >
                                    <div className="w-8 h-8 rounded-full overflow-hidden bg-slate-200">
                                        {m.avatar ? <img src={m.avatar} alt={m.name} className="w-full h-full object-cover" /> : <UserIcon size={16} className="m-auto mt-2 text-slate-400" />}
                                    </div>
                                    <div className="text-sm font-medium text-slate-700 dark:text-slate-200 truncate">{m.name}</div>
                                </button>
                            ))}
                        </div>
                    )}

                    {(!results.events?.length && !results.chores?.length && !results.members?.length) && (
                        <div className="p-4 text-center text-sm text-slate-400">
                            No results found
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}

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

    return (
        <div className="flex h-screen w-full bg-slate-50 dark:bg-slate-950 font-sans text-sm antialiased text-slate-900 dark:text-slate-100 selection:bg-blue-100 selection:text-blue-900">


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
                <header className="h-16 bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between px-6 z-10 relative">
                    <SearchResults />
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
