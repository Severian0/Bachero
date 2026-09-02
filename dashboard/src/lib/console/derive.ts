import type { Pothole } from "@/lib/data/types";
import type { PotholeStatus } from "@/lib/types";
import { countInArea } from "./area";
import { coord, plural } from "./format";

export type Filter = "suspected" | "confirmed" | "scheduled" | "all";
/** Every filter has a chip; the two names are kept apart only for readability. */
export type ChipFilter = Filter;
/** Chip order, and the order the f key steps through. */
export const FILTER_CYCLE: ChipFilter[] = ["all", "confirmed", "suspected", "scheduled"];
export const FILTER_LABELS: Record<Filter, string> = {
  suspected: "Suspected", confirmed: "Confirmed", scheduled: "Scheduled", all: "All",
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

export const displayName = (p: Pothole) => p.street ?? coord(p.lat, p.lng);

export function evidenceLine(p: Pothole): string {
  return `${plural(p.distinct_vehicles, "vehicle")} · ${plural(p.detection_count, "pass", "passes")} · ${STATUS_LABEL[p.status].toLowerCase()}`;
}

export function matchesFilter(p: Pothole, f: Filter): boolean {
  if (f === "all") return p.status !== "false_positive";
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
