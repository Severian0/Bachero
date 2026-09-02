import { haversineKm } from "./geo";
import type { Pothole } from "./model";

/**
 * Crew assumptions. These are printed in the dispatch sheet rather than
 * buried here, because the officer who quotes the resulting figure at
 * committee has to be able to defend where it came from.
 */
export const CREW_KM_PER_HOUR = 21;
export const MINUTES_ON_SITE = 22;

export interface RoutePlan {
  stops: Pothole[];
  km: number;
  minutes: number;
}

/**
 * Nearest-neighbour ordering from the northernmost stop.
 *
 * Deliberately not optimal: the real ordering comes from the routing service.
 * This is the honest back-of-envelope figure the console quotes while the
 * operator is still choosing, and the sheet says so in as many words.
 */
export function planRoute(selected: Pothole[]): RoutePlan {
  if (selected.length === 0) return { stops: [], km: 0, minutes: 0 };

  const remaining = [...selected].sort((a, b) => b.lat - a.lat);
  const stops: Pothole[] = [remaining.shift()!];
  let km = 0;

  while (remaining.length > 0) {
    const from = stops[stops.length - 1];
    let best = 0;
    let bestKm = Infinity;
    for (let i = 0; i < remaining.length; i += 1) {
      const d = haversineKm(from, remaining[i]);
      if (d < bestKm) {
        bestKm = d;
        best = i;
      }
    }
    km += bestKm;
    stops.push(remaining.splice(best, 1)[0]);
  }

  return {
    stops,
    km,
    minutes: Math.round((km / CREW_KM_PER_HOUR) * 60 + stops.length * MINUTES_ON_SITE),
  };
}
