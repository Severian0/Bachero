import type { Matrix } from "./haversine";

export interface Candidate { id: string; priority: number }
export interface Constraints {
  mode: "manual" | "count" | "time";
  maxStops?: number;
  timeBudgetMin?: number;
  serviceMin: number;
}

export type SkipReason = "stop_limit" | "time_budget";
export interface Skipped {
  id: string;
  reason: SkipReason;
  /** Extra driving minutes this candidate would have cost at its best slot. */
  marginalMin: number;
}

/** `order` holds candidate indices (0-based). Matrix index of candidate i is i + 1; depot is 0. */
export interface Solution {
  order: number[];
  totalMin: number;
  totalKm: number;
  baselineKm: number;
  /** Candidates the constraint pushed out, with why. Drives the explain line. */
  skipped: Skipped[];
}

const mi = (i: number) => i + 1;

export function tourKm(order: number[], m: Matrix): number {
  if (order.length === 0) return 0;
  let km = m.distanceKm[0][mi(order[0])];
  for (let k = 0; k + 1 < order.length; k++) km += m.distanceKm[mi(order[k])][mi(order[k + 1])];
  return km + m.distanceKm[mi(order[order.length - 1])][0];
}

export function tourMin(order: number[], m: Matrix, serviceMin: number): number {
  if (order.length === 0) return 0;
  let min = m.durationMin[0][mi(order[0])];
  for (let k = 0; k + 1 < order.length; k++) min += m.durationMin[mi(order[k])][mi(order[k + 1])];
  return min + m.durationMin[mi(order[order.length - 1])][0] + serviceMin * order.length;
}

/** Extra minutes from inserting candidate c between positions pos-1 and pos of `order`. */
function marginalMin(order: number[], c: number, pos: number, m: Matrix, serviceMin: number): number {
  const prev = pos === 0 ? 0 : mi(order[pos - 1]);
  const next = pos === order.length ? 0 : mi(order[pos]);
  return m.durationMin[prev][mi(c)] + m.durationMin[mi(c)][next] - m.durationMin[prev][next] + serviceMin;
}

/**
 * 2-opt: reverse the segment between two positions whenever that shortens the
 * tour, until nothing improves.
 *
 * `cost` selects what "shorter" means and defaults to duration. It must be the
 * same quantity the caller's budget is expressed in: optimising distance while
 * constraining minutes lets a swap that saves kilometres push the route over
 * its time budget, which is invisible with a straight-line matrix (where the
 * two are proportional) and appears the moment a real road matrix is used.
 */
export function twoOpt(order: number[], m: Matrix, cost: number[][] = m.durationMin): number[] {
  const o = [...order];
  let improved = true;
  while (improved) {
    improved = false;
    for (let i = 0; i < o.length - 1; i++) {
      for (let j = i + 1; j < o.length; j++) {
        const a = i === 0 ? 0 : mi(o[i - 1]), b = mi(o[i]);
        const c = mi(o[j]), d = j === o.length - 1 ? 0 : mi(o[j + 1]);
        const delta = cost[a][c] + cost[b][d] - cost[a][b] - cost[c][d];
        if (delta < -1e-9) {
          o.splice(i, j - i + 1, ...o.slice(i, j + 1).reverse());
          improved = true;
        }
      }
    }
  }
  return o;
}

export function solve(candidates: Candidate[], m: Matrix, c: Constraints): Solution {
  const remaining = new Set(candidates.map((_, i) => i));
  const skipped: Skipped[] = [];
  let order: number[] = [];

  while (remaining.size > 0) {
    if (c.mode === "count" && order.length >= (c.maxStops ?? 0)) break;
    let best: { i: number; pos: number; score: number; cost: number } | null = null;
    // `remaining` is a Set built from ascending indices, so it iterates in ascending
    // index order; the strict `>` below means the lowest index wins ties.
    for (const i of remaining) {
      for (let pos = 0; pos <= order.length; pos++) {
        const cost = marginalMin(order, i, pos, m, c.serviceMin);
        const score = candidates[i].priority / Math.max(cost, 1e-6);
        if (!best || score > best.score + 1e-12) {
          best = { i, pos, score, cost };
        }
      }
    }
    if (!best) break;
    const trial = [...order.slice(0, best.pos), best.i, ...order.slice(best.pos)];
    if (c.mode === "time" && tourMin(trial, m, c.serviceMin) > (c.timeBudgetMin ?? 0)) {
      // Does not fit here; a cheaper candidate might, so keep going without it.
      skipped.push({ id: candidates[best.i].id, reason: "time_budget", marginalMin: best.cost });
      remaining.delete(best.i);
      continue;
    }
    order = trial;
    remaining.delete(best.i);
  }

  // Anything still queued when a count cap ended the loop.
  for (const i of remaining) {
    skipped.push({ id: candidates[i].id, reason: "stop_limit", marginalMin: 0 });
  }

  // Optimise on the same quantity the budget constrains, so a tour that fitted
  // before the swap still fits after it.
  order = twoOpt(order, m);
  const chosen = [...order].sort((a, b) => candidates[b].priority - candidates[a].priority || a - b);
  return {
    order,
    totalMin: tourMin(order, m, c.serviceMin),
    totalKm: tourKm(order, m),
    baselineKm: tourKm(chosen, m),
    skipped,
  };
}
