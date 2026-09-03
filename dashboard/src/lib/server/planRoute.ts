import type { SupabaseClient } from "@supabase/supabase-js";
import type { LineString, OsrmClient } from "./osrm";
import { parsePointWkb } from "./wkb";
import { pointInPolygon } from "@/lib/console/area";
import { solve } from "@/lib/solver/heuristic";
import { buildMatrix } from "@/lib/solver/haversine";
import type { LngLat, Matrix } from "@/lib/solver/haversine";
import { DEFAULT_TIME_ZONE, SHIFT_START_HOUR, shiftStartMs } from "@/lib/solver/schedule";
import type { PlanRouteRequest, PlanRouteResponse, PlanRouteStop, PotholeMapRow } from "@/lib/types";

/** Error carrying the HTTP status the route handler should return. */
export class PlanRouteError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = "PlanRouteError";
  }
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;
const DEFAULT_SERVICE_MIN = 20;
/** Caps the OSRM /table call. Recorded in `objective`, never applied silently. */
const MAX_CANDIDATES = 60;
/** Average urban driving speed for the straight-line fallback matrix. */
const FALLBACK_KMH = 25;
/** Work-order statuses that still hold a pothole out of the repair queue. */
const OPEN_WORK_ORDER_STATUSES = ["open", "assigned", "in_progress"];

