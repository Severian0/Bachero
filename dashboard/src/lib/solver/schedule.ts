/** Default start of a repair crew's shift, local to the authority. */
export const SHIFT_START_HOUR = 8;
export const DEFAULT_TIME_ZONE = "Europe/London";

/**
 * The instant a shift starts, as milliseconds since the epoch.
 *
 * A plan_date is a calendar day, not a moment, so "08:00" has to be resolved in
 * the authority's own timezone. Treating it as 08:00 UTC puts every ETA an hour
 * out for half the year in the UK, which is a wrong number on an operator's
 * screen rather than a rounding error.
 *
 * The offset is found by asking what a candidate UTC instant looks like in the
 * target zone and correcting by the difference, which handles British Summer
 * Time without a timezone library.
 */
export function shiftStartMs(
  planDate: string,
  hour: number = SHIFT_START_HOUR,
  timeZone: string = DEFAULT_TIME_ZONE,
): number {
  const [y, m, d] = planDate.split("-").map(Number);
  if (!y || !m || !d) return Number.NaN;
  const guess = Date.UTC(y, m - 1, d, hour, 0, 0);
  return guess - zoneOffsetMs(guess, timeZone);
}

/** How far ahead of UTC `timeZone` runs at the given instant, in milliseconds. */
export function zoneOffsetMs(instantMs: number, timeZone: string): number {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone,
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date(instantMs));

  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value ?? "0");
  const asUtc = Date.UTC(
    get("year"), get("month") - 1, get("day"),
    get("hour"), get("minute"), get("second"),
  );
  return asUtc - instantMs;
}
