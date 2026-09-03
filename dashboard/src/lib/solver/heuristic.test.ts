import { describe, it, expect } from "vitest";
import { buildMatrix, haversineKm } from "./haversine";
import { solve, tourKm, tourMin, twoOpt } from "./heuristic";
import type { Matrix } from "./haversine";

// Depot at 0, four stops on a square 1 km apart, in an order that makes the
// priority tour cross itself: 1 (NW), 2 (SE), 3 (NE), 4 (SW).
const pts: [number, number][] = [
  [0, 0], [-0.005, 0.009], [0.005, -0.009], [0.005, 0.009], [-0.005, -0.009],
];
const m: Matrix = buildMatrix(pts, 30);
const cands = [
  { id: "nw", priority: 4 }, { id: "se", priority: 3 }, { id: "ne", priority: 2 }, { id: "sw", priority: 1 },
];

// The same square plus an end anchor 1.1 km east of the depot, at matrix
// index 5. Candidates keep indices 0..3 (matrix 1..4).
const ptsOpen: [number, number][] = [...pts, [0.01, 0]];
const mOpen: Matrix = buildMatrix(ptsOpen, 30);
const END = 5;

describe("open routes (endIndex)", () => {
  it("tourKm and tourMin charge the leg to the end anchor, not a return to the start", () => {
    expect(tourKm([0], mOpen, END)).toBeCloseTo(mOpen.distanceKm[0][1] + mOpen.distanceKm[1][END], 9);
    expect(tourMin([0], mOpen, 20, END)).toBeCloseTo(
      mOpen.durationMin[0][1] + mOpen.durationMin[1][END] + 20, 9,
    );
  });

  it("endIndex 0 and endIndex omitted both reproduce today's closed tour exactly", () => {
    const closed = solve(cands, m, { mode: "manual", serviceMin: 20 });
    const explicit = solve(cands, m, { mode: "manual", serviceMin: 20, endIndex: 0 });
    expect(explicit).toEqual(closed);
    expect(tourKm([0, 1, 2, 3], m, 0)).toBeCloseTo(tourKm([0, 1, 2, 3], m), 9);
    expect(tourMin([0, 1, 2, 3], m, 20, 0)).toBeCloseTo(tourMin([0, 1, 2, 3], m, 20), 9);
  });

  it("a time budget respects the leg to the end anchor", () => {
    const s = solve(cands, mOpen, { mode: "time", timeBudgetMin: 50, serviceMin: 20, endIndex: END });
    expect(s.order.length).toBeGreaterThan(0);
    expect(s.totalMin).toBeLessThanOrEqual(50);
    // The reported total is the open-path total, end leg included.
    expect(s.totalMin).toBeCloseTo(tourMin(s.order, mOpen, 20, END), 9);
    expect(s.totalKm).toBeCloseTo(tourKm(s.order, mOpen, END), 9);
  });

  it("2-opt uncrosses a deliberately crossed open path", () => {
    const crossed = [0, 1, 2, 3]; // nw, se, ne, sw crosses itself
    const result = twoOpt(crossed, mOpen, mOpen.durationMin, END);
    expect([...result].sort()).toEqual([0, 1, 2, 3]);
    expect(tourKm(result, mOpen, END)).toBeLessThan(tourKm(crossed, mOpen, END));
  });

  it("the baseline uses the same end, so the percent-shorter figure stays honest", () => {
    const s = solve(cands, mOpen, { mode: "manual", serviceMin: 0, endIndex: END });
    const chosen = [0, 1, 2, 3]; // priority order
    expect(s.baselineKm).toBeCloseTo(tourKm(chosen, mOpen, END), 9);
    expect(s.totalKm).toBeLessThanOrEqual(s.baselineKm + 1e-9);
  });
});

describe("haversine", () => {
  it("1 degree of latitude is ~111 km", () => {
    expect(haversineKm([0, 0], [0, 1])).toBeCloseTo(111.2, 0);
  });
  it("matrix is symmetric with zero diagonal and minutes = km / speed × 60", () => {
    expect(m.distanceKm[0][0]).toBe(0);
    expect(m.distanceKm[1][2]).toBeCloseTo(m.distanceKm[2][1], 9);
    expect(m.durationMin[1][2]).toBeCloseTo((m.distanceKm[1][2] / 30) * 60, 9);
  });
});

