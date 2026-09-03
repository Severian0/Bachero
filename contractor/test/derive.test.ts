import { describe, expect, it } from "vitest";
import type { PotholeMapRow, Stop, WorkOrderStatus } from "@/lib/types";
import {
  evidenceLine,
  groupBacklog,
  isOutstanding,
  nextStop,
  progressOf,
  refOf,
  savingFraction,
  severitySegments,
  sortStops,
  statusWord,
  stopMark,
  streetOf,
} from "@/lib/crew/derive";

const pothole = (over: Partial<PotholeMapRow> = {}): PotholeMapRow => ({
  id: "4f2a1b3c-0000-4000-a000-000000000000",
  authority_id: "a",
  road_name: "Victoria Street",
  status: "scheduled",
  severity: 0.62,
  detection_count: 11,
  distinct_vehicles: 3,
  first_detected_at: "2026-08-01T08:00:00.000Z",
  last_detected_at: "2026-09-02T08:00:00.000Z",
  repaired_at: null,
  updated_at: "2026-09-02T08:00:00.000Z",
  lng: -0.1357,
  lat: 51.4975,
  photo_url: null,
  priority: 4.2,
  ...over,
});

const stop = (over: Partial<Stop> = {}): Stop => ({
  id: "w1",
  potholeId: "4f2a1b3c-0000-4000-a000-000000000000",
  routePlanId: "r1",
  crewId: "c1",
  crewName: "Crew A",
  planDate: "2026-09-03",
  stopOrder: 1,
  status: "assigned",
  eta: null,
  startedAt: null,
  completedAt: null,
  beforePhotoUrl: null,
  afterPhotoUrl: null,
  notes: null,
  pothole: pothole(),
  ref: "BCH-4F2A",
  street: "Victoria Street",
  ...over,
});

const STATUSES: WorkOrderStatus[] = [
  "open",
  "assigned",
  "in_progress",
  "done",
  "cancelled",
];

