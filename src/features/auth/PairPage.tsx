import { useEffect, useState } from "react";
import { Link, Navigate } from "react-router-dom";
import { Leaf, Monitor, ShieldCheck } from "lucide-react";
import { useAuth } from "../../context/AuthContext";
import { apiFetch } from "../../lib/api";

export function PairPage() {
  const { user, logout, needsSetup, isLoading, error: authError } = useAuth();
  const [code, setCode] = useState("");
  const [expires, setExpires] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    if (!code) return;
    let active = true;
    let timer: ReturnType<typeof setTimeout>;
    async function poll() {
      try {
        const response = await apiFetch("/api/pairing");
        const data = await response.json();
        if (!active) return;
        if (data.state === "approved") {
          window.location.replace("/display");
          return;
        }
        if (data.state === "expired" || Date.now() >= expires * 1000) {
          setCode("");
          setError("That code expired. Generate a new one.");
          return;
        }
        setError("");
      } catch {
        if (active) setError("Connection interrupted. Retrying…");
      }
      if (active) timer = setTimeout(poll, 3000);
    }
    void poll();
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [code, expires]);
  async function start() {
    setBusy(true);
    setError("");
    try {
      const response = await apiFetch("/api/pairing", { method: "POST" });
      const data = await response.json();
      if (typeof data.code !== "string" || typeof data.expires_at !== "number")
        throw new Error();
      setCode(data.code);
      setExpires(data.expires_at);
    } catch {
      setError("Could not create a code. Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  }
  if (user?.role === "display") return <Navigate to="/display" replace />;
  return (
    <main className="min-h-dvh bg-[#F7F5F0] dark:bg-stone-950 text-[#252923] dark:text-stone-100 grid place-items-center p-6">
      <section className="w-full max-w-xl rounded-[2rem] bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-800 p-8 sm:p-12 text-center space-y-6">
        <Leaf className="mx-auto text-[#355B48]" size={32} />
        <h1 className="text-3xl font-semibold tracking-tight">
          A place for your family’s day.
        </h1>
        <p className="text-stone-600 dark:text-stone-400">
          Connect this screen to MyLight without leaving an owner account signed
          in.
        </p>
        {isLoading ? (
          <p>Checking your household…</p>
        ) : needsSetup ? (
          <Link className="underline" to="/setup">
            Set up your household first
          </Link>
        ) : user ? (
          <button
            className="rounded-xl bg-[#355B48] text-white px-5 py-3"
            onClick={() => void logout()}
          >
            Sign out before pairing this display
          </button>
        ) : code ? (
          <>
            <div className="rounded-2xl bg-[#eef3ed] dark:bg-emerald-950/40 p-6">
              <p className="text-xs uppercase tracking-widest text-stone-600 dark:text-stone-400 mb-3">
                Display code
              </p>
              <p className="font-mono text-3xl sm:text-4xl tracking-wider font-semibold">
                {code}
              </p>
            </div>
            <p>
              On your phone, open this MyLight server, sign in as the owner, and
              enter this code in <strong>Settings → Displays</strong>.
            </p>
            <p className="text-sm text-stone-600 dark:text-stone-400">
              Expires in 10 minutes. Keep this page open; it will connect
              automatically after approval.
            </p>
          </>
        ) : (
          <button
            disabled={busy}
            onClick={() => void start()}
            className="mx-auto flex items-center gap-2 rounded-xl bg-[#355B48] text-white px-6 py-4 disabled:opacity-50"
          >
            <Monitor size={20} />
            {busy ? "Creating code…" : "Pair this display"}
          </button>
        )}
        {(error || authError) && (
          <p role="status" className="text-rose-700 dark:text-rose-300">
            {error || authError}
          </p>
        )}
        <p className="text-xs text-stone-600 dark:text-stone-400 flex justify-center items-center gap-2">
          <ShieldCheck size={16} />
          Only the owner can approve a display. Access can be revoked anytime.
        </p>
        <Link
          to="/login"
          className="inline-block text-sm underline text-stone-600 dark:text-stone-400"
        >
          Use a normal account instead
        </Link>
      </section>
    </main>
  );
}