function isRealDate(value: string): boolean {
  const parsed = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

function isPolygon(value: unknown): value is GeoJSON.Polygon {
  if (typeof value !== "object" || value === null) return false;
  const candidate = value as { type?: unknown; coordinates?: unknown };
  return (
    candidate.type === "Polygon" &&
    Array.isArray(candidate.coordinates) &&
    Array.isArray(candidate.coordinates[0]) &&
    candidate.coordinates[0].length >= 4
  );
}

/**
 * Normalises an untrusted request body into a `PlanRouteRequest`, dropping the
 * fields that do not belong to the chosen mode, or returns one plain sentence
 * describing the first problem found.
 */
export function validatePlanRequest(body: unknown): PlanRouteRequest | { error: string } {
  if (typeof body !== "object" || body === null || Array.isArray(body)) {
    return { error: "The request body must be a JSON object." };
  }
  const raw = body as Record<string, unknown>;

  if (typeof raw.crew_id !== "string" || !UUID.test(raw.crew_id)) {
    return { error: "crew_id must be a crew UUID." };
  }
  if (typeof raw.plan_date !== "string" || !DATE_ONLY.test(raw.plan_date) || !isRealDate(raw.plan_date)) {
    return { error: "plan_date must be a calendar date in YYYY-MM-DD form." };
  }
  if (raw.mode !== "manual" && raw.mode !== "count" && raw.mode !== "time") {
    return { error: "mode must be one of manual, count or time." };
  }

  let serviceMin = DEFAULT_SERVICE_MIN;
  if (raw.service_min_per_stop !== undefined) {
    if (typeof raw.service_min_per_stop !== "number" || !Number.isFinite(raw.service_min_per_stop) || raw.service_min_per_stop < 0) {
      return { error: "service_min_per_stop must be a number of minutes that is zero or more." };
    }
    serviceMin = raw.service_min_per_stop;
  }

  if (raw.area !== undefined && !isPolygon(raw.area)) {
    return { error: "area must be a GeoJSON Polygon with a closed outer ring." };
  }

  const req: PlanRouteRequest = {
    crew_id: raw.crew_id,
    plan_date: raw.plan_date,
    mode: raw.mode,
    service_min_per_stop: serviceMin,
    ...(raw.area === undefined ? {} : { area: raw.area as GeoJSON.Polygon }),
  };

  if (raw.mode === "manual") {
    const ids = raw.pothole_ids;
    if (!Array.isArray(ids) || ids.length === 0 || !ids.every((id) => typeof id === "string" && UUID.test(id))) {
      return { error: "manual mode needs pothole_ids: a non-empty array of pothole UUIDs." };
    }
    req.pothole_ids = ids as string[];
  } else if (raw.mode === "count") {
    if (typeof raw.max_stops !== "number" || !Number.isInteger(raw.max_stops) || raw.max_stops < 1) {
      return { error: "count mode needs max_stops: a whole number of at least 1." };
    }
    req.max_stops = raw.max_stops;
  } else {
    if (typeof raw.time_budget_min !== "number" || !Number.isFinite(raw.time_budget_min) || raw.time_budget_min < 1) {
      return { error: "time mode needs time_budget_min: at least 1 minute." };
    }
    req.time_budget_min = raw.time_budget_min;
  }

  return req;
}

/**
 * Solver candidates. Manual mode takes the named potholes in queue (priority)
 * order; the other modes take the whole queue, optionally clipped to `area`.
 */
export function pickCandidates(queue: PotholeMapRow[], req: PlanRouteRequest): PotholeMapRow[] {
  if (req.mode === "manual") {
    const wanted = new Set(req.pothole_ids ?? []);
    return queue.filter((row) => wanted.has(row.id));
  }
  const area = req.area;
  if (!area) return [...queue];
  return queue.filter((row) => pointInPolygon([row.lng, row.lat], area));
}

/**
 * Shift start: 08:00 on `plan_date` in the authority's time zone.
 *
 * Resolved explicitly rather than from the server's local time, because the
 * server is not in the authority's zone once this is deployed: Vercel runs UTC,
 * which puts every ETA an hour out through British Summer Time.
 */
export function planStartIso(
  planDate: string,
  timeZone: string = process.env.AUTHORITY_TIME_ZONE ?? DEFAULT_TIME_ZONE,
): string {
  return new Date(shiftStartMs(planDate, SHIFT_START_HOUR, timeZone)).toISOString();
}

/**
 * ETA per stop: cumulative drive minutes from the depot (matrix index 0), with
 * `serviceMin` added after each stop. `order` holds candidate indices, so the
 * matrix index of candidate i is i + 1.
 */
export function buildEtas(order: number[], matrix: Matrix, serviceMin: number, startIso: string): string[] {
  const startMs = new Date(startIso).getTime();
  const etas: string[] = [];
  let minutes = 0;
  let from = 0;
  for (const candidate of order) {
    const node = candidate + 1;
    minutes += matrix.durationMin[from][node];
    etas.push(new Date(startMs + minutes * 60_000).toISOString());
    minutes += serviceMin;
    from = node;
  }
  return etas;
}

function toEwktLineString(line: LineString): string {
  return `SRID=4326;LINESTRING(${line.coordinates.map(([lng, lat]) => `${lng} ${lat}`).join(", ")})`;
}

const round1 = (value: number) => Math.round(value * 10) / 10;

interface QueryResult {
  data: unknown;
  error: { message?: string } | null;
}

/** Unwraps a PostgREST result, turning any database error into a 500. */
function rows<T>(result: QueryResult): T[] {
  if (result.error) throw new PlanRouteError(500, "The database request failed.");
  return (result.data ?? []) as T[];
}

export interface PlanRouteDeps {
  db: SupabaseClient;
  osrm: OsrmClient;
  now?: () => Date;
}

/** The crew's current plan for `plan_date`, if any, with the work orders on it. */
interface ExistingPlan {
  planIds: string[];
  orders: { id: string; pothole_id: string }[];
}

async function loadExistingPlan(db: SupabaseClient, req: PlanRouteRequest): Promise<ExistingPlan> {
  const plans = rows<{ id: string }>(
    await db.from("route_plans").select("id").eq("crew_id", req.crew_id).eq("plan_date", req.plan_date),
  );
  if (plans.length === 0) return { planIds: [], orders: [] };
  const planIds = plans.map((p) => p.id);
  const orders = rows<{ id: string; pothole_id: string }>(
    await db.from("work_orders").select("id, pothole_id").in("route_plan_id", planIds),
  );
  return { planIds, orders };
}

/**
 * Solver input: the open queue, plus the potholes the plan we are about to
 * replace is holding. Those are `scheduled`, so `repair_queue` excludes them —
 * without this, replanning the same crew and date would find nothing to plan.
 * Merged and re-sorted by priority so the candidate order stays queue order.
 */
async function loadQueue(db: SupabaseClient, existing: ExistingPlan): Promise<PotholeMapRow[]> {
  const queue = rows<PotholeMapRow>(
    await db.from("repair_queue").select("*").order("priority", { ascending: false }),
  );
  const inQueue = new Set(queue.map((row) => row.id));
  const heldIds = [...new Set(existing.orders.map((o) => o.pothole_id))].filter((id) => !inQueue.has(id));
  if (heldIds.length === 0) return queue;

  const held = rows<PotholeMapRow>(
    await db.from("potholes_map").select("*").in("id", heldIds).eq("status", "scheduled"),
  );
  return [...queue, ...held].sort((a, b) => b.priority - a.priority);
}

/**
 * Deletes the crew's existing plan for `plan_date`, first cancelling its work
 * orders and returning their potholes to `confirmed`. The work_orders_sync
 * trigger only moves potholes *into* `scheduled`, so the reset is explicit; a
 * pothole still referenced by another open work order is left alone.
 *
 * `keepScheduled` holds the potholes the *new* plan will carry over. Their old
 * work orders are still cancelled and deleted, but they are not reset: they are
 * scheduled before and after, so resetting them would emit a pointless
 * `scheduled → confirmed → scheduled` pair of realtime events that a client can
 * apply out of order. Only genuinely dropped stops flip.
 */
async function replaceExistingPlan(
  db: SupabaseClient,
  existing: ExistingPlan,
  nowIso: string,
  keepScheduled: ReadonlySet<string>,
): Promise<void> {
  const { planIds, orders: oldOrders } = existing;
  if (planIds.length === 0) return;

  if (oldOrders.length > 0) {
    const orderIds = oldOrders.map((w) => w.id);
    rows(await db.from("work_orders").update({ status: "cancelled" }).in("id", orderIds));

    // Now that these are cancelled, anything still open is a *different* work order.
    const potholeIds = [...new Set(oldOrders.map((w) => w.pothole_id))];
    const stillHeld = rows<{ pothole_id: string }>(
      await db
        .from("work_orders")
        .select("pothole_id")
        .in("pothole_id", potholeIds)
        .in("status", OPEN_WORK_ORDER_STATUSES),
    );
    const held = new Set(stillHeld.map((w) => w.pothole_id));
    const freed = potholeIds.filter((id) => !held.has(id) && !keepScheduled.has(id));
    if (freed.length > 0) {
      rows(
        await db
          .from("potholes")
          .update({ status: "confirmed", updated_at: nowIso })
          .eq("status", "scheduled")
          .in("id", freed),
      );
    }

    rows(await db.from("work_orders").delete().in("id", orderIds));
  }

  rows(await db.from("route_plans").delete().in("id", planIds));
}

/** docs/ARCHITECTURE.md §5 — plan a crew's day and persist it as a draft. */
export async function planRoute(deps: PlanRouteDeps, req: PlanRouteRequest): Promise<PlanRouteResponse> {
  const { db, osrm } = deps;
  const nowIso = (deps.now?.() ?? new Date()).toISOString();

  const crews = rows<{ id: string; depot: string }>(
    await db.from("crews").select("id, depot").eq("id", req.crew_id),
  );
  const crew = crews[0];
  if (!crew) throw new PlanRouteError(404, "That crew was not found.");

  let depot: LngLat;
  try {
    depot = parsePointWkb(crew.depot);
  } catch {
    throw new PlanRouteError(500, "The crew depot could not be read.");
  }

  const existing = await loadExistingPlan(db, req);
  const queue = await loadQueue(db, existing);
  let candidates = pickCandidates(queue, req);
  if (candidates.length === 0) throw new PlanRouteError(400, "No open potholes match that request.");
  // The queue is priority-ordered, so clipping keeps the most valuable stops.
  const consideredAll = candidates.length <= MAX_CANDIDATES;
  if (!consideredAll) candidates = candidates.slice(0, MAX_CANDIDATES);

  const points: LngLat[] = candidates.map((c) => [c.lng, c.lat]);
  // A dead routing service downgrades the numbers rather than killing the plan.
  // The matrix only ranks candidate orderings; nobody reads it. `estimated` is
  // recorded on the plan so the console can label figures it cannot stand behind.
  let estimated = false;
  let matrix: Matrix;
  try {
    matrix = await osrm.table([depot, ...points]);
  } catch {
    matrix = buildMatrix([depot, ...points], FALLBACK_KMH);
    estimated = true;
  }

  const serviceMin = req.service_min_per_stop ?? DEFAULT_SERVICE_MIN;
  const solution = solve(
    candidates.map((c) => ({ id: c.id, priority: c.priority })),
    matrix,
    {
      mode: req.mode,
      maxStops: req.max_stops,
      timeBudgetMin: req.time_budget_min,
      serviceMin,
    },
  );
  if (solution.order.length === 0) {
    throw new PlanRouteError(400, "No route could be planned for those stops.");
  }

  // An unreachable cell in the OSRM matrix is Infinity, and the solver will
  // still seed its first candidate with one. Say so rather than letting the
  // ETA arithmetic throw a RangeError further down.
  if (!Number.isFinite(solution.totalMin)) {
    throw new PlanRouteError(400, "Some of those potholes cannot be reached by road.");
  }

  const ordered = solution.order.map((i) => candidates[i]);
  const routePoints: LngLat[] = [depot, ...ordered.map((c): LngLat => [c.lng, c.lat]), depot];
  let line: LineString;
  try {
    line = await osrm.route(routePoints);
  } catch {
    line = { type: "LineString", coordinates: routePoints.map(([lng, lat]): [number, number] => [lng, lat]) };
    estimated = true;
  }
  const etas = buildEtas(solution.order, matrix, serviceMin, planStartIso(req.plan_date));

  await replaceExistingPlan(db, existing, nowIso, new Set(ordered.map((c) => c.id)));

  const totalKm = round1(solution.totalKm);
  const totalMinutes = Math.round(solution.totalMin);
  const baselineKm = round1(solution.baselineKm);

  const inserted = rows<{ id: string }>(
    await db
      .from("route_plans")
      .insert({
        crew_id: req.crew_id,
        plan_date: req.plan_date,
        status: "draft",
        path: toEwktLineString(line),
        total_km: totalKm,
        total_minutes: totalMinutes,
        baseline_km: baselineKm,
        objective: { request: req, candidate_count: candidates.length, estimated, considered_all: consideredAll },
      })
      .select("id"),
  );
  const plan = inserted[0];
  if (!plan) throw new PlanRouteError(500, "The database request failed.");

  // `route_plans` is unique on (crew_id, plan_date), so a plan with no stops
  // would block every later request for that crew and date. There is no
  // transaction across these two inserts, so compensate by hand: if the work
  // orders fail, delete the plan row we just made. The *previous* plan is
  // already gone at this point and is not restored — the caller must replan.
  let workOrders: { id: string; stop_order: number }[];
  try {
    workOrders = rows<{ id: string; stop_order: number }>(
      await db
        .from("work_orders")
        .insert(
          ordered.map((c, i) => ({
            pothole_id: c.id,
            crew_id: req.crew_id,
            route_plan_id: plan.id,
            stop_order: i + 1,
            status: "assigned",
            eta: etas[i],
          })),
        )
        .select("id, stop_order"),
    );
    if (workOrders.length !== ordered.length) {
      throw new PlanRouteError(500, "The database request failed.");
    }
  } catch (error) {
    // Best effort. If the cleanup itself fails there is nothing further to try,
    // and the original error is the one worth reporting.
    try {
      await db.from("route_plans").delete().eq("id", plan.id);
    } catch {
      /* ignored */
    }
    throw error;
  }
  const idByStop = new Map(workOrders.map((w) => [w.stop_order, w.id]));

  const stops: PlanRouteStop[] = ordered.map((c, i) => {
    // Guarded by the length check above; an empty string here would hand the
    // client something that is not a work order id.
    const workOrderId = idByStop.get(i + 1);
    if (workOrderId === undefined) throw new PlanRouteError(500, "The database request failed.");
    return {
      work_order_id: workOrderId,
      pothole_id: c.id,
      stop_order: i + 1,
      eta: etas[i],
      lng: c.lng,
      lat: c.lat,
      severity: c.severity,
      photo_url: c.photo_url,
    };
  });

  return {
    route_plan_id: plan.id,
    stops,
    total_km: totalKm,
    total_minutes: totalMinutes,
    baseline_km: baselineKm,
    path: line,
  };
}