describe("status is never carried by colour alone", () => {
  it("gives every status a mark and a distinct word", () => {
    const words = STATUSES.map(statusWord);
    expect(new Set(words).size).toBe(STATUSES.length);
    for (const status of STATUSES) {
      expect(stopMark(status)).toMatch(/^var\(--color-/);
    }
  });

  it("calls a cancelled work order escalated, because that is what happened", () => {
    expect(statusWord("cancelled")).toBe("Escalated");
  });

  it("uses the one accent only for the stop being worked", () => {
    expect(stopMark("in_progress")).toBe("var(--color-accent)");
    // Everything else is neutral: no red, no amber, no green anywhere.
    for (const status of STATUSES.filter((s) => s !== "in_progress")) {
      expect(stopMark(status)).toContain("neutral");
    }
  });
});

describe("severitySegments", () => {
  it("fills ceil(severity × 4), and never fewer than one", () => {
    expect(severitySegments(0)).toEqual([true, false, false, false]);
    expect(severitySegments(0.24)).toEqual([true, false, false, false]);
    expect(severitySegments(0.25)).toEqual([true, false, false, false]);
    expect(severitySegments(0.26)).toEqual([true, true, false, false]);
    expect(severitySegments(1)).toEqual([true, true, true, true]);
  });

  it("clamps values outside 0–1 rather than overflowing the bar", () => {
    expect(severitySegments(4)).toEqual([true, true, true, true]);
    expect(severitySegments(-1)).toEqual([true, false, false, false]);
  });
});

describe("naming a place", () => {
  it("prefers the road name", () => {
    expect(streetOf(pothole())).toBe("Victoria Street");
  });

  it("falls back to the coordinate when the reverse-geocode has not run", () => {
    expect(streetOf(pothole({ road_name: null }))).toBe("51.49750, -0.13570");
  });

  it("builds the reference from the first four hex of the id", () => {
    expect(refOf("4f2a1b3c-0000-4000-a000-000000000000")).toBe("BCH-4F2A");
  });
});

describe("evidenceLine", () => {
  it("states the measurement before any inference", () => {
    expect(evidenceLine(stop())).toBe("3 vehicles · 11 passes · severity 0.62");
  });

  it("stays grammatical for a single vehicle and a single pass", () => {
    const one = stop({ pothole: pothole({ distinct_vehicles: 1, detection_count: 1 }) });
    expect(evidenceLine(one)).toBe("1 vehicle · 1 pass · severity 0.62");
  });
});

describe("progressOf", () => {
  it("counts escalated stops as settled — the crew cannot do more there", () => {
    const p = progressOf([
      stop({ id: "a", status: "done" }),
      stop({ id: "b", status: "cancelled" }),
      stop({ id: "c", status: "assigned" }),
      stop({ id: "d", status: "in_progress" }),
    ]);
    expect(p.done).toBe(1);
    expect(p.escalated).toBe(1);
    expect(p.outstanding).toBe(2);
    expect(p.fraction).toBe(0.5);
  });

  it("states the same fact in words, so the rule never stands alone", () => {
    expect(progressOf([stop({ status: "done" })]).label).toBe("1 of 1 stop done");
    expect(progressOf([]).label).toBe("0 of 0 stops done");
  });

  it("does not divide by zero on an empty route", () => {
    expect(progressOf([]).fraction).toBe(0);
  });
});

describe("route order", () => {
  it("sorts by stop_order, putting stops without one last", () => {
    const ordered = sortStops([
      stop({ id: "c", stopOrder: 3 }),
      stop({ id: "x", stopOrder: null, ref: "BCH-ZZZZ" }),
      stop({ id: "a", stopOrder: 1 }),
    ]);
    expect(ordered.map((s) => s.id)).toEqual(["a", "c", "x"]);
  });

  it("drives to the stop already in progress before any earlier one", () => {
    const next = nextStop([
      stop({ id: "a", stopOrder: 1, status: "assigned" }),
      stop({ id: "b", stopOrder: 2, status: "in_progress" }),
    ]);
    expect(next?.id).toBe("b");
  });

  it("otherwise drives to the first outstanding stop in order", () => {
    const next = nextStop([
      stop({ id: "a", stopOrder: 1, status: "done" }),
      stop({ id: "b", stopOrder: 2, status: "cancelled" }),
      stop({ id: "c", stopOrder: 3, status: "assigned" }),
    ]);
    expect(next?.id).toBe("c");
  });

  it("has nowhere to go once the route is finished", () => {
    expect(nextStop([stop({ status: "done" })])).toBeNull();
    expect(nextStop([])).toBeNull();
  });

  it("treats done and escalated as closed", () => {
    expect(isOutstanding(stop({ status: "done" }))).toBe(false);
    expect(isOutstanding(stop({ status: "cancelled" }))).toBe(false);
    expect(isOutstanding(stop({ status: "assigned" }))).toBe(true);
  });
});

describe("groupBacklog", () => {
  const today = "2026-09-03";

  it("splits on the plan date against today's calendar date", () => {
    const groups = groupBacklog(
      [
        stop({ id: "late", planDate: "2026-09-02" }),
        stop({ id: "now", planDate: "2026-09-03" }),
        stop({ id: "soon", planDate: "2026-09-04" }),
      ],
      today,
    );
    expect(groups.overdue.map((s) => s.id)).toEqual(["late"]);
    expect(groups.today.map((s) => s.id)).toEqual(["now"]);
    expect(groups.upcoming.map((s) => s.id)).toEqual(["soon"]);
  });

  it("leaves out everything already closed", () => {
    const groups = groupBacklog(
      [
        stop({ id: "done", status: "done", planDate: "2026-09-02" }),
        stop({ id: "gone", status: "cancelled", planDate: "2026-09-02" }),
      ],
      today,
    );
    expect(groups.overdue).toHaveLength(0);
  });

  it("orders each group by priority, highest first", () => {
    const groups = groupBacklog(
      [
        stop({ id: "low", pothole: pothole({ priority: 1 }) }),
        stop({ id: "high", pothole: pothole({ priority: 9 }) }),
      ],
      today,
    );
    expect(groups.today.map((s) => s.id)).toEqual(["high", "low"]);
  });
});

describe("savingFraction", () => {
  it("reports how much shorter the plan is than the priority-order baseline", () => {
    expect(savingFraction({ totalKm: 14.2, baselineKm: 21.9 })).toBeCloseTo(0.3516, 4);
  });

  it("claims nothing when there is nothing to compare, or nothing was saved", () => {
    expect(savingFraction({ totalKm: null, baselineKm: 21.9 })).toBeNull();
    expect(savingFraction({ totalKm: 14.2, baselineKm: null })).toBeNull();
    expect(savingFraction({ totalKm: 22, baselineKm: 21.9 })).toBeNull();
    expect(savingFraction({ totalKm: 14.2, baselineKm: 0 })).toBeNull();
  });
});
