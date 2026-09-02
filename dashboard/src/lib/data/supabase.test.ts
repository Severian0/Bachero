import { describe, it, expect, vi, afterEach } from "vitest";
import { isSupabaseConfigured, startOfTodayISO } from "./index";
import { createSupabaseSource } from "./supabase";

describe("env switch", () => {
  afterEach(() => vi.unstubAllEnvs());
  it("uses Supabase only when the URL is set", () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "");
    expect(isSupabaseConfigured()).toBe(false);
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://x.supabase.co");
    expect(isSupabaseConfigured()).toBe(true);
  });
  it("startOfTodayISO is midnight local", () => {
    expect(new Date(startOfTodayISO()).getHours()).toBe(0);
  });
});

describe("supabase source load", () => {
  it("reads the views and maps rows", async () => {
    const tables: Record<string, unknown[]> = {
      potholes_map: [{ id: "abcd0000-0000-0000-0000-000000000000", authority_id: "a", road_name: null, status: "confirmed", severity: 0.5, detection_count: 2, distinct_vehicles: 2, first_detected_at: "2026-08-01T00:00:00Z", last_detected_at: "2026-09-01T00:00:00Z", repaired_at: null, updated_at: "2026-09-01T00:00:00Z", lng: -0.12, lat: 51.49, photo_url: null, priority: 1 }],
      latest_vehicle_positions: [{ vehicle_id: "v", trip_id: "t", recorded_at: "2026-09-02T08:00:00Z", lng: -0.13, lat: 51.5, speed_mps: 5, heading_deg: 90, label: "Bus 24", fleet_type: "bus", route_ref: null }],
      crews: [{ id: "c", authority_id: "a", name: "Crew A", shift_minutes: 480, repairs_per_shift: 12 }],
      trips: [{ distance_m: 1500 }, { distance_m: 2500 }],
      work_orders: [{ pothole_id: "abcd0000-0000-0000-0000-000000000000", stop_order: 2 }],
    };
    const query = (rows: unknown[]) => {
      const q: Record<string, unknown> = {};
      const chain = () => q;
      Object.assign(q, { select: chain, in: chain, or: chain, gte: chain, order: chain, eq: chain,
        then: (res: (v: { data: unknown[]; error: null }) => unknown) => Promise.resolve({ data: rows, error: null }).then(res) });
      return q;
    };
    const client = { from: (t: string) => query(tables[t] ?? []) } as never;
    const res = await createSupabaseSource(client).load();
    expect(res.potholes[0]).toMatchObject({ ref: "BCH-ABCD", street: null, stop_order: 2 });
    expect(res.vehicles[0]).toMatchObject({ id: "v", label: "Bus 24" });
    expect(res.vehicles[0].position.lng).toBe(-0.13);
    expect(res.kmToday).toBe(4);
  });
});