describe("solve", () => {
  it("manual mode visits every candidate exactly once", () => {
    const s = solve(cands, m, { mode: "manual", serviceMin: 20 });
    expect([...s.order].sort()).toEqual([0, 1, 2, 3]);
  });
  it("count mode stops at maxStops, preferring high priority per minute", () => {
    const s = solve(cands, m, { mode: "count", maxStops: 2, serviceMin: 20 });
    expect(s.order).toHaveLength(2);
    expect(s.order).toContain(0);
  });
  it("time mode respects the budget including service and the return leg", () => {
    const s = solve(cands, m, { mode: "time", timeBudgetMin: 50, serviceMin: 20 });
    expect(s.totalMin).toBeLessThanOrEqual(50);
    expect(s.order.length).toBeGreaterThan(0);
    expect(s.order.length).toBeLessThan(4);
    const none = solve(cands, m, { mode: "time", timeBudgetMin: 1, serviceMin: 20 });
    expect(none.order).toEqual([]);
    expect(none.totalKm).toBe(0);
  });
  it("2-opt produces a tour no longer than the priority-order baseline", () => {
    const s = solve(cands, m, { mode: "manual", serviceMin: 0 });
    expect(s.totalKm).toBeLessThanOrEqual(s.baselineKm + 1e-9);
    expect(s.baselineKm).toBeCloseTo(tourKm([0, 1, 2, 3], m), 9);
    // The square's perimeter (~4.2 km incl. depot legs) beats the crossed tour.
    expect(s.totalKm).toBeLessThan(s.baselineKm);
  });
  it("tourMin adds service time per stop", () => {
    expect(tourMin([0], m, 20)).toBeCloseTo(m.durationMin[0][1] + m.durationMin[1][0] + 20, 9);
  });
  it("is deterministic", () => {
    const a = solve(cands, m, { mode: "count", maxStops: 3, serviceMin: 20 });
    const b = solve(cands, m, { mode: "count", maxStops: 3, serviceMin: 20 });
    expect(a).toEqual(b);
  });
});

describe("twoOpt", () => {
  it("un-crosses the priority-order tour into the shortest perimeter tour", () => {
    const crossed = [0, 1, 2, 3]; // nw, se, ne, sw — self-crossing
    // The two ways to walk the square's perimeter from the crossed order's
    // start differ in km because each replaces a different side with two
    // depot legs; take whichever is actually shortest as the target.
    const perimeterA = tourKm([0, 2, 1, 3], m); // nw, ne, se, sw
    const perimeterB = tourKm([0, 3, 1, 2], m); // nw, sw, se, ne
    const shortestPerimeterKm = Math.min(perimeterA, perimeterB);

    const result = twoOpt(crossed, m);

    expect([...result].sort()).toEqual([0, 1, 2, 3]); // still a permutation
    expect(tourKm(result, m)).toBeLessThan(tourKm(crossed, m));
    expect(tourKm(result, m)).toBeCloseTo(shortestPerimeterKm, 9);
  });
});

// A matrix where minutes and kilometres disagree, which a straight-line matrix
// can never be (there minutes = km / speed). Real road matrices do this all the
// time: a fast dual carriageway is long in km and short in minutes.
const skew: Matrix = {
  distanceKm: [
    [0, 10, 1, 10],
    [10, 0, 1, 1],
    [1, 1, 0, 10],
    [10, 1, 10, 0],
  ],
  durationMin: [
    [0, 1, 20, 1],
    [1, 0, 1, 20],
    [20, 1, 0, 1],
    [1, 20, 1, 0],
  ],
};

describe("twoOpt optimises the quantity the budget is spent in", () => {
  it("leaves a duration-optimal tour alone even when km could be cut", () => {
    // [0,1,2] is 4 min / 31 km. Reversing to [1,0,2] is 13 km but 42 min.
    expect(twoOpt([0, 1, 2], skew)).toEqual([0, 1, 2]);
    expect(tourMin([0, 1, 2], skew, 0)).toBeCloseTo(4, 9);
  });

  it("would take the km-cheaper, slower tour if pointed at distance", () => {
    const byKm = twoOpt([0, 1, 2], skew, skew.distanceKm);
    expect(byKm).not.toEqual([0, 1, 2]);
    expect(tourKm(byKm, skew)).toBeLessThan(tourKm([0, 1, 2], skew));
    // This is the regression: optimising km inflates the minutes the time
    // budget was checked against, so the returned route no longer fits.
    expect(tourMin(byKm, skew, 0)).toBeGreaterThan(tourMin([0, 1, 2], skew, 0));
  });

  it("keeps a time-mode solution inside its budget after 2-opt", () => {
    const skewed = [
      { id: "a", priority: 3 }, { id: "b", priority: 2 }, { id: "c", priority: 1 },
    ];
    const s = solve(skewed, skew, { mode: "time", timeBudgetMin: 10, serviceMin: 0 });
    expect(s.order.length).toBeGreaterThan(0);
    expect(s.totalMin).toBeLessThanOrEqual(10);
  });
});

describe("solve reports what it left out", () => {
  it("names the stops a count cap pushed out", () => {
    const s = solve(cands, m, { mode: "count", maxStops: 2, serviceMin: 20 });
    expect(s.skipped).toHaveLength(2);
    expect(s.skipped.every((k) => k.reason === "stop_limit")).toBe(true);
    const ids = new Set(s.skipped.map((k) => k.id));
    for (const i of s.order) expect(ids.has(cands[i].id)).toBe(false);
  });

  it("names the stops a time budget pushed out, with what they would have cost", () => {
    const s = solve(cands, m, { mode: "time", timeBudgetMin: 50, serviceMin: 20 });
    expect(s.skipped.length).toBeGreaterThan(0);
    expect(s.skipped.every((k) => k.reason === "time_budget")).toBe(true);
    expect(s.skipped.every((k) => k.marginalMin > 0)).toBe(true);
    expect(s.order.length + s.skipped.length).toBe(cands.length);
  });

  it("skips nothing in manual mode", () => {
    expect(solve(cands, m, { mode: "manual", serviceMin: 20 }).skipped).toEqual([]);
  });
});
