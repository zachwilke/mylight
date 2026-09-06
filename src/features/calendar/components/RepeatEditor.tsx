import type {
  RepeatDraft,
  RepeatFrequency,
} from "../../../lib/recurrenceEditor";

const inputStyle =
  "min-h-11 w-full rounded-xl border border-stone-200 bg-white px-3 py-2 text-sm text-stone-900 focus:outline-none focus:ring-2 focus:ring-amber-500 dark:border-stone-600 dark:bg-stone-800 dark:text-stone-100";

export function RepeatEditor({
  value,
  onChange,
  startDate,
  allDay,
}: {
  value: RepeatDraft;
  onChange: (value: RepeatDraft) => void;
  startDate: string;
  allDay: boolean;
}) {
  const update = (patch: Partial<RepeatDraft>) =>
    onChange({ ...value, ...patch, original: undefined });
  const units = {
    DAILY: "days",
    WEEKLY: "weeks",
    MONTHLY: "months",
    YEARLY: "years",
  };
  const custom = value.frequency === "custom";
  return (
    <div className="space-y-3 rounded-2xl border border-stone-200 bg-stone-50 p-4 dark:border-stone-700 dark:bg-stone-900/50">
      <label htmlFor="event-repeat" className="block text-sm font-semibold">
        Repeat
      </label>
      <select
        id="event-repeat"
        className={inputStyle}
        value={custom ? value.original : value.frequency}
        onChange={(e) =>
          update({ frequency: e.target.value as RepeatFrequency })
        }
      >
        <option value="">Does not repeat</option>
        <option value="DAILY">Daily</option>
        <option value="WEEKLY">Weekly</option>
        <option value="MONTHLY">Monthly</option>
        <option value="YEARLY">Yearly</option>
        {custom && (
          <option value={value.original}>Custom recurrence (preserved)</option>
        )}
      </select>
      {custom ? (
        <p className="text-sm text-stone-600 dark:text-stone-300">
          This custom schedule is preserved unchanged. Choosing another schedule
          replaces its repeat rules.
        </p>
      ) : (
        value.frequency &&
        value.frequency !== "custom" && (
          <>
            <div className="flex items-center gap-3">
              <label htmlFor="repeat-interval" className="shrink-0 text-sm">
                Every
              </label>
              <input
                id="repeat-interval"
                aria-label="Repeat interval"
                type="number"
                min="1"
                max="1000"
                step="1"
                required
                className={`${inputStyle} max-w-24`}
                value={value.interval}
                onChange={(e) => update({ interval: e.target.value })}
              />
              <span className="text-sm">{units[value.frequency]}</span>
            </div>
            <label
              htmlFor="repeat-ending"
              className="block text-sm font-medium"
            >
              Repeat ends
            </label>
            <select
              id="repeat-ending"
              className={inputStyle}
              value={value.ending}
              onChange={(e) =>
                update({
                  ending: e.target.value as RepeatDraft["ending"],
                  until: value.until || startDate,
                })
              }
            >
              <option value="never">Never</option>
              <option value="count">After a number of occurrences</option>
              <option value="until">On a date</option>
            </select>
            {value.ending === "count" && (
              <div className="space-y-2">
                <label htmlFor="repeat-count" className="block text-sm">
                  Number of occurrences
                </label>
                <input
                  id="repeat-count"
                  type="number"
                  min="1"
                  max="10000"
                  step="1"
                  required
                  className={inputStyle}
                  value={value.count}
                  onChange={(e) => update({ count: e.target.value })}
                />
                <p className="text-xs text-stone-600 dark:text-stone-300">
                  Includes the first occurrence.
                </p>
              </div>
            )}
            {value.ending === "until" && (
              <div className="space-y-2">
                <label htmlFor="repeat-until" className="block text-sm">
                  Last repeat date
                </label>
                <input
                  id="repeat-until"
                  type="date"
                  min={startDate}
                  required
                  className={inputStyle}
                  value={value.until}
                  onChange={(e) => update({ until: e.target.value })}
                />
                <p className="text-xs text-stone-600 dark:text-stone-300">
                  Occurrences may start through this date
                  {allDay ? "." : " in this device’s timezone."}
                </p>
              </div>
            )}
            {value.frequency === "MONTHLY" && (
              <p className="text-xs text-stone-600 dark:text-stone-300">
                Repeats on the same day of the month. Months without that date
                are skipped.
              </p>
            )}
            {value.frequency === "YEARLY" && (
              <p className="text-xs text-stone-600 dark:text-stone-300">
                Repeats on the same date each year. February 29 only repeats in
                leap years.
              </p>
            )}
          </>
        )
      )}
      {value.frequency && !allDay && (
        <p className="text-xs text-stone-600 dark:text-stone-300">
          Timed repeats currently keep a fixed UTC time. The local time can
          shift when daylight saving time changes.
        </p>
      )}
    </div>
  );
}
