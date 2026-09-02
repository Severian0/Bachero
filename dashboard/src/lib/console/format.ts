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

/** Age in 30-day months, 1 decimal. */
export function monthsSince(iso: string, now: Date = new Date()): number {
  const days = (now.getTime() - new Date(iso).getTime()) / 86_400_000;
  return Math.round((days / 30) * 10) / 10;
}
