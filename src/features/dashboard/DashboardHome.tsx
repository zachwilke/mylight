import React, { useEffect, useState } from 'react';
import { Sun, Calendar, CheckCircle2, TrendingUp, Plus, ArrowRight } from 'lucide-react';
import { getCachedWeather } from '../../utils/weather';
import { Chore, FamilyMember } from '../../types';
import { useAuth } from '../../context/AuthContext';

interface DashboardHomeProps {
    onNavigate: (tab: string) => void;
}

export function DashboardHome({ onNavigate }: DashboardHomeProps) {
    const { user } = useAuth();
    const [greeting, setGreeting] = useState('');
    const [weather, setWeather] = useState<{ temp: number; label: string } | null>(null);
    const [stats, setStats] = useState({ choresPending: 0, choresDone: 0 });

    useEffect(() => {
        const hour = new Date().getHours();
        if (hour < 12) setGreeting('Good Morning');
        else if (hour < 18) setGreeting('Good Afternoon');
        else setGreeting('Good Evening');

        // Fetch Data
        Promise.all([
            fetch('/api/chores').then(res => res.json()),
            fetch('/api/settings').then(res => res.json())
        ]).then(async ([choresData, settingsData]: [Record<string, Chore[]>, any]) => {
            // Stats
            const pending = Object.values(choresData).flat().filter((c: any) => !c.completed).length;
            const done = Object.values(choresData).flat().filter((c: any) => c.completed).length;
            setStats({ choresPending: pending, choresDone: done });
        });
    }, []);

    return (
        <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-3xl font-bold text-slate-900 dark:text-white tracking-tight">{greeting}, {user?.name}!</h1>
                    <p className="text-slate-500 dark:text-slate-400 mt-1">Here is what's happening in your household today.</p>
                </div>
                <div className="flex gap-3">
                    <button className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium text-sm shadow-sm hover:shadow active:scale-95">
                        <Plus size={16} />
                        New Task
                    </button>
                </div>
            </div>

            {/* Stats Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                <StatCard
                    label="Active Chores"
                    value={stats.choresPending.toString()}
                    icon={CheckCircle2}
                    trend="+2 due"
                    color="blue"
                />
                <StatCard
                    label="Completed Today"
                    value={stats.choresDone.toString()}
                    icon={TrendingUp}
                    trend="Good job!"
                    color="green"
                />
                <StatCard
                    label="Next Event"
                    value="Soccer Practice"
                    icon={Calendar}
                    trend="4:00 PM"
                    color="purple"
                />
                <StatCard
                    label="Weather"
                    value="72° Sunny"
                    icon={Sun}
                    trend="High 78°"
                    color="orange"
                />
            </div>

            {/* Recent Activity / Content Sections */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                <div className="lg:col-span-2 space-y-6">
                    <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-6 shadow-sm">
                        <div className="flex items-center justify-between mb-6">
                            <h3 className="font-semibold text-slate-900 dark:text-white">Recent Activity</h3>
                            <button className="text-sm text-blue-600 hover:text-blue-700 font-medium">View All</button>
                        </div>
                        <div className="space-y-4">
                            {[1, 2, 3].map((i) => (
                                <div key={i} className="flex items-center gap-4 p-3 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors group cursor-default">
                                    <div className="w-10 h-10 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-slate-500 group-hover:bg-white group-hover:shadow-sm transition-all border border-transparent group-hover:border-slate-200">
                                        <CheckCircle2 size={18} />
                                    </div>
                                    <div className="flex-1">
                                        <p className="text-sm font-medium text-slate-900 dark:text-white">Zach completed "Clean Room"</p>
                                        <p className="text-xs text-slate-500">2 hours ago</p>
                                    </div>
                                    <ArrowRight size={16} className="text-slate-300 opacity-0 group-hover:opacity-100 transition-opacity" />
                                </div>
                            ))}
                        </div>
                    </div>
                </div>

                <div className="space-y-6">
                    <div className="bg-gradient-to-br from-blue-600 to-indigo-700 rounded-xl p-6 text-white shadow-lg shadow-blue-900/20">
                        <h3 className="font-semibold text-lg mb-2">Pro Tip</h3>
                        <p className="text-blue-100 text-sm leading-relaxed mb-4">
                            You can inspect your household's progress over time in the History tab.
                        </p>
                        <button
                            onClick={() => onNavigate('history')}
                            className="bg-white/10 hover:bg-white/20 text-white text-xs font-semibold px-3 py-1.5 rounded-md transition-colors border border-white/20"
                        >
                            Check History
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}

function StatCard({ label, value, icon: Icon, trend, color }: any) {
    const colors: any = {
        blue: "text-blue-600 bg-blue-50 dark:bg-blue-900/20 dark:text-blue-400",
        green: "text-green-600 bg-green-50 dark:bg-green-900/20 dark:text-green-400",
        purple: "text-purple-600 bg-purple-50 dark:bg-purple-900/20 dark:text-purple-400",
        orange: "text-orange-600 bg-orange-50 dark:bg-orange-900/20 dark:text-orange-400",
    };

    return (
        <div className="bg-white dark:bg-slate-900 p-6 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm hover:shadow-md transition-all duration-200 group">
            <div className="flex items-center justify-between mb-4">
                <div className={`p-2 rounded-lg ${colors[color]}`}>
                    <Icon size={20} />
                </div>
                <span className="text-xs font-medium text-slate-400 bg-slate-50 dark:bg-slate-800 px-2 py-1 rounded-full">{trend}</span>
            </div>
            <div>
                <p className="text-sm font-medium text-slate-500 dark:text-slate-400">{label}</p>
                <h4 className="text-2xl font-bold text-slate-900 dark:text-white mt-1 group-hover:scale-[1.02] transition-transform origin-left">{value}</h4>
            </div>
        </div>
    );
}
