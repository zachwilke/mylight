import { useEffect, useState } from "react";
import { useAuth } from "../context/AuthContext";

export function SystemStatus() {
  const { user } = useAuth();
  const [error, setError] = useState("");
  const [offline, setOffline] = useState(false);
  useEffect(() => {
    const handle = (event: Event) =>
      setError(String((event as CustomEvent).detail));
    window.addEventListener("api-error", handle);
    return () => window.removeEventListener("api-error", handle);
  }, []);
  useEffect(() => {
    if (!user) {
      setOffline(false);
      setError("");
      return;
    }
    const source = new EventSource("/api/updates");
    source.onopen = () => {
      setOffline(false);
      window.dispatchEvent(new Event("system-update"));
    };
    source.onmessage = () => window.dispatchEvent(new Event("system-update"));
    source.addEventListener("session-expired", () => {
      source.close();
      window.dispatchEvent(new Event("session-expired"));
    });
    source.onerror = () => setOffline(true);
    return () => source.close();
  }, [user]);
  if (!error && !offline) return null;
  return (
    <div
      className="fixed bottom-24 md:bottom-6 left-4 right-4 md:left-auto md:max-w-md z-[150] rounded-2xl bg-stone-900 text-white p-4 shadow-xl flex items-center gap-4"
      role="status"
    >
      <p className="text-sm">
        {error || "Reconnecting to your home server. Changes may not save yet."}
      </p>
      {error && (
        <button
          className="min-h-12 px-3 underline"
          onClick={() => setError("")}
        >
          Dismiss
        </button>
      )}
    </div>
  );
}
