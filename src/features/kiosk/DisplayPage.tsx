import { useCallback, useEffect, useState } from "react";
import { Navigate } from "react-router-dom";
import { addDays, format, startOfDay } from "date-fns";
import { Check, Leaf, LockKeyhole } from "lucide-react";
import { useAuth } from "../../context/AuthContext";
import { apiFetch } from "../../lib/api";
import { segments } from "../../lib/calendar";
import { eventMemberLabel } from "../../lib/eventMembers";
import { calendarEventsURL } from "../../lib/calendarRange";
import type {
  Chore,
  Event as CalendarEvent,
  FamilyMember,
  Meal,
} from "../../types";
export function DisplayPage() {
  const { user, isLoading } = useAuth();
  const [now, setNow] = useState(new Date());
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [chores, setChores] = useState<Chore[]>([]);
  const [members, setMembers] = useState<FamilyMember[]>([]);
  const [meals, setMeals] = useState<Meal[]>([]);
  const [family, setFamily] = useState("MyLight");
  const [canComplete, setCanComplete] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState<number | null>(null);
  const [view, setView] = useState<"today" | "week">("today");
  const [homeView, setHomeView] = useState<"today" | "week">("today");
  const [theme, setTheme] = useState("system");
  useEffect(() => setView(homeView), [homeView]);
  useEffect(() => {
    if (user?.role !== "display") return;
    window.dispatchEvent(new CustomEvent("theme-change", { detail: theme }));
  }, [theme, user?.role]);
  const load = useCallback(async () => {
    if (user?.role !== "display") return;
    const start = startOfDay(new Date());
    const responses = await Promise.all(
      [
        calendarEventsURL(start, addDays(start, 7)),
        "/api/chores",
        "/api/family",
        "/api/meals",
        "/api/settings",
        "/api/device",
      ].map((path) => apiFetch(path).then((r) => r.json())),
    );
    return responses;
  }, [user?.role]);
  useEffect(() => {
    let active = true;
    let version = 0;
    async function refresh() {
      const request = ++version;
      try {
        const data = await load();
        if (!active || request !== version || !data) return;
        const [eventData, choreData, familyData, mealData, settings, device] =
          data;
        setEvents(eventData);
        setChores(Object.values(choreData as Record<string, Chore[]>).flat());
        setMembers(familyData);
        setMeals(mealData);
        setFamily(settings.family_name || "MyLight");
        setCanComplete(device.can_complete_tasks);
        setHomeView(
          device.preferences?.home_view === "week" ? "week" : "today",
        );
        setTheme(device.preferences?.theme || "system");
        setError("");
      } catch {
        if (active && request === version)
          setError("Could not refresh. Showing the last loaded plans.");
      }
    }
    void refresh();
    window.addEventListener("system-update", refresh);
    const timer = setInterval(() => {
      setNow(new Date());
      void refresh();
    }, 60000);
    return () => {
      active = false;
      clearInterval(timer);
      window.removeEventListener("system-update", refresh);
    };
  }, [load]);
  async function complete(chore: Chore) {
    if (!canComplete || busy !== null) return;
    setBusy(chore.id);
    try {
      await apiFetch(`/api/chores/${chore.id}/toggle`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ completed: !chore.completed }),
      });
      window.dispatchEvent(new Event("system-update"));
    } catch {
      setError("That task did not save. Try again when connected.");
    } finally {
      setBusy(null);
    }
  }
  if (isLoading) return <p className="p-8">Checking display access…</p>;
  if (!user) return <Navigate to="/pair" replace />;
  if (user.role !== "display") return <Navigate to="/kiosk" replace />;
  const start = startOfDay(now);
  const planned = segments(
    events,
    start,
    addDays(start, view === "week" ? 7 : 1),
  );
  const dinner = meals.filter(
    (meal) => meal.date === format(now, "yyyy-MM-dd"),
  );
  const nameFor = (id: number) =>
    members.find((member) => member.id === id)?.name || "Family";
  return (
    <main className="min-h-dvh bg-[#F7F5F0] dark:bg-stone-950 text-[#252923] dark:text-stone-100 p-5 sm:p-8 lg:p-10">
      <header className="flex flex-wrap justify-between items-center gap-5 mb-8">
        <div>
          <p className="flex gap-2 items-center text-sm font-medium text-[#355B48] dark:text-emerald-300">
            <Leaf size={22} />
            {family}
          </p>
          <h1 className="mt-2 text-3xl lg:text-4xl font-semibold tracking-tight">
            {format(now, "EEEE, MMMM d")}
          </h1>
        </div>
        <div className="flex items-center gap-4">
          <span className="text-2xl tabular-nums">{format(now, "h:mm a")}</span>
          <span className="flex items-center gap-1 text-xs text-stone-600 dark:text-stone-400">
            <LockKeyhole size={14} />
            Paired display
          </span>
        </div>
      </header>
      {error && (
        <p
          role="status"
          className="mb-5 rounded-xl p-4 bg-amber-50 dark:bg-amber-950 text-amber-800 dark:text-amber-200"
        >
          {error}
        </p>
      )}
      <div className="grid lg:grid-cols-[1.5fr_1fr] gap-6">
        <section className="rounded-3xl bg-white dark:bg-stone-900 p-6 border border-stone-200 dark:border-stone-800">
          <div className="flex items-center justify-between gap-3 mb-6">
            <h2 className="text-xl font-semibold">The family calendar</h2>
            <div className="flex rounded-xl bg-stone-100 dark:bg-stone-800 p-1">
              {(["today", "week"] as const).map((value) => (
                <button
                  key={value}
                  aria-pressed={view === value}
                  onClick={() => setView(value)}
                  className={`min-h-12 px-4 rounded-lg text-sm capitalize ${view === value ? "bg-white dark:bg-stone-700 shadow-sm" : "text-stone-600 dark:text-stone-400"}`}
                >
                  {value}
                </button>
              ))}
            </div>
          </div>
          {planned.length === 0 ? (
            <p className="py-12 text-stone-600 dark:text-stone-400 text-center">
              A little breathing room. No plans here yet.
            </p>
          ) : (
            <div className="space-y-3">
              {planned.map((event) => (
                <details
                  key={event.id}
                  className="rounded-2xl bg-[#eef3ed] dark:bg-emerald-950/30 p-5"
                >
                  <summary className="cursor-pointer marker:text-[#355B48]">
                    <span className="text-xs text-stone-600 dark:text-stone-400">
                      {view === "week"
                        ? format(event.date, "EEE, MMM d · ")
                        : ""}
                      {event.is_all_day
                        ? "All day"
                        : format(event.date, "h:mm a")}
                    </span>
                    <span className="block mt-1 text-xl lg:text-2xl font-medium">
                      {event.title}
                    </span>
                    <span className="block mt-2 text-sm text-stone-600 dark:text-stone-400">
                      {eventMemberLabel(event, members)}
                    </span>
                  </summary>
                  {event.location && (
                    <p className="mt-3 text-sm">{event.location}</p>
                  )}
                  {event.description && (
                    <p className="mt-3 whitespace-pre-wrap text-sm text-stone-600 dark:text-stone-400">
                      {event.description}
                    </p>
                  )}
                </details>
              ))}
            </div>
          )}
        </section>
        <div className="space-y-6">
          <section className="rounded-3xl bg-white dark:bg-stone-900 p-6 border border-stone-200 dark:border-stone-800">
            <h2 className="text-xl font-semibold mb-2">
              Little things, together.
            </h2>
            <p className="text-sm text-stone-600 dark:text-stone-400 mb-5">
              {canComplete
                ? "Tap a task to complete it. Tap again to undo."
                : "View-only. An owner can approve task completion when pairing."}
            </p>
            <div className="space-y-3">
              {chores.length === 0 ? (
                <p className="text-stone-600 dark:text-stone-400 py-4">
                  No tasks planned yet.
                </p>
              ) : (
                chores.map((chore) => (
                  <button
                    key={chore.id}
                    disabled={!canComplete || busy !== null}
                    onClick={() => void complete(chore)}
                    aria-pressed={chore.completed}
                    className="w-full flex gap-4 text-left items-center rounded-2xl border border-stone-200 dark:border-stone-700 p-4 min-h-20 disabled:cursor-default"
                  >
                    <span
                      className={`w-8 h-8 shrink-0 rounded-full border grid place-items-center ${chore.completed ? "bg-[#355B48] border-[#355B48] text-white" : "border-stone-300"}`}
                    >
                      {chore.completed && <Check size={20} />}
                    </span>
                    <span>
                      <span
                        className={`block text-lg ${chore.completed ? "line-through text-stone-400" : ""}`}
                      >
                        {chore.title}
                      </span>
                      <span className="text-xs text-stone-600 dark:text-stone-400">
                        {nameFor(chore.member_id)} · {chore.time_of_day}
                      </span>
                    </span>
                  </button>
                ))
              )}
            </div>
          </section>
          <section className="rounded-3xl bg-[#eee4d6] dark:bg-amber-950/30 p-6">
            <h2 className="text-xl font-semibold mb-4">At the table</h2>
            {dinner.length === 0 ? (
              <p className="text-stone-600 dark:text-stone-400">
                Dinner is still open for ideas.
              </p>
            ) : (
              dinner.map((meal) => (
                <div key={meal.id} className="mt-4">
                  <p className="text-xs uppercase tracking-wider text-stone-600 dark:text-stone-400">
                    {meal.type}
                  </p>
                  <p className="mt-1 text-xl font-medium">{meal.title}</p>
                </div>
              ))
            )}
          </section>
        </div>
      </div>
      <p className="text-center text-xs text-stone-600 dark:text-stone-400 mt-8">
        Manage this screen from Settings → Displays on your phone. This screen
        cannot edit calendars or account settings.
      </p>
    </main>
  );
}
