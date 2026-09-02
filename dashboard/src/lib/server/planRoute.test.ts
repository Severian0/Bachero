import { describe, it, expect, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  validatePlanRequest,
  pickCandidates,
  buildEtas,
  planStartIso,
  planRoute,
  PlanRouteError,
} from "./planRoute";
import type { OsrmClient, LineString } from "./osrm";
import type { LngLat, Matrix } from "@/lib/solver/haversine";
import type { PlanRouteRequest, PotholeMapRow } from "@/lib/types";

const CREW = "00000000-0000-0000-0000-000000000006";
const DATE = "2026-09-03";
const POTHOLE_A = "11111111-1111-1111-1111-111111111111";
const POTHOLE_B = "22222222-2222-2222-2222-222222222222";
// SRID=4326;POINT(-0.1246 51.4994), the seeded Crew A depot.
const DEPOT_HEX = "0101000020e6100000bde3141dc9e5bfbfabcfd556ecbf4940";

function queueRow(over: Partial<PotholeMapRow> & { id: string }): PotholeMapRow {
  return {
    authority_id: "00000000-0000-0000-0000-000000000001",
    road_name: null,
    status: "confirmed",
    severity: 0.5,
    detection_count: 2,
    distinct_vehicles: 2,
    first_detected_at: "2026-09-01T00:00:00.000Z",
    last_detected_at: "2026-09-01T00:00:00.000Z",
    repaired_at: null,
    updated_at: "2026-09-01T00:00:00.000Z",
    lng: 0,
    lat: 0,
    photo_url: null,
    priority: 1,
    ...over,
  };
}

// ─── validatePlanRequest ──────────────────────────────────────────────────────

const base = { crew_id: CREW, plan_date: DATE };

function errorOf(result: PlanRouteRequest | { error: string }): string {
  if (!("error" in result)) throw new Error("expected a validation error");
  return result.error;
}

function okOf(result: PlanRouteRequest | { error: string }): PlanRouteRequest {
  if ("error" in result) throw new Error(`expected success, got: ${result.error}`);
  return result;
}

describe("validatePlanRequest", () => {
  it("rejects a non-object body", () => {
    expect(errorOf(validatePlanRequest(null))).toMatch(/JSON object/);
    expect(errorOf(validatePlanRequest("nope"))).toMatch(/JSON object/);
  });

  it("rejects a missing or malformed crew_id", () => {
    expect(errorOf(validatePlanRequest({ ...base, crew_id: undefined, mode: "count", max_stops: 1 }))).toMatch(
      /crew_id/,
    );
    expect(errorOf(validatePlanRequest({ ...base, crew_id: "abc", mode: "count", max_stops: 1 }))).toMatch(/crew_id/);
  });

  it("rejects a plan_date that is not YYYY-MM-DD", () => {
    expect(errorOf(validatePlanRequest({ ...base, plan_date: "03/09/2026", mode: "count", max_stops: 1 }))).toMatch(
      /plan_date/,
    );
    expect(errorOf(validatePlanRequest({ ...base, plan_date: "2026-13-40", mode: "count", max_stops: 1 }))).toMatch(
      /plan_date/,
    );
  });

  it("rejects an unknown mode", () => {
    expect(errorOf(validatePlanRequest({ ...base, mode: "vibes" }))).toMatch(/mode/);
  });

  it("requires a non-empty pothole_ids for manual mode", () => {
    expect(errorOf(validatePlanRequest({ ...base, mode: "manual" }))).toMatch(/pothole_ids/);
    expect(errorOf(validatePlanRequest({ ...base, mode: "manual", pothole_ids: [] }))).toMatch(/pothole_ids/);
    expect(errorOf(validatePlanRequest({ ...base, mode: "manual", pothole_ids: ["nope"] }))).toMatch(/pothole_ids/);
    expect(okOf(validatePlanRequest({ ...base, mode: "manual", pothole_ids: [POTHOLE_A] })).pothole_ids).toEqual([
      POTHOLE_A,
    ]);
  });

  it("requires max_stops >= 1 for count mode", () => {
    expect(errorOf(validatePlanRequest({ ...base, mode: "count" }))).toMatch(/max_stops/);
    expect(errorOf(validatePlanRequest({ ...base, mode: "count", max_stops: 0 }))).toMatch(/max_stops/);
    expect(errorOf(validatePlanRequest({ ...base, mode: "count", max_stops: 2.5 }))).toMatch(/max_stops/);
    expect(okOf(validatePlanRequest({ ...base, mode: "count", max_stops: 3 })).max_stops).toBe(3);
  });

  it("requires time_budget_min >= 1 for time mode", () => {
    expect(errorOf(validatePlanRequest({ ...base, mode: "time" }))).toMatch(/time_budget_min/);
    expect(errorOf(validatePlanRequest({ ...base, mode: "time", time_budget_min: 0 }))).toMatch(/time_budget_min/);
    expect(okOf(validatePlanRequest({ ...base, mode: "time", time_budget_min: 480 })).time_budget_min).toBe(480);
  });

  it("defaults service_min_per_stop to 20 and validates an override", () => {
    expect(okOf(validatePlanRequest({ ...base, mode: "count", max_stops: 1 })).service_min_per_stop).toBe(20);
    expect(
      okOf(validatePlanRequest({ ...base, mode: "count", max_stops: 1, service_min_per_stop: 5 }))
        .service_min_per_stop,
    ).toBe(5);
    expect(
      errorOf(validatePlanRequest({ ...base, mode: "count", max_stops: 1, service_min_per_stop: -1 })),
    ).toMatch(/service_min_per_stop/);
  });

  it("accepts an optional Polygon area and rejects other geometry", () => {
    const area: GeoJSON.Polygon = {
      type: "Polygon",
      coordinates: [
        [
          [0, 0],
          [1, 0],
          [1, 1],
          [0, 1],
          [0, 0],
        ],
      ],
    };
    expect(okOf(validatePlanRequest({ ...base, mode: "count", max_stops: 1, area })).area).toEqual(area);
    expect(
      errorOf(validatePlanRequest({ ...base, mode: "count", max_stops: 1, area: { type: "Point", coordinates: [0, 0] } })),
    ).toMatch(/area/);
  });

  it("drops fields that do not belong to the chosen mode", () => {
    const req = okOf(validatePlanRequest({ ...base, mode: "count", max_stops: 2, time_budget_min: 90 }));
    expect(req.time_budget_min).toBeUndefined();
    expect(req.pothole_ids).toBeUndefined();
  });
});

