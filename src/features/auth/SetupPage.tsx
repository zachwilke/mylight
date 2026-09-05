import { ArrowRight, House, Leaf } from "lucide-react";
import { useState, type FormEvent } from "react";
import { Navigate } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import { apiFetch } from "../../lib/api";

export function SetupPage() {
  const { login, needsSetup, isLoading, user } = useAuth();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  if (isLoading) return <div className="p-12">Getting your home ready…</div>;
  if (!needsSetup) return <Navigate to={user ? "/" : "/login"} replace />;
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    const values = Object.fromEntries(new FormData(event.currentTarget));
    try {
      const data = await (
        await apiFetch("/api/setup", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(values),
        })
      ).json();
      login(data.user);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Setup failed");
    } finally {
      setBusy(false);
    }
  }
  return (
    <main className="min-h-screen overflow-y-auto bg-[#F7F5F0] text-[#252923] grid lg:grid-cols-2">
      <section className="hidden lg:flex flex-col justify-between p-16 bg-[#355B48] text-[#F7F5F0]">
        <div className="flex items-center gap-3 text-2xl font-semibold">
          <Leaf /> MyLight
        </div>
        <div>
          <p className="uppercase tracking-[.25em] text-sm text-emerald-200 mb-8">
            A little more together.
          </p>
          <h1 className="text-6xl leading-tight tracking-tight max-w-lg">
            A lovely place
            <br />
            for everyday life.
          </h1>
          <p className="text-xl mt-8 text-emerald-100/80 max-w-md">
            The plans, the little routines, and everything that makes your
            family yours.
          </p>
        </div>
        <p className="text-sm text-emerald-100/70">
          Your household. Your data. Right at home.
        </p>
      </section>
      <section className="flex items-center justify-center p-6 sm:p-12">
        <form onSubmit={submit} className="w-full max-w-md space-y-5">
          <div className="w-14 h-14 bg-[#E7ECDD] rounded-2xl flex items-center justify-center mb-8">
            <House />
          </div>
          <p className="text-xs uppercase tracking-[.2em] text-stone-500">
            Welcome home
          </p>
          <h2 className="text-4xl font-semibold tracking-tight">
            Make it your own.
          </h2>
          <p className="text-stone-500 pb-3">
            Create your adult account. You can add the rest of your family next.
          </p>
          {[
            ["family_name", "Household name", "The Miller family", "text"],
            ["name", "Your name", "Alex", "text"],
            ["email", "Email", "you@example.com", "email"],
            ["password", "Password", "At least 10 characters", "password"],
          ].map(([name, label, placeholder, type]) => (
            <label key={name} className="block text-sm font-medium">
              {label}
              <input
                name={name}
                type={type}
                placeholder={placeholder}
                required
                minLength={type === "password" ? 10 : undefined}
                maxLength={type === "password" ? 72 : 200}
                autoComplete={
                  type === "password"
                    ? "new-password"
                    : name === "email"
                      ? "email"
                      : "off"
                }
                className="mt-2 block w-full rounded-xl border border-stone-200 bg-white px-4 py-3.5 focus:outline-none focus:ring-2 focus:ring-[#355B48]"
              />
            </label>
          ))}
          <label className="block text-sm font-medium">
            Household timezone
            <input
              name="timezone"
              required
              defaultValue={Intl.DateTimeFormat().resolvedOptions().timeZone}
              className="mt-2 block w-full rounded-xl border border-stone-200 bg-white px-4 py-3.5"
            />
          </label>
          {error && (
            <p role="alert" className="text-red-700">
              {error}
            </p>
          )}
          <button
            disabled={busy}
            className="w-full bg-[#355B48] text-white rounded-xl py-4 flex justify-center gap-3 font-medium disabled:opacity-50"
          >
            {busy ? "Creating your home…" : "Create my household"}
            <ArrowRight size={20} />
          </button>
          <p className="text-xs text-stone-500 text-center">
            This account is stored on your MyLight server.
          </p>
        </form>
      </section>
    </main>
  );
}
