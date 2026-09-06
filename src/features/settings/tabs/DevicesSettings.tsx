import { useCallback, useEffect, useState } from "react";
import { Monitor, ShieldCheck } from "lucide-react";
import { useAuth } from "../../../context/AuthContext";
import { apiFetch } from "../../../lib/api";
import { ConfirmDialog } from "../../../components/ConfirmDialog";
import { parseDevices, type Device } from "../../../lib/devices";
export function DevicesSettings() {
  const { user } = useAuth();
  const [devices, setDevices] = useState<Device[]>([]);
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [complete, setComplete] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [revoking, setRevoking] = useState<Device | null>(null);
  const load = useCallback(async () => {
    if (user?.role !== "admin") return;
    try {
      const data = await (await apiFetch("/api/devices")).json();
      setDevices(parseDevices(data));
    } catch {
      setError("Could not load your displays. Try again.");
    }
  }, [user?.role]);
  useEffect(() => {
    void load();
  }, [load]);
  async function approve(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      await apiFetch("/api/devices/approve", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, code, can_complete_tasks: complete }),
      });
      setName("");
      setCode("");
      setComplete(false);
      await load();
    } catch {
      setError(
        "Could not approve that code. It may have expired or already been used.",
      );
    } finally {
      setBusy(false);
    }
  }
  async function update(device: Device) {
    setBusy(true);
    setError("");
    try {
      await apiFetch(`/api/devices/${device.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(device),
      });
      await load();
    } catch {
      setError("Could not update that display. Try again.");
    } finally {
      setBusy(false);
    }
  }
  async function revoke(device: Device) {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      await apiFetch(`/api/devices/${device.id}`, { method: "DELETE" });
      setRevoking(null);
      await load();
    } catch {
      setError("Could not revoke this display. Try again.");
    } finally {
      setBusy(false);
    }
  }
  if (user?.role !== "admin")
    return <p>Only the household owner can approve or revoke displays.</p>;
  return (
    <section className="space-y-6">
      <ConfirmDialog
        isOpen={revoking !== null}
        onClose={() => setRevoking(null)}
        onConfirm={() => (revoking ? revoke(revoking) : undefined)}
        title="Disconnect this display?"
        message={`${revoking?.name || "This display"} will need a new pairing code to reconnect.`}
        confirmText="Disconnect"
      />
      <div className="bg-white dark:bg-stone-900 rounded-3xl border border-stone-200 dark:border-stone-800 p-6 sm:p-8 space-y-4">
        <Monitor className="text-[#355B48]" size={28} />
        <h2 className="text-2xl font-semibold">
          Every screen, safely connected.
        </h2>
        <p className="text-sm text-stone-600 dark:text-stone-400">
          On the wall screen, open{" "}
          <span className="font-mono">{window.location.origin}/pair</span>.
          Enter its code here and choose what it can do. Use a separate
          browser/device from your owner session.
        </p>
        <form onSubmit={approve} className="space-y-4">
          <div className="grid sm:grid-cols-2 gap-4">
            <label className="text-sm font-medium">
              Display code
              <input
                required
                value={code}
                onChange={(e) => setCode(e.target.value)}
                placeholder="ABCDE-12345"
                autoComplete="off"
                maxLength={11}
                className="mt-2 w-full rounded-xl border border-stone-200 dark:border-stone-700 bg-transparent px-4 py-3 font-mono uppercase"
              />
            </label>
            <label className="text-sm font-medium">
              Display name
              <input
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Kitchen display"
                maxLength={100}
                className="mt-2 w-full rounded-xl border border-stone-200 dark:border-stone-700 bg-transparent px-4 py-3"
              />
            </label>
          </div>
          <label className="flex items-start gap-3 text-sm py-2">
            <input
              type="checkbox"
              checked={complete}
              onChange={(e) => setComplete(e.target.checked)}
              className="mt-1"
            />
            <span>
              Allow task completion and undo
              <span className="block text-stone-600 dark:text-stone-400 mt-1">
                Otherwise this display is view-only. Account settings, calendar
                edits, uploads, and backups are always blocked.
              </span>
            </span>
          </label>
          <button
            disabled={busy}
            className="rounded-xl bg-[#355B48] px-5 py-3 text-white disabled:opacity-50"
          >
            {busy ? "Saving…" : "Approve display"}
          </button>
        </form>
        {error && (
          <p role="alert" className="text-rose-700 dark:text-rose-300">
            {error}
          </p>
        )}
      </div>
      <div className="space-y-3">
        {devices.length === 0 ? (
          <p className="p-5 text-stone-600 dark:text-stone-400">
            No paired displays yet.
          </p>
        ) : (
          devices.map((device) => (
            <div
              key={device.id}
              className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-stone-200 dark:border-stone-800 bg-white dark:bg-stone-900 p-5"
            >
              <div>
                <h3 className="font-semibold">{device.name}</h3>
                <p className="text-sm text-stone-600 dark:text-stone-400">
                  {device.revoked_at
                    ? "Disconnected"
                    : device.expires_at * 1000 < Date.now()
                      ? "Expired—pair again"
                      : device.can_complete_tasks
                        ? "View and complete tasks"
                        : "View-only"}
                </p>
              </div>
              {!device.revoked_at && (
                <button
                  disabled={busy}
                  onClick={() => setRevoking(device)}
                  className="px-4 py-3 rounded-xl border border-stone-200 dark:border-stone-700 text-sm"
                >
                  Revoke access
                </button>
              )}
              {!device.revoked_at && (
                <div className="flex flex-wrap gap-4 w-full text-sm">
                  <label className="flex items-center gap-2">
                    Home view
                    <select
                      disabled={busy}
                      value={device.preferences.home_view}
                      onChange={(e) =>
                        void update({
                          ...device,
                          preferences: {
                            ...device.preferences,
                            home_view:
                              e.target.value === "week" ? "week" : "today",
                          },
                        })
                      }
                      className="rounded-lg border border-stone-200 dark:border-stone-700 bg-transparent p-3"
                    >
                      <option value="today">Today</option>
                      <option value="week">Week</option>
                    </select>
                  </label>
                  <label className="flex items-center gap-2">
                    Theme
                    <select
                      disabled={busy}
                      value={device.preferences.theme}
                      onChange={(e) =>
                        void update({
                          ...device,
                          preferences: {
                            ...device.preferences,
                            theme:
                              e.target.value === "dark" ||
                              e.target.value === "light"
                                ? e.target.value
                                : "system",
                          },
                        })
                      }
                      className="rounded-lg border border-stone-200 dark:border-stone-700 bg-transparent p-3"
                    >
                      <option value="system">System</option>
                      <option value="light">Light</option>
                      <option value="dark">Dark</option>
                    </select>
                  </label>
                  <label className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      disabled={busy}
                      checked={device.can_complete_tasks}
                      onChange={(e) =>
                        void update({
                          ...device,
                          can_complete_tasks: e.target.checked,
                        })
                      }
                    />
                    Allow task completion
                  </label>
                </div>
              )}
            </div>
          ))
        )}
      </div>
      <p className="flex gap-2 text-xs text-stone-600 dark:text-stone-400">
        <ShieldCheck size={16} className="shrink-0" />
        Display credentials expire after a year and are excluded from backups.
        Revocation blocks new requests and closes the live connection; it cannot
        erase information someone already saw.
      </p>
    </section>
  );
}
