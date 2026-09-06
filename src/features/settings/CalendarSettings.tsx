import { Calendar, Trash2 } from "lucide-react";
import React, { useEffect, useState } from "react";
import { apiFetch } from "../../lib/api";
import { CalendarSubscription } from "../../types";

const PRESET_COLORS = [
  { label: "Gray", value: "bg-gray-200 text-gray-800" },
  { label: "Red", value: "bg-red-100 text-red-800" },
  { label: "Green", value: "bg-emerald-100 text-emerald-800" },
  { label: "Blue", value: "bg-blue-100 text-blue-800" },
  { label: "Purple", value: "bg-purple-100 text-purple-800" },
];

import { ConfirmDialog } from "../../components/ConfirmDialog";

export function CalendarSettings() {
  const [calendars, setCalendars] = useState<CalendarSubscription[]>([]);
  const [newUrl, setNewUrl] = useState("");
  const [newName, setNewName] = useState("");
  const [newColor, setNewColor] = useState(PRESET_COLORS[0].value);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [pendingDeleteId, setPendingDeleteId] = useState<number | null>(null);

  useEffect(() => {
    apiFetch("/api/calendars")
      .then((res) => res.json())
      .then((data) => setCalendars(data || []))
      .catch(console.error);
  }, []);

  const addCalendar = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newUrl) return;

    try {
      const res = await apiFetch("/api/calendars", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          url: newUrl,
          name: newName || "Calendar",
          color: newColor,
        }),
      });
      const data = await res.json();
      setCalendars([...calendars, data]);
      setNewUrl("");
      setNewName("");
    } catch (err) {
      console.error(err);
    }
  };

  const confirmDeleteCalendar = async () => {
    if (!pendingDeleteId) return;
    try {
      await apiFetch(`/api/calendars/${pendingDeleteId}`, { method: "DELETE" });
      setCalendars(calendars.filter((c) => c.id !== pendingDeleteId));
      setPendingDeleteId(null);
      setShowDeleteConfirm(false);
    } catch (err) {
      console.error(err);
    }
  };

  const handleDeleteCalendar = (id: number) => {
    setPendingDeleteId(id);
    setShowDeleteConfirm(true);
  };

  return (
    <div className="space-y-4">
      <ConfirmDialog
        isOpen={showDeleteConfirm}
        onClose={() => setShowDeleteConfirm(false)}
        onConfirm={confirmDeleteCalendar}
        title="Unsubscribe Calendar"
        message="Are you sure you want to unsubscribe from this calendar?"
        confirmText="Unsubscribe"
      />
      {calendars.map((cal) => (
        <div
          key={cal.id}
          className="flex items-center justify-between p-4 bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700 rounded-xl shadow-sm"
        >
          <div className="flex items-center gap-4 overflow-hidden">
            <div
              className={`w-10 h-10 rounded-full ${cal.color || "bg-gray-100 dark:bg-gray-700"} flex items-center justify-center shrink-0`}
            >
              <Calendar size={18} className="opacity-70 dark:text-white" />
            </div>
            <div className="min-w-0">
              <h4 className="font-semibold text-gray-800 dark:text-gray-100 truncate">
                {cal.name}
              </h4>
              <p className="text-xs text-gray-400 dark:text-gray-500 truncate max-w-xs">
                {cal.url}
              </p>
            </div>
          </div>
          <button
            onClick={() => handleDeleteCalendar(cal.id)}
            className="p-2 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg"
          >
            <Trash2 size={18} />
          </button>
        </div>
      ))}

      <form
        onSubmit={addCalendar}
        className="bg-gray-50 dark:bg-gray-900/50 p-4 rounded-xl border border-gray-100 dark:border-gray-800 space-y-3"
      >
        <h4 className="font-bold text-gray-700 dark:text-gray-300 text-sm">
          Add Subscription
        </h4>
        <input
          type="text"
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          placeholder="Calendar Name (e.g. Holidays)"
          className="w-full px-4 py-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-primary/20"
        />
        <input
          type="text"
          value={newUrl}
          onChange={(e) => setNewUrl(e.target.value)}
          placeholder="iCal URL (https://...)"
          className="w-full px-4 py-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-primary/20"
        />
        <div className="flex items-center gap-2">
          {PRESET_COLORS.map((c) => (
            <button
              key={c.value}
              type="button"
              onClick={() => setNewColor(c.value)}
              className={`w-6 h-6 rounded-full ${c.value.split(" ")[0]} border-2 ${newColor === c.value ? "border-gray-600 dark:border-white" : "border-transparent"}`}
              title={c.label}
            />
          ))}
          <button
            type="submit"
            className="ml-auto bg-primary text-white px-4 py-2 rounded-lg font-medium text-sm"
          >
            Subscribe
          </button>
        </div>
      </form>
    </div>
  );
}
