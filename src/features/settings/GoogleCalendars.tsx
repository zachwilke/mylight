import { useCallback, useEffect, useRef, useState } from "react";
import { CalendarDays, Link2, Plus, Unplug } from "lucide-react";
import { GoogleEventModal } from "../calendar/components/GoogleEventModal";
import { apiFetch } from "../../lib/api";
import { ConfirmDialog } from "../../components/ConfirmDialog";

type Account = { id: number; calendars: number; write_enabled?: boolean };
type Calendar = {
  id: string;
  summary: string;
  accessRole: string;
  connected?: boolean;
  source_id?: number;
};
type Status = { configured: boolean; accounts: Account[] };

export function GoogleCalendars({
  onChange,
}: {
  onChange: () => Promise<void>;
}) {
  const [creating, setCreating] = useState<Calendar | null>(null);
  const [status, setStatus] = useState<Status | null>(null);
  const [selected, setSelected] = useState<number | null>(null);
  const [calendars, setCalendars] = useState<Calendar[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [removing, setRemoving] = useState<Account | null>(null);
  const [notice, setNotice] = useState(() => {
    const result = new URLSearchParams(window.location.search).get("google");
    return result === "connected"
      ? "Google connected. Choose which calendars to bring home."
      : result === "failed"
        ? "Google connection did not finish. Try again from this browser and allow both calendar permissions."
        : "";
  });
  const generation = useRef(0);
  const load = useCallback(async () => {
    const version = ++generation.current;
    const response = await apiFetch("/api/google");
    const data: Status = await response.json();
    if (typeof data.configured !== "boolean" || !Array.isArray(data.accounts))
      throw new Error("Could not read Google connections");
    if (generation.current === version) setStatus(data);
  }, []);
  const invalidate = useCallback(() => {
    generation.current++;
  }, []);
  useEffect(() => {
    const refresh = () =>
      void load().catch((e) =>
        setError(
          e instanceof Error ? e.message : "Could not read Google connections",
        ),
      );
    refresh();
    window.addEventListener("system-update", refresh);
    // Only a generic outcome appears in this URL; codes and tokens never do.
    const url = new URL(window.location.href);
    if (url.searchParams.has("google")) {
      url.searchParams.delete("google");
      window.history.replaceState(null, "", url.pathname + url.search);
    }
    return () => {
      invalidate();
      window.removeEventListener("system-update", refresh);
    };
  }, [load, invalidate]);
  async function run(action: () => Promise<void>) {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      await action();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Google connection failed");
    } finally {
      setBusy(false);
    }
  }
  async function connect(account?: Account, editing = false) {
    const response = await apiFetch("/api/google/connect", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ account_id: account?.id, allow_editing: editing }),
    });
    const { url } = await response.json();
    const destination = new URL(url);
    if (destination.origin !== "https://accounts.google.com")
      throw new Error("Invalid Google connection link");
    window.location.assign(destination.href);
  }
  async function choose(account: Account) {
    setSelected(null);
    setCalendars([]);
    const response = await apiFetch(`/api/google/${account.id}/calendars`);
    const data: Calendar[] = await response.json();
    if (!Array.isArray(data))
      throw new Error("Could not read Google calendars");
    setCalendars(data);
    setSelected(account.id);
  }
  async function add(calendar: Calendar) {
    await apiFetch(`/api/google/${selected}/calendars`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ calendar_id: calendar.id }),
    });
    setCalendars((items) =>
      items.map((item) =>
        item.id === calendar.id ? { ...item, connected: true } : item,
      ),
    );
    await onChange();
    await load();
    setNotice(
      `${calendar.summary || "Google Calendar"} added. Its refresh status is shown below.`,
    );
  }
  async function disconnect() {
    if (!removing || busy) return;
    setBusy(true);
    setError("");
    try {
      await apiFetch(`/api/google/${removing.id}`, { method: "DELETE" });
      setRemoving(null);
      setSelected(null);
      setCalendars([]);
      await load();
      await onChange();
      setNotice("Google account disconnected from MyLight.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not disconnect Google");
      throw e;
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="rounded-3xl border border-stone-200 dark:border-stone-800 bg-white dark:bg-stone-900 p-6 space-y-4">
      <div className="flex items-center gap-3">
        <span className="p-3 rounded-2xl bg-blue-50 text-blue-700">
          <CalendarDays size={24} />
        </span>
        <div>
          <h3 className="text-lg font-semibold">Google Calendar</h3>
          <p className="text-sm text-stone-500">
            Your plans, together in one place.
          </p>
        </div>
      </div>
      <p className="text-sm text-stone-600 dark:text-stone-300">
        Connect your account and choose calendars to display. Changes from
        Google appear here automatically. Enable editing on an account to change
        individual appointments from MyLight.
      </p>
      {notice && (
        <p
          role="status"
          className="rounded-xl bg-blue-50 text-blue-900 p-3 text-sm"
        >
          {notice}
        </p>
      )}
      {error && (
        <p role="alert" className="rounded-xl bg-red-50 text-red-800 p-3">
          {error}
        </p>
      )}
      {!status && (
        <button
          disabled={busy}
          onClick={() => void run(load)}
          className="min-h-11 underline"
        >
          {error ? "Retry Google connections" : "Loading Google connections…"}
        </button>
      )}
      {status && !status.configured && (
        <p className="rounded-xl bg-stone-50 dark:bg-stone-800 p-4 text-sm">
          Google needs a one-time setup by the person running your MyLight
          server. Calendar feeds below are available now.
        </p>
      )}
      {status?.accounts.map((account) => (
        <div
          key={account.id}
          className="rounded-2xl border border-stone-200 dark:border-stone-700 p-4 space-y-3"
        >
          <p className="font-medium">
            Google account {account.id}{" "}
            <span className="text-sm font-normal text-stone-500">
              · {account.calendars} connected calendar
              {account.calendars === 1 ? "" : "s"}
            </span>
          </p>
          <div className="flex flex-wrap gap-2">
            <button
              disabled={busy || !status.configured}
              onClick={() => void run(() => choose(account))}
              className="min-h-11 px-4 rounded-xl bg-blue-50 text-blue-800 disabled:opacity-50"
            >
              Choose calendars
            </button>
            <button
              disabled={busy || !status.configured}
              onClick={() => void run(() => connect(account, true))}
              className="min-h-11 px-4 rounded-xl border border-stone-300 disabled:opacity-50"
            >
              {account.write_enabled
                ? "Reconnect with editing"
                : "Enable editing"}
            </button>
            <p className="text-xs text-stone-500 w-full">
              {account.write_enabled
                ? "Individual appointment editing enabled. Outgoing changes appear below."
                : "Read-only. Enabling editing asks Google for additional permission."}
            </p>
            <button
              disabled={busy}
              onClick={() => setRemoving(account)}
              className="min-h-11 px-4 rounded-xl flex items-center gap-2 text-stone-500 disabled:opacity-50"
            >
              <Unplug size={16} />
              Disconnect
            </button>
          </div>
          {selected === account.id && (
            <div className="space-y-2">
              {calendars.length === 0 && (
                <p className="text-sm text-stone-500">
                  No readable calendars in this account.
                </p>
              )}
              {calendars.map((calendar) => (
                <div
                  key={calendar.id}
                  className="flex items-center justify-between gap-3 border-t border-stone-100 dark:border-stone-800 pt-2"
                >
                  <span className="min-w-0 break-words">
                    {calendar.summary || "Untitled calendar"}
                  </span>
                  {account.write_enabled &&
                    calendar.source_id &&
                    ["owner", "writer"].includes(calendar.accessRole) && (
                      <button
                        disabled={busy}
                        onClick={() => setCreating(calendar)}
                        className="min-h-11 px-3 rounded-xl text-blue-700"
                      >
                        New appointment
                      </button>
                    )}
                  <button
                    disabled={busy || calendar.connected}
                    aria-label={`${calendar.connected ? "Added" : "Add"} ${calendar.summary || "calendar"}`}
                    onClick={() => void run(() => add(calendar))}
                    className="min-h-11 px-3 rounded-xl flex shrink-0 items-center gap-1 text-blue-700 disabled:opacity-50"
                  >
                    <Plus size={16} />
                    {calendar.connected ? "Added" : "Add"}
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      ))}
      {status?.configured && (
        <button
          disabled={busy}
          onClick={() => void run(() => connect())}
          className="min-h-11 px-5 py-3 rounded-xl bg-[#355B48] text-white font-medium flex items-center gap-2 disabled:opacity-50"
        >
          <Link2 size={18} />
          {busy
            ? "Working…"
            : status.accounts.length
              ? "Connect another Google account"
              : "Connect Google"}
        </button>
      )}
      <p className="text-xs text-stone-500">
        Incoming refresh every 15 minutes · Only selected calendars are saved to
        MyLight
      </p>
      {creating && (
        <GoogleEventModal
          create
          event={{
            source_id: creating.source_id,
            source_name: creating.summary,
          }}
          onClose={() => setCreating(null)}
          onQueued={() => {
            setNotice(
              "Appointment queued. Follow its progress in Outgoing Google changes.",
            );
            window.dispatchEvent(new Event("system-update"));
          }}
        />
      )}
      <ConfirmDialog
        isOpen={!!removing}
        title="Disconnect Google account?"
        message="Remove this account and its cached calendars from MyLight? Your calendars in Google will stay unchanged. You can also remove MyLight's permission in your Google Account settings."
        confirmText="Disconnect"
        onClose={() => setRemoving(null)}
        onConfirm={disconnect}
      />
    </section>
  );
}
