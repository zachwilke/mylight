interface TimedEntry {
  id: string | number;
  startMinutes: number;
  durationMinutes: number;
}

/** One day's visual intervals. Minimum card height participates in collision
 * detection, so adjacent short events cannot cover each other's controls. */
export function layoutTimedEvents<T extends TimedEntry>(events: T[]) {
  const entries = events
    .filter(
      (event) =>
        Number.isFinite(event.startMinutes) &&
        event.startMinutes >= 0 &&
        event.startMinutes < 1440,
    )
    .map((event) => ({
      event,
      top: event.startMinutes,
      height: Math.max(
        30,
        Math.min(
          Number.isFinite(event.durationMinutes) ? event.durationMinutes : 0,
          1440 - event.startMinutes,
        ),
      ),
      column: 0,
      columns: 1,
    }))
    .sort(
      (a, b) =>
        a.top - b.top ||
        b.height - a.height ||
        String(a.event.id).localeCompare(String(b.event.id)),
    );
  let group: typeof entries = [];
  let ends: number[] = [];
  let groupEnd = -Infinity;
  const finish = () => {
    for (const entry of group) entry.columns = ends.length;
    group = [];
    ends = [];
  };
  for (const entry of entries) {
    if (entry.top >= groupEnd) finish();
    let column = ends.findIndex((end) => end <= entry.top);
    if (column === -1) column = ends.length;
    entry.column = column;
    ends[column] = entry.top + entry.height;
    groupEnd = Math.max(...ends);
    group.push(entry);
  }
  finish();
  return entries;
}
