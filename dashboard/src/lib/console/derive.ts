import type { Pothole } from "@/lib/data/types";
import type { PotholeStatus } from "@/lib/types";
import { haversineKm } from "@/lib/solver/haversine";
import { countInArea } from "./area";
import { coord, hhmm, monthsSince, plural } from "./format";

export type Filter = "open" | "suspected" | "confirmed" | "scheduled" | "all";
/** The four the column offers as chips. `open` is a grouping with no chip. */
export type ChipFilter = Exclude<Filter, "open">;
/** Chip order, and the order the f key steps through. */
export const FILTER_CYCLE: ChipFilter[] = ["all", "confirmed", "suspected", "scheduled"];
export const FILTER_LABELS: Record<Filter, string> = {
  open: "Open", suspected: "Suspected", confirmed: "Confirmed", scheduled: "Scheduled", all: "All",
};
export const STATUS_LABEL: Record<PotholeStatus, string> = {
  suspected: "Suspected", confirmed: "Confirmed", scheduled: "Scheduled", repaired: "Repaired", false_positive: "Dismissed",
};

/** Mirrors potholes_map.priority: severity × ln(1 + vehicles) × (1 + age in 30-day months). */
export function priority(
  p: Pick<Pothole, "severity" | "distinct_vehicles" | "first_detected_at">, now: Date = new Date(),
): number {
  const ageMonths = (now.getTime() - new Date(p.first_detected_at).getTime()) / 86_400_000 / 30;
  return p.severity * Math.log(1 + p.distinct_vehicles) * (1 + ageMonths);
}

/**
 * The 0-1 severity as the 1-4 grade the record and the pin quote. Clamped, so
 * a value from outside the range can never index off the end of a table.
 */
export function severityGrade(severity: number): 1 | 2 | 3 | 4 {
  return Math.min(4, Math.max(1, Math.ceil(severity * 4))) as 1 | 2 | 3 | 4;
}

export function severitySegments(severity: number): boolean[] {
  const filled = Math.max(1, Math.ceil(severity * 4));
  return [0, 1, 2, 3].map((i) => i < filled);
}

export const displayName = (p: Pothole) => p.street ?? coord(p.lat, p.lng);

export function evidenceLine(p: Pothole): string {
  return `${plural(p.distinct_vehicles, "vehicle")} · ${plural(p.detection_count, "pass", "passes")} · ${STATUS_LABEL[p.status].toLowerCase()}`;
}

export function inspectorLines(p: Pothole, now: Date = new Date()) {
  return {
    title: `${displayName(p)} ${p.ref}`,
    status: STATUS_LABEL[p.status],
    line1: `${p.distinct_vehicles} distinct vehicles · ${p.detection_count} passes · last ${hhmm(p.last_detected_at)}`,
    line2: `Severity ${p.severity.toFixed(2)} · age ${monthsSince(p.first_detected_at, now)} months · priority ${priority(p, now).toFixed(1)}`,
  };
}

export function matchesFilter(p: Pothole, f: Filter): boolean {
  if (f === "all") return p.status !== "false_positive";
  if (f === "open") return p.status === "suspected" || p.status === "confirmed";
  return p.status === f;
}

export function visibleRows(potholes: Pothole[], f: Filter, now: Date = new Date()): Pothole[] {
  return potholes
    .filter((p) => matchesFilter(p, f))
    .map((p) => ({ p, pr: priority(p, now) }))
    .sort((a, b) => b.pr - a.pr)
    .map((x) => x.p);
}

export function stats(potholes: Pothole[]) {
  return {
    confirmedOpen: potholes.filter((p) => p.status === "confirmed").length,
    suspected: potholes.filter((p) => p.status === "suspected").length,
    scheduled: potholes.filter((p) => p.status === "scheduled").length,
  };
}

export const isSelectable = (p: Pothole) =>
  p.status === "suspected" || p.status === "confirmed" || p.status === "scheduled";

/** Minutes per stop of travel the console assumes before the solver has run. */
const TRAVEL_MIN_PER_STOP = 6.5;

/**
 * The console's own estimate of a day's work before a route has been planned:
 * the crew's service time per stop, plus a flat travel allowance. Deliberately
 * crude and labelled as an estimate, because the real figure comes back from
 * the routing service with the plan.
 */
export function estimateMinutes(stops: number, serviceMinPerStop: number): number {
  return stops * serviceMinPerStop + Math.round(stops * TRAVEL_MIN_PER_STOP);
}

/**
 * How many potholes the solver would have to work with, which is what decides
 * whether "Plan route" can be pressed. Picking stops by hand means the
 * selection; asking for a best N or a time budget means the open queue, narrowed
 * to the drawn area when there is one.
 */
export function planCandidates(
  potholes: Pothole[],
  { mode, area, selectedCount }: { mode: "manual" | "count" | "time"; area: GeoJSON.Polygon | null; selectedCount: number },
): number {
  if (mode === "manual") return selectedCount;
  if (area) return countInArea(potholes, area);
  return potholes.filter((p) => p.status === "suspected" || p.status === "confirmed").length;
}

/**
 * Straight-line distance along a list of stops, in the order they are listed,
 * which is the order a crew would drive them. Deliberately not a road
 * distance: it is the honest back-of-envelope figure the console quotes while
 * the operator is still choosing, and the sheet says so in as many words.
 */
export function straightLineKm(stops: Pick<Pothole, "lng" | "lat">[]): number {
  let total = 0;
  for (let i = 1; i < stops.length; i += 1) {
    total += haversineKm([stops[i - 1].lng, stops[i - 1].lat], [stops[i].lng, stops[i].lat]);
  }
  return total;
}
