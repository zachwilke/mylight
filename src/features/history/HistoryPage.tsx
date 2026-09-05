import { Award, TrendingUp } from "lucide-react";
import { useEffect, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { apiFetch } from "../../lib/api";
import { cn } from "../../lib/utils";

interface HistoryRow {
  date: string;
  member_name: string;
  count: number;
}

interface ChartDataPoint {
  date: string;
  [key: string]: string | number;
}

const COLORS = [
  "#3b82f6",
  "#ec4899",
  "#10b981",
  "#f59e0b",
  "#8b5cf6",
  "#ef4444",
  "#06b6d4",
  "#6366f1",
];

export function HistoryPage() {
  const [period, setPeriod] = useState("week"); // 'week', 'month', 'year'
  const [data, setData] = useState<ChartDataPoint[]>([]);
  const [pieData, setPieData] = useState<{ name: string; value: number }[]>([]);
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState<Record<string, number>>({});
  const [members, setMembers] = useState<string[]>([]);
  const [totalChores, setTotalChores] = useState(0);

  const fetchHistory = async () => {
    setLoading(true);
    try {
      const res = await apiFetch(`/api/history?period=${period}`);
      const rawData: HistoryRow[] = await res.json();

      // Process Data
      const chartDataObj: Record<string, ChartDataPoint> = {};
      const memberStats: Record<string, number> = {};
      const uniqueMembers = new Set<string>();
      let globalTotal = 0;

      rawData.forEach((row) => {
        const d = row.date;
        if (!chartDataObj[d]) {
          chartDataObj[d] = { date: d };
        }
        chartDataObj[d][row.member_name] = row.count;

        memberStats[row.member_name] =
          (memberStats[row.member_name] || 0) + row.count;
        uniqueMembers.add(row.member_name);
        globalTotal += row.count;
      });

      // Sort by date
      const chartData = Object.values(chartDataObj).sort(
        (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime(),
      );

      // Pie Data
      const pie = Object.entries(memberStats).map(([name, value]) => ({
        name,
        value,
      }));

      setData(chartData);
      setStats(memberStats);
      setMembers(Array.from(uniqueMembers));
      setPieData(pie);
      setTotalChores(globalTotal);
    } catch (err) {
      console.error("Failed to fetch history", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchHistory();
  }, [period]);

  return (
    <div className="h-full flex flex-col p-6 overflow-y-auto custom-scrollbar bg-slate-50 dark:bg-slate-950">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8">
        <div>
          <h2 className="text-3xl font-bold text-slate-900 dark:text-white tracking-tight">
            Performance History
          </h2>
          <p className="text-slate-500 dark:text-slate-400 mt-1">
            Visualize household efficiency and individual contributions.
          </p>
        </div>

        <div className="flex bg-white dark:bg-slate-900 p-1 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm self-start md:self-auto">
          {["week", "month", "year"].map((p) => (
            <button
              key={p}
              onClick={() => setPeriod(p)}
              className={cn(
                "px-5 py-2 rounded-lg text-sm font-semibold transition-all capitalize",
                period === p
                  ? "bg-slate-100 dark:bg-slate-800 text-slate-900 dark:text-white shadow-sm"
                  : "text-slate-500 hover:text-slate-700 dark:hover:text-slate-300",
              )}
            >
              {p}
            </button>
          ))}
        </div>
      </div>

      {/* Top Stats Cards */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8">
        {/* Leaderboard Donut */}
        <div className="bg-white dark:bg-slate-900 p-6 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm flex flex-col">
          <h3 className="text-lg font-bold text-slate-900 dark:text-white mb-4">
            Contribution Split
          </h3>
          <div className="flex-1 min-h-[200px] relative">
            {loading ? (
              <div className="absolute inset-0 flex items-center justify-center text-slate-400">
                Loading...
              </div>
            ) : totalChores > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={pieData}
                    innerRadius={60}
                    outerRadius={80}
                    paddingAngle={5}
                    dataKey="value"
                  >
                    {pieData.map((_, index) => (
                      <Cell
                        key={`cell-${index}`}
                        fill={COLORS[index % COLORS.length]}
                      />
                    ))}
                  </Pie>
                  <Tooltip
                    contentStyle={{
                      borderRadius: "12px",
                      border: "none",
                      boxShadow: "0 4px 12px rgba(0,0,0,0.1)",
                    }}
                  />
                  <Legend verticalAlign="bottom" height={36} />
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <div className="absolute inset-0 flex items-center justify-center text-slate-400 text-sm">
                No data for this period
              </div>
            )}
            {/* Center Text */}
            {totalChores > 0 && (
              <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none pb-8">
                <span className="text-3xl font-bold text-slate-900 dark:text-white">
                  {totalChores}
                </span>
                <span className="text-xs font-medium text-slate-500 uppercase">
                  Total
                </span>
              </div>
            )}
          </div>
        </div>

        {/* Leaderboard List */}
        <div className="lg:col-span-2 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-2xl p-6 text-white shadow-lg overflow-hidden relative">
          <div className="absolute top-0 right-0 p-32 bg-white/10 rounded-full blur-3xl -mr-16 -mt-16 pointer-events-none" />
          <div className="relative z-10 h-full flex flex-col">
            <div className="flex items-center gap-3 mb-6">
              <div className="p-2 bg-white/20 rounded-lg backdrop-blur-sm">
                <Award size={24} className="text-white" />
              </div>
              <div>
                <h3 className="text-xl font-bold">Top Performers</h3>
                <p className="text-indigo-100 text-sm">
                  Most completed chores this {period}
                </p>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
              {members
                .sort((a, b) => stats[b] - stats[a])
                .slice(0, 3)
                .map((name, idx) => (
                  <div
                    key={name}
                    className="bg-white/10 backdrop-blur-md rounded-xl p-4 border border-white/10 flex flex-col justify-between"
                  >
                    <div className="flex items-start justify-between mb-2">
                      <span
                        className={cn(
                          "text-xs font-bold px-2 py-1 rounded-full",
                          idx === 0
                            ? "bg-yellow-400 text-yellow-900"
                            : idx === 1
                              ? "bg-slate-300 text-slate-900"
                              : "bg-orange-300 text-orange-900",
                        )}
                      >
                        #{idx + 1}
                      </span>
                      <div className="w-8 h-8 rounded-full bg-white/20 flex items-center justify-center text-xs font-bold">
                        {name[0]}
                      </div>
                    </div>
                    <div>
                      <h4 className="text-lg font-bold truncate">{name}</h4>
                      <p className="text-indigo-100 text-sm">
                        {stats[name]} chores
                      </p>
                    </div>
                  </div>
                ))}
              {members.length === 0 && (
                <div className="col-span-full flex items-center justify-center h-32 text-indigo-100 italic">
                  No activity yet
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Main Chart */}
      <div className="flex-1 bg-white dark:bg-slate-900 p-6 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm min-h-[400px] flex flex-col">
        <div className="flex items-center gap-3 mb-6">
          <div className="p-2 bg-blue-50 dark:bg-blue-900/20 rounded-lg text-blue-600 dark:text-blue-400">
            <TrendingUp size={24} />
          </div>
          <div>
            <h3 className="text-lg font-bold text-slate-900 dark:text-white">
              Activity Timeline
            </h3>
            <p className="text-slate-500 text-sm">Daily completion breakdown</p>
          </div>
        </div>

        <div className="flex-1 w-full min-h-[300px]">
          {loading ? (
            <div className="w-full h-full flex items-center justify-center text-slate-400">
              Loading chart...
            </div>
          ) : data.length > 0 ? (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={data}
                margin={{ top: 10, right: 30, left: 0, bottom: 0 }}
              >
                <CartesianGrid
                  strokeDasharray="3 3"
                  vertical={false}
                  stroke="#e2e8f0"
                />
                <XAxis
                  dataKey="date"
                  axisLine={false}
                  tickLine={false}
                  tick={{ fill: "#64748b", fontSize: 12 }}
                  dy={10}
                  tickFormatter={(val) => {
                    const d = new Date(val);
                    return period === "year"
                      ? d.toLocaleDateString(undefined, { month: "short" })
                      : d.toLocaleDateString(undefined, {
                          weekday: "short",
                          day: "numeric",
                        });
                  }}
                />
                <YAxis
                  axisLine={false}
                  tickLine={false}
                  tick={{ fill: "#64748b", fontSize: 12 }}
                />
                <Tooltip
                  cursor={{ fill: "rgba(0,0,0,0.02)" }}
                  contentStyle={{
                    backgroundColor: "#fff",
                    borderRadius: "12px",
                    border: "1px solid #e2e8f0",
                    boxShadow: "0 4px 6px -1px rgba(0, 0, 0, 0.1)",
                    fontSize: "14px",
                  }}
                />
                <Legend wrapperStyle={{ paddingTop: "20px" }} />
                {members.map((name, idx) => (
                  <Bar
                    key={name}
                    dataKey={name}
                    stackId="a"
                    fill={COLORS[idx % COLORS.length]}
                    radius={[4, 4, 0, 0]} // only top radius for stacked looks weird in middle, but Recharts handles it?
                    // Actually for stacked bars, usually only top-most gets radius. Recharts doesn't easy support conditional radius in stack.
                    // Let's remove radius for stack.
                  />
                ))}
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div className="w-full h-full flex items-center justify-center text-slate-400 italic">
              No data available for this period
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
