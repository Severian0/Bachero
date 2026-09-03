import { describe, it, expect } from "vitest";
import { nearestOpenPothole } from "./nearest";
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
