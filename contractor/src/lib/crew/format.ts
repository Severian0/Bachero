// Numbers carry units and periods. Civil-service plain English, and nothing is
// abbreviated that a committee would have to ask about (DESIGN.md §8).
//
// Ported from `sensor/lib/core/format.dart`, which already encodes the voice —
// the two apps must not describe the same measurement two different ways.

const two = (v: number) => String(v).padStart(2, "0");

export const hhmm = (t: Date) => `${two(t.getHours())}:${two(t.getMinutes())}`;

export const hhmmss = (t: Date) =>
  `${two(t.getHours())}:${two(t.getMinutes())}:${two(t.getSeconds())}`;

/** "3 vehicles" / "1 vehicle" — measurement first, and never "1 vehicles". */
export const plural = (count: number, singular: string, pluralForm?: string) =>
  `${count} ${count === 1 ? singular : (pluralForm ?? `${singular}s`)}`;

export const kilometres = (km: number | null | undefined) =>
  km == null ? "— km" : `${km.toFixed(1)} km`;

export const minutes = (min: number | null | undefined) =>
  min == null ? "— min" : `${Math.round(min)} min`;

export const metresPerSecond = (v: number | null | undefined) =>
  v == null ? "— m/s" : `${v.toFixed(1)} m/s`;

export const accuracyMetres = (v: number | null | undefined) =>
  v == null ? "±— m" : `±${Math.round(v)} m`;

export const percent = (zeroToOne: number) => `${Math.round(zeroToOne * 100)}%`;

export const severity = (v: number) => v.toFixed(2);

/**
 * "51.50720, -0.12750" — the coordinate as a person reads it, so latitude first.
 * Everywhere else in this project longitude comes first; this is the exception,
 * along with Google Maps links.
 */
export const coordinate = (lat: number, lng: number) =>
  `${lat.toFixed(5)}, ${lng.toFixed(5)}`;

const DAY_MS = 86_400_000;

/** Local calendar date as YYYY-MM-DD. `toISOString` would shift across midnight. */
export function isoDate(d: Date): string {
  return `${d.getFullYear()}-${two(d.getMonth() + 1)}-${two(d.getDate())}`;
}

/** Whole days from `from` to `to`, comparing calendar dates, not instants. */
export function dayOffset(isoFrom: string, isoTo: string): number {
  const a = Date.parse(`${isoFrom}T00:00:00`);
  const b = Date.parse(`${isoTo}T00:00:00`);
  return Math.round((b - a) / DAY_MS);
}

const LONG_DATE = new Intl.DateTimeFormat("en-GB", {
  weekday: "short",
  day: "numeric",
  month: "long",
  year: "numeric",
});

/**
 * "Today", "Tomorrow", "Yesterday", else "Wed 2 September 2026". Named days are
 * the ones a crew actually thinks in; everything else gets stated in full.
 */
export function dateLabel(iso: string, today: string): string {
  switch (dayOffset(today, iso)) {
    case 0:
      return "Today";
    case 1:
      return "Tomorrow";
    case -1:
      return "Yesterday";
    default:
      return LONG_DATE.format(new Date(`${iso}T00:00:00`));
  }
}

/** "Wed 2 September 2026" — the header's date chip, never relative. */
export const longDate = (iso: string) =>
  LONG_DATE.format(new Date(`${iso}T00:00:00`));

/** Minutes between two timestamps, or null if either is missing. */
export function minutesBetween(
  from: string | null,
  to: string | null,
): number | null {
  if (from == null || to == null) return null;
  const ms = Date.parse(to) - Date.parse(from);
  return Number.isFinite(ms) ? ms / 60_000 : null;
}

/** "since 08:15" — the period a measurement covers, per DESIGN.md §8. */
export const since = (iso: string | null) =>
  iso == null ? "not started" : `since ${hhmm(new Date(iso))}`;