// ─── pickCandidates ───────────────────────────────────────────────────────────

describe("pickCandidates", () => {
  const queue = [
    queueRow({ id: POTHOLE_A, lng: 0, lat: 0, priority: 3 }),
    queueRow({ id: POTHOLE_B, lng: 10, lat: 10, priority: 2 }),
  ];

  it("manual mode keeps only the requested ids, in queue order", () => {
    const req = okOf(validatePlanRequest({ ...base, mode: "manual", pothole_ids: [POTHOLE_B, POTHOLE_A] }));
    expect(pickCandidates(queue, req).map((r) => r.id)).toEqual([POTHOLE_A, POTHOLE_B]);
  });

  it("manual mode ignores ids that are not in the queue", () => {
    const req = okOf(
      validatePlanRequest({ ...base, mode: "manual", pothole_ids: ["33333333-3333-3333-3333-333333333333"] }),
    );
    expect(pickCandidates(queue, req)).toEqual([]);
  });

  it("count mode without an area keeps the whole queue", () => {
    const req = okOf(validatePlanRequest({ ...base, mode: "count", max_stops: 5 }));
    expect(pickCandidates(queue, req)).toHaveLength(2);
  });

  it("filters by point-in-polygon when an area is given", () => {
    const area: GeoJSON.Polygon = {
      type: "Polygon",
      coordinates: [
        [
          [-1, -1],
          [1, -1],
          [1, 1],
          [-1, 1],
          [-1, -1],
        ],
      ],
    };
    const req = okOf(validatePlanRequest({ ...base, mode: "count", max_stops: 5, area }));
    expect(pickCandidates(queue, req).map((r) => r.id)).toEqual([POTHOLE_A]);
  });

  it("returns an empty array when the area matches nothing", () => {
    const area: GeoJSON.Polygon = {
      type: "Polygon",
      coordinates: [
        [
          [90, 80],
          [91, 80],
          [91, 81],
          [90, 81],
          [90, 80],
        ],
      ],
    };
    const req = okOf(validatePlanRequest({ ...base, mode: "count", max_stops: 5, area }));
    expect(pickCandidates(queue, req)).toEqual([]);
  });
});

// ─── buildEtas / planStartIso ─────────────────────────────────────────────────

