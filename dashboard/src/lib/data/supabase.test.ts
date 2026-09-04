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

type TableSpec = unknown[] | { rows: unknown[]; error: unknown };

function query(spec: TableSpec) {
  const { rows, error } = Array.isArray(spec) ? { rows: spec, error: null } : spec;
  const q: Record<string, unknown> = {};
  const chain = () => q;
  Object.assign(q, { select: chain, in: chain, or: chain, gte: chain, order: chain, eq: chain,
    then: (res: (v: { data: unknown[] | null; error: unknown }) => unknown) =>
      Promise.resolve({ data: error ? null : rows, error }).then(res) });
  return q;
}

function clientFrom(tables: Record<string, TableSpec>) {
  return { from: (t: string) => query(tables[t] ?? []) } as never;
}

describe("supabase source load", () => {
  it("reads the views and maps rows", async () => {
    const tables: Record<string, TableSpec> = {
      potholes_map: [{ id: "abcd0000-0000-0000-0000-000000000000", authority_id: "a", road_name: null, status: "confirmed", severity: 0.5, detection_count: 2, distinct_vehicles: 2, first_detected_at: "2026-08-01T00:00:00Z", last_detected_at: "2026-09-01T00:00:00Z", repaired_at: null, updated_at: "2026-09-01T00:00:00Z", lng: -0.12, lat: 51.49, photo_url: null, priority: 1 }],
      latest_vehicle_positions: [{ vehicle_id: "v", trip_id: "t", recorded_at: "2026-09-02T08:00:00Z", lng: -0.13, lat: 51.5, speed_mps: 5, heading_deg: 90, label: "Bus 24", fleet_type: "bus", route_ref: null }],
      crews_map: [{ id: "c", authority_id: "a", name: "Crew A", shift_minutes: 480, repairs_per_shift: 12, depot_lng: -0.1246, depot_lat: 51.4994 }],
      trips: [{ distance_m: 1500 }, { distance_m: 2500 }],
      work_orders: [{ pothole_id: "abcd0000-0000-0000-0000-000000000000", stop_order: 2 }],
    };
    const res = await createSupabaseSource(clientFrom(tables)).load();
    expect(res.potholes[0]).toMatchObject({ ref: "BCH-ABCD", street: null, stop_order: 2 });
    expect(res.vehicles[0]).toMatchObject({ id: "v", label: "Bus 24" });
    expect(res.vehicles[0].position.lng).toBe(-0.13);
    expect(res.kmToday).toBe(4);
  });

  it("rejects when the crews query errors", async () => {
    const tables: Record<string, TableSpec> = {
      potholes_map: [], latest_vehicle_positions: [],
      crews_map: { rows: [], error: { message: "crews unavailable" } },
      trips: [], work_orders: [],
    };
    await expect(createSupabaseSource(clientFrom(tables)).load()).rejects.toThrow("crews unavailable");
  });

  it("falls back to kmToday 0 when the trips query errors", async () => {
    const tables: Record<string, TableSpec> = {
      potholes_map: [], latest_vehicle_positions: [], crews: [],
      trips: { rows: [], error: { message: "trips unavailable" } },
      work_orders: [],
    };
    const res = await createSupabaseSource(clientFrom(tables)).load();
    expect(res.kmToday).toBe(0);
  });
});

describe("supabase source crews", () => {
  // A fake that records the writes and answers the read-back from crews_map.
  function writingClient(opts: { deleteError?: { code: string; message: string } } = {}) {
    const calls: { table: string; op: string; row?: unknown; id?: string }[] = [];
    const from = (table: string) => {
      const c: { table: string; op: string; row?: unknown; id?: string } = { table, op: "select" };
      calls.push(c);
      const q: Record<string, unknown> = {};
      const chain = () => q;
      Object.assign(q, {
        select: chain, order: chain, in: chain,
        insert: (row: unknown) => { c.op = "insert"; c.row = row; return q; },
        update: (row: unknown) => { c.op = "update"; c.row = row; return q; },
        delete: () => { c.op = "delete"; return q; },
        eq: (_col: string, id: string) => { c.id = id; return q; },
        then: (res: (v: { data: unknown[] | null; error: unknown }) => unknown) => {
          const v = c.op === "delete"
            ? { data: null, error: opts.deleteError ?? null }
            : table === "crews_map"
              ? { data: [{ id: c.id, authority_id: "a", name: "Crew B", shift_minutes: 420, repairs_per_shift: 8, depot_lng: -0.11, depot_lat: 51.51 }], error: null }
              : { data: [{ id: c.id ?? "new-id" }], error: null };
          return Promise.resolve(v).then(res);
        },
      });
      return q;
    };
    return { client: { from } as never, calls };
  }

  it("inserts a crew with an EWKT depot, longitude first, and reads it back from the view", async () => {
    const { client, calls } = writingClient();
    const crew = await createSupabaseSource(client).saveCrew({ name: "Crew B", depot_lng: -0.11, depot_lat: 51.51, shift_minutes: 420, repairs_per_shift: 8 });
    expect(calls[0]).toMatchObject({ table: "crews", op: "insert", row: { name: "Crew B", depot: "SRID=4326;POINT(-0.11 51.51)", shift_minutes: 420 } });
    expect(calls[1]).toMatchObject({ table: "crews_map", id: "new-id" });
    expect(crew).toMatchObject({ id: "new-id", depot_lng: -0.11, depot_lat: 51.51 });
  });

  it("updates by id", async () => {
    const { client, calls } = writingClient();
    await createSupabaseSource(client).saveCrew({ id: "c1", name: "Crew B", depot_lng: -0.11, depot_lat: 51.51, shift_minutes: 420, repairs_per_shift: 8 });
    expect(calls[0]).toMatchObject({ table: "crews", op: "update", id: "c1" });
    expect((calls[0].row as Record<string, unknown>).authority_id).toBeUndefined();
  });

  it("says why a crew with routes cannot be deleted", async () => {
    const { client } = writingClient({ deleteError: { code: "23503", message: "violates foreign key" } });
    await expect(createSupabaseSource(client).deleteCrew("c1")).rejects.toThrow("routes on record");
  });
});
