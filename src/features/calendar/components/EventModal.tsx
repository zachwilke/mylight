import { addDays, addHours, format, parseISO } from "date-fns";
import { AlignLeft, Clock, MapPin, Share, X } from "lucide-react";
import React, { useEffect, useRef, useState } from "react";
import { apiFetch } from "../../../lib/api";
import { downloadICS } from "../../../lib/icsUtils";
import { cn } from "../../../lib/utils";
import { Event, FamilyMember } from "../../../types";
import { Modal } from "../../../components/ui/Modal";

interface EventModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (event: Partial<Event>) => Promise<void>;
  currentEvent: Event | null;
  initialDate?: Date | null;
  onDelete: (id: number | string) => void;
  onReload?: () => Promise<void>;
  externalError?: string;
}

export function EventModal({
  isOpen,
  onClose,
  onSave,
  currentEvent,
  onDelete,
  initialDate,
  onReload,
  externalError = "",
}: EventModalProps) {
  const [title, setTitle] = useState("");
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");
  const errorNotice = useRef<HTMLDivElement>(null);
  const [reloading, setReloading] = useState(false);
  const [seriesConfirmed, setSeriesConfirmed] = useState(false);
  const editingSeries = !!(currentEvent?.recurrence || currentEvent?.rrule);
  useEffect(() => {
    if (saveError) {
      errorNotice.current?.scrollIntoView?.({ block: "center" });
      errorNotice.current?.focus({ preventScroll: true });
    }
  }, [saveError]);

  // Date/Time State
  const [startDate, setStartDate] = useState(format(new Date(), "yyyy-MM-dd"));
  const [startTime, setStartTime] = useState("12:00");
  const [endDate, setEndDate] = useState(format(new Date(), "yyyy-MM-dd"));
  const [endTime, setEndTime] = useState("13:00");
  const [isAllDay, setIsAllDay] = useState(false);

  const [memberIds, setMemberIds] = useState<number[]>([]);
  const [recurrence, setRecurrence] = useState("");
  const [location, setLocation] = useState("");
  const [description, setDescription] = useState("");

  const [members, setMembers] = useState<FamilyMember[]>([]);
  const [familyError, setFamilyError] = useState("");
  const [familyLoading, setFamilyLoading] = useState(true);

  useEffect(() => {
    if (!isOpen) return;
    let active = true;
    setFamilyError("");
    setFamilyLoading(true);
    apiFetch("/api/family", { cache: "no-store" })
      .then((res) => res.json())
      .then((data) => {
        if (!active) return;
        if (
          !Array.isArray(data) ||
          data.some(
            (member) =>
              !member ||
              typeof member.id !== "number" ||
              typeof member.name !== "string",
          )
        ) {
          throw new Error("Invalid family profile response");
        }
        setMembers(data);
      })
      .catch(() => {
        if (active) {
          setMembers([]);
          setFamilyError(
            "Could not load family profiles. Close and reopen the event to try again.",
          );
        }
      })
      .finally(() => {
        if (active) setFamilyLoading(false);
      });
    return () => {
      active = false;
    };
  }, [isOpen, currentEvent]);

  useEffect(() => {
    if (isOpen) {
      setSaveError("");
      setSeriesConfirmed(false);
      if (currentEvent) {
        setTitle(currentEvent.title);
        const start = parseISO(currentEvent.start_date);
        setStartDate(format(start, "yyyy-MM-dd"));
        setStartTime(format(start, "HH:mm"));

        if (currentEvent.end_date) {
          const parsedEnd = parseISO(currentEvent.end_date);
          const end =
            currentEvent.is_all_day && currentEvent.end_date.length === 10
              ? addDays(parsedEnd, -1)
              : parsedEnd;
          setEndDate(format(end, "yyyy-MM-dd"));
          setEndTime(format(end, "HH:mm"));
        } else {
          // Default end is +1 hour from start
          const end = addHours(start, 1);
          setEndDate(format(end, "yyyy-MM-dd"));
          setEndTime(format(end, "HH:mm"));
        }

        setMemberIds(
          currentEvent.member_ids ??
            (currentEvent.member_id ? [currentEvent.member_id] : []),
        );
        setRecurrence(currentEvent.recurrence || currentEvent.rrule || "");
        setLocation(currentEvent.location || "");
        setDescription(currentEvent.description || "");
        setIsAllDay(!!currentEvent.is_all_day);
      } else {
        // Reset for new event
        setTitle("");
        setMemberIds([]);
        const now = initialDate ? new Date(initialDate) : new Date();
        // If initialDate provided, use it (it might be midnight from default date)
        // If it came from double click on day, it's 00:00:00 local time of that day usually

        // If initialDate is provided, let's keep time as current time (if today) or 12:00?
        // Usually calendar click implies full day or specific slot. Monthly view click -> Day
        // Let's set default time to now's time or 9am? Existing code used 'now'.

        // If initialDate is different day than today, maybe set to 9AM or just keep using 'now' time on that date?
        if (initialDate) {
          // Keep the time from 'now' but change date
          const timeNow = new Date();
          now.setHours(timeNow.getHours(), timeNow.getMinutes());
        }

        const nextHour = addHours(now, 1);

        setStartDate(format(now, "yyyy-MM-dd"));
        setStartTime(format(now, "HH:mm"));
        setEndDate(format(now, "yyyy-MM-dd"));
        setEndTime(format(nextHour, "HH:mm"));

        setRecurrence("");
        setLocation("");
        setDescription("");
        setIsAllDay(false);
      }
    }
  }, [isOpen, currentEvent, initialDate]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (
      saving ||
      reloading ||
      familyLoading ||
      familyError ||
      (editingSeries && !seriesConfirmed)
    )
      return;

    let startIso: string;
    let endIso: string | undefined;

    if (isAllDay) {
      // The editor's last day is inclusive; storage/ICS use an exclusive end.
      startIso = startDate;
      endIso = format(addDays(parseISO(endDate), 1), "yyyy-MM-dd");
    } else {
      startIso = new Date(`${startDate}T${startTime}`).toISOString();
      endIso = new Date(`${endDate}T${endTime}`).toISOString();
    }

    setSaving(true);
    setSaveError("");
    try {
      await onSave({
        title,
        start_date: startIso,
        end_date: endIso,
        member_ids: memberIds,
        recurrence,
        location,
        description,
        is_all_day: isAllDay,
      });
    } catch (cause) {
      setSaveError(
        cause instanceof Error
          ? cause.message
          : "Could not save event. Your draft is still here.",
      );
    } finally {
      setSaving(false);
    }
  };

  if (!isOpen) return null;

  if (currentEvent?.is_external)
    return (
      <Modal isOpen={isOpen} onClose={onClose} label="Subscribed event">
        <div className="p-7 space-y-4">
          <p className="text-xs uppercase tracking-widest text-stone-500">
            {currentEvent.source_name || "Connected calendar"} · Read-only
          </p>
          <h2 className="text-2xl font-semibold pr-8">{currentEvent.title}</h2>
          <p>
            {format(
              parseISO(currentEvent.start_date),
              currentEvent.is_all_day ? "PPP" : "PPP · p",
            )}
            {currentEvent.is_all_day ? " · All day" : ""}
          </p>
          {currentEvent.end_date && (
            <p className="text-sm text-stone-500">
              Through{" "}
              {format(
                currentEvent.is_all_day
                  ? addDays(parseISO(currentEvent.end_date), -1)
                  : parseISO(currentEvent.end_date),
                currentEvent.is_all_day ? "PPP" : "PPP · p",
              )}
            </p>
          )}
          {currentEvent.location && (
            <p className="break-words">{currentEvent.location}</p>
          )}
          {currentEvent.description && (
            <p className="text-sm whitespace-pre-wrap break-words">
              {currentEvent.description}
            </p>
          )}
          <p className="rounded-xl bg-stone-100 dark:bg-stone-800 p-4 text-sm">
            Make changes in the original calendar. MyLight refreshes this
            read-only copy automatically.
          </p>
        </div>
      </Modal>
    );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/20 dark:bg-black/50 backdrop-blur-sm p-4">
      <div
        role="dialog"
        aria-modal="true"
        aria-label={currentEvent ? "Edit Event" : "New Event"}
        className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto custom-scrollbar animate-in fade-in zoom-in-95 duration-200"
      >
        {/* Header */}
        <div className="px-6 py-4 border-b border-gray-100 dark:border-gray-700 flex items-center justify-between sticky top-0 bg-white dark:bg-gray-800 z-10">
          <h3 className="text-xl font-bold text-gray-800 dark:text-gray-100">
            {currentEvent ? "Edit Event" : "New Event"}
          </h3>
          <div className="flex items-center gap-2">
            {currentEvent && (
              <button
                disabled={saving || reloading}
                onClick={() => {
                  try {
                    downloadICS(currentEvent);
                  } catch (cause) {
                    window.dispatchEvent(
                      new CustomEvent("api-error", {
                        detail:
                          cause instanceof Error
                            ? cause.message
                            : "Could not export this event.",
                      }),
                    );
                  }
                }}
                className="p-2 text-sky-500 hover:text-sky-600 hover:bg-sky-50 rounded-full transition-colors"
                title="Download Invite (ICS)"
              >
                <Share size={20} />
              </button>
            )}
            <button
              disabled={saving || reloading}
              onClick={onClose}
              aria-label="Close event"
              className="p-2 text-gray-400 hover:text-gray-600 rounded-full hover:bg-gray-50 transition-colors"
            >
              <X size={20} />
            </button>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-6">
          {(saveError || externalError) && (
            <div
              role="alert"
              ref={errorNotice}
              tabIndex={-1}
              className="rounded-xl bg-amber-50 dark:bg-amber-950 p-4 text-sm text-amber-900 dark:text-amber-100 space-y-3"
            >
              <p>
                {saveError || externalError}. Your draft has not been discarded.
              </p>
              {currentEvent && onReload && (
                <button
                  type="button"
                  disabled={saving || reloading}
                  className="min-h-11 rounded-lg border border-current px-3"
                  onClick={async () => {
                    setReloading(true);
                    try {
                      await onReload();
                      setSaveError("");
                    } catch (cause) {
                      setSaveError(
                        cause instanceof Error
                          ? cause.message
                          : "Could not load latest event",
                      );
                    } finally {
                      setReloading(false);
                    }
                  }}
                >
                  {reloading ? "Loading…" : "Discard draft and load latest"}
                </button>
              )}
            </div>
          )}
          {editingSeries && (
            <div className="rounded-xl bg-stone-100 dark:bg-stone-900 p-4 text-sm space-y-3">
              <p className="font-semibold">
                Editing the entire recurring series
              </p>
              <p>
                The dates below describe the first occurrence in the series, not
                necessarily the occurrence you clicked. Changes affect past and
                future occurrences. Single-occurrence and “this and future”
                editing are not available yet.
              </p>
              <label className="flex items-center gap-3 min-h-11">
                <input
                  type="checkbox"
                  checked={seriesConfirmed}
                  disabled={saving || reloading}
                  onChange={(e) => setSeriesConfirmed(e.target.checked)}
                  className="h-4 w-4 accent-emerald-700"
                />
                Apply my changes to the entire series
              </label>
            </div>
          )}
          <fieldset
            disabled={saving || reloading}
            className="min-w-0 space-y-6"
          >
            {familyError && (
              <p
                role="alert"
                className="rounded-xl bg-amber-50 dark:bg-amber-950 p-3 text-sm text-amber-900 dark:text-amber-100"
              >
                {familyError}
              </p>
            )}
            {/* Title Input */}
            <div>
              <input
                type="text"
                placeholder="Add Title"
                aria-label="Event title"
                className="w-full text-2xl font-semibold border-b-2 border-gray-100 dark:border-gray-700 py-2 focus:border-blue-500 focus:outline-none bg-transparent placeholder:text-gray-300 dark:placeholder:text-gray-600 dark:text-gray-100 transition-colors"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                autoFocus
                required
              />
            </div>

            {/* All Day Toggle */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-gray-600 dark:text-gray-300">
                <Clock size={18} />
                <span className="text-sm font-medium">All Day</span>
              </div>
              <button
                type="button"
                onClick={() => setIsAllDay(!isAllDay)}
                role="switch"
                aria-label="All day"
                aria-checked={isAllDay}
                className={cn(
                  "relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2",
                  isAllDay ? "bg-blue-600" : "bg-gray-200 dark:bg-gray-700",
                )}
              >
                <span
                  className={cn(
                    "inline-block h-4 w-4 transform rounded-full bg-white transition-transform",
                    isAllDay ? "translate-x-6" : "translate-x-1",
                  )}
                />
              </button>
            </div>

            {/* Date & Time Picker Group */}
            <div className="space-y-3">
              {/* Start */}
              <div className="flex items-center gap-3">
                <div className="flex-1">
                  <label className="block text-xs font-bold text-gray-400 uppercase mb-1">
                    Starts
                  </label>
                  <div className="flex gap-2">
                    <div className="relative flex-1">
                      <input
                        type="date"
                        className="w-full bg-gray-50 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-lg py-2 px-3 text-sm font-medium dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500/50"
                        value={startDate}
                        aria-label="Start date"
                        onChange={(e) => setStartDate(e.target.value)}
                        required
                      />
                    </div>
                    {!isAllDay && (
                      <div className="relative w-32">
                        <input
                          type="time"
                          className="w-full bg-gray-50 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-lg py-2 px-3 text-sm font-medium dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500/50"
                          value={startTime}
                          aria-label="Start time"
                          onChange={(e) => setStartTime(e.target.value)}
                        />
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* End */}
              <div className="flex items-center gap-3">
                <div className="flex-1">
                  <label className="block text-xs font-bold text-gray-400 uppercase mb-1">
                    Ends
                  </label>
                  <div className="flex gap-2">
                    <div className="relative flex-1">
                      <input
                        type="date"
                        className="w-full bg-gray-50 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-lg py-2 px-3 text-sm font-medium dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500/50"
                        value={endDate}
                        aria-label="End date"
                        onChange={(e) => setEndDate(e.target.value)}
                        required
                      />
                    </div>
                    {!isAllDay && (
                      <div className="relative w-32">
                        <input
                          type="time"
                          className="w-full bg-gray-50 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-lg py-2 px-3 text-sm font-medium dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500/50"
                          value={endTime}
                          aria-label="End time"
                          onChange={(e) => setEndTime(e.target.value)}
                        />
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>

            {/* Recurrence */}
            <div>
              <label
                htmlFor="event-repeat"
                className="block text-xs font-bold text-gray-400 uppercase mb-1"
              >
                Repeat
              </label>
              <select
                id="event-repeat"
                className="w-full bg-gray-50 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-lg py-2 px-3 text-sm font-medium dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500/50 appearance-none"
                value={recurrence}
                onChange={(e) => setRecurrence(e.target.value)}
              >
                <option value="" className="dark:bg-gray-800">
                  Does not repeat
                </option>
                <option value="FREQ=DAILY" className="dark:bg-gray-800">
                  Daily
                </option>
                <option value="FREQ=WEEKLY" className="dark:bg-gray-800">
                  Weekly
                </option>
                <option value="FREQ=MONTHLY" className="dark:bg-gray-800">
                  Monthly
                </option>
                <option value="FREQ=YEARLY" className="dark:bg-gray-800">
                  Yearly
                </option>
                {recurrence &&
                  ![
                    "FREQ=DAILY",
                    "FREQ=WEEKLY",
                    "FREQ=MONTHLY",
                    "FREQ=YEARLY",
                  ].includes(recurrence) && (
                    <option value={recurrence}>
                      Custom recurrence (preserved)
                    </option>
                  )}
              </select>
            </div>

            <div className="border-t border-gray-100 dark:border-gray-700 pt-4 space-y-4">
              {/* Member / Calendar */}
              <fieldset
                disabled={familyLoading || saving || !!familyError}
                className="space-y-2"
              >
                <legend className="text-sm font-semibold mb-2">
                  Who's going?
                </legend>
                <p className="text-xs text-stone-500">
                  Select everyone involved. No selection keeps this event in
                  Shared.
                </p>
                {familyLoading ? (
                  <p role="status" className="text-sm">
                    Loading family…
                  </p>
                ) : (
                  <div className="flex flex-wrap gap-2">
                    {[
                      ...members,
                      ...memberIds
                        .filter(
                          (id) => !members.some((member) => member.id === id),
                        )
                        .map((id) => ({
                          id,
                          name: `Unavailable member #${id}`,
                          color: null,
                        })),
                    ].map((member) => (
                      <label
                        key={member.id}
                        className={cn(
                          "min-h-11 max-w-full flex items-center gap-2 rounded-xl border px-3 py-2 text-sm cursor-pointer",
                          member.color ||
                            "bg-stone-100 text-stone-800 dark:bg-stone-700 dark:text-stone-100",
                          memberIds.includes(member.id)
                            ? "border-stone-500"
                            : "border-transparent",
                        )}
                      >
                        <input
                          type="checkbox"
                          checked={memberIds.includes(member.id)}
                          onChange={() =>
                            setMemberIds((ids) =>
                              ids.includes(member.id)
                                ? ids.filter((id) => id !== member.id)
                                : [...ids, member.id],
                            )
                          }
                          className="accent-emerald-700 h-4 w-4 shrink-0"
                        />
                        <span className="break-words min-w-0">
                          {member.name}
                          {members.some(
                            (other) =>
                              other.id !== member.id &&
                              other.name === member.name,
                          )
                            ? ` · #${member.id}`
                            : ""}
                        </span>
                      </label>
                    ))}
                    <button
                      type="button"
                      onClick={() => setMemberIds([])}
                      className="min-h-11 rounded-xl border border-stone-300 dark:border-stone-600 px-3 text-sm"
                    >
                      Clear / Shared
                    </button>
                  </div>
                )}
              </fieldset>

              {/* Location */}
              <div>
                <div className="relative">
                  <MapPin
                    size={16}
                    className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"
                  />
                  <input
                    type="text"
                    placeholder="Add Location"
                    className="w-full bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-600 rounded-lg py-2 pl-10 pr-4 text-sm font-medium dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500/50"
                    value={location}
                    onChange={(e) => setLocation(e.target.value)}
                  />
                </div>
              </div>

              {/* Description */}
              <div>
                <div className="relative">
                  <AlignLeft
                    size={16}
                    className="absolute left-3 top-3 text-gray-400"
                  />
                  <textarea
                    placeholder="Add Description"
                    className="w-full bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-600 rounded-lg py-2 pl-10 pr-4 text-sm font-medium dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500/50 min-h-[80px]"
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                  />
                </div>
              </div>
            </div>

            {/* Action Buttons */}
            <div className="pt-2 flex gap-3">
              {currentEvent && (
                <button
                  type="button"
                  onClick={() => onDelete(currentEvent.id)}
                  className="px-5 py-3 bg-red-50 text-red-500 hover:bg-red-100 rounded-xl font-bold transition-colors text-sm"
                >
                  Delete
                </button>
              )}
              <button
                type="submit"
                disabled={
                  saving ||
                  reloading ||
                  familyLoading ||
                  !!familyError ||
                  (editingSeries && !seriesConfirmed)
                }
                className="flex-1 bg-charcoal dark:bg-white text-white dark:text-charcoal rounded-xl py-3 font-bold hover:bg-gray-800 dark:hover:bg-gray-200 transition-transform active:scale-[0.98] shadow-lg shadow-gray-200 dark:shadow-none"
              >
                {saving
                  ? "Saving…"
                  : editingSeries
                    ? "Save entire series"
                    : currentEvent
                      ? "Save Changes"
                      : "Save Event"}
              </button>
            </div>
          </fieldset>
        </form>
      </div>
    </div>
  );
}