describe("planStartIso", () => {
  it("is 08:00 local on the plan date", () => {
    const iso = planStartIso(DATE);
    const local = new Date(iso);
    expect(local.getFullYear()).toBe(2026);
    expect(local.getMonth()).toBe(8);
    expect(local.getDate()).toBe(3);
    expect(local.getHours()).toBe(8);
    expect(local.getMinutes()).toBe(0);
  });
});

describe("buildEtas", () => {
  const matrix: Matrix = {
    durationMin: [
      [0, 5, 20],
      [5, 0, 10],
      [15, 10, 0],
    ],
    distanceKm: [
      [0, 1, 10],
      [1, 0, 2],
      [3, 2, 0],
    ],
  };

  it("accumulates drive time from the depot and adds service after each stop", () => {
    const start = "2026-09-03T08:00:00.000Z";
    // depot -> A is 5 min; then 20 min service; A -> B is 10 min.
    expect(buildEtas([0, 1], matrix, 20, start)).toEqual([
      "2026-09-03T08:05:00.000Z",
      "2026-09-03T08:35:00.000Z",
    ]);
  });

  it("returns an empty array for an empty order", () => {
    expect(buildEtas([], matrix, 20, "2026-09-03T08:00:00.000Z")).toEqual([]);
  });
});

// ─── fake PostgREST ───────────────────────────────────────────────────────────

type Row = Record<string, unknown>;
type Filter = { col: string; values: unknown[] };
interface WriteLog {
  table: string;
  op: "insert" | "update" | "delete";
  payload?: Row | Row[];
  filters: Filter[];
}

function matches(row: Row, filters: Filter[]): boolean {
  return filters.every((f) => f.values.includes(row[f.col]));
}

type Result = { data: Row[] | null; error: { message: string } | null };
/** Makes one table/op combination fail the way PostgREST does: data null, error set. */
type FailWhen = (call: { table: string; op: WriteLog["op"] | "select" }) => boolean;

/** Minimal in-memory stand-in for the supabase-js chains planRoute uses. */
function makeDb(tables: Record<string, Row[]>, failWhen: FailWhen = () => false) {
  const writes: WriteLog[] = [];
  let seq = 0;

  function from(table: string) {
    const filters: Filter[] = [];
    let op: WriteLog["op"] | "select" = "select";
    let payload: Row | Row[] | undefined;
    let sort: { col: string; ascending: boolean } | null = null;

    function run(): Result {
      const rows = tables[table] ?? (tables[table] = []);
      if (failWhen({ table, op })) return { data: null, error: { message: "boom" } };
      if (op === "select") {
        let out = rows.filter((r) => matches(r, filters));
        if (sort) {
          const { col, ascending } = sort;
          out = [...out].sort(
            (a, b) => ((a[col] as number) - (b[col] as number)) * (ascending ? 1 : -1),
          );
        }
        return { data: out.map((r) => ({ ...r })), error: null };
      }
      if (op === "insert") {
        const incoming = (Array.isArray(payload) ? payload : [payload as Row]).map((r) => ({
          id: `${table}-${++seq}`,
          ...r,
        }));
        rows.push(...incoming);
        writes.push({ table, op, payload, filters: [] });
        return { data: incoming.map((r) => ({ ...r })), error: null };
      }
      const hit = rows.filter((r) => matches(r, filters));
      writes.push({ table, op, payload, filters: [...filters] });
      if (op === "update") {
        for (const r of hit) Object.assign(r, payload as Row);
        return { data: hit.map((r) => ({ ...r })), error: null };
      }
      for (const r of hit) rows.splice(rows.indexOf(r), 1);
      return { data: hit.map((r) => ({ ...r })), error: null };
    }

    const q = {
      select: () => q,
      eq: (col: string, value: unknown) => {
        filters.push({ col, values: [value] });
        return q;
      },
      in: (col: string, values: unknown[]) => {
        filters.push({ col, values });
        return q;
      },
      order: (col: string, opts?: { ascending?: boolean }) => {
        sort = { col, ascending: opts?.ascending ?? true };
        return q;
      },
      insert: (rows: Row | Row[]) => {
        op = "insert";
        payload = rows;
        return q;
      },
      update: (row: Row) => {
        op = "update";
        payload = row;
        return q;
      },
      delete: () => {
        op = "delete";
        return q;
      },
      then: <T>(resolve: (v: Result) => T) => Promise.resolve(run()).then(resolve),
    };
    return q;
  }

  return { db: { from } as unknown as SupabaseClient, tables, writes };
}

