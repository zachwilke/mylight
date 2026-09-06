import { addDays, addMonths, format, subMonths } from "date-fns";
import { motion } from "framer-motion";
import { ChevronLeft, ChevronRight, Plus } from "lucide-react";
import React, { useState } from "react";
import { ConfirmDialog } from "../../components/ConfirmDialog";
import { apiFetch } from "../../lib/api";
import { cn } from "../../lib/utils";
import { DayView } from "./components/DayView";
import { EventModal } from "./components/EventModal";
import { MonthGrid } from "./components/MonthGrid";
import { WeekView } from "./components/WeekView";

import { Event } from "../../types";
import type { FamilySelection } from "../../lib/calendarFilters";

export function CalendarView({ kiosk = false }: { kiosk?: boolean }) {
  const [currentDate, setCurrentDate] = useState(new Date());
  const [view, setView] = useState<"month" | "week" | "day">("month"); // 'month' | 'week' | 'day'
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [refreshTrigger, setRefreshTrigger] = useState(0);
  const [familySelection, setFamilySelection] = useState<FamilySelection>(null);

  const [currentEvent, setCurrentEvent] = useState<Event | null>(null);
  const [initialDate, setInitialDate] = useState<Date | null>(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleteError, setDeleteError] = useState("");
  const [pendingDeleteId, setPendingDeleteId] = useState<
    number | string | null
  >(null);

  const triggerRefresh = () => setRefreshTrigger((prev) => prev + 1);

  React.useEffect(() => {
    window.addEventListener("system-update", triggerRefresh);
    return () => window.removeEventListener("system-update", triggerRefresh);
  }, []);

  const nextPeriod = () => {
    if (view === "month") setCurrentDate(addMonths(currentDate, 1));
    else if (view === "week") setCurrentDate(addDays(currentDate, 7));
    else setCurrentDate(addDays(currentDate, 1));
  };

  const prevPeriod = () => {
    if (view === "month") setCurrentDate(subMonths(currentDate, 1));
    else if (view === "week") setCurrentDate(addDays(currentDate, -7));
    else setCurrentDate(addDays(currentDate, -1));
  };

  const today = () => setCurrentDate(new Date());

  const handleSaveEvent = async (eventData: Partial<Event>) => {
    const isEdit = !!currentEvent;
    const url = isEdit
      ? `/api/events/${encodeURIComponent(String(currentEvent.id))}`
      : "/api/events";
    const method = isEdit ? "PUT" : "POST";

    await apiFetch(url, {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...eventData,
        ...(currentEvent ? { version: currentEvent.version } : {}),
      }),
    });

    setIsModalOpen(false);
    setDeleteError("");
    setCurrentEvent(null);
    setInitialDate(null);
    setRefreshTrigger((prev) => prev + 1);
  };

  const reloadCurrentEvent = async () => {
    if (!currentEvent) return;
    const latest = await apiFetch(
      `/api/events/${encodeURIComponent(String(currentEvent.id))}`,
    ).then((response) => response.json());
    setCurrentEvent(latest);
    setDeleteError("");
    triggerRefresh();
  };

  const confirmDelete = async () => {
    if (!pendingDeleteId) return;
    try {
      const version = currentEvent?.version;
      const query =
        version === undefined
          ? ""
          : `?version=${encodeURIComponent(String(version))}`;
      await apiFetch(
        `/api/events/${encodeURIComponent(String(pendingDeleteId))}${query}`,
        { method: "DELETE" },
      );
      setCurrentEvent(null);
      setDeleteError("");
      setIsModalOpen(false);
      setRefreshTrigger((prev) => prev + 1);
      setPendingDeleteId(null);
      setShowDeleteConfirm(false);
    } catch (err) {
      setDeleteError(
        err instanceof Error ? err.message : "Could not delete event",
      );
      throw err;
    }
  };

  const handleDeleteEvent = (id: number | string) => {
    setDeleteError("");
    setPendingDeleteId(id);
    setShowDeleteConfirm(true);
  };

  return (
    <div className="flex flex-col h-full bg-white dark:bg-gray-800 relative">
      <div className="relative z-[60]">
        <ConfirmDialog
          isOpen={showDeleteConfirm}
          onClose={() => setShowDeleteConfirm(false)}
          onConfirm={confirmDelete}
          title={
            currentEvent?.recurrence || currentEvent?.rrule
              ? "Delete entire series"
              : "Delete Event"
          }
          confirmText={
            currentEvent?.recurrence || currentEvent?.rrule
              ? "Delete series"
              : "Delete"
          }
          message={
            currentEvent?.recurrence || currentEvent?.rrule
              ? "This deletes every occurrence in this recurring series, including past and future dates. This action cannot be undone."
              : "Are you sure you want to delete this event? This action cannot be undone."
          }
        />
      </div>
      <EventModal
        isOpen={isModalOpen}
        onClose={() => {
          setIsModalOpen(false);
          setCurrentEvent(null);
          setInitialDate(null);
          setDeleteError("");
        }}
        onSave={handleSaveEvent}
        currentEvent={currentEvent}
        initialDate={initialDate}
        onDelete={handleDeleteEvent}
        onReload={reloadCurrentEvent}
        externalError={deleteError}
      />

      {/* Calendar Header / Toolbar */}
      {!kiosk && (
        <div className="flex flex-col md:flex-row items-center justify-between px-4 md:px-6 py-4 border-b border-gray-100 dark:border-gray-700 shrink-0 gap-4 md:gap-0">
          <div className="flex items-center justify-between w-full md:w-auto gap-4">
            <h2 className="text-xl md:text-2xl font-bold text-gray-800 dark:text-gray-100 tracking-tight min-w-[150px] md:min-w-[200px]">
              {format(currentDate, "MMMM yyyy")}
            </h2>
            <div className="flex items-center bg-gray-100 dark:bg-gray-700 rounded-xl p-1">
              <button
                onClick={prevPeriod}
                aria-label="Previous period"
                className="p-1.5 md:p-2 hover:bg-white dark:hover:bg-gray-600 rounded-lg transition-all text-gray-600 dark:text-gray-300"
              >
                <ChevronLeft size={20} />
              </button>
              <button
                onClick={today}
                className="px-3 py-1 text-xs md:text-sm font-semibold text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white"
              >
                Today
              </button>
              <button
                onClick={nextPeriod}
                aria-label="Next period"
                className="p-1.5 md:p-2 hover:bg-white dark:hover:bg-gray-600 rounded-lg transition-all text-gray-600 dark:text-gray-300"
              >
                <ChevronRight size={20} />
              </button>
            </div>
          </div>

          <div className="flex items-center gap-3 w-full md:w-auto justify-between md:justify-end">
            {/* View Toggles */}
            <div className="flex bg-gray-100 dark:bg-gray-700 p-1 rounded-xl flex-1 md:flex-none justify-center">
              {["month", "week", "day"].map((v) => (
                <button
                  key={v}
                  onClick={() => setView(v as "month" | "week" | "day")}
                  className={cn(
                    "px-3 md:px-4 py-1.5 md:py-2 capitalize text-xs md:text-sm font-medium rounded-lg transition-all flex-1 md:flex-none text-center",
                    view === v
                      ? "bg-white dark:bg-gray-600 shadow-sm text-gray-900 dark:text-white"
                      : "text-gray-500 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200",
                  )}
                >
                  {v}
                </button>
              ))}
            </div>

            <button
              onClick={() => setIsModalOpen(true)}
              className="flex items-center gap-2 bg-charcoal dark:bg-gray-100 text-white dark:text-charcoal px-4 md:px-5 py-2 md:py-2.5 rounded-xl hover:bg-gray-800 dark:hover:bg-white transition-colors shadow-lg shadow-gray-200 dark:shadow-none whitespace-nowrap"
            >
              <Plus size={18} />
              <span className="font-medium text-sm hidden md:inline">
                New Event
              </span>
              <span className="font-medium text-sm md:hidden">New</span>
            </button>
          </div>
        </div>
      )}

      {kiosk && (
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="p-6 pb-2 shrink-0 flex items-center justify-between"
        >
          <h2 className="text-xl font-bold text-gray-800 dark:text-gray-100 tracking-tight">
            {format(currentDate, "MMMM yyyy")}
          </h2>
          <div className="flex items-center gap-2 glass-panel rounded-xl p-1">
            <button
              onClick={prevPeriod}
              aria-label="Previous period"
              className="p-2 hover:bg-white/50 dark:hover:bg-white/10 rounded-lg transition-all kiosk-touch"
            >
              <ChevronLeft
                size={20}
                className="text-gray-600 dark:text-gray-300"
              />
            </button>
            <button
              onClick={today}
              className="px-3 py-1.5 text-sm font-semibold text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white kiosk-touch"
            >
              Today
            </button>
            <button
              onClick={nextPeriod}
              aria-label="Next period"
              className="p-2 hover:bg-white/50 dark:hover:bg-white/10 rounded-lg transition-all kiosk-touch"
            >
              <ChevronRight
                size={20}
                className="text-gray-600 dark:text-gray-300"
              />
            </button>
          </div>
        </motion.div>
      )}

      {/* Calendar Grid Content */}
      <div className="flex-1 overflow-hidden">
        {view === "month" && (
          <MonthGrid
            familySelection={familySelection}
            onFamilySelectionChange={setFamilySelection}
            currentDate={currentDate}
            key={refreshTrigger}
            refreshTrigger={refreshTrigger}
            onEventClick={(evt) => {
              setCurrentEvent(evt);
              setIsModalOpen(true);
            }}
            onDayDoubleClick={(date) => {
              setInitialDate(date);
              setIsModalOpen(true);
            }}
          />
        )}
        {view === "week" && (
          <WeekView
            familySelection={familySelection}
            onFamilySelectionChange={setFamilySelection}
            currentDate={currentDate}
            refreshTrigger={refreshTrigger}
            onEventClick={(evt) => {
              setCurrentEvent(evt);
              setIsModalOpen(true);
            }}
          />
        )}
        {view === "day" && (
          <DayView
            familySelection={familySelection}
            onFamilySelectionChange={setFamilySelection}
            currentDate={currentDate}
            refreshTrigger={refreshTrigger}
            onEventClick={(evt) => {
              setCurrentEvent(evt);
              setIsModalOpen(true);
            }}
          />
        )}
      </div>
    </div>
  );
}
