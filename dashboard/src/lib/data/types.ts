import type {
  Crew, PotholeMapRow, VehiclePositionRow, PlanRouteRequest, PlanRouteResponse, DispatchRequest,
} from "@/lib/types";

export type { Crew, PlanRouteRequest, PlanRouteResponse, DispatchRequest };

/** A pothole as the console shows it: the potholes_map row plus display fields. */
export type Pothole = PotholeMapRow & {
  street: string | null; // road_name; null renders as the coordinate
  ref: string;           // "BCH-" + first 4 hex of the id, uppercase
  stop_order: number | null; // set while scheduled on a route
};

export interface VehiclePosition {
  vehicle_id: string;
  lng: number;
  lat: number;
  recorded_at: string;
  speed_mps: number | null;
  heading_deg: number | null;
}

export interface Vehicle {
  id: string;
  label: string;
  fleet_type: string;
  position: VehiclePosition;
  trail: VehiclePosition[]; // most recent last, max 5
}

export interface Detection {
  id: string;
  pothole_id: string;
  vehicle_id: string;
  vehicle_label: string | null;
  recorded_at: string;
  severity: number;
  speed_mps: number | null;
  photo_url: string | null;
}

export type PotholeUpdate = Pothole | { id: string; deleted: true };

export interface LoadResult {
  potholes: Pothole[];
  vehicles: Vehicle[];
  crews: Crew[];
  kmToday: number;
}

export interface SubscribeHandlers {
  onPothole(p: PotholeUpdate): void;
  onVehicle(v: Vehicle): void;
  /** Synthetic-only: the source's own running km-today total after a tick. */
  onKmToday?(km: number): void;
}

export interface ConsoleDataSource {
  load(): Promise<LoadResult>;
  subscribe(handlers: SubscribeHandlers): () => void;
  detections(potholeId: string): Promise<Detection[]>;
  dismiss(potholeId: string): Promise<void>;
  planRoute(req: PlanRouteRequest): Promise<PlanRouteResponse>;
  dispatch(req: DispatchRequest): Promise<void>;
}

export function potholeRef(id: string): string {
  return "BCH-" + id.replace(/-/g, "").slice(0, 4).toUpperCase();
}

export function toPothole(row: PotholeMapRow, stop_order: number | null = null): Pothole {
  return { ...row, street: row.road_name, ref: potholeRef(row.id), stop_order };
}

export function toVehicle(row: VehiclePositionRow): Vehicle {
  const position: VehiclePosition = {
    vehicle_id: row.vehicle_id, lng: row.lng, lat: row.lat, recorded_at: row.recorded_at,
    speed_mps: row.speed_mps, heading_deg: row.heading_deg,
  };
  return { id: row.vehicle_id, label: row.label, fleet_type: row.fleet_type, position, trail: [position] };
}
