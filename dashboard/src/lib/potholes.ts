import { MOCK_POTHOLES, MOCK_VEHICLES, MOCK_KM_SCANNED } from "./fixtures";
import type { PotholeMapRow, VehiclePositionRow } from "./types";
import type { Pothole, PotholeStatus, Vehicle } from "./model";

/**
 * A reference an operator can read down a phone.
 *
 * The read model keys on a uuid, which nobody can quote, so the console
 * derives a short stable reference from it. It is display only: every write
 * still goes back by `id`.
 */
function refOf(id: string): string {
  const tail = id.replace(/[^a-zA-Z0-9]/g, "").slice(-4).toUpperCase();
  return `TLRN-${tail || "0000"}`;
}

function fromRow(r: PotholeMapRow): Pothole {
  return {
    id: r.id,
    ref: refOf(r.id),
    street: r.road_name ?? "Unnamed road",
    // Not carried by `potholes_map`. The record panel omits the line when
    // it is empty rather than inventing a borough.
    locality: "",
    lat: r.lat,
    lng: r.lng,
    severity: Math.min(4, Math.max(1, Math.round(r.severity))) as 1 | 2 | 3 | 4,
    priority: r.priority,
    status: r.status as PotholeStatus,
    vehicleCount: r.distinct_vehicles,
    passCount: r.detection_count,
    firstSeenIso: r.first_detected_at,
    lastSeenIso: r.last_detected_at,
    // The view reports no per-detection confidence, so the console says it
    // does not know rather than printing a number it made up.
    confidence: null,
    frameCount: r.detection_count,
    imageUrl: r.photo_url,
    stopOrder: null,
  };
}

function vehicleFromRow(r: VehiclePositionRow): Vehicle {
  return { id: r.vehicle_id, label: r.label, lat: r.lat, lng: r.lng };
}

export interface ConsoleData {
  potholes: Pothole[];
  vehicles: Vehicle[];
  kmScanned: number;
  /** False when the console is running on fixtures. Reported in the header. */
  live: boolean;
}

const FIXTURES: ConsoleData = {
  potholes: MOCK_POTHOLES,
  vehicles: MOCK_VEHICLES,
  kmScanned: MOCK_KM_SCANNED,
  live: false,
};

/**
 * The console's single read, against the read-model views.
 *
 * Falls back to fixtures whenever Supabase is absent or unreachable, and says
 * so in the header, because a dead backend must not blank an operator's
 * screen and must never look like live data.
 */
export async function loadConsoleData(): Promise<ConsoleData> {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
    return FIXTURES;
  }

  try {
    // Imported here rather than at module scope: the shared client asserts
    // its environment at construction, so a console running on fixtures must
    // not load it at all.
    const { supabase } = await import("./supabase");

    const [potholes, vehicles] = await Promise.all([
      supabase
        .from("potholes_map")
        .select("*")
        .neq("status", "false_positive")
        .order("priority", { ascending: true }),
      supabase.from("latest_vehicle_positions").select("*"),
    ]);

    if (potholes.error || !potholes.data) return FIXTURES;

    return {
      potholes: (potholes.data as PotholeMapRow[]).map(fromRow),
      vehicles: ((vehicles.data ?? []) as VehiclePositionRow[]).map(vehicleFromRow),
      kmScanned: MOCK_KM_SCANNED,
      live: true,
    };
  } catch {
    return FIXTURES;
  }
}
