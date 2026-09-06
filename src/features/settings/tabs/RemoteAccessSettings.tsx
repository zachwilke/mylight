import { useEffect, useState } from "react";
import { Globe, LockKeyhole, ExternalLink, ShieldCheck } from "lucide-react";
import { useAuth } from "../../../context/AuthContext";
import { apiFetch } from "../../../lib/api";

interface RemoteStatus {
  enabled: boolean;
  tailnet_only: boolean;
  state: string;
  message: string;
  url?: string;
  auth_url?: string;
}

export function RemoteAccessSettings() {
  const { user } = useAuth();
  const [status, setStatus] = useState<RemoteStatus | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    if (user?.role !== "admin") return;
    let active = true;
    let timer: ReturnType<typeof setTimeout>;
    async function load() {
      try {
        const response = await apiFetch("/api/remote-access");
        const data: RemoteStatus = await response.json();
        if (
          !data ||
          typeof data.enabled !== "boolean" ||
          typeof data.state !== "string" ||
          typeof data.message !== "string"
        )
          throw new Error("Invalid remote-access status");
        if (active) {
          setStatus(data);
          setError("");
        }
      } catch {
        if (active)
          setError("Could not check the connection. Retrying shortly.");
      } finally {
        if (active) timer = setTimeout(load, 10000);
      }
    }
    void load();
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [user?.role]);

  if (user?.role !== "admin")
    return (
      <p className="text-stone-500">
        Only the household owner can manage private remote access.
      </p>
    );
  return (
    <section className="rounded-3xl border border-stone-200 bg-white dark:bg-stone-900 dark:border-stone-800 overflow-hidden">
      <div className="p-6 sm:p-8 bg-[#eef3ed] dark:bg-emerald-950/30">
        <div className="flex items-center justify-between gap-4 mb-6">
          <div className="rounded-2xl bg-white dark:bg-stone-800 p-3 text-[#355B48]">
            <Globe size={28} />
          </div>
          <span className="text-xs font-semibold uppercase tracking-widest text-[#355B48] dark:text-emerald-300">
            Private by design
          </span>
        </div>
        <h2 className="text-2xl font-semibold tracking-tight">
          Home, wherever you are.
        </h2>
        <p className="mt-3 text-sm text-stone-600 dark:text-stone-300 max-w-xl leading-relaxed">
          Tailscale connects your phone to your own MyLight server. No router
          port forwarding, public website, or separate Tailscale container
          needed.
        </p>
      </div>
      <div className="p-6 sm:p-8 space-y-6">
        <div
          aria-live="polite"
          className="rounded-2xl bg-stone-50 dark:bg-stone-800 p-4"
        >
          <div className="flex items-center gap-2 font-semibold">
            <span
              className={`h-2.5 w-2.5 rounded-full ${status?.state === "ready" ? "bg-emerald-500" : "bg-stone-400"}`}
            />
            {status?.state === "ready"
              ? "Private HTTPS configured"
              : status?.enabled
                ? "Connecting your home"
                : status
                  ? "Not enabled"
                  : "Checking connection…"}
          </div>
          <p className="mt-2 text-sm text-stone-500">
            {error || status?.message}
          </p>
          {status?.url && (
            <a
              className="mt-3 inline-flex items-center gap-2 break-all text-sm text-emerald-700 dark:text-emerald-300 underline"
              href={status.url}
              target="_blank"
              rel="noopener noreferrer"
            >
              {status.url}
              <ExternalLink size={14} />
            </a>
          )}
          {status?.auth_url && (
            <a
              className="mt-4 inline-flex rounded-xl bg-[#355B48] text-white px-4 py-3 text-sm"
              href={status.auth_url}
              target="_blank"
              rel="noopener noreferrer"
            >
              Authorize this MyLight device
            </a>
          )}
        </div>
        {!status?.enabled && (
          <div className="space-y-3 text-sm">
            <h3 className="font-semibold">One setting to get started</h3>
            <p className="text-stone-500">
              Add this to your Compose .env file, then restart MyLight. For a
              native executable, set it in the environment before starting.
            </p>
            <pre className="rounded-xl bg-stone-900 text-emerald-200 p-4 overflow-x-auto text-xs">
              MYLIGHT_TAILSCALE=true
            </pre>
            <p className="text-stone-500">
              Return here to authorize the device. Enable MagicDNS and HTTPS
              certificates in your Tailscale admin console, then connect your
              phone to the same tailnet.
            </p>
          </div>
        )}
        <div className="grid sm:grid-cols-2 gap-5 text-sm">
          <div className="flex gap-3">
            <LockKeyhole className="shrink-0 text-[#355B48]" size={20} />
            <div>
              <h3 className="font-semibold">Your sign-in stays</h3>
              <p className="text-stone-500 mt-1">
                Tailscale is the private connection, not an account bypass.
                MyLight still requires sign-in.
              </p>
            </div>
          </div>
          <div className="flex gap-3">
            <ShieldCheck className="shrink-0 text-[#355B48]" size={20} />
            <div>
              <h3 className="font-semibold">
                {status?.tailnet_only
                  ? "Tailnet-only access"
                  : "Local access stays available"}
              </h3>
              <p className="text-stone-500 mt-1">
                {status?.tailnet_only
                  ? "LAN access is disabled. A loopback-only HTTP endpoint remains for local recovery."
                  : "Optionally set MYLIGHT_TAILSCALE_ONLY=true to disable LAN HTTP access after enrollment."}
              </p>
            </div>
          </div>
        </div>
        <p className="text-xs text-stone-500 leading-relaxed">
          Tailscale is an optional external service. Its account, network
          policy, and certificate settings apply. HTTPS certificate names appear
          in public certificate transparency logs. Device identity is stored
          separately from your household backup. MyLight does not enable Funnel
          or publish your calendar.
        </p>
        <a
          href="https://tailscale.com/docs/how-to/set-up-https-certificates"
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-2 text-sm underline text-emerald-700 dark:text-emerald-300"
        >
          Tailscale HTTPS setup <ExternalLink size={14} />
        </a>
      </div>
    </section>
  );
}
