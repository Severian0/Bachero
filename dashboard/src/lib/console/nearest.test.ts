import { describe, it, expect } from "vitest";
import { firstLegKm, nearestOpenPothole } from "./nearest";
import { haversineKm } from "@/lib/solver/haversine";
import type { PlanRouteResponse } from "@/lib/types";
import type { Pothole } from "@/lib/data/types";

const base: Pothole = {
  id: "a", authority_id: "x", road_name: "Millbank", street: "Millbank", ref: "BCH-A", stop_order: null,
  status: "confirmed", severity: 0.5, detection_count: 2, distinct_vehicles: 2,
  first_detected_at: "2026-08-01T00:00:00Z", last_detected_at: "2026-09-01T00:00:00Z", repaired_at: null,
  updated_at: "2026-09-01T00:00:00Z", lng: -0.12, lat: 51.49, photo_url: null, priority: 1,
};
const p = (o: Partial<Pothole>): Pothole => ({ ...base, ...o });

describe("nearestOpenPothole", () => {
  it("picks the closest suspected or confirmed pothole by straight-line distance", () => {
    const near = p({ id: "near", lng: 0.001, lat: 0 });
    const far = p({ id: "far", lng: 0.1, lat: 0 });
    expect(nearestOpenPothole([far, near], [0, 0])?.id).toBe("near");
  });

  it("ignores scheduled, repaired and dismissed potholes even when they are closer", () => {
    const closest = p({ id: "sched", status: "scheduled", lng: 0, lat: 0 });
    const repaired = p({ id: "rep", status: "repaired", lng: 0.0001, lat: 0 });
    const dismissed = p({ id: "fp", status: "false_positive", lng: 0.0002, lat: 0 });
    const open = p({ id: "open", lng: 0.01, lat: 0 });
    expect(nearestOpenPothole([closest, repaired, dismissed, open], [0, 0])?.id).toBe("open");
  });

  it("returns null when nothing is open, and is deterministic on ties", () => {
    expect(nearestOpenPothole([p({ id: "r", status: "repaired" })], [0, 0])).toBeNull();
    expect(nearestOpenPothole([], [0, 0])).toBeNull();
    const first = p({ id: "first", lng: 0.001, lat: 0 });
    const second = p({ id: "second", lng: 0.001, lat: 0 });
    expect(nearestOpenPothole([first, second], [0, 0])?.id).toBe("first");
  });
});

describe("firstLegKm", () => {
  const planOf = (start: [number, number], stops: [number, number][]): PlanRouteResponse => ({
    route_plan_id: "r",
    stops: stops.map(([lng, lat], i) => ({
      work_order_id: `w${i}`, pothole_id: `p${i}`, stop_order: i + 1,
      eta: "2026-09-03T08:00:00.000Z", lng, lat, severity: 0.5, photo_url: null,
    })),
    total_km: 0, total_minutes: 0, baseline_km: 0,
    path: { type: "LineString", coordinates: [] },
    steps: [],
    start: { lng: start[0], lat: start[1], label: "Depot" },
    end: { lng: start[0], lat: start[1], label: "Depot" },
  });

  it("measures from the start anchor to the first stop", () => {
    // One degree of longitude at this latitude is about 69 km; 0.001 is about 69 m.
    const plan = planOf([0, 51.5], [[0.1, 51.5], [0.2, 51.5]]);
    expect(firstLegKm(plan)).toBeCloseTo(haversineKm([0, 51.5], [0.1, 51.5]), 9);
  });

  it("is zero when the plan has no stops", () => {
    expect(firstLegKm(planOf([0, 51.5], []))).toBe(0);
  });
});
