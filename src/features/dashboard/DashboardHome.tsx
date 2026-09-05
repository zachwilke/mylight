import { addDays, format, isSameDay, startOfDay } from "date-fns";
import {
  ArrowRight,
  CalendarDays,
  Check,
  CheckCheck,
  CookingPot,
  Plus,
  Sprout,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { apiFetch } from "../../lib/api";
import { segments } from "../../lib/calendar";
import { eventMemberLabel } from "../../lib/eventMembers";
import { calendarEventsURL } from "../../lib/calendarRange";
import type {
  Event as CalendarEvent,
  Chore,
  FamilyMember,
  Meal,
} from "../../types";

interface Snapshot {
  events: CalendarEvent[];
  chores: Chore[];
  members: FamilyMember[];
  meals: Meal[];
}
export function DashboardHome() {
  const [data, setData] = useState<Snapshot>({
    events: [],
    chores: [],
    members: [],
    meals: [],
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const loadVersion = useRef(0);
  const location = useLocation();
  const prefix = location.pathname.startsWith("/kiosk") ? "/kiosk" : "";
  const load = useCallback(async () => {
    const version = ++loadVersion.current;
    try {
      const start = startOfDay(new Date());
      const [events, chores, members, meals] = await Promise.all(
        [
          calendarEventsURL(start, addDays(start, 7)),
          "/api/chores",
          "/api/family",
          "/api/meals",
        ].map(async (p) => (await apiFetch(p)).json()),
      );
      if (version !== loadVersion.current) return;
      setData({
        events,
        chores: Object.values(chores).flat() as Chore[],
        members,
        meals,
      });
      setError("");
    } catch (e) {
      if (version !== loadVersion.current) return;
      setError(e instanceof Error ? e.message : "Could not load your day");
    } finally {
      if (version === loadVersion.current) setLoading(false);
    }
  }, []);
  useEffect(() => {
    void load();
    const handle = () => void load();
    window.addEventListener("system-update", handle);
    const timer = setInterval(handle, 60000);
    return () => {
      loadVersion.current++;
      window.removeEventListener("system-update", handle);
      clearInterval(timer);
    };
  }, [load]);
  const today = startOfDay(new Date());
  const days = Array.from({ length: 7 }, (_, i) => addDays(today, i));
  const expanded = segments(data.events, today, addDays(today, 7));
  const pending = data.chores.filter((c) => !c.completed);
  const todayEvents = expanded.filter((e) => isSameDay(e.date, today));
  const dinner = data.meals.filter(
    (m) => m.date === format(today, "yyyy-MM-dd") && m.type === "Dinner",
  );
  const hour = new Date().getHours();
  const greeting =
    hour < 12
      ? "Good morning."
      : hour < 18
        ? "A lovely afternoon."
        : "Welcome to the evening.";
  const done = data.chores.length - pending.length;
  async function complete(chore: Chore) {
    try {
      await apiFetch("/api/chores/" + chore.id + "/toggle", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ completed: true }),
      });
      await load();
    } catch {
      setError(
        "Couldn't save this task. It remains pending; please try again.",
      );
    }
  }
  return (
    <div className="p-5 md:p-8 xl:p-10 max-w-[1800px] mx-auto space-y-7">
      <section className="relative overflow-hidden rounded-[28px] bg-[#355B48] text-[#F7F5F0] p-7 md:p-10 flex items-center justify-between gap-6">
        <div className="relative z-10">
          <p className="text-[11px] font-medium tracking-[.2em] uppercase text-emerald-100/70 mb-4">
            Your day, a little lighter
          </p>
          <h1 className="text-3xl md:text-5xl tracking-tight font-medium">
            {greeting}
          </h1>
          <p className="mt-4 text-sm md:text-base text-emerald-50/80">
            {loading
              ? "Gathering your day…"
              : todayEvents.length
                ? todayEvents.length +
                  (todayEvents.length === 1
                    ? " plan on the calendar today."
                    : " plans on the calendar today.")
                : "A little breathing room on the calendar today."}
          </p>
        </div>
        <Sprout
          size={144}
          strokeWidth={0.7}
          className="hidden sm:block text-[#BDD0AE] shrink-0 opacity-80"
        />
        <div className="absolute -right-10 -bottom-32 w-80 h-80 rounded-full border border-white/10" />
      </section>
      {error && (
        <div
          role="alert"
          className="rounded-xl bg-red-50 text-red-800 p-4 flex justify-between"
        >
          <p>{error}</p>
          <button onClick={() => void load()} className="underline">
            Retry
          </button>
        </div>
      )}
      {data.members.length === 1 && !loading && (
        <Link
          to={`${prefix}/settings`}
          className="flex items-center gap-3 text-sm text-[#355B48] dark:text-emerald-200 bg-[#E7ECDD] dark:bg-emerald-950 p-4 rounded-2xl"
        >
          <Plus size={18} />
          Make room for everyone. Add your family profiles.
          <ArrowRight size={18} className="ml-auto" />
        </Link>
      )}
      <div className="grid xl:grid-cols-[minmax(0,1fr)_320px] gap-7">
        <section className="min-w-0">
          <div className="flex items-center justify-between mb-5">
            <div>
              <p className="text-[10px] uppercase tracking-[.2em] text-stone-500 mb-1">
                Room for what matters
              </p>
              <h2 className="text-2xl tracking-tight font-semibold">
                The week ahead
              </h2>
            </div>
            <Link
              to={prefix + "/calendar"}
              className="text-sm text-stone-500 flex gap-2 items-center"
            >
              Calendar
              <ArrowRight size={16} />
            </Link>
          </div>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {days.map((day, index) => {
              const events = expanded.filter((e) => isSameDay(e.date, day));
              return (
                <Link
                  to={prefix + "/calendar"}
                  key={day.toISOString()}
                  className={
                    "min-h-40 p-4 rounded-2xl border transition-colors hover:border-[#355B48] " +
                    (index === 0
                      ? "bg-white dark:bg-stone-900 border-[#A9BA9B] sm:col-span-2 lg:col-span-1"
                      : "bg-white/60 dark:bg-stone-900/50 border-stone-200/80 dark:border-stone-800")
                  }
                >
                  <div className="flex items-center justify-between mb-4">
                    <span className="text-xs uppercase tracking-wider text-stone-500">
                      {index === 0 ? "Today" : format(day, "EEE")}
                    </span>
                    <span
                      className={
                        "text-lg tabular-nums " +
                        (index === 0
                          ? "bg-[#355B48] text-white w-9 h-9 rounded-full flex items-center justify-center"
                          : "")
                      }
                    >
                      {format(day, "d")}
                    </span>
                  </div>
                  <div className="space-y-2">
                    {events.slice(0, 3).map((event) => {
                      const member = data.members.find(
                        (m) => m.id === event.member_id,
                      );
                      return (
                        <div
                          key={event.occurrenceId}
                          className={
                            "rounded-lg px-3 py-2 " +
                            (member?.color || "bg-stone-100 text-stone-700")
                          }
                        >
                          <p className="text-[10px] font-semibold opacity-70">
                            {event.is_all_day
                              ? "All day"
                              : format(event.date, "h:mm a")}
                            {" · " + eventMemberLabel(event, data.members)}
                          </p>
                          <p className="text-sm font-medium truncate mt-0.5">
                            {event.title}
                          </p>
                        </div>
                      );
                    })}
                    {!events.length && (
                      <p className="text-xs text-stone-400 pt-4">
                        A little space to breathe.
                      </p>
                    )}
                    {events.length > 3 && (
                      <p className="text-xs text-stone-500">
                        +{events.length - 3} more plans
                      </p>
                    )}
                  </div>
                </Link>
              );
            })}
          </div>
          <Link
            to={prefix + "/calendar"}
            className="mt-4 flex items-center justify-center gap-2 rounded-2xl border border-dashed border-stone-300 dark:border-stone-700 p-4 text-sm text-stone-500 hover:bg-white/60"
          >
            <CalendarDays size={18} />
            Plan something together
          </Link>
        </section>
        <aside className="space-y-5">
          <section className="bg-white dark:bg-stone-900 border border-stone-200/80 dark:border-stone-800 rounded-3xl p-6">
            <div className="flex justify-between items-center mb-5">
              <h2 className="font-semibold text-lg">Little wins</h2>
              <CheckCheck
                size={20}
                className="text-[#355B48] dark:text-emerald-200"
              />
            </div>
            <div className="h-1.5 bg-stone-100 dark:bg-stone-800 rounded-full overflow-hidden mb-2">
              <div
                className="h-full bg-[#8EA580] rounded-full"
                style={{
                  width: data.chores.length
                    ? (done / data.chores.length) * 100 + "%"
                    : "0%",
                }}
              />
            </div>
            <p className="text-xs text-stone-500 mb-5">
              {done} of {data.chores.length} tasks complete
            </p>
            <div className="space-y-4">
              {pending.slice(0, 4).map((chore) => (
                <div key={chore.id} className="flex items-center gap-3">
                  <button
                    onClick={() => void complete(chore)}
                    aria-label={"Complete " + chore.title}
                    className="w-12 h-12 shrink-0 rounded-full border border-stone-200 dark:border-stone-700 flex items-center justify-center text-stone-300 hover:bg-[#E7ECDD] hover:text-[#355B48]"
                  >
                    <Check size={20} />
                  </button>
                  <div className="min-w-0">
                    <p className="text-sm font-medium truncate">
                      {chore.title}
                    </p>
                    <p className="text-xs text-stone-500">
                      {data.members.find((m) => m.id === chore.member_id)?.name}{" "}
                      · {chore.time_of_day}
                    </p>
                  </div>
                </div>
              ))}
            </div>
            {!pending.length && (
              <p className="text-sm text-stone-500">
                {data.chores.length
                  ? "All done. Enjoy your time together."
                  : "Add a small routine to get started."}
              </p>
            )}
            <Link
              to={prefix + "/chores"}
              className="mt-5 pt-4 border-t border-stone-100 dark:border-stone-800 flex justify-between text-xs text-stone-500"
            >
              All family tasks
              <ArrowRight size={15} />
            </Link>
          </section>
          <Link
            to={prefix + "/meals"}
            className="block rounded-3xl bg-[#EAE4D7] dark:bg-stone-800 p-6"
          >
            <CookingPot
              size={24}
              className="text-[#786646] dark:text-amber-100 mb-5"
            />
            <p className="text-[10px] uppercase tracking-[.2em] text-stone-500 mb-2">
              Around the table
            </p>
            <h2 className="text-xl font-semibold">
              {dinner.length
                ? dinner.map((m) => m.title).join(" & ")
                : "What’s for dinner?"}
            </h2>
            <p className="text-sm text-stone-500 mt-2">
              {dinner.length
                ? "Tonight’s plan, all taken care of."
                : "Give tonight a little thought."}
            </p>
            <span className="mt-5 flex items-center gap-2 text-xs font-medium">
              Open meal plan
              <ArrowRight size={15} />
            </span>
          </Link>
        </aside>
      </div>
    </div>
  );
}
