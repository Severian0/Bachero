import { describe, it, expect } from "vitest";
import { buildTrack } from "./along";
import type { RouteStep } from "@/lib/types";

// A straight track due north along the prime meridian: 0, 0.5, 1 degree latitude.
// One degree of latitude is about 111.2 km.
const COORDS: [number, number][] = [
  [0, 0],
  [0, 0.5],
  [0, 1],
];

const STEPS: RouteStep[] = [
  { instruction: "Head out", lng: 0, lat: 0, distance_m: 55600 },
  { instruction: "Turn left onto Test Street", lng: 0.001, lat: 0.5, distance_m: 55600 },
];

describe("buildTrack", () => {
  it("accumulates the total distance", () => {
    expect(buildTrack(COORDS, []).totalKm).toBeCloseTo(111.2, 0);
  });

  it("pointAt interpolates linearly and clamps past both ends", () => {
    const t = buildTrack(COORDS, []);
    expect(t.pointAt(0)).toEqual([0, 0]);
    const mid = t.pointAt(t.totalKm / 2);
    expect(mid[0]).toBeCloseTo(0, 9);
    expect(mid[1]).toBeCloseTo(0.5, 3);
    const quarter = t.pointAt(t.totalKm / 4);
    expect(quarter[1]).toBeCloseTo(0.25, 3);
    expect(t.pointAt(t.totalKm * 10)).toEqual([0, 1]);
    expect(t.pointAt(-5)).toEqual([0, 0]);
  });

  it("stepAt returns the last instruction at or before the distance", () => {
    const t = buildTrack(COORDS, STEPS);
    // The second step snaps to the middle vertex, about 55.6 km along.
    expect(t.stepAt(1)?.instruction).toBe("Head out");
    expect(t.stepAt(t.totalKm / 2 - 1)?.instruction).toBe("Head out");
    expect(t.stepAt(t.totalKm / 2 + 1)?.instruction).toBe("Turn left onto Test Street");
    expect(t.stepAt(t.totalKm)?.instruction).toBe("Turn left onto Test Street");
  });

  it("stepAt is null with no steps", () => {
    expect(buildTrack(COORDS, []).stepAt(50)).toBeNull();
  });
});
