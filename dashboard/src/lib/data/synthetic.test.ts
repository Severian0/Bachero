import { describe, it, expect, vi } from "vitest";
import { createSyntheticSource, mulberry32 } from "./synthetic";

describe("synthetic source", () => {
  it("mulberry32 is deterministic", () => {
    const a = mulberry32(1), b = mulberry32(1);
    expect([a(), a(), a()]).toEqual([b(), b(), b()]);
  });
  it("load is deterministic for the seed and covers every status", async () => {
    const x = await createSyntheticSource(7).load();
    const y = await createSyntheticSource(7).load();
    expect(x.potholes.map((p) => p.id)).toEqual(y.potholes.map((p) => p.id));
    expect(x.potholes.length).toBeGreaterThanOrEqual(28);
    const statuses = new Set(x.potholes.map((p) => p.status));
    expect(statuses.has("suspected")).toBe(true);
    expect(statuses.has("confirmed")).toBe(true);
    expect(x.vehicles).toHaveLength(3);
    expect(x.crews[0].id).toBe("00000000-0000-0000-0000-000000000006");
    expect(x.kmToday).toBeCloseTo(148.6, 6);
  });
  it("confirmed needs two vehicles; suspected has one", async () => {
    const { potholes } = await createSyntheticSource().load();
    for (const p of potholes) {
      if (p.status === "suspected") expect(p.distinct_vehicles).toBe(1);
      if (p.status === "confirmed") expect(p.distinct_vehicles).toBeGreaterThanOrEqual(2);
    }
  });
  it("detections name exactly distinct_vehicles distinct vehicle ids", async () => {
    const ds = createSyntheticSource();
    const { potholes } = await ds.load();
    for (const p of potholes) {
      const rows = await ds.detections(p.id);
      const distinct = new Set(rows.map((d) => d.vehicle_id));
      expect(distinct.size).toBe(p.distinct_vehicles);
    }
  });
  it("detections match detection_count and carry the pothole id", async () => {
    const ds = createSyntheticSource();
    const { potholes } = await ds.load();
    const p = potholes[0];
    const rows = await ds.detections(p.id);
    expect(rows).toHaveLength(p.detection_count);
    expect(rows.every((d) => d.pothole_id === p.id)).toBe(true);
  });
  it("planRoute marks chosen potholes scheduled with contiguous stop numbers", async () => {
    const ds = createSyntheticSource();
    const { potholes, crews } = await ds.load();
    const onPothole = vi.fn();
    ds.subscribe({ onPothole, onVehicle: vi.fn() });
    const open = potholes.filter((p) => p.status === "confirmed").slice(0, 4);
    const res = await ds.planRoute({ crew_id: crews[0].id, plan_date: "2026-09-03", mode: "manual", pothole_ids: open.map((p) => p.id), service_min_per_stop: 20 });
    expect(res.stops.map((s) => s.stop_order)).toEqual([1, 2, 3, 4]);
    expect(res.path.coordinates.length).toBe(6); // depot + 4 stops + depot
    expect(res.baseline_km).toBeGreaterThanOrEqual(res.total_km);
    const scheduled = onPothole.mock.calls.map((c) => c[0]).filter((p) => p.status === "scheduled");
    expect(scheduled).toHaveLength(4);
  });
  it("count mode with an area only considers potholes inside it", async () => {
    const ds = createSyntheticSource();
    const { crews } = await ds.load();
    const tiny: GeoJSON.Polygon = { type: "Polygon", coordinates: [[[-0.1300, 51.4940], [-0.1200, 51.4940], [-0.1200, 51.4990], [-0.1300, 51.4990], [-0.1300, 51.4940]]] };
    const res = await ds.planRoute({ crew_id: crews[0].id, plan_date: "2026-09-03", mode: "count", max_stops: 50, area: tiny, service_min_per_stop: 20 });
    for (const s of res.stops) {
      expect(s.lng).toBeGreaterThanOrEqual(-0.13);
      expect(s.lng).toBeLessThanOrEqual(-0.12);
      expect(s.lat).toBeGreaterThanOrEqual(51.494);
      expect(s.lat).toBeLessThanOrEqual(51.499);
    }
  });
  it("subscribe emits vehicles on a timer and stops on unsubscribe", async () => {
    vi.useFakeTimers();
    const ds = createSyntheticSource();
    await ds.load();
    const onVehicle = vi.fn();
    const off = ds.subscribe({ onPothole: vi.fn(), onVehicle });
    vi.advanceTimersByTime(1200 * 3);
    expect(onVehicle).toHaveBeenCalledTimes(9);
    off();
    vi.advanceTimersByTime(1200);
    expect(onVehicle).toHaveBeenCalledTimes(9);
    vi.useRealTimers();
  });

  it("subscribe emits an onKmToday total that grows by KM_PER_TICK each tick", async () => {
    vi.useFakeTimers();
    const ds = createSyntheticSource();
    const { kmToday: start } = await ds.load();
    const onKmToday = vi.fn();
    const off = ds.subscribe({ onPothole: vi.fn(), onVehicle: vi.fn(), onKmToday });
    vi.advanceTimersByTime(1200 * 2);
    expect(onKmToday).toHaveBeenCalledTimes(2);
    expect(onKmToday.mock.calls[1][0]).toBeCloseTo(start + 0.11 * 2, 6);
    off();
    vi.useRealTimers();
  });
});
