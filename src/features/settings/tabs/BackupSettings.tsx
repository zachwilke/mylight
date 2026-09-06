import { useState } from "react";
import { Download, ShieldCheck } from "lucide-react";
import { apiFetch } from "../../../lib/api";

export function BackupSettings() {
  const [busy, setBusy] = useState(false);
  async function download() {
    setBusy(true);
    try {
      const response = await apiFetch("/api/backup");
      const url = URL.createObjectURL(await response.blob());
      const link = document.createElement("a");
      link.href = url;
      link.download =
        "mylight-" + new Date().toISOString().slice(0, 10) + ".zip";
      link.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch {
      /* Error is shown by the shared request banner. */
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="bg-white dark:bg-stone-900 rounded-3xl border border-stone-200 dark:border-stone-800 p-6 space-y-4">
      <ShieldCheck className="text-[#355B48]" size={28} />
      <h2 className="text-xl font-semibold">A safe copy of home.</h2>
      <p className="text-sm text-stone-500 max-w-lg">
        Download your household data and photos together. Keep the archive
        somewhere private: it includes your account and integration settings.
        Active sign-ins are excluded.
      </p>
      <button
        onClick={() => void download()}
        disabled={busy}
        className="flex items-center gap-2 rounded-xl bg-[#355B48] text-white px-5 py-3 disabled:opacity-50"
      >
        <Download size={18} />
        {busy ? "Preparing your backup…" : "Download backup"}
      </button>
      <p className="text-sm text-stone-500">
        To restore, stop your server and follow the Restore section in the
        README. Your existing data is retained as a recovery copy.
      </p>
    </section>
  );
}
