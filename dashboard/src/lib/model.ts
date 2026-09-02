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
