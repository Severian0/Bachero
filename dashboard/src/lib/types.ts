// Row shapes for the read-model views in supabase/migrations/20260901000000_init.sql.
// Keep in sync with the views; PostgREST returns exactly these columns.

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
