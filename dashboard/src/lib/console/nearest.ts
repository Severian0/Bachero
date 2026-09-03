import { haversineKm, type LngLat } from "@/lib/solver/haversine";
import type { Pothole } from "@/lib/data/types";
import type { PlanRouteResponse } from "@/lib/types";

/**
 * The open pothole nearest to `from`, by straight-line distance. "Open" means
 * suspected or confirmed - the statuses a new plan may claim. Strict `<`
 * keeps the first of a tie, so the result is deterministic. Null when the
 * queue holds nothing open, which the caller treats as "nothing to plan".
 */
export function nearestOpenPothole(potholes: Pothole[], from: LngLat): Pothole | null {
  let best: Pothole | null = null;
  let bestKm = Infinity;
  for (const p of potholes) {
    if (p.status !== "suspected" && p.status !== "confirmed") continue;
    const d = haversineKm(from, [p.lng, p.lat]);
    if (d < bestKm) {
      best = p;
      bestKm = d;
    }
  }
  return best;
}

/**
 * Straight-line distance from where the route starts to its first stop.
 *
 * Shown beside the totals because the crew depot can sit a long way from the
 * worked area, and a large total is otherwise unexplainable on screen.
 */
export function firstLegKm(plan: PlanRouteResponse): number {
  const first = plan.stops[0];
  if (!first) return 0;
  return haversineKm([plan.start.lng, plan.start.lat], [first.lng, first.lat]);
}
