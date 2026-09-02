import { displayName, severityGrade } from "@/lib/console/derive";
import type { Pothole as ConsolePothole, Vehicle as ConsoleVehicle } from "@/lib/data/types";

/** Lifecycle from the detection schema. `false_positive` leaves the map. */
export type PotholeStatus =
  | "suspected"
  | "confirmed"
  | "scheduled"
  | "repaired"
  | "false_positive";

export interface Pothole {
  id: string;
  /** Human-quotable reference. Operators read these down a phone. */
  ref: string;
  street: string;
  /** Borough or district. Determines who is accountable for the repair. */
  locality: string;
  lat: number;
  lng: number;
  /** 1 to 4. Drives pin size and the segmented bar. Never priority. */
  severity: 1 | 2 | 3 | 4;
  /** Queue ordering. Includes age and corroboration, not just severity. */
  priority: number;
  status: PotholeStatus;
  /** Distinct vehicles that reported it. Two or more makes it `confirmed`. */
  vehicleCount: number;
  /** Total passes over the location, corroborating or not. */
  passCount: number;
  firstSeenIso: string;
  lastSeenIso: string;
  /** Detector mean confidence across accepted frames, 0 to 1, or null. */
  confidence: number | null;
  /** Frames the detector accepted for this location. */
  frameCount: number;
  /** Capture from the detector app. Supabase Storage URL in production. */
  imageUrl: string | null;
  /** Set once the pothole is on a crew's route. */
  stopOrder: number | null;
}

export interface Vehicle {
  id: string;
  label: string;
  lat: number;
  lng: number;
}

export interface Crew {
  id: string;
  name: string;
  depot: string;
  available: boolean;
}

/** A committed dispatch. Attributed, timestamped, quotable at committee. */
export interface Dispatch {
  reference: string;
  crewId: string;
  stops: Pothole[];
  km: number;
  minutes: number;
  dispatchedAtIso: string;
  operator: string;
}

export interface Bounds {
  north: number;
  south: number;
  east: number;
  west: number;
}

export type FilterKey = "all" | "suspected" | "confirmed" | "scheduled";

/*
 * Temporary adapters from the console store's domain types to the shapes the
 * screen's children still take. They exist only while the children are being
 * moved over one at a time; the last task to land deletes this file.
 */

/** A pothole as the store holds it, mapped onto the record above. */
export function toRecord(p: ConsolePothole): Pothole {
  return {
    id: p.id,
    ref: p.ref,
    street: displayName(p),
    locality: "",
    lat: p.lat,
    lng: p.lng,
    severity: severityGrade(p.severity),
    // Rounded for the queue column, which prints the figure in a 26px cell.
    priority: Math.round(p.priority * 10) / 10,
    status: p.status,
    vehicleCount: p.distinct_vehicles,
    passCount: p.detection_count,
    firstSeenIso: p.first_detected_at,
    lastSeenIso: p.last_detected_at,
    confidence: null,
    frameCount: p.detection_count,
    imageUrl: p.photo_url,
    stopOrder: p.stop_order,
  };
}

/** A vehicle as the store holds it, flattened to the position the map draws. */
export function toVehicleRecord(v: ConsoleVehicle): Vehicle {
  return { id: v.id, label: v.label, lat: v.position.lat, lng: v.position.lng };
}