// ─── planRoute ────────────────────────────────────────────────────────────────

// Depot = 0, candidate A = 1, candidate B = 2. Deliberately asymmetric so the
// solver's order (B then A) differs from the priority order (A then B) and the
// baseline tour is measurably worse than the optimised one.
const MATRIX: Matrix = {
  durationMin: [
    [0, 20, 5],
    [15, 0, 10],
    [5, 10, 0],
  ],
  distanceKm: [
    [0, 10, 1],
    [3, 0, 2],
    [1, 2, 0],
  ],
};

const LINE: LineString = {
  type: "LineString",
  coordinates: [
    [-0.1246, 51.4994],
    [-0.133, 51.4984],
    [-0.129, 51.496],
    [-0.1246, 51.4994],
  ],
};

function makeOsrm(over: Partial<OsrmClient> = {}) {
  return {
    table: vi.fn<(points: LngLat[]) => Promise<Matrix>>().mockResolvedValue(MATRIX),
    route: vi.fn<(points: LngLat[]) => Promise<LineString>>().mockResolvedValue(LINE),
    ...over,
  };
}

function baseTables(): Record<string, Row[]> {
  return {
    crews: [{ id: CREW, depot: DEPOT_HEX }],
    // Already in `repair_queue` order: priority descending.
    repair_queue: [
      queueRow({ id: POTHOLE_A, lng: -0.129, lat: 51.496, priority: 5, severity: 0.4 }) as unknown as Row,
      queueRow({
        id: POTHOLE_B,
        lng: -0.133,
        lat: 51.4984,
        priority: 1,
        severity: 0.9,
        photo_url: "https://example.com/b.jpg",
      }) as unknown as Row,
    ],
    route_plans: [],
    work_orders: [],
    potholes: [],
  };
}

const COUNT_REQ = okOf(validatePlanRequest({ crew_id: CREW, plan_date: DATE, mode: "count", max_stops: 3 }));

