import { format, parseISO } from "date-fns";
import { eventClock, zoneEndOfDay } from "./eventTimezone";

export type RepeatFrequency =
  "" | "DAILY" | "WEEKLY" | "MONTHLY" | "YEARLY" | "custom";
export interface RepeatDraft {
  frequency: RepeatFrequency;
  interval: string;
  ending: "never" | "count" | "until";
  count: string;
  until: string;
  // Keep untouched rules byte-for-byte, including rules this editor understands.
  original?: string;
}

export function readRepeat(
  rule: string,
  allDay: boolean,
  zone?: string,
): RepeatDraft {
  const draft: RepeatDraft = {
    frequency: "",
    interval: "1",
    ending: "never",
    count: "10",
    until: "",
    original: rule,
  };
  if (!rule) return draft;
  const custom = { ...draft, frequency: "custom" as const };
  const fields: Record<string, string> = {};
  for (const field of rule.replace(/^RRULE:/, "").split(";")) {
    const pair = field.split("=");
    if (
      pair.length !== 2 ||
      !pair[1] ||
      !["FREQ", "INTERVAL", "COUNT", "UNTIL"].includes(pair[0]) ||
      fields[pair[0]]
    )
      return custom;
    fields[pair[0]] = pair[1];
  }
  if (!["DAILY", "WEEKLY", "MONTHLY", "YEARLY"].includes(fields.FREQ))
    return custom;
  if (fields.COUNT && fields.UNTIL) return custom;
  if (fields.INTERVAL && !validInteger(fields.INTERVAL, 1000)) return custom;
  if (fields.COUNT && !validInteger(fields.COUNT, 10000)) return custom;
  draft.frequency = fields.FREQ as RepeatFrequency;
  draft.interval = fields.INTERVAL || "1";
  if (fields.COUNT) {
    draft.ending = "count";
    draft.count = fields.COUNT;
  }
  if (fields.UNTIL) {
    const value = fields.UNTIL;
    const shape = allDay ? /^\d{8}$/ : /^\d{8}T\d{6}Z$/;
    if (!shape.test(value)) return custom;
    const iso =
      `${value.slice(0, 4)}-${value.slice(4, 6)}-${value.slice(6, 8)}` +
      (allDay
        ? ""
        : `T${value.slice(9, 11)}:${value.slice(11, 13)}:${value.slice(13, 15)}Z`);
    const date = parseISO(iso);
    if (!Number.isFinite(date.getTime())) return custom;
    // Arbitrary imported cutoffs must not silently become end-of-day cutoffs.
    if (
      !allDay &&
      (zone
        ? eventClock(date, zone).toPlainTime().toString() !== "23:59:59"
        : format(date, "HHmmss") !== "235959")
    )
      return custom;
    draft.ending = "until";
    draft.until =
      !allDay && zone
        ? eventClock(date, zone).toPlainDate().toString()
        : format(date, "yyyy-MM-dd");
  }
  return draft;
}

function validInteger(value: string, max: number) {
  return /^\d+$/.test(value) && Number(value) >= 1 && Number(value) <= max;
}

export function writeRepeat(
  draft: RepeatDraft,
  allDay: boolean,
  startDate: string,
  zone?: string,
): string {
  if (draft.original !== undefined) return draft.original;
  if (!draft.frequency) return "";
  if (draft.frequency === "custom")
    throw new Error(
      "Choose a repeat schedule before replacing this custom rule",
    );
  if (!validInteger(draft.interval, 1000))
    throw new Error("Repeat interval must be a whole number from 1 to 1000");
  const fields = [`FREQ=${draft.frequency}`];
  if (Number(draft.interval) !== 1)
    fields.push(`INTERVAL=${Number(draft.interval)}`);
  if (draft.ending === "count") {
    if (!validInteger(draft.count, 10000))
      throw new Error(
        "Occurrence count must be a whole number from 1 to 10000",
      );
    fields.push(`COUNT=${Number(draft.count)}`);
  } else if (draft.ending === "until") {
    let date = parseISO(draft.until);
    if (
      !/^\d{4}-\d{2}-\d{2}$/.test(draft.until) ||
      !Number.isFinite(date.getTime()) ||
      format(date, "yyyy-MM-dd") !== draft.until ||
      draft.until < startDate
    ) {
      throw new Error(
        "Choose a repeat end date on or after the event start date",
      );
    }
    if (allDay) fields.push(`UNTIL=${draft.until.replace(/-/g, "")}`);
    else {
      if (zone) date = zoneEndOfDay(draft.until, zone);
      else date.setHours(23, 59, 59, 0);
      fields.push(
        `UNTIL=${date.toISOString().replace(/[-:]/g, "").replace(".000", "")}`,
      );
    }
  }
  return fields.join(";");
}
