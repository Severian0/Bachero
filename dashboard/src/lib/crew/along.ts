import { haversineKm } from "@/lib/solver/haversine";
import type { RouteStep } from "@/lib/types";

/** A path indexed by distance: where is km 3.2, and what was the last turn before it. */
export interface AlongTrack {
  /** Full length of the path in km. */
  totalKm: number;
  /** Point on the path `km` from its start; clamps to the ends. */
  pointAt(km: number): [number, number];
  /** Last turn instruction at or before `km`; null before the first one or when there are none. */
  stepAt(km: number): RouteStep | null;
}

/**
 * Precomputes cumulative distances once (spec section 9). Each step is snapped
 * to its nearest vertex here, so stepAt is a plain comparison at animation time
 * - the requestAnimationFrame loop does no geometry.
 */
export function buildTrack(coordinates: [number, number][], steps: RouteStep[]): AlongTrack {
  const cum: number[] = [0];
  for (let i = 1; i < coordinates.length; i++) {
    cum.push(cum[i - 1] + haversineKm(coordinates[i - 1], coordinates[i]));
  }
  const totalKm = cum[cum.length - 1] ?? 0;

  const snapped = steps
    .map((step) => {
      let bestIndex = 0;
      let bestKm = Infinity;
      for (let i = 0; i < coordinates.length; i++) {
        const d = haversineKm([step.lng, step.lat], coordinates[i]);
        if (d < bestKm) {
          bestKm = d;
          bestIndex = i;
        }
      }
      return { km: cum[bestIndex], step };
    })
    .sort((a, b) => a.km - b.km);

  return {
    totalKm,

    pointAt(km: number): [number, number] {
      const target = Math.max(0, Math.min(km, totalKm));
      let i = 1;
      while (i < cum.length && cum[i] < target) i++;
      if (i >= cum.length) return coordinates[coordinates.length - 1];
      const span = cum[i] - cum[i - 1];
      const t = span === 0 ? 0 : (target - cum[i - 1]) / span;
      const [ax, ay] = coordinates[i - 1];
      const [bx, by] = coordinates[i];
      return [ax + (bx - ax) * t, ay + (by - ay) * t];
    },

    stepAt(km: number): RouteStep | null {
      let last: RouteStep | null = null;
      for (const s of snapped) {
        if (s.km <= km) last = s.step;
        else break;
      }
      return last;
    },
  };
}
