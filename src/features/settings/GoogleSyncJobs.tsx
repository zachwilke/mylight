import { addDays, format, parseISO } from "date-fns";
import { useCallback, useEffect, useRef, useState } from "react";
import { ConfirmDialog } from "../../components/ConfirmDialog";
import { apiFetch } from "../../lib/api";
import type {
  GoogleDraft,
  GoogleEventView,
} from "../calendar/components/GoogleEventModal";
interface Job {
  operation?: "update" | "create" | "delete";
  id: string;
  state: string;
  source_name?: string;
  version: number;
  attempts: number;
  next_attempt: number;
  message: string;
  draft: GoogleDraft;
  remote: GoogleEventView | null;
}
const labels: Record<string, string> = {
  pending: "Queued",
  running: "Sending to Google",
  retry: "Waiting to retry",
  paused: "Needs attention",
  conflict: "Review both versions",
};
function DraftDetails({ draft }: { draft: GoogleDraft }) {
  const date = (value: string, end = false) =>
    draft.is_all_day
      ? format(addDays(parseISO(value), end ? -1 : 0), "PPP")
      : new Date(value).toLocaleString();
  return (
    <div className="space-y-2 text-sm break-words">
      <p className="font-semibold">{draft.title || "Untitled appointment"}</p>
      <p>
        {date(draft.start_date)} → {date(draft.end_date, true)}
        {draft.is_all_day ? " · All day" : ""}
      </p>
      <p>{draft.location || "No location"}</p>
      <p className="whitespace-pre-wrap">
        {draft.description || "No description"}
      </p>
    </div>
  );
}
export function GoogleSyncJobs() {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [error, setError] = useState("");
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [confirm, setConfirm] = useState<{ job: Job; action: string } | null>(
    null,
  );
  const generation = useRef(0);
  const load = useCallback(async () => {
    const version = ++generation.current;
    const response = await apiFetch("/api/google-jobs");
    const data: Job[] = await response.json();
    if (!Array.isArray(data))
      throw new Error("Could not read outgoing Google changes");
    if (generation.current !== version) return;
    setError("");
    setJobs(data);
    setLoaded(true);
  }, []);
  const invalidate = useCallback(() => {
    generation.current++;
  }, []);
  useEffect(() => {
    let active = true;
    const refresh = () => {
      if (active)
        void load().catch((e) =>
          setError(
            e instanceof Error
              ? e.message
              : "Could not read outgoing Google changes",
          ),
        );
    };
    refresh();
    window.addEventListener("system-update", refresh);
    return () => {
      active = false;
      invalidate();
      window.removeEventListener("system-update", refresh);
    };
  }, [load, invalidate]);
  async function resolve() {
    if (!confirm || busy) return;
    setBusy(true);
    setError("");
    try {
      await apiFetch(`/api/google-jobs/${confirm.job.id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: confirm.action,
          version: confirm.job.version,
          etag:
            confirm.action === "apply" ? confirm.job.remote?.etag : undefined,
        }),
      });
      setConfirm(null);
      await load();
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : "Could not update this outgoing change",
      );
      throw e;
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="rounded-3xl border border-stone-200 dark:border-stone-800 bg-white dark:bg-stone-900 p-6 space-y-4">
      <h3 className="text-lg font-semibold">Outgoing Google changes</h3>
      <p className="text-sm text-stone-500">
        Changes are saved here until Google accepts them. A version conflict
        waits for your choice.
      </p>
      {error && (
        <p role="alert" className="rounded-xl bg-amber-50 text-amber-900 p-4">
          {error}
        </p>
      )}
      {!loaded && <p role="status">Loading outgoing changes…</p>}
      {loaded && !jobs.length && (
        <p className="text-sm text-stone-500">No outgoing changes waiting.</p>
      )}
      <button
        disabled={busy}
        onClick={() => void load().catch((e) => setError(e.message))}
        className="min-h-11 underline text-sm"
      >
        Refresh outgoing changes
      </button>
      {jobs.map((job) => (
        <article
          key={job.id}
          className="rounded-2xl border border-stone-200 dark:border-stone-700 p-4 space-y-4"
        >
          <div>
            <h4 className="font-semibold break-words">{job.draft.title}</h4>
            <p className="text-xs text-stone-500">
              {job.source_name || "Google Calendar"}
            </p>
            <p className="text-sm text-blue-700 dark:text-blue-300">
              {job.operation === "delete"
                ? "Delete · "
                : job.operation === "create"
                  ? "Create · "
                  : ""}
              {labels[job.state] || job.state}
            </p>
          </div>
          {job.message && (
            <p className="text-sm text-stone-600 dark:text-stone-300">
              {job.message}
            </p>
          )}
          {job.state === "retry" && (
            <p className="text-xs text-stone-500">
              Next check: {new Date(job.next_attempt * 1000).toLocaleString()}
            </p>
          )}
          <details open={job.state === "conflict"}>
            <summary className="min-h-11 py-3 cursor-pointer text-sm font-medium">
              Review appointment details
            </summary>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="rounded-xl bg-blue-50 dark:bg-blue-950 p-4">
                <h5 className="font-semibold mb-3">
                  {job.operation === "delete"
                    ? "Appointment to delete"
                    : "My draft"}
                </h5>
                <DraftDetails draft={job.draft} />
              </div>
              {job.remote && (
                <div className="rounded-xl bg-stone-100 dark:bg-stone-800 p-4">
                  <h5 className="font-semibold mb-3">Google version</h5>
                  <DraftDetails draft={job.remote} />
                </div>
              )}
            </div>
          </details>
          <div className="flex flex-wrap gap-2">
            {job.state === "conflict" &&
              job.operation !== "create" &&
              job.remote?.editable && (
                <button
                  disabled={busy}
                  onClick={() => setConfirm({ job, action: "apply" })}
                  className="min-h-11 px-4 rounded-xl bg-[#355B48] text-white"
                >
                  {job.operation === "delete"
                    ? "Delete Google version"
                    : "Apply my draft"}
                </button>
              )}
            {["retry", "paused"].includes(job.state) && (
              <button
                disabled={busy}
                onClick={() => setConfirm({ job, action: "retry" })}
                className="min-h-11 px-4 rounded-xl bg-blue-50 text-blue-800"
              >
                Check again
              </button>
            )}
            {job.state !== "running" && (
              <button
                disabled={busy}
                onClick={() => setConfirm({ job, action: "discard" })}
                className="min-h-11 px-4 rounded-xl border border-stone-300"
              >
                {job.state === "conflict"
                  ? "Keep Google version"
                  : job.attempts === 0
                    ? "Cancel queued change"
                    : "Stop retrying"}
              </button>
            )}
          </div>
        </article>
      ))}
      <ConfirmDialog
        isOpen={!!confirm}
        title={
          confirm?.action === "apply"
            ? confirm.job.operation === "delete"
              ? "Delete this Google version?"
              : "Apply your draft to Google?"
            : confirm?.action === "retry"
              ? "Check this change again?"
              : "Stop this outgoing change?"
        }
        message={
          confirm?.action === "apply"
            ? confirm.job.operation === "delete"
              ? "Delete the Google version shown above? Only this appointment or occurrence will be removed. If it changed again, another review will be required."
              : "Replace this appointment's title, dates, location and description with your draft shown above? Other dates in a repeating series stay unchanged. If Google changed again, another review will be required."
            : confirm?.action === "retry"
              ? "MyLight will check Google's latest version before retrying this saved change."
              : "Stop sending this change? This does not undo a change Google may already have accepted. The appointment will show Google's version on the next refresh."
        }
        confirmText={
          confirm?.action === "apply"
            ? confirm.job.operation === "delete"
              ? "Delete reviewed version"
              : "Apply draft"
            : confirm?.action === "retry"
              ? "Check again"
              : "Stop outgoing change"
        }
        onClose={() => setConfirm(null)}
        onConfirm={resolve}
      />
    </section>
  );
}
