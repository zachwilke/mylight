import {
  CalendarDays,
  CheckCircle2,
  RefreshCw,
  ShieldCheck,
  Trash2,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { useAuth } from "../../../context/AuthContext";
import { ConfirmDialog } from "../../../components/ConfirmDialog";
import { apiFetch } from "../../../lib/api";

import { GoogleSyncJobs } from "../GoogleSyncJobs";
import { GoogleCalendars } from "../GoogleCalendars";

interface Source {
  provider?: "google" | "feed";
  id: number;
  name: string;
  color: string;
  last_sync: string;
  last_attempt: string;
  last_error: string;
  range_start: string;
  range_end: string;
  event_count: number;
}
const colors = [
  ["Blue", "bg-blue-100 text-blue-800"],
  ["Green", "bg-emerald-100 text-emerald-800"],
  ["Purple", "bg-purple-100 text-purple-800"],
  ["Orange", "bg-orange-100 text-orange-800"],
  ["Rose", "bg-rose-100 text-rose-800"],
];
export function IntegrationsSettings() {
  const { user } = useAuth();
  const [sources, setSources] = useState<Source[]>([]);
  const [name, setName] = useState("");
  const [url, setURL] = useState("");
  const [color, setColor] = useState(colors[0][1]);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [removing, setRemoving] = useState<Source | null>(null);
  const requestVersion = useRef(0);
  const load = useCallback(async () => {
    if (user?.role !== "admin") return;
    const version = ++requestVersion.current;
    try {
      const response = await apiFetch("/api/calendars");
      const data = (await response.json()) ?? [];
      if (
        !Array.isArray(data) ||
        data.some(
          (source) =>
            !source ||
            typeof source.id !== "number" ||
            typeof source.name !== "string",
        )
      )
        throw new Error("The server returned an invalid calendar list");
      if (version !== requestVersion.current) return;
      setSources(data);
      setError("");
    } catch (e) {
      if (version !== requestVersion.current) return;
      setError(e instanceof Error ? e.message : "Could not read calendars");
    } finally {
      if (version === requestVersion.current) setLoading(false);
    }
  }, [user?.role]);
  useEffect(() => {
    void load();
    const update = () => void load();
    window.addEventListener("system-update", update);
    return () => window.removeEventListener("system-update", update);
  }, [load]);
  async function add(event: React.FormEvent) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    try {
      await apiFetch("/api/calendars", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, url, color }),
      });
      setName("");
      setURL("");
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not add calendar");
    } finally {
      setBusy(false);
    }
  }
  async function sync(source: Source) {
    setBusy(true);
    try {
      await apiFetch("/api/calendars/" + source.id + "/sync", {
        method: "POST",
      });
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not refresh calendar");
    } finally {
      setBusy(false);
    }
  }
  async function remove() {
    if (!removing || busy) return;
    setBusy(true);
    try {
      await apiFetch("/api/calendars/" + removing.id, { method: "DELETE" });
      setRemoving(null);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not remove calendar");
      throw e;
    } finally {
      setBusy(false);
    }
  }
  if (user?.role !== "admin")
    return (
      <p className="p-6">The household owner manages calendar connections.</p>
    );
  return (
    <div className="space-y-6">
      <section className="rounded-3xl bg-[#355B48] text-white p-7">
        <CalendarDays size={30} className="mb-4 text-emerald-200" />
        <h2 className="text-2xl font-semibold">Bring your calendars home.</h2>
        <p className="mt-3 max-w-xl text-emerald-50/85">
          Connect Google or subscribe to a calendar feed from your provider,
          school, or club. Plans appear alongside your family calendar and stay
          available when the internet is down.
        </p>
        <p className="mt-4 text-sm text-emerald-100">
          Automatic refresh · Last 31 days and next year
        </p>
      </section>
      <GoogleCalendars onChange={load} />
      <GoogleSyncJobs />
      {error && (
        <div role="alert" className="rounded-xl bg-red-50 text-red-800 p-4">
          {error}
        </div>
      )}
      {loading && <p role="status">Loading your calendars…</p>}
      {!loading && sources.length === 0 && (
        <p className="text-stone-500">
          Choose a Google calendar above or add your first feed below.
        </p>
      )}
      {sources.map((source) => (
        <section
          key={source.id}
          className="rounded-2xl border border-stone-200 dark:border-stone-800 bg-white dark:bg-stone-900 p-5"
        >
          <div className="flex items-start gap-3">
            <span className={"rounded-xl p-3 " + source.color}>
              <CalendarDays size={22} />
            </span>
            <div className="min-w-0 flex-1">
              <h3 className="font-semibold break-words">{source.name}</h3>
              <p className="text-xs text-stone-500 mt-1">
                {source.event_count} cached occurrences ·{" "}
                {source.provider === "google"
                  ? "Google Calendar"
                  : "Read-only feed"}
              </p>
            </div>
            <button
              type="button"
              disabled={busy}
              aria-label={"Refresh " + source.name}
              onClick={() => void sync(source)}
              className="p-3 rounded-xl hover:bg-stone-100 dark:hover:bg-stone-800 disabled:opacity-40"
            >
              <RefreshCw size={18} />
            </button>
            <button
              type="button"
              disabled={busy}
              aria-label={"Remove " + source.name}
              onClick={() => setRemoving(source)}
              className="p-3 rounded-xl hover:bg-red-50 text-stone-500 disabled:opacity-40"
            >
              <Trash2 size={18} />
            </button>
          </div>
          {source.last_error ? (
            <div
              role="status"
              className="mt-4 rounded-xl bg-amber-50 text-amber-900 p-3 text-sm"
            >
              <p className="font-medium">Refresh needs attention</p>
              <p>{source.last_error}</p>
              {source.last_sync && (
                <p className="mt-1">
                  Keeping the last good copy from{" "}
                  {new Date(source.last_sync).toLocaleString()}.
                </p>
              )}
            </div>
          ) : (
            <p className="mt-4 text-sm text-stone-500 flex gap-2 items-center">
              <CheckCircle2 size={16} />
              {source.last_sync
                ? "Updated " + new Date(source.last_sync).toLocaleString()
                : "Waiting for first refresh"}
            </p>
          )}
          {source.range_end && (
            <p className="text-xs text-stone-500 mt-2">
              Cached dates: {source.range_start} to {source.range_end} (end
              exclusive).
            </p>
          )}
        </section>
      ))}
      <form
        onSubmit={add}
        className="rounded-3xl border border-stone-200 dark:border-stone-800 bg-white dark:bg-stone-900 p-6 space-y-4"
      >
        <h3 className="text-lg font-semibold">Connect a calendar feed</h3>
        <label className="block text-sm font-medium">
          Calendar name
          <input
            required
            maxLength={100}
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="School & activities"
            className="mt-2 w-full p-3 rounded-xl border border-stone-200 dark:border-stone-700 bg-transparent"
          />
        </label>
        <label className="block text-sm font-medium">
          iCalendar feed URL
          <input
            required
            autoComplete="off"
            spellCheck={false}
            value={url}
            onChange={(e) => setURL(e.target.value)}
            placeholder="https://…/calendar.ics"
            className="mt-2 w-full p-3 rounded-xl border border-stone-200 dark:border-stone-700 bg-transparent"
            aria-describedby="feed-privacy"
          />
        </label>
        <p
          id="feed-privacy"
          className="text-xs text-stone-500 flex items-start gap-2"
        >
          <ShieldCheck className="shrink-0" size={16} />
          Use a subscription/export link, not a calendar webpage. Secret links
          stay on your server and are included in private backups. HTTPS or
          webcal links only; local-network feeds are blocked.
        </p>
        <fieldset>
          <legend className="text-sm mb-2">Calendar color</legend>
          <div className="flex gap-2 flex-wrap">
            {colors.map(([label, value]) => (
              <button
                key={value}
                type="button"
                aria-label={label}
                aria-pressed={color === value}
                onClick={() => setColor(value)}
                className={
                  "min-h-11 px-3 rounded-xl border-2 " +
                  value +
                  (color === value
                    ? " border-stone-700"
                    : " border-transparent")
                }
              >
                {label}
              </button>
            ))}
          </div>
        </fieldset>
        <button
          disabled={busy}
          className="px-5 py-3 rounded-xl bg-[#355B48] text-white font-medium disabled:opacity-50"
        >
          {busy ? "Working…" : "Connect calendar"}
        </button>
        <p className="text-xs text-stone-500">
          Edit feed subscriptions in their original calendar. Google editing
          supports individual appointments; whole-series Google changes, iCloud
          editing and Google Chat notifications are not yet available.
        </p>
      </form>
      <ConfirmDialog
        isOpen={!!removing}
        title="Remove connected calendar?"
        message={`Remove ${removing?.name || "this calendar"} and its cached events from MyLight? The original calendar will not change. Reconnect the calendar to restore it.`}
        onClose={() => setRemoving(null)}
        onConfirm={remove}
        confirmText={busy ? "Removing…" : "Remove calendar"}
      />
    </div>
  );
}
