import type { Pothole } from "@/lib/data/types";
import type { PotholeStatus } from "@/lib/types";
import { coord, hhmm, monthsSince, plural } from "./format";

export type Filter = "open" | "suspected" | "confirmed" | "scheduled" | "all";
/** Chip order, and the order the f key steps through. */
export const FILTER_CYCLE: Filter[] = ["all", "confirmed", "suspected", "scheduled"];
export const FILTER_LABELS: Record<Filter, string> = {
  open: "Open", suspected: "Suspected", confirmed: "Confirmed", scheduled: "Scheduled", all: "All",
};
export const STATUS_LABEL: Record<PotholeStatus, string> = {
  suspected: "Suspected", confirmed: "Confirmed", scheduled: "Scheduled", repaired: "Repaired", false_positive: "Dismissed",
};

/** Flags a queue row reads from the store. Pins take theirs from `./visual`. */
type Flags = { linked: boolean; selected: boolean };

/** Mirrors potholes_map.priority: severity × ln(1 + vehicles) × (1 + age in 30-day months). */
export function priority(
  p: Pick<Pothole, "severity" | "distinct_vehicles" | "first_detected_at">, now: Date = new Date(),
): number {
  const ageMonths = (now.getTime() - new Date(p.first_detected_at).getTime()) / 86_400_000 / 30;
  return p.severity * Math.log(1 + p.distinct_vehicles) * (1 + ageMonths);
}

export interface RowStyle { mark: string; bg: string; priColor: string }

export function rowStyle(p: Pothole, { linked, selected }: Flags): RowStyle {
  let mark = "var(--color-neutral-400)";
  if (p.status === "confirmed") mark = "var(--color-accent)";
  if (p.status === "scheduled") mark = "var(--color-accent-800)";
  if (p.status === "repaired") mark = "var(--color-neutral-300)";
  return {
    mark,
    bg: selected ? "var(--color-accent-100)" : linked ? "var(--ink-5)" : "transparent",
    priColor: selected || linked ? "var(--color-accent-800)" : "var(--ink-72)",
  };
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
