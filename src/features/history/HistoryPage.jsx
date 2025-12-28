import React, { useState, useEffect } from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, LineChart, Line, AreaChart, Area } from 'recharts';
import { Calendar, TrendingUp, Award, Clock } from 'lucide-react';
import { cn } from '../../lib/utils';

export function HistoryPage() {
    const [period, setPeriod] = useState('week'); // 'week', 'month', 'year'
    const [data, setData] = useState([]);
    const [loading, setLoading] = useState(true);
    const [stats, setStats] = useState({});

    const fetchHistory = async () => {
        setLoading(true);
        try {
            const res = await fetch(`/api/history?period=${period}`);
            const rawData = await res.json();

            // Process data for Recharts
            // Data format: { date: '2023-10-01', 'Max': 2, 'Mia': 1 }
            const chartDataObj = {};
            const memberStats = {};

            rawData.forEach(row => {
                if (!chartDataObj[row.date]) {
                    chartDataObj[row.date] = { date: row.date };
                }
                chartDataObj[row.date][row.member_name] = row.count;

                if (!memberStats[row.member_name]) {
                    memberStats[row.member_name] = 0;
                }
                memberStats[row.member_name] += row.count;
            });

            const chartData = Object.values(chartDataObj).sort((a, b) => new Date(a.date) - new Date(b.date));
            setData(chartData);
            setStats(memberStats);
        } catch (err) {
            console.error("Failed to fetch history", err);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchHistory();
    }, [period]);

    const colors = ['#3b82f6', '#ec4899', '#10b981', '#f59e0b', '#8b5cf6', '#ef4444'];
    const members = Object.keys(stats);

    return (
        <div className="h-full flex flex-col p-6 overflow-y-auto custom-scrollbar">
            <div className="flex items-center justify-between mb-8">
                <div>
                    <h2 className="text-3xl font-bold text-gray-900 dark:text-white tracking-tight">Efficiency History</h2>
                    <p className="text-gray-500 dark:text-gray-400 mt-1">Track chore completion and star progress</p>
                </div>

                <div className="flex bg-white/40 dark:bg-black/20 backdrop-blur-md p-1 rounded-2xl border border-white/40 dark:border-white/5 shadow-sm">
                    {['week', 'month', 'year'].map((p) => (
                        <button
                            key={p}
                            onClick={() => setPeriod(p)}
                            className={cn(
                                "px-6 py-2 rounded-xl text-sm font-bold transition-all capitalize",
                                period === p
                                    ? "bg-white dark:bg-white/10 text-primary shadow-sm ring-1 ring-black/5"
                                    : "text-gray-500 hover:text-gray-700 dark:hover:text-gray-300"
                            )}
                        >
                            {p}
                        </button>
                    ))}
                </div>
            </div>

            {/* Stats Cards */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
                {members.length > 0 ? members.map((name, idx) => (
                    <div key={name} className="bg-white/40 dark:bg-gray-800/40 backdrop-blur-xl p-6 rounded-[2rem] border border-white/50 dark:border-white/10 shadow-lg shadow-black/5">
                        <div className="flex items-center justify-between mb-4">
                            <div className="w-10 h-10 rounded-full flex items-center justify-center" style={{ backgroundColor: `${colors[idx % colors.length]}20`, color: colors[idx % colors.length] }}>
                                <Award size={20} />
                            </div>
                            <span className="text-xs font-black text-gray-400 dark:text-gray-500 uppercase tracking-widest">Total Done</span>
                        </div>
                        <h4 className="text-2xl font-bold text-gray-900 dark:text-white">{name}</h4>
                        <div className="mt-2 flex items-baseline gap-2">
                            <span className="text-4xl font-black text-primary drop-shadow-sm">{stats[name]}</span>
                            <span className="text-sm font-medium text-gray-500">chores</span>
                        </div>
                    </div>
                )) : (
                    <div className="col-span-full py-12 text-center bg-white/20 dark:bg-black/10 rounded-[2rem] border-2 border-dashed border-black/5 dark:border-white/5">
                        <TrendingUp size={48} className="mx-auto text-gray-300 mb-4" />
                        <p className="text-gray-500 italic">No history data yet. Start doing some chores!</p>
                    </div>
                )}
            </div>

            {/* Chart */}
            <div className="flex-1 bg-white/40 dark:bg-gray-800/40 backdrop-blur-xl p-8 rounded-[2rem] border border-white/50 dark:border-white/10 shadow-lg shadow-black/5 min-h-[400px]">
                <div className="flex items-center gap-3 mb-8">
                    <div className="p-2 bg-primary/10 rounded-xl text-primary">
                        <TrendingUp size={24} />
                    </div>
                    <h3 className="text-xl font-bold text-gray-900 dark:text-white">Activity Overview</h3>
                </div>

                <div className="h-[350px] w-full">
                    {loading ? (
                        <div className="w-full h-full flex items-center justify-center text-gray-400">Loading charts...</div>
                    ) : data.length > 0 ? (
                        <ResponsiveContainer width="100%" height="100%">
                            <AreaChart data={data}>
                                <defs>
                                    {members.map((name, idx) => (
                                        <linearGradient key={`grad-${name}`} id={`color-${name}`} x1="0" y1="0" x2="0" y2="1">
                                            <stop offset="5%" stopColor={colors[idx % colors.length]} stopOpacity={0.3} />
                                            <stop offset="95%" stopColor={colors[idx % colors.length]} stopOpacity={0} />
                                        </linearGradient>
                                    ))}
                                </defs>
                                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgba(0,0,0,0.05)" />
                                <XAxis
                                    dataKey="date"
                                    axisLine={false}
                                    tickLine={false}
                                    tick={{ fill: '#9ca3af', fontSize: 12 }}
                                    dy={10}
                                    tickFormatter={(val) => {
                                        const d = new Date(val);
                                        return period === 'year'
                                            ? d.toLocaleDateString(undefined, { month: 'short' })
                                            : d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
                                    }}
                                />
                                <YAxis
                                    axisLine={false}
                                    tickLine={false}
                                    tick={{ fill: '#9ca3af', fontSize: 12 }}
                                />
                                <Tooltip
                                    contentStyle={{
                                        backgroundColor: 'rgba(255,255,255,0.8)',
                                        backdropFilter: 'blur(10px)',
                                        border: 'none',
                                        borderRadius: '16px',
                                        boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.1)'
                                    }}
                                />
                                <Legend iconType="circle" wrapperStyle={{ paddingTop: '20px' }} />
                                {members.map((name, idx) => (
                                    <Area
                                        key={name}
                                        type="monotone"
                                        dataKey={name}
                                        stroke={colors[idx % colors.length]}
                                        strokeWidth={3}
                                        fillOpacity={1}
                                        fill={`url(#color-${name})`}
                                    />
                                ))}
                            </AreaChart>
                        </ResponsiveContainer>
                    ) : (
                        <div className="w-full h-full flex items-center justify-center text-gray-400 italic">Not enough data to display graph</div>
                    )}
                </div>
            </div>
        </div>
    );
}
