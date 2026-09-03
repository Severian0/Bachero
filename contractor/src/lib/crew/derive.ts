// Pure derivations: what a work order looks like, what it says, and how a route
// adds up. No React, no I/O — everything here is unit-tested in
// test/derive.test.ts.
//
// The rule these functions exist to enforce is DESIGN.md §1: one accent, no
// status palette. A work order's state is carried by fill, weight and form, and
// *always also by a word*. `statusWord` is therefore never optional — a caller
// that renders `stopMark` without it has broken the rule.

import type {
  BacklogGroups,
  PotholeMapRow,
  RouteSummary,
  Stop,
  WorkOrderStatus,
} from "@/lib/types";
import { coordinate, dayOffset, plural, severity as severityText } from "./format";

/** The 3px left marker on a row, and the fill of its severity bar. */
export function stopMark(status: WorkOrderStatus): string {
  switch (status) {
    case "in_progress":
      return "var(--color-accent)";
    case "assigned":
      return "var(--color-neutral-400)";
    case "done":
      return "var(--color-neutral-300)";
    case "cancelled":
      return "var(--color-neutral-600)";
    case "open":
      return "var(--color-neutral-300)";
  }
}

/**
 * The word. Spelled out, never abbreviated, never carried by colour alone.
 * "Escalated" rather than "Cancelled": the work is not cancelled, it has gone
 * back to the council because this crew cannot close it.
 */
export function statusWord(status: WorkOrderStatus): string {
  switch (status) {
    case "open":
      return "Unassigned";
    case "assigned":
      return "Not started";
    case "in_progress":
      return "In progress";
    case "done":
      return "Done";
    case "cancelled":
      return "Escalated";
  }
}

/** Four segments, filled from the left. `ceil(severity × 4)`, minimum one. */
export function severitySegments(value: number): boolean[] {
  const clamped = Math.min(1, Math.max(0, value));
  const filled = Math.min(4, Math.max(1, Math.ceil(clamped * 4)));
  return [0, 1, 2, 3].map((i) => i < filled);
}

/** `road_name`, or the coordinate when the reverse-geocode has not run. */
export const streetOf = (p: PotholeMapRow): string =>
  p.road_name ?? coordinate(p.lat, p.lng);

/** "BCH-A41C" — the first four hex of the pothole id, as the console does it. */
export const refOf = (potholeId: string): string =>
  `BCH-${potholeId.replace(/-/g, "").slice(0, 4).toUpperCase()}`;

/**
 * Measurement, then inference (DESIGN.md §8). The corroboration evidence comes
 * first because it is what justifies the crew being sent at all.
 */
export function evidenceLine(stop: Stop): string {
  const p = stop.pothole;
  return [
    plural(p.distinct_vehicles, "vehicle"),
    plural(p.detection_count, "pass", "passes"),
    `severity ${severityText(p.severity)}`,
  ].join(" · ");
}

export interface Progress {
  done: number;
  escalated: number;
  outstanding: number;
  total: number;
  /** 0–1, counting escalated stops as settled: the crew cannot do more here. */
  fraction: number;
  /** "4 of 12 stops done" — the words that always accompany the rule. */
  label: string;
}

export function progressOf(stops: readonly Stop[]): Progress {
  const total = stops.length;
  const done = stops.filter((s) => s.status === "done").length;
  const escalated = stops.filter((s) => s.status === "cancelled").length;
  const settled = done + escalated;
  return {
    done,
    escalated,
    outstanding: total - settled,
    total,
    fraction: total === 0 ? 0 : settled / total,
    label: `${done} of ${total} ${total === 1 ? "stop" : "stops"} done`,
  };
}

/** Progress from a summary row, which carries counts rather than stops. */
export function progressOfSummary(route: RouteSummary): Progress {
  const settled = route.doneCount + route.escalatedCount;
  return {
    done: route.doneCount,
    escalated: route.escalatedCount,
    outstanding: route.stopCount - settled,
    total: route.stopCount,
    fraction: route.stopCount === 0 ? 0 : settled / route.stopCount,
    label: `${route.doneCount} of ${route.stopCount} ${
      route.stopCount === 1 ? "stop" : "stops"
    } done`,
  };
}

/** `stop_order` ascending; stops without one sort last, then by reference. */
export function sortStops<T extends Stop>(stops: readonly T[]): T[] {
  return [...stops].sort((a, b) => {
    const ao = a.stopOrder ?? Number.MAX_SAFE_INTEGER;
    const bo = b.stopOrder ?? Number.MAX_SAFE_INTEGER;
    return ao === bo ? a.ref.localeCompare(b.ref) : ao - bo;
  });
}

/** True while a crew can still act on this stop. */
export const isOutstanding = (s: Stop): boolean =>
  s.status !== "done" && s.status !== "cancelled";

/**
 * The next stop a crew should drive to: the one already in progress, else the
 * first outstanding one in route order. Null when the route is finished.
 */
export function nextStop(stops: readonly Stop[]): Stop | null {
  const ordered = sortStops(stops);
  return (
    ordered.find((s) => s.status === "in_progress") ??
    ordered.find(isOutstanding) ??
    null
  );
}

/**
 * Everything still owed, split by when it was due. Grouping is on the route's
 * `plan_date` against today's calendar date, so a stop dated yesterday is
 * overdue at one minute past midnight, which is when a supervisor wants to see it.
 */
export function groupBacklog(
  stops: readonly Stop[],
  today: string,
): BacklogGroups {
  const groups: BacklogGroups = { overdue: [], today: [], upcoming: [] };
  for (const stop of stops) {
    if (!isOutstanding(stop)) continue;
    const offset = stop.planDate == null ? 0 : dayOffset(today, stop.planDate);
    if (offset < 0) groups.overdue.push(stop);
    else if (offset === 0) groups.today.push(stop);
    else groups.upcoming.push(stop);
  }
  const byPriority = (a: Stop, b: Stop) => b.pothole.priority - a.pothole.priority;
  groups.overdue.sort(byPriority);
  groups.today.sort(byPriority);
  groups.upcoming.sort(byPriority);
  return groups;
}

/**
 * How much shorter the planned route is than visiting the same stops in
 * descending priority order — the number the console shows when it plans, shown
 * here so the crew sees the same claim. Null when there is nothing to compare.
 */
export function savingFraction(route: {
  totalKm: number | null;
  baselineKm: number | null;
}): number | null {
  const { totalKm, baselineKm } = route;
  if (totalKm == null || baselineKm == null || baselineKm <= 0) return null;
  const saving = 1 - totalKm / baselineKm;
  return saving > 0 ? saving : null;
}
