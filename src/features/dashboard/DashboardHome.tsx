import React, { useState, useEffect } from 'react';
import { Calendar, CheckSquare, CloudSun, TrendingUp, ArrowRight, User, Plus } from 'lucide-react';
import { format } from 'date-fns';
import { useNavigate } from 'react-router-dom';
import { Chore, Event, FamilyMember } from '../../types';
import { UserAvatar } from '../../components/UserAvatar';
import { useAuth } from '../../context/AuthContext';

export function DashboardHome() {
    const { user } = useAuth();
    const navigate = useNavigate();
    const [events, setEvents] = useState<Event[]>([]);
    const [chores, setChores] = useState<Chore[]>([]);
    const [members, setMembers] = useState<FamilyMember[]>([]);

    useEffect(() => {
        // Fetch snapshot data
        Promise.all([
            fetch('/api/events').then(r => r.json()),
            fetch('/api/chores').then(r => r.json()),
            fetch('/api/family').then(r => r.json())
        ]).then(([eventsData, choresData, familyData]) => {
            // ... (keep existing data processing)
            const today = new Date();
            const todaysEvents = (eventsData as Event[]).filter(e => {
                const date = new Date(e.start_date);
                return date.toDateString() === today.toDateString();
            }).slice(0, 3);
            setEvents(todaysEvents);

            // Chores comes as map likely? Or need similar parsing as in Chores view
            // Actually handleChores GET returns map[string][]Chore. 
            // Let's just grab a flattened list of pending chores for now if possible or just slice
            // Simpler: Just count pending?
            // The API logic for chores returns `map[memberName]Chore[]`.
            const allChores: Chore[] = [];
            Object.values(choresData).forEach((list: any) => {
                allChores.push(...list);
            });
            setChores(allChores.filter(c => !c.completed).slice(0, 4));

            setMembers(familyData as FamilyMember[]);
        }).catch(err => console.error("Dashboard fetch error", err));
    }, []);

    const QuickStat = ({ icon: Icon, label, value, color, onClick }: any) => (
        <button
            onClick={onClick}
            className="bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-100 dark:border-slate-800 shadow-sm hover:shadow-md transition-all flex items-center justify-between group"
        >
            <div className="flex items-center gap-4">
                <div className={`p - 3 rounded - xl ${color} bg - opacity - 10`}>
                    <Icon size={24} className={color.replace('bg-', 'text-')} />
                </div>
                <div className="text-left">
                    <div className="text-2xl font-bold text-slate-800 dark:text-slate-100">{value}</div>
                    <div className="text-sm text-slate-500 font-medium">{label}</div>
                </div>
            </div>
            <ArrowRight size={18} className="text-slate-300 group-hover:text-blue-500 transition-colors" />
        </button>
    );

    return (
        <div className="space-y-8">
            <header className="mb-8">
                <h1 className="text-3xl font-bold text-slate-800 dark:text-white mb-2">
                    Good Morning, Family! ☀️
                </h1>
                <p className="text-slate-500 dark:text-slate-400">
                    Here's what's happening today, {format(new Date(), 'EEEE, MMMM do')}.
                </p>
            </header>

            {/* Quick Stats / Navigation */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                <QuickStat
                    icon={Calendar}
                    label="Events Today"
                    value={events.length}
                    color="bg-purple-500"
                    onClick={() => navigate('/calendar')}
                />
                <QuickStat
                    icon={CheckSquare}
                    label="Pending Chores"
                    value={chores.length}
                    color="bg-green-500"
                    onClick={() => navigate('/chores')}
                />
                <QuickStat
                    icon={CloudSun}
                    label="Weather"
                    value="72°"
                    color="bg-blue-500"
                    onClick={() => navigate('/weather')}
                />
                <QuickStat
                    icon={TrendingUp}
                    label="Weekly Progress"
                    value="85%"
                    color="bg-orange-500"
                    onClick={() => navigate('/history')}
                />
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                {/* Upcoming Events */}
                <div className="lg:col-span-2 bg-white dark:bg-slate-900 rounded-3xl border border-slate-100 dark:border-slate-800 p-6 shadow-sm">
                    <div className="flex items-center justify-between mb-6">
                        <h2 className="text-lg font-bold text-slate-800 dark:text-white">Upcoming Events</h2>
                        <button onClick={() => navigate('/calendar')} className="text-sm font-semibold text-blue-600 hover:text-blue-700">View All</button>
                    </div>
                    <div className="space-y-3">
                        {events.length === 0 ? (
                            <div className="text-center py-8 text-slate-400">No events today</div>
                        ) : (
                            events.map(event => (
                                <div key={event.id} className="flex items-center gap-4 p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/50 hover:bg-slate-100 transition-colors">
                                    <div className="w-16 text-center">
                                        <div className="text-xs font-bold text-slate-400 uppercase">{format(new Date(event.start_date), 'MMM')}</div>
                                        <div className="text-xl font-bold text-slate-800 dark:text-slate-200">{format(new Date(event.start_date), 'd')}</div>
                                    </div>
                                    <div className="flex-1">
                                        <h3 className="font-bold text-slate-800 dark:text-slate-100">{event.title}</h3>
                                        <div className="text-sm text-slate-500">{event.location || 'No location'} • {format(new Date(event.start_date), 'h:mm a')}</div>
                                    </div>
                                    {event.member_id && <UserAvatar member={members.find(m => m.id === event.member_id)} size="sm" />}
                                </div>
                            ))
                        )}
                        <button onClick={() => navigate('/calendar')} className="w-full py-3 rounded-xl border border-dashed border-slate-200 dark:border-slate-700 text-slate-400 hover:text-blue-600 hover:border-blue-200 flex items-center justify-center gap-2 font-medium transition-all">
                            <Plus size={18} />
                            Add Event
                        </button>
                    </div>
                </div>
                const colors: any = {
                    blue: "text-blue-600 bg-blue-50 dark:bg-blue-900/20 dark:text-blue-400",
                green: "text-green-600 bg-green-50 dark:bg-green-900/20 dark:text-green-400",
                purple: "text-purple-600 bg-purple-50 dark:bg-purple-900/20 dark:text-purple-400",
                orange: "text-orange-600 bg-orange-50 dark:bg-orange-900/20 dark:text-orange-400",
    };

                return (
                <div className="bg-white dark:bg-slate-900 p-6 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm hover:shadow-md transition-all duration-200 group">
                    <div className="flex items-center justify-between mb-4">
                        <div className={`p - 2 rounded - lg ${colors[color]} `}>
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
