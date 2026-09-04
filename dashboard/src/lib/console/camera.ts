import type { Crew, Pothole } from "@/lib/data/types";
import type { LngLat } from "@/lib/solver/haversine";

/**
 * Everything the fleet has found plus every depot a crew starts from: the
 * whole night's work in one frame. `fallback` is the synthetic depot, used
 * only when no crew is known yet so the frame is never empty.
 */
export function networkPoints(
  potholes: Iterable<Pothole>,
  crews: readonly Crew[],
  fallback: LngLat,
): LngLat[] {
  const pts: LngLat[] = [];
  for (const p of potholes) if (p.status !== "false_positive") pts.push([p.lng, p.lat]);
  if (crews.length) for (const c of crews) pts.push([c.depot_lng, c.depot_lat]);
  else pts.push(fallback);
  return pts;
}

/** South-west and north-east corners of a set of points. */
export function boundsOf(pts: readonly LngLat[]): [LngLat, LngLat] {
  let w = Infinity, s = Infinity, e = -Infinity, n = -Infinity;
  for (const [lng, lat] of pts) {
    if (lng < w) w = lng; if (lng > e) e = lng;
    if (lat < s) s = lat; if (lat > n) n = lat;
  }
  return [[w, s], [e, n]];
}
