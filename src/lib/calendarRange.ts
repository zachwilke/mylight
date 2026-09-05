import { format } from "date-fns";

/** Preserve civil dates and each boundary's offset; UTC serialization alone can
 * shift floating all-day events when the viewer is east/west of Greenwich. */
export function calendarEventsURL(start: Date, end: Date): string {
  if (
    !Number.isFinite(start.getTime()) ||
    !Number.isFinite(end.getTime()) ||
    end <= start
  ) {
    throw new Error("Invalid calendar date range");
  }
  const query = new URLSearchParams({
    start: format(start, "yyyy-MM-dd'T'HH:mm:ss.SSSxxx"),
    end: format(end, "yyyy-MM-dd'T'HH:mm:ss.SSSxxx"),
  });
  return `/api/events?${query}`;
}
