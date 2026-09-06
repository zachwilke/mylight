import { useCallback, useEffect, useState } from "react";
import { ShieldCheck } from "lucide-react";
import { apiFetch } from "../../../lib/api";

interface AccountSession {
  id: string;
  expires_at: number;
  current: boolean;
}

export function AccountSettings() {
  const [sessions, setSessions] = useState<AccountSession[]>([]);
  const [password, setPassword] = useState("");
  const [nextPassword, setNextPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const load = useCallback(async () => {
    const data = await (await apiFetch("/api/account/sessions")).json();
    if (!Array.isArray(data)) throw new Error("Could not load sessions");
    setSessions(data);
  }, []);
  useEffect(() => {
    void load().catch(() => setError("Could not load sessions. Try again."));
  }, [load]);
  async function save(session?: AccountSession) {
    if (busy) return;
    setError("");
    setMessage("");
    if (!password) {
      setError("Enter your current password to confirm this change.");
      return;
    }
    if (!session && nextPassword !== confirmation) {
      setError("The new passwords do not match.");
      return;
    }
    setBusy(true);
    try {
      await apiFetch(
        session ? "/api/account/sessions/revoke" : "/api/account/password",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(
            session
              ? { current_password: password, session_id: session.id }
              : { current_password: password, new_password: nextPassword },
          ),
        },
      );
      setPassword("");
      setNextPassword("");
      setConfirmation("");
      if (!session || session.current) {
        window.dispatchEvent(new Event("session-expired"));
        return;
      }
      setMessage("That session has been signed out.");
      await load();
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Could not update your account.",
      );
    } finally {
      setBusy(false);
    }
  }
  const inputClass =
    "block mt-2 w-full rounded-xl border border-stone-200 dark:border-stone-700 bg-transparent px-4 py-3";
  return (
    <section className="rounded-3xl border border-stone-200 dark:border-stone-800 bg-white dark:bg-stone-900 p-6 sm:p-8 space-y-6">
      <div>
        <ShieldCheck
          className="text-[#355B48] dark:text-emerald-300 mb-3"
          size={28}
        />
        <h2 className="text-2xl font-semibold">
          Your account, under your control.
        </h2>
        <p className="mt-2 text-sm text-stone-600 dark:text-stone-400">
          Confirm your password before changing credentials or disconnecting an
          account session. Paired wall displays are managed separately in
          Displays.
        </p>
      </div>
      <label className="block text-sm font-medium max-w-md">
        Current password
        <input
          type="password"
          autoComplete="current-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className={inputClass}
          disabled={busy}
        />
      </label>
      {error && (
        <p role="alert" className="text-rose-700 dark:text-rose-300">
          {error}
        </p>
      )}
      {message && (
        <p role="status" className="text-emerald-700 dark:text-emerald-300">
          {message}
        </p>
      )}
      <form
        onSubmit={(event) => {
          event.preventDefault();
          void save();
        }}
        className="space-y-4 max-w-md"
      >
        <h3 className="text-lg font-semibold">Change password</h3>
        <label className="block text-sm font-medium">
          New password
          <input
            type="password"
            required
            minLength={10}
            autoComplete="new-password"
            value={nextPassword}
            onChange={(e) => setNextPassword(e.target.value)}
            className={inputClass}
            disabled={busy}
          />
        </label>
        <label className="block text-sm font-medium">
          Confirm new password
          <input
            type="password"
            required
            minLength={10}
            autoComplete="new-password"
            value={confirmation}
            onChange={(e) => setConfirmation(e.target.value)}
            className={inputClass}
            disabled={busy}
          />
        </label>
        <p className="text-sm text-stone-600 dark:text-stone-400">
          Use 10–72 bytes (non-English characters may use more than one byte).
          Changing your password signs out all your account sessions, including
          this one. Your household data and approved wall displays stay intact.
        </p>
        <button
          disabled={busy}
          className="min-h-12 rounded-xl bg-[#355B48] text-white px-5 py-3 disabled:opacity-50"
        >
          {busy ? "Saving…" : "Change password and sign out"}
        </button>
      </form>
      <div className="space-y-3 border-t border-stone-200 dark:border-stone-800 pt-6">
        <h3 className="text-lg font-semibold">Signed-in sessions</h3>
        <p className="text-sm text-stone-600 dark:text-stone-400">
          Only your own account sessions appear here. Sessions expire after 30
          days.
        </p>
        {sessions.map((session) => (
          <div
            key={session.id}
            className="flex flex-wrap justify-between items-center gap-3 p-4 rounded-xl bg-stone-50 dark:bg-stone-800"
          >
            <div>
              <p className="font-medium">
                {session.current ? "This browser" : "Another signed-in session"}
              </p>
              <p className="text-sm text-stone-600 dark:text-stone-400">
                Expires {new Date(session.expires_at * 1000).toLocaleString()}
              </p>
            </div>
            <button
              disabled={busy}
              onClick={() => void save(session)}
              className="min-h-12 px-4 py-3 rounded-xl border border-stone-300 dark:border-stone-600 disabled:opacity-50"
            >
              Sign out{session.current ? " here" : " session"}
            </button>
          </div>
        ))}
      </div>
    </section>
  );
}
