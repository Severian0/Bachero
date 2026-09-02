export type LngLat = [number, number];

/** Matrix with the depot at index 0; candidates follow in order. */
export interface Matrix { durationMin: number[][]; distanceKm: number[][] }

export function haversineKm(a: LngLat, b: LngLat): number {
  const R = 6371;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b[1] - a[1]);
  const dLng = toRad(b[0] - a[0]);
  const s = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a[1])) * Math.cos(toRad(b[1])) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}

/** Straight-line matrix at a constant speed. Used by the synthetic planner only. */
export function buildMatrix(points: LngLat[], speedKmh: number): Matrix {
  const distanceKm = points.map((a) => points.map((b) => haversineKm(a, b)));
  const durationMin = distanceKm.map((row) => row.map((km) => (km / speedKmh) * 60));
  return { durationMin, distanceKm };
}
