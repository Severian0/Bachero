// Row shapes for the read-model views. Everything down to the `/api/plan-route`
// contract is copied verbatim from `dashboard/src/lib/types.ts` so the two apps
// agree on what PostgREST returns; keep both in sync with the views in
// supabase/migrations/20260901000000_init.sql. Contractor-only shapes are
// appended at the foot of this file.

export type PotholeStatus =
  | "suspected"
  | "confirmed"
  | "scheduled"
  | "repaired"
  | "false_positive";

export type WorkOrderStatus =
  | "open"
  | "assigned"
  | "in_progress"
  | "done"
  | "cancelled";

export type RouteStatus = "draft" | "published" | "in_progress" | "completed";

/** Row of `potholes_map` (and `repair_queue`, which is a filtered subset). */
export interface PotholeMapRow {
  id: string;
  authority_id: string;
  road_name: string | null;
  status: PotholeStatus;
  severity: number;
  detection_count: number;
  distinct_vehicles: number;
  first_detected_at: string;
  last_detected_at: string;
  repaired_at: string | null;
  updated_at: string;
  lng: number;
  lat: number;
  photo_url: string | null;
  priority: number;
}

/** Row of `latest_vehicle_positions`. */
export interface VehiclePositionRow {
  vehicle_id: string;
  trip_id: string;
  recorded_at: string;
  lng: number;
  lat: number;
  speed_mps: number | null;
  heading_deg: number | null;
  label: string;
  fleet_type: string;
  route_ref: string | null;
}

export interface Crew {
  id: string;
  authority_id: string;
  name: string;
  shift_minutes: number;
  repairs_per_shift: number;
}

export interface WorkOrder {
  id: string;
  pothole_id: string;
  crew_id: string | null;
  route_plan_id: string | null;
  stop_order: number | null;
  status: WorkOrderStatus;
  eta: string | null;
  started_at: string | null;
  completed_at: string | null;
  before_photo_url: string | null;
  after_photo_url: string | null;
  notes: string | null;
  pothole?: PotholeMapRow;
}

/** Row of `route_plans_map` with the nested embed used by the dashboard and crew page. */
export interface RoutePlanMapRow {
  id: string;
  crew_id: string;
  plan_date: string;
  status: RouteStatus;
  total_km: number | null;
  total_minutes: number | null;
  baseline_km: number | null;
  objective: Record<string, unknown> | null;
  path_geojson: { type: "LineString"; coordinates: [number, number][] } | null;
  crew?: Crew;
  work_orders?: WorkOrder[];
}

// ─── /api/plan-route contract (docs/ARCHITECTURE.md §5) ────────────────────────────

export type PlanMode = "manual" | "count" | "time";

export interface PlanRouteRequest {
  crew_id: string;
  plan_date: string; // YYYY-MM-DD
  mode: PlanMode;
  pothole_ids?: string[]; // manual
  max_stops?: number; // count
  time_budget_min?: number; // time
  area?: { type: "Polygon"; coordinates: [number, number][][] };
  service_min_per_stop?: number;
}

export interface PlanRouteStop {
  work_order_id: string;
  pothole_id: string;
  stop_order: number;
  eta: string;
  lng: number;
  lat: number;
  severity: number;
  photo_url: string | null;
}

export interface PlanRouteResponse {
  route_plan_id: string;
  stops: PlanRouteStop[];
  total_km: number;
  total_minutes: number;
  baseline_km: number;
  path: { type: "LineString"; coordinates: [number, number][] };
}

export interface DispatchRequest {
  route_plan_id: string;
  to: string[];
}

// ─── Contractor shapes ────────────────────────────────────────────────────────
// What the screens actually render. A thin mapping over the rows above: the work
// order joined to its pothole, plus the two derived fields every list needs (a
// human reference and something to call the place).

/** One stop on a route: a `work_orders` row with its pothole and route context. */
export interface Stop {
  id: string; // work_orders.id
  potholeId: string;
  routePlanId: string | null;
  crewId: string | null;
  crewName: string | null;
  planDate: string | null; // YYYY-MM-DD, from the stop's route plan
  stopOrder: number | null;
  status: WorkOrderStatus;
  eta: string | null;
  startedAt: string | null;
  completedAt: string | null;
  beforePhotoUrl: string | null;
  afterPhotoUrl: string | null;
  notes: string | null;
  pothole: PotholeMapRow;
  /** "BCH-A41C" — the first four hex of the pothole id. What a crew reads aloud. */
  ref: string;
  /** `road_name`, or the coordinate when the reverse-geocode has not run. */
  street: string;
}

/** A route plan as it appears in a list: totals and progress, no stops. */
export interface RouteSummary {
  id: string;
  crew: Crew;
  planDate: string;
  status: RouteStatus;
  totalKm: number | null;
  totalMinutes: number | null;
  baselineKm: number | null;
  stopCount: number;
  doneCount: number;
  escalatedCount: number;
}

/** A route plan with its stops, in `stop_order`. */
export interface RouteDetail extends RouteSummary {
  stops: Stop[];
}

/** Everything still owed, split by when it was due. */
export interface BacklogGroups {
  overdue: Stop[];
  today: Stop[];
  upcoming: Stop[];
}

export interface CrewStats {
  routes: number;
  stopsDone: number;
  stopsEscalated: number;
  kilometres: number;
  /** Median-free mean over stops that carry both `started_at` and `completed_at`. */
  averageMinutesPerStop: number | null;
}

export interface CrewDetail {
  crew: Crew;
  routes: RouteSummary[];
  stats: CrewStats;
}

/** What `complete()` records alongside the status change. */
export interface CompletionPatch {
  afterPhotoUrl?: string;
  notes?: string;
}
