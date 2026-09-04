import { describe, it, expect } from "vitest";
import { boundsOf, networkPoints } from "./camera";
import type { Crew, Pothole } from "@/lib/data/types";

const p = (id: string, lng: number, lat: number, status: Pothole["status"] = "confirmed"): Pothole => ({
  id, authority_id: "x", road_name: null, street: null, ref: id, stop_order: null, status, severity: 0.5,
  detection_count: 1, distinct_vehicles: 1, first_detected_at: "", last_detected_at: "", repaired_at: null,
  updated_at: "", lng, lat, photo_url: null, priority: 1,
});
const crew = (id: string, lng: number, lat: number): Crew =>
  ({ id, authority_id: "x", name: id, shift_minutes: 480, repairs_per_shift: 12, depot_lng: lng, depot_lat: lat });

describe("camera", () => {
  it("frames potholes and every crew depot, skipping false positives", () => {
    const pts = networkPoints([p("a", 1, 2), p("b", 3, 4, "false_positive")], [crew("c", 5, 6), crew("d", 7, 8)], [0, 0]);
    expect(pts).toEqual([[1, 2], [5, 6], [7, 8]]);
  });
  it("falls back to the synthetic depot only when no crew is known", () => {
    expect(networkPoints([], [], [9, 9])).toEqual([[9, 9]]);
  });
  it("boundsOf is south-west then north-east", () => {
    expect(boundsOf([[1, 5], [3, 2]])).toEqual([[1, 2], [3, 5]]);
  });
});
