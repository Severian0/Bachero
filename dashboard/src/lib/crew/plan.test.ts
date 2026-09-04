import { describe, it, expect } from "vitest";
import { crewPlanFromRow } from "./plan";
import type { RoutePlanMapRow, WorkOrder } from "@/lib/types";

const pothole = (id: string, lng: number, lat: number, road: string | null) => ({
  id, authority_id: "x", road_name: road, status: "scheduled" as const, severity: 0.5,
  detection_count: 2, distinct_vehicles: 2, first_detected_at: "2026-09-01T00:00:00Z",
  last_detected_at: "2026-09-01T00:00:00Z", repaired_at: null, updated_at: "2026-09-01T00:00:00Z",
  lng, lat, photo_url: null, priority: 1,
});

const order = (id: string, stop: number, potholeId: string, lng: number, lat: number, road: string | null): WorkOrder => ({
  id, pothole_id: potholeId, crew_id: "c1", route_plan_id: "r1", stop_order: stop,
  status: "assigned", eta: "2026-09-04T08:20:00.000Z", started_at: null, completed_at: null,
  before_photo_url: null, after_photo_url: null, notes: null,
  pothole: pothole(potholeId, lng, lat, road),
});

function row(over: Partial<RoutePlanMapRow> = {}): RoutePlanMapRow {
  return {
    id: "r1", crew_id: "c1", plan_date: "2026-09-04", status: "published",
    total_km: 6, total_minutes: 70, baseline_km: 13, objective: null,
    path_geojson: { type: "LineString", coordinates: [[-0.1246, 51.4994], [-0.133, 51.4984], [-0.1246, 51.4994]] },
    crew: { id: "c1", authority_id: "x", name: "Crew A", shift_minutes: 480, repairs_per_shift: 12, depot_lng: -0.1246, depot_lat: 51.4994 },
    work_orders: [
      order("w2", 2, "p2", -0.129, 51.496, "Marsham Street"),
      order("w1", 1, "p1", -0.133, 51.4984, "Victoria Street"),
    ],
    ...over,
  };
}

describe("crewPlanFromRow", () => {
  it("flattens the row and sorts stops into driving order", () => {
    const plan = crewPlanFromRow(row());
    expect(plan).not.toBeNull();
    expect(plan?.crew_name).toBe("Crew A");
    expect(plan?.stops.map((s) => s.work_order_id)).toEqual(["w1", "w2"]);
    expect(plan?.stops[0]).toMatchObject({
      pothole_id: "p1", stop_order: 1, road_name: "Victoria Street", lng: -0.133, lat: 51.4984,
    });
    expect(plan?.path).toHaveLength(3);
  });

  it("falls back to the path endpoints as depot anchors and an empty step list", () => {
    const plan = crewPlanFromRow(row({ objective: null }));
    expect(plan?.start).toEqual({ lng: -0.1246, lat: 51.4994, label: "Depot" });
    expect(plan?.end).toEqual({ lng: -0.1246, lat: 51.4994, label: "Depot" });
    expect(plan?.steps).toEqual([]);
  });

  it("reads anchors and steps from objective when they are stored", () => {
    const plan = crewPlanFromRow(row({
      objective: {
        anchors: {
          start: { lng: -0.133, lat: 51.4984, label: "BCH-1111 - Victoria Street" },
          end: { lng: -0.1246, lat: 51.4994, label: "Depot" },
        },
        steps: [{ instruction: "Turn left onto Millbank", lng: -0.13, lat: 51.497, distance_m: 240 }],
      },
    }));
    expect(plan?.start.label).toBe("BCH-1111 - Victoria Street");
    expect(plan?.steps).toEqual([{ instruction: "Turn left onto Millbank", lng: -0.13, lat: 51.497, distance_m: 240 }]);
  });

  it("ignores cancelled work orders and returns null when nothing remains", () => {
    const cancelled = { ...order("w1", 1, "p1", -0.133, 51.4984, "Victoria Street"), status: "cancelled" as const };
    expect(crewPlanFromRow(row({ work_orders: [cancelled] }))).toBeNull();
    expect(crewPlanFromRow(row({ work_orders: [] }))).toBeNull();
    expect(crewPlanFromRow(row({ path_geojson: null }))).toBeNull();
  });
});
