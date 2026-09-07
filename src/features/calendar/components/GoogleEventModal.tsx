import { useEffect, useState } from "react";
import { addDays, format, parseISO } from "date-fns";
import { ConfirmDialog } from "../../../components/ConfirmDialog";
import { Modal } from "../../../components/ui";
import { apiFetch } from "../../../lib/api";
import type { Event } from "../../../types";

export interface GoogleDraft {
  title: string;
  start_date: string;
  end_date: string;
  is_all_day: boolean;
  description: string;
  location: string;
}
export interface GoogleEventView extends GoogleDraft {
  etag: string;
  editable: boolean;
  recurring: boolean;
}
// getRandomValues also works when the household opens MyLight over LAN HTTP.
const nextRequestID = () =>
  Array.from(crypto.getRandomValues(new Uint8Array(16)), (value) =>
    value.toString(16).padStart(2, "0"),
  ).join("");
const localInput = (value: string, allDay: boolean, end = false) =>
  allDay
    ? end
      ? format(addDays(parseISO(value), -1), "yyyy-MM-dd")
      : value
    : format(new Date(value), "yyyy-MM-dd'T'HH:mm");

export function GoogleEventModal({
  event,
  create = false,
  onClose,
  onQueued,
}: {
  event: Pick<Event, "source_id" | "source_name" | "google_event_id">;
  create?: boolean;
  onClose: () => void;
  onQueued: () => void;
}) {
  const [deleting, setDeleting] = useState(false);
  const [deleteID] = useState(nextRequestID);
  const [saved, setSaved] = useState<GoogleEventView | null>(null);
  const [draft, setDraft] = useState<GoogleDraft | null>(null);
  const [requestID, setRequestID] = useState(() => nextRequestID());
  const [reload, setReload] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const endpoint = `/api/google-events/${event.source_id}/${encodeURIComponent(event.google_event_id || "")}`;
  useEffect(() => {
    if (create) {
      const start = new Date();
      start.setSeconds(0, 0);
      const end = new Date(+start + 3600000);
      const initial: GoogleEventView = {
        title: "",
        start_date: start.toISOString(),
        end_date: end.toISOString(),
        is_all_day: false,
        description: "",
        location: "",
        etag: "",
        editable: true,
        recurring: false,
      };
      setSaved(initial);
      setDraft({
        ...initial,
        start_date: localInput(initial.start_date, false),
        end_date: localInput(initial.end_date, false),
      });
      return;
    }
    let active = true;
    apiFetch(endpoint)
      .then((r) => r.json())
      .then((view: GoogleEventView) => {
        if (active) {
          setSaved(view);
          setDraft({
            ...view,
            start_date: localInput(view.start_date, view.is_all_day),
            end_date: localInput(view.end_date, view.is_all_day, true),
          });
        }
      })
      .catch((e) => {
        if (active)
          setError(
            e instanceof Error
              ? e.message
              : "Could not load Google appointment",
          );
      });
    return () => {
      active = false;
    };
  }, [endpoint, reload, create]);
  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!draft || !saved || busy) return;
    setBusy(true);
    setError("");
    try {
      const value = (field: "start_date" | "end_date") => {
        // Preserve the original seconds/fold when a displayed clock is unchanged.
        if (
          draft.is_all_day === saved.is_all_day &&
          draft[field] ===
            localInput(saved[field], saved.is_all_day, field === "end_date")
        )
          return saved[field];
        if (draft.is_all_day)
          return field === "end_date"
            ? format(addDays(parseISO(draft[field]), 1), "yyyy-MM-dd")
            : draft[field];
        const parsed = new Date(draft[field]);
        if (
          !Number.isFinite(+parsed) ||
          localInput(parsed.toISOString(), false) !== draft[field]
        )
          throw new Error(
            "Choose a valid local time; that clock time does not exist in your timezone",
          );
        return parsed.toISOString();
      };
      await apiFetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...draft,
          start_date: value("start_date"),
          end_date: value("end_date"),
          operation: create ? "create" : "update",
          etag: saved.etag,
          request_id: requestID,
        }),
      });
      onQueued();
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not queue your edit");
    } finally {
      setBusy(false);
    }
  }
  async function remove() {
    if (!saved || busy) return;
    setBusy(true);
    try {
      await apiFetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...saved,
          operation: "delete",
          request_id: deleteID,
        }),
      });
      setDeleting(false);
      onQueued();
      onClose();
    } finally {
      setBusy(false);
    }
  }
  function change(values: Partial<GoogleDraft>) {
    if (busy) return;
    setDraft((current) => current && { ...current, ...values });
    // A retry of an unchanged draft reuses its ID; a changed draft is a new request.
    setRequestID(nextRequestID());
  }
  return (
    <>
      <Modal
        isOpen
        onClose={() => {
          if (!busy) onClose();
        }}
        label={create ? "New Google appointment" : "Edit Google appointment"}
      >
        <form onSubmit={save} className="p-6 space-y-5">
          <div className="pr-8">
            <p className="text-xs uppercase tracking-widest text-stone-500">
              {event.source_name || "Google Calendar"}
            </p>
            <h2 className="text-2xl font-semibold mt-2">
              {create ? "New Google appointment" : "Edit Google appointment"}
            </h2>
          </div>
          <p className="rounded-xl bg-blue-50 text-blue-900 p-4 text-sm">
            {saved?.recurring ? "This changes only this occurrence. " : ""}Your
            change will be queued and sent to Google. If the appointment changed
            there, you can review both versions in Settings → Integrations.
          </p>
          {error && (
            <p
              role="alert"
              className="rounded-xl bg-amber-50 text-amber-900 p-4"
            >
              {error}
              {draft ? ". Your draft has been kept." : ""}
            </p>
          )}
          {!draft && error && (
            <button
              type="button"
              onClick={() => {
                setError("");
                setReload((value) => value + 1);
              }}
              className="min-h-11 underline"
            >
              Retry loading appointment
            </button>
          )}
          {!draft && !error && (
            <p role="status">Loading the latest Google appointment…</p>
          )}
          {draft && (
            <>
              <label className="block text-sm font-medium">
                Title
                <input
                  required
                  maxLength={500}
                  value={draft.title}
                  disabled={busy}
                  onChange={(e) => change({ title: e.target.value })}
                  className="mt-2 w-full border rounded-xl p-3 bg-transparent"
                />
              </label>
              {create && (
                <label className="flex gap-3 items-center text-sm">
                  <input
                    type="checkbox"
                    checked={draft.is_all_day}
                    disabled={busy}
                    onChange={(e) => {
                      const allDay = e.target.checked;
                      change({
                        is_all_day: allDay,
                        start_date: allDay
                          ? draft.start_date.slice(0, 10)
                          : draft.start_date + "T09:00",
                        end_date: allDay
                          ? draft.end_date.slice(0, 10)
                          : draft.end_date + "T10:00",
                      });
                    }}
                  />
                  All day
                </label>
              )}
              <p className="text-xs text-stone-500">
                {draft.is_all_day
                  ? "All-day appointment."
                  : `Times shown in ${Intl.DateTimeFormat().resolvedOptions().timeZone}.`}
              </p>
              <div className="grid gap-4 sm:grid-cols-2">
                <label className="block text-sm font-medium">
                  Starts
                  <input
                    required
                    type={draft.is_all_day ? "date" : "datetime-local"}
                    value={draft.start_date}
                    disabled={busy}
                    onChange={(e) => change({ start_date: e.target.value })}
                    className="mt-2 w-full min-w-0 border rounded-xl p-3 bg-transparent"
                  />
                </label>
                <label className="block text-sm font-medium">
                  Ends
                  <input
                    required
                    type={draft.is_all_day ? "date" : "datetime-local"}
                    value={draft.end_date}
                    disabled={busy}
                    onChange={(e) => change({ end_date: e.target.value })}
                    className="mt-2 w-full min-w-0 border rounded-xl p-3 bg-transparent"
                  />
                </label>
              </div>
              <label className="block text-sm font-medium">
                Location
                <input
                  maxLength={2000}
                  value={draft.location}
                  disabled={busy}
                  onChange={(e) => change({ location: e.target.value })}
                  className="mt-2 w-full border rounded-xl p-3 bg-transparent"
                />
              </label>
              <label className="block text-sm font-medium">
                Description
                <textarea
                  maxLength={20000}
                  value={draft.description}
                  disabled={busy}
                  onChange={(e) => change({ description: e.target.value })}
                  className="mt-2 w-full border rounded-xl p-3 bg-transparent"
                />
              </label>
              <button
                disabled={busy}
                className="w-full min-h-11 rounded-xl bg-[#355B48] text-white px-5 py-3 disabled:opacity-50"
              >
                {busy
                  ? "Saving your change…"
                  : create
                    ? "Queue Google appointment"
                    : "Queue Google edit"}
              </button>
              {!create && (
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => setDeleting(true)}
                  className="w-full min-h-11 rounded-xl border border-red-200 text-red-700 px-5 py-3"
                >
                  Delete Google appointment
                </button>
              )}
            </>
          )}
        </form>
      </Modal>
      <ConfirmDialog
        isOpen={deleting}
        title="Delete Google appointment?"
        message={`Queue deletion of “${saved?.title}” from Google? ${saved?.recurring ? "Only this occurrence will be removed. " : ""}If it changed in Google, you must review the latest version before deletion.`}
        confirmText="Queue deletion"
        onClose={() => setDeleting(false)}
        onConfirm={remove}
      />
    </>
  );
}
