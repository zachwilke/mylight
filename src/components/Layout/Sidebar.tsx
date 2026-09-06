import {
  Calendar,
  CheckSquare,
  CloudSun,
  Settings,
  TrendingUp,
} from "lucide-react";
import { cn } from "../../lib/utils";

const NAV_ITEMS = [
  { id: "calendar", label: "Calendar", icon: Calendar },
  { id: "chores", label: "Chores", icon: CheckSquare },
  { id: "history", label: "History", icon: TrendingUp },
  { id: "weather", label: "Weather", icon: CloudSun },
  { id: "settings", label: "Settings", icon: Settings },
];

export function Sidebar({
  activeTab,
  onTabChange,
  showSettings = true,
}: {
  activeTab: string;
  onTabChange: (tab: string) => void;
  showSettings?: boolean;
}) {
  const visibleItems = showSettings
    ? NAV_ITEMS
    : NAV_ITEMS.filter((item) => item.id !== "settings");

  return (
    <aside className="hidden md:flex w-24 lg:w-72 bg-transparent flex-col items-center lg:items-stretch py-8 h-full z-20 transition-all duration-300">
      <div className="mb-10 px-6 flex justify-center lg:justify-start items-center">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white hidden lg:block tracking-tight text-center w-full drop-shadow-sm">
          🗓️ MyLight
        </h1>
        {/* Tablet Icon Logo */}
        <div className="w-10 h-10 bg-white/50 dark:bg-black/20 backdrop-blur-md text-primary rounded-xl lg:hidden flex items-center justify-center shadow-sm border border-white/20">
          <span className="font-bold text-lg">M</span>
        </div>
      </div>

      <nav className="flex-1 w-full px-4 space-y-3">
        {visibleItems.map((item) => {
          const Icon = item.icon;
          const isActive = activeTab === item.id;

          return (
            <button
              key={item.id}
              onClick={() => onTabChange(item.id)}
              className={cn(
                "w-full flex items-center justify-center lg:justify-start gap-3 px-3 py-3 rounded-2xl transition-all duration-300 group relative overflow-hidden",
                isActive
                  ? "bg-white/60 dark:bg-white/10 shadow-lg shadow-black/5 backdrop-blur-md text-primary font-semibold ring-1 ring-white/50"
                  : "text-gray-600 dark:text-gray-400 hover:bg-white/30 dark:hover:bg-white/5 hover:text-gray-900 dark:hover:text-gray-200",
              )}
              title={item.label}
            >
              <Icon
                size={28}
                className={cn(
                  "transition-colors duration-300",
                  isActive
                    ? "text-primary scale-110"
                    : "text-gray-500 dark:text-gray-500 group-hover:text-gray-700 dark:group-hover:text-gray-300",
                )}
              />
              <span className="hidden lg:block text-base tracking-medium">
                {item.label}
              </span>
            </button>
          );
        })}
      </nav>

      <div className="mt-auto px-4">{/* Footer content if needed */}</div>
    </aside>
  );
}
