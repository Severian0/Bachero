import type { ResolvedAnchor, RoutePlanMapRow, RouteStep, WorkOrderStatus } from "@/lib/types";

/** One stop as the crew page shows it: the work order plus its pothole, flattened. */
export interface CrewStop {
  work_order_id: string;
  pothole_id: string;
  stop_order: number;
  status: WorkOrderStatus;
  eta: string | null;
  lng: number;
  lat: number;
  road_name: string | null;
  severity: number;
  photo_url: string | null;
  after_photo_url: string | null;
}

/** Everything the crew page renders, as plain data. No geography, no embeds. */
export interface CrewPlan {
  id: string;
  crew_name: string;
  plan_date: string;
  total_km: number | null;
  total_minutes: number | null;
  path: [number, number][];
  stops: CrewStop[];
  start: ResolvedAnchor;
  end: ResolvedAnchor;
  steps: RouteStep[];
}

function isAnchor(value: unknown): value is ResolvedAnchor {
  if (typeof value !== "object" || value === null) return false;
  const a = value as Record<string, unknown>;
  return typeof a.lng === "number" && typeof a.lat === "number" && typeof a.label === "string";
}

function isStep(value: unknown): value is RouteStep {
  if (typeof value !== "object" || value === null) return false;
  const s = value as Record<string, unknown>;
  return (
    typeof s.instruction === "string" && typeof s.lng === "number" &&
    typeof s.lat === "number" && typeof s.distance_m === "number"
  );
}

/**
 * The nested route_plans_map row, flattened for rendering. Returns null when
 * there is nothing drivable (no stops, or no path), which the page shows as
 * its not-found state.
 */
export function crewPlanFromRow(row: RoutePlanMapRow): CrewPlan | null {
  const path = row.path_geojson?.coordinates ?? [];
  const stops: CrewStop[] = [];
  for (const w of row.work_orders ?? []) {
    if (w.status === "cancelled" || w.stop_order === null || !w.pothole) continue;
    stops.push({
      work_order_id: w.id,
      pothole_id: w.pothole_id,
      stop_order: w.stop_order,
      status: w.status,
      eta: w.eta,
      lng: w.pothole.lng,
      lat: w.pothole.lat,
      road_name: w.pothole.road_name,
      severity: w.pothole.severity,
      photo_url: w.pothole.photo_url,
      after_photo_url: w.after_photo_url,
    });
  }
  stops.sort((a, b) => a.stop_order - b.stop_order);
  if (stops.length === 0 || path.length === 0) return null;

  const objective = (row.objective ?? {}) as Record<string, unknown>;
  const anchors = (
    typeof objective.anchors === "object" && objective.anchors !== null ? objective.anchors : {}
  ) as Record<string, unknown>;
  // Plans saved before anchors were stored always started and ended at the
  // depot, which is exactly where their saved path begins and ends.
  const first = path[0];
  const last = path[path.length - 1];
  const start = isAnchor(anchors.start) ? anchors.start : { lng: first[0], lat: first[1], label: "Depot" };
  const end = isAnchor(anchors.end) ? anchors.end : { lng: last[0], lat: last[1], label: "Depot" };
  const steps = Array.isArray(objective.steps) ? objective.steps.filter(isStep) : [];

  return {
    id: row.id,
    crew_name: row.crew?.name ?? "Crew",
    plan_date: row.plan_date,
    total_km: row.total_km,
    total_minutes: row.total_minutes,
    path,
    stops,
    start,
    end,
    steps,
  };
}
