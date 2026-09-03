export const km = (n: number) => `${n.toFixed(1)} km`;
export const minutes = (n: number) => `${Math.round(n)} min`;

export function hhmm(iso: string): string {
  const d = new Date(iso);
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

/** Human-facing coordinate: lat, lng (the one place that order is used). */
export const coord = (lat: number, lng: number) => `${lat.toFixed(4)}, ${lng.toFixed(4)}`;

export function plural(n: number, singular: string, pluralWord = singular + "s"): string {
  return `${n} ${n === 1 ? singular : pluralWord}`;
}

export const pct = (fraction: number) => `${Math.round(fraction * 100)}%`;

/** The calendar day, in the same UTC frame the records are stamped in. */
export function todayISO(now: Date = new Date()): string {
  return now.toISOString().slice(0, 10);
}

/**
 * The dispatch field is a plain comma-separated list, because that is how an
 * operator pastes addresses out of a directory. A trailing comma or a stray
 * separator must not send an empty recipient, so blanks are dropped rather
 * than passed through to the mail service.
 */
export function parseAddresses(text: string): string[] {
  return text.split(",").map((s) => s.trim()).filter(Boolean);
}
