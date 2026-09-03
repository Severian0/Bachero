// Google Maps deep links.
//
// The one place in this project where coordinates are latitude first: Google
// Maps takes `lat,lng`, everything else here takes `lng,lat` (CLAUDE.md).
//
// Waypoint limits vary by platform — around nine on desktop and fewer on mobile
// (ARCHITECTURE.md §5) — so a whole route is handed over as one link per leg
// rather than one link that silently drops stops. The crew page stays the
// primary link; these are for the driving.

export interface Point {
  lat: number;
  lng: number;
}

const BASE = "https://www.google.com/maps/dir/?api=1";
const pair = (p: Point) => `${p.lat},${p.lng}`;

/** Navigate to a single stop from wherever the phone currently is. */
export function directionsTo(destination: Point): string {
  return `${BASE}&destination=${pair(destination)}&travelmode=driving`;
}

export interface Leg {
  url: string;
  /** Indices into the `stops` array this leg covers, for labelling the link. */
  from: number;
  to: number;
}

/**
 * A route as a sequence of Maps links. Each leg carries at most `maxWaypoints`
 * intermediate stops, so no link is silently truncated by the platform.
 *
 * Legs overlap by one stop: a leg ends where the next begins, which is what a
 * driver expects when they finish one link and open the next.
 */
export function directionsLegs(
  stops: readonly Point[],
  options: { origin?: Point; maxWaypoints?: number } = {},
): Leg[] {
  const { origin, maxWaypoints = 8 } = options;
  if (stops.length === 0) return [];

  // The full sequence to drive, including the depot when one is known.
  const points = origin ? [origin, ...stops] : [...stops];
  if (points.length === 1) {
    return [{ url: directionsTo(points[0]), from: 0, to: 0 }];
  }

  const perLeg = Math.max(1, maxWaypoints) + 1; // waypoints plus the destination
  const legs: Leg[] = [];
  for (let start = 0; start < points.length - 1; start += perLeg) {
    const end = Math.min(points.length - 1, start + perLeg);
    const waypoints = points.slice(start + 1, end);
    const params = [
      `origin=${pair(points[start])}`,
      `destination=${pair(points[end])}`,
      waypoints.length > 0
        ? `waypoints=${waypoints.map(pair).join("|")}`
        : null,
      "travelmode=driving",
    ].filter((p): p is string => p !== null);
    // Report indices in the caller's `stops` array, not the padded one.
    const shift = origin ? 1 : 0;
    legs.push({
      url: `${BASE}&${params.join("&")}`,
      from: Math.max(0, start - shift),
      to: end - shift,
    });
  }
  return legs;
}
