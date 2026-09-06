import { format } from "date-fns";
import {
  CalendarDays,
  CheckCheck,
  CloudSun,
  CookingPot,
  House,
  Leaf,
  ListTodo,
  LogOut,
  Monitor,
  Settings,
} from "lucide-react";
import { useEffect, useState } from "react";
import { NavLink, Outlet } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import { useSettings } from "../../hooks/useSettings";
import { cn } from "../../lib/utils";

const links = [
  { label: "Today", path: "", icon: House },
  { label: "Calendar", path: "/calendar", icon: CalendarDays },
  { label: "Tasks", path: "/chores", icon: CheckCheck },
  { label: "Meals", path: "/meals", icon: CookingPot },
  { label: "Lists", path: "/lists", icon: ListTodo },
];
export function DesktopLayout({ kiosk = false }: { kiosk?: boolean }) {
  const { user, logout } = useAuth();
  const { settings } = useSettings();
  const [now, setNow] = useState(new Date());
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 60000);
    return () => clearInterval(timer);
  }, []);
  const prefix = kiosk ? "/kiosk" : "";
  return (
    <div className="h-dvh flex bg-[#F7F5F0] dark:bg-stone-950 text-[#252923] dark:text-stone-100 overflow-hidden">
      <aside className="hidden md:flex w-24 shrink-0 flex-col items-center border-r border-stone-200/70 dark:border-stone-800 py-7">
        <NavLink
          to={prefix || "/"}
          aria-label="MyLight home"
          className="w-12 h-12 rounded-2xl bg-[#355B48] text-white flex items-center justify-center mb-10"
        >
          <Leaf size={25} />
        </NavLink>
        <nav className="flex flex-col gap-3 w-full px-3">
          {links.map(({ label, path, icon: Icon }) => (
            <NavLink
              end
              key={label}
              to={prefix + path || "/"}
              className={({ isActive }) =>
                cn(
                  "flex flex-col items-center gap-1.5 rounded-2xl py-3 text-[11px] font-medium transition-colors",
                  isActive
                    ? "bg-[#E7ECDD] text-[#355B48] dark:bg-emerald-950 dark:text-emerald-100"
                    : "text-stone-500 hover:bg-stone-200/50 dark:hover:bg-stone-800",
                )
              }
            >
              <Icon size={22} strokeWidth={1.7} />
              {label}
            </NavLink>
          ))}
        </nav>
        <div className="mt-auto flex flex-col gap-3">
          <NavLink
            to={prefix + "/weather"}
            aria-label="Weather"
            className="p-3 text-stone-500 rounded-xl hover:bg-stone-200/50"
          >
            <CloudSun size={22} />
          </NavLink>
          {!kiosk && (
            <NavLink
              to="/kiosk"
              aria-label="Open wall display"
              className="p-3 text-stone-500 rounded-xl hover:bg-stone-200/50"
            >
              <Monitor size={22} />
            </NavLink>
          )}
          <NavLink
            to={`${prefix}/settings`}
            aria-label="Settings"
            className="p-3 text-stone-500 rounded-xl hover:bg-stone-200/50"
          >
            <Settings size={22} />
          </NavLink>
          {!kiosk && (
            <button
              onClick={() => logout()}
              aria-label="Sign out"
              className="p-3 text-stone-500 rounded-xl hover:bg-stone-200/50"
            >
              <LogOut size={20} />
            </button>
          )}
        </div>
      </aside>
      <div className="min-w-0 flex-1 flex flex-col">
        <header className="shrink-0 h-20 md:h-24 px-5 md:px-9 flex justify-between items-center border-b border-stone-200/60 dark:border-stone-800">
          <div>
            <p className="flex items-center gap-2 text-lg font-semibold tracking-tight">
              <Leaf className="md:hidden text-[#355B48]" size={20} />
              {settings.family_name || "MyLight"}
            </p>
            <p className="text-xs text-stone-500 mt-1">
              {format(now, "EEEE, MMMM d")}
              <span className="hidden sm:inline">
                {" "}
                · A little more together.
              </span>
            </p>
          </div>
          <div className="flex items-center gap-4">
            <span className="hidden sm:block text-sm tabular-nums text-stone-500">
              {format(now, "h:mm a")}
            </span>
            <NavLink
              to={`${prefix}/settings`}
              aria-label="Household settings"
              className="w-10 h-10 rounded-full bg-[#E7ECDD] dark:bg-emerald-950 flex items-center justify-center text-[#355B48] dark:text-emerald-100 font-semibold"
            >
              {user?.name?.slice(0, 1)}
            </NavLink>
          </div>
        </header>
        <main className="flex-1 min-h-0 overflow-y-auto pb-20 md:pb-0">
          <Outlet />
        </main>
      </div>
      <nav
        aria-label="Main navigation"
        className="md:hidden fixed bottom-0 inset-x-0 h-20 pb-[env(safe-area-inset-bottom)] bg-[#F7F5F0]/95 dark:bg-stone-950 border-t border-stone-200 dark:border-stone-800 flex justify-around z-40"
      >
        {links.map(({ label, path, icon: Icon }) => (
          <NavLink
            end
            key={label}
            to={prefix + path || "/"}
            className={({ isActive }) =>
              cn(
                "min-w-14 flex flex-col items-center justify-center gap-1 text-[10px]",
                isActive
                  ? "text-[#355B48] dark:text-emerald-300 font-bold"
                  : "text-stone-500",
              )
            }
          >
            <Icon size={21} />
            {label}
          </NavLink>
        ))}
      </nav>
    </div>
  );
}
