import { haversineKm } from "@/lib/solver/haversine";

/**
 * Initial bearing from a to b, degrees clockwise from north, in [0, 360).
 * Used for the heading wedge when the device reports no heading of its own.
 */
export function bearingDeg(a: [number, number], b: [number, number]): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const lng1 = toRad(a[0]);
  const lat1 = toRad(a[1]);
  const lng2 = toRad(b[0]);
  const lat2 = toRad(b[1]);
  const y = Math.sin(lng2 - lng1) * Math.cos(lat2);
  const x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(lng2 - lng1);
  return ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;
}

/**
 * Straight-line distance from a point to the nearest vertex of the path.
 * Vertex distance, not segment distance: OSRM paths have a vertex every few
 * tens of metres, which is precision to spare for a 2 km guard.
 */
export function minDistanceKm(point: [number, number], coordinates: [number, number][]): number {
  let best = Infinity;
  for (const c of coordinates) best = Math.min(best, haversineKm(point, c));
  return best;
}
