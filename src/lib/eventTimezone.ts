import { Temporal } from "@js-temporal/polyfill";
import { RRule } from "rrule";

export function validateEventTimezone(zone: string) {
  if (!zone) return; // Explicit legacy fixed-UTC mode.
  try {
    if (
      zone.length > 100 ||
      (zone !== "UTC" &&
        !/^(Africa|America|Antarctica|Arctic|Asia|Atlantic|Australia|Europe|Indian|Pacific|Etc)\/[A-Za-z0-9_+/-]+$/.test(
          zone,
        ))
    )
      throw new Error();
    eventClock("2000-01-01T00:00:00Z", zone);
  } catch {
    throw new Error(
      "Choose a valid IANA event timezone, such as America/Chicago, or UTC",
    );
  }
}

export function eventClock(instant: string | Date, zone: string) {
  return Temporal.Instant.from(
    typeof instant === "string" ? instant : instant.toISOString(),
  )
    .toZonedDateTimeISO(zone)
    .toPlainDateTime();
}

/** No host-timezone dependency. Gaps have no occurrence; folds choose the first. */
export function clockInstant(
  clock: Temporal.PlainDateTime,
  zone: string,
): Date | null {
  const earlier = clock.toZonedDateTime(zone, { disambiguation: "earlier" });
  if (!earlier.toPlainDateTime().equals(clock)) return null;
  return new Date(earlier.epochMilliseconds);
}

export function eventInstant(day: string, time: string, zone: string): string {
  const clock = Temporal.PlainDateTime.from(`${day}T${time}`);
  const instant = clockInstant(clock, zone);
  if (!instant)
    throw new Error(
      "This time does not exist in the event timezone because the clocks move forward. Choose another time",
    );
  return instant.toISOString();
}

export function zoneEndOfDay(day: string, zone: string): Date {
  // The next civil day's first instant handles even midnight transitions.
  const next = Temporal.PlainDate.from(day)
    .add({ days: 1 })
    .toZonedDateTime(zone);
  return new Date(next.epochMilliseconds - 1000);
}

function floating(clock: Temporal.PlainDateTime): Date {
  return new Date(`${clock.toString({ smallestUnit: "second" })}Z`);
}

/** Expand calendar fields in a timezone-neutral clock, then resolve each date in
 * the series' zone. COUNT counts real occurrences, not skipped spring gaps. */
export function zonedRepeatDates(
  rule: string,
  first: Date,
  zone: string,
  start: Date,
  end: Date,
): Date[] {
  const options = RRule.parseString(rule);
  if (options.freq === undefined || options.freq > RRule.DAILY)
    throw new Error("Unsupported repeat frequency");
  const seed = floating(eventClock(first, zone));
  const until = options.until;
  const count = options.count;
  // Two civil days of padding cover timezone offsets and date-line transitions.
  const upper = new Date(end.getTime() + 2 * 86400000);
  const lower = count ? seed : new Date(start.getTime() - 2 * 86400000);
  const dates: Date[] = [];
  let seen = 0;
  let work = 0;
  new RRule({
    ...options,
    dtstart: seed,
    tzid: null,
    count: null,
    until: upper,
  }).between(lower, upper, true, (candidate) => {
    if (++work > 20000)
      throw new Error("Repeat schedule exceeds the safe expansion limit");
    const clock = Temporal.PlainDateTime.from(
      candidate.toISOString().replace(/Z$/, ""),
    );
    const instant =
      candidate.getTime() === seed.getTime()
        ? first
        : clockInstant(clock, zone);
    if (!instant) return true;
    if (until && instant > until) return false;
    if (count && ++seen > count) return false;
    if (instant >= start && instant < end) dates.push(instant);
    return instant < end;
  });
  return dates;
}
