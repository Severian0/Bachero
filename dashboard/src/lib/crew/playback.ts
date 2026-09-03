/**
 * Seconds the compressed playback runs (spec section 9): a route plays in about
 * 30 seconds, and the rate is capped so a 2-minute route does not flash by in
 * under 8 seconds. Half a second of playback per real minute, clamped.
 */
export function playbackDurationSec(totalMinutes: number): number {
  return Math.max(8, Math.min(30, totalMinutes * 0.5));
}

/** Real driving minutes left at `km` along a `totalKm` route of `totalMinutes`. */
export function minutesLeft(totalMinutes: number, km: number, totalKm: number): number {
  if (totalKm <= 0) return 0;
  return Math.max(0, totalMinutes * (1 - km / totalKm));
}