describe("planRoute", () => {
  it("plans, persists and returns the spec response", async () => {
    const { db, tables, writes } = makeDb(baseTables());
    const osrm = makeOsrm();

    const result = await planRoute({ db, osrm }, COUNT_REQ);

    // Depot first, then candidates in repair_queue order (lng first).
    expect(osrm.table).toHaveBeenCalledWith([
      [-0.1246, 51.4994],
      [-0.129, 51.496],
      [-0.133, 51.4984],
    ]);
    // Geometry request follows the solved order and returns to the depot.
    expect(osrm.route).toHaveBeenCalledWith([
      [-0.1246, 51.4994],
      [-0.133, 51.4984],
      [-0.129, 51.496],
      [-0.1246, 51.4994],
    ]);

    expect(result.stops.map((s) => s.pothole_id)).toEqual([POTHOLE_B, POTHOLE_A]);
    expect(result.stops.map((s) => s.stop_order)).toEqual([1, 2]);
    expect(result.stops[0]).toMatchObject({
      lng: -0.133,
      lat: 51.4984,
      severity: 0.9,
      photo_url: "https://example.com/b.jpg",
    });
    expect(result.total_km).toBe(6);
    expect(result.total_minutes).toBe(70);
    expect(result.baseline_km).toBe(13);
    expect(result.path).toEqual(LINE);

    const plan = tables.route_plans[0];
    expect(result.route_plan_id).toBe(plan.id);
    expect(plan).toMatchObject({
      crew_id: CREW,
      plan_date: DATE,
      status: "draft",
      total_km: 6,
      total_minutes: 70,
      baseline_km: 13,
      path: "SRID=4326;LINESTRING(-0.1246 51.4994, -0.133 51.4984, -0.129 51.496, -0.1246 51.4994)",
    });
    expect(plan.objective).toEqual({ request: COUNT_REQ, candidate_count: 2 });

    expect(tables.work_orders).toHaveLength(2);
    expect(tables.work_orders[0]).toMatchObject({
      pothole_id: POTHOLE_B,
      crew_id: CREW,
      route_plan_id: plan.id,
      stop_order: 1,
      status: "assigned",
    });
    expect(result.stops[0].work_order_id).toBe(tables.work_orders[0].id);
    // ETAs: depot -> B is 5 min from 08:00 local, then 20 min service + 10 min drive.
    expect(result.stops.map((s) => s.eta)).toEqual(buildEtas([1, 0], MATRIX, 20, planStartIso(DATE)));

    // Nothing to replace, so no deletes.
    expect(writes.some((w) => w.op === "delete")).toBe(false);
  });

  it("honours manual mode ordering of candidates", async () => {
    const { db } = makeDb(baseTables());
    const req = okOf(validatePlanRequest({ crew_id: CREW, plan_date: DATE, mode: "manual", pothole_ids: [POTHOLE_B] }));
    const osrm = makeOsrm({
      table: vi.fn<(points: LngLat[]) => Promise<Matrix>>().mockResolvedValue({
        durationMin: [
          [0, 12],
          [12, 0],
        ],
        distanceKm: [
          [0, 4],
          [4, 0],
        ],
      }),
    });

    const result = await planRoute({ db, osrm }, req);
    expect(result.stops).toHaveLength(1);
    expect(result.stops[0].pothole_id).toBe(POTHOLE_B);
    expect(result.total_km).toBe(8);
  });

  it("404s when the crew does not exist", async () => {
    const { db } = makeDb({ ...baseTables(), crews: [] });
    await expect(planRoute({ db, osrm: makeOsrm() }, COUNT_REQ)).rejects.toMatchObject({
      status: 404,
    });
  });

  it("400s when nothing is in the queue", async () => {
    const { db } = makeDb({ ...baseTables(), repair_queue: [] });
    await expect(planRoute({ db, osrm: makeOsrm() }, COUNT_REQ)).rejects.toThrow(
      "No open potholes match that request.",
    );
  });

  it("400s when the solver returns no stops", async () => {
    const { db } = makeDb(baseTables());
    const req = okOf(
      validatePlanRequest({ crew_id: CREW, plan_date: DATE, mode: "time", time_budget_min: 1 }),
    );
    await expect(planRoute({ db, osrm: makeOsrm() }, req)).rejects.toThrow(
      "No route could be planned for those stops.",
    );
  });

  it("502s when OSRM fails", async () => {
    const { db } = makeDb(baseTables());
    const osrm = makeOsrm({
      table: vi
        .fn<(points: LngLat[]) => Promise<Matrix>>()
        .mockRejectedValue(new Error("Route service unavailable")),
    });
    const error = await planRoute({ db, osrm }, COUNT_REQ).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(PlanRouteError);
    expect((error as PlanRouteError).status).toBe(502);
  });

  it("500s when the database returns an error", async () => {
    const broken = {
      from: () => ({
        select: () => ({
          eq: () => Promise.resolve({ data: null, error: { message: "boom" } }),
        }),
      }),
    } as unknown as SupabaseClient;
    await expect(planRoute({ db: broken, osrm: makeOsrm() }, COUNT_REQ)).rejects.toMatchObject({
      status: 500,
    });
  });

  it("deletes the plan it just inserted when the work orders fail to insert", async () => {
    const tables = baseTables();
    const { db } = makeDb(tables, (call) => call.table === "work_orders" && call.op === "insert");

    await expect(planRoute({ db, osrm: makeOsrm() }, COUNT_REQ)).rejects.toMatchObject({
      status: 500,
      message: "The database request failed.",
    });

    // No orphaned, stopless draft is left blocking (crew_id, plan_date).
    expect(tables.route_plans).toEqual([]);
  });

  it("re-plans potholes the plan being replaced is holding out of the queue", async () => {
    const tables = baseTables();
    // A is 'scheduled' because of last night's plan, so repair_queue omits it.
    const [rowA, rowB] = tables.repair_queue;
    tables.repair_queue = [rowB];
    tables.potholes_map = [{ ...rowA, status: "scheduled" }, rowB];
    tables.route_plans = [{ id: "plan-old", crew_id: CREW, plan_date: DATE, status: "draft" }];
    tables.work_orders = [
      { id: "wo-1", pothole_id: POTHOLE_A, route_plan_id: "plan-old", stop_order: 1, status: "assigned" },
    ];
    const { db } = makeDb(tables);

    const result = await planRoute({ db, osrm: makeOsrm() }, COUNT_REQ);

    expect(result.stops.map((s) => s.pothole_id)).toEqual([POTHOLE_B, POTHOLE_A]);
  });

  it("400s when the tour cannot be driven, before anything is written", async () => {
    const { db, writes } = makeDb(baseTables());
    // Every OSRM cell was null, which osrm.table() maps to Infinity.
    const unreachable: Matrix = {
      durationMin: [[0, Infinity, Infinity], [Infinity, 0, Infinity], [Infinity, Infinity, 0]],
      distanceKm: MATRIX.distanceKm,
    };
    const osrm = makeOsrm({ table: vi.fn<(points: LngLat[]) => Promise<Matrix>>().mockResolvedValue(unreachable) });

    await expect(planRoute({ db, osrm }, COUNT_REQ)).rejects.toMatchObject({
      status: 400,
      message: "Some of those potholes cannot be reached by road.",
    });
    expect(writes).toEqual([]);
  });

  it("leaves a carried-over stop scheduled and resets only the stops the new plan drops", async () => {
    const tables = baseTables();
    tables.route_plans = [{ id: "plan-old", crew_id: CREW, plan_date: DATE, status: "draft" }];
    tables.work_orders = [
      // A is on the old plan and will be on the new one; p-dropped will not.
      { id: "wo-1", pothole_id: POTHOLE_A, route_plan_id: "plan-old", stop_order: 1, status: "assigned" },
      { id: "wo-2", pothole_id: "p-dropped", route_plan_id: "plan-old", stop_order: 2, status: "assigned" },
    ];
    tables.potholes = [
      { id: POTHOLE_A, status: "scheduled" },
      { id: "p-dropped", status: "scheduled" },
    ];
    const { db, writes } = makeDb(tables);

    const result = await planRoute({ db, osrm: makeOsrm() }, COUNT_REQ);
    expect(result.stops.map((s) => s.pothole_id)).toContain(POTHOLE_A);

    // A is scheduled before and after, so it is never reset: no
    // scheduled → confirmed → scheduled pair goes out on the wire for it.
    expect(tables.potholes.find((p) => p.id === POTHOLE_A)?.status).toBe("scheduled");
    expect(tables.potholes.find((p) => p.id === "p-dropped")?.status).toBe("confirmed");
    const resets = writes.filter((w) => w.table === "potholes" && w.op === "update");
    expect(resets).toHaveLength(1);
    expect(resets[0].filters.find((f) => f.col === "id")?.values).toEqual(["p-dropped"]);

    // Both old work orders are still cancelled and deleted, A's included.
    const cancel = writes.find((w) => w.table === "work_orders" && w.op === "update");
    expect(cancel?.payload).toMatchObject({ status: "cancelled" });
    expect(cancel?.filters.find((f) => f.col === "id")?.values).toEqual(["wo-1", "wo-2"]);
    expect(tables.work_orders.map((w) => w.id)).not.toContain("wo-1");
    expect(tables.work_orders.map((w) => w.id)).not.toContain("wo-2");
  });

  it("replaces an existing plan: cancels, un-schedules, then deletes", async () => {
    const tables = baseTables();
    tables.route_plans = [{ id: "plan-old", crew_id: CREW, plan_date: DATE, status: "draft" }];
    tables.work_orders = [
      { id: "wo-1", pothole_id: "p-old-1", route_plan_id: "plan-old", stop_order: 1, status: "assigned" },
      { id: "wo-2", pothole_id: "p-old-2", route_plan_id: "plan-old", stop_order: 2, status: "assigned" },
      // p-old-2 is also on another, unrelated open work order, so it must stay scheduled.
      { id: "wo-3", pothole_id: "p-old-2", route_plan_id: null, stop_order: null, status: "open" },
    ];
    tables.potholes = [
      { id: "p-old-1", status: "scheduled" },
      { id: "p-old-2", status: "scheduled" },
    ];
    const { db, writes } = makeDb(tables);

    await planRoute({ db, osrm: makeOsrm() }, COUNT_REQ);

    // Old work orders were cancelled before being deleted.
    const cancel = writes.find((w) => w.table === "work_orders" && w.op === "update");
    expect(cancel?.payload).toMatchObject({ status: "cancelled" });

    // Only the pothole with no other open work order is reset.
    expect(tables.potholes.find((p) => p.id === "p-old-1")?.status).toBe("confirmed");
    expect(tables.potholes.find((p) => p.id === "p-old-2")?.status).toBe("scheduled");

    // The old plan and its work orders are gone; the unrelated one survives.
    expect(tables.work_orders.map((w) => w.id)).not.toContain("wo-1");
    expect(tables.work_orders.map((w) => w.id)).not.toContain("wo-2");
    expect(tables.work_orders.map((w) => w.id)).toContain("wo-3");
    expect(tables.route_plans.map((p) => p.id)).not.toContain("plan-old");
    expect(tables.route_plans).toHaveLength(1);
  });
});
