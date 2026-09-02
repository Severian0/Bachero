import { describe, it, expect } from "vitest";
import { buildMatrix, haversineKm } from "./haversine";
import { solve, tourKm, tourMin } from "./heuristic";
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
