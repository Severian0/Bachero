import { describe, it, expect } from "vitest";
import {
  priority, severityGrade, evidenceLine,
  matchesFilter, visibleRows, stats, isSelectable, FILTER_CYCLE,
  estimateMinutes, planCandidates,
} from "./derive";
import type { Pothole } from "@/lib/data/types";

const now = new Date("2026-09-02T12:00:00Z");
const base: Pothole = {
  id: "11111111-0000-0000-0000-000000000000", authority_id: "a", road_name: "Millbank", street: "Millbank",
  ref: "BCH-1111", stop_order: null, status: "confirmed", severity: 0.5, detection_count: 6,
  distinct_vehicles: 2, first_detected_at: "2026-08-03T12:00:00Z", last_detected_at: "2026-09-02T06:30:00Z",
  repaired_at: null, updated_at: "2026-09-02T06:30:00Z", lng: -0.1247, lat: 51.4962, photo_url: null, priority: 0,
};
const p = (o: Partial<Pothole>): Pothole => ({ ...base, ...o });

describe("priority", () => {
  it("is severity × ln(1+vehicles) × (1 + age months)", () => {
    // age 30 days = 1 month → factor 2; ln(3) = 1.0986; 0.5 × 1.0986 × 2 = 1.0986
    expect(priority(base, now)).toBeCloseTo(1.0986, 3);
    expect(priority(p({ distinct_vehicles: 1, first_detected_at: now.toISOString() }), now)).toBeCloseTo(0.5 * Math.log(2), 6);
    expect(priority(p({ severity: 0 }), now)).toBe(0);
  });
});

describe("severityGrade", () => {
  it("maps the 0-1 severity onto the 1-4 grade the record and the pin quote", () => {
    expect(severityGrade(0)).toBe(1);
    expect(severityGrade(0.25)).toBe(1);
    expect(severityGrade(0.26)).toBe(2);
    expect(severityGrade(0.75)).toBe(3);
    expect(severityGrade(1)).toBe(4);
  });
  it("clamps values outside the range rather than indexing off the end of a table", () => {
    expect(severityGrade(-1)).toBe(1);
    expect(severityGrade(1.4)).toBe(4);
  });
});

describe("copy", () => {
  it("evidence line states measurement then inference", () => {
    expect(evidenceLine(base)).toBe("2 vehicles · 6 passes · confirmed");
    expect(evidenceLine(p({ distinct_vehicles: 1, detection_count: 1, status: "suspected" }))).toBe("1 vehicle · 1 pass · suspected");
  });
});

describe("filters and stats", () => {
  const list = [
    p({ id: "a", status: "suspected", severity: 0.2 }),
    p({ id: "b", status: "confirmed", severity: 0.9 }),
    p({ id: "c", status: "scheduled" }),
    p({ id: "d", status: "repaired" }),
    p({ id: "e", status: "false_positive" }),
  ];
  it("open = suspected + confirmed; all excludes false_positive", () => {
    expect(list.filter((x) => matchesFilter(x, "open")).map((x) => x.id)).toEqual(["a", "b"]);
    expect(list.filter((x) => matchesFilter(x, "all")).map((x) => x.id)).toEqual(["a", "b", "c", "d"]);
    expect(list.filter((x) => matchesFilter(x, "scheduled")).map((x) => x.id)).toEqual(["c"]);
  });
  it("visibleRows sorts by priority desc", () => {
    expect(visibleRows(list, "open").map((x) => x.id)).toEqual(["b", "a"]);
  });
  it("stats count confirmed-open, suspected, scheduled", () => {
    expect(stats(list)).toEqual({ confirmedOpen: 1, suspected: 1, scheduled: 1 });
  });
  it("only open and scheduled items are selectable", () => {
    expect(list.map(isSelectable)).toEqual([true, true, true, false, false]);
  });
  it("filter cycle is the chip order", () => {
    expect(FILTER_CYCLE).toEqual(["all", "confirmed", "suspected", "scheduled"]);
  });
});

describe("estimateMinutes", () => {
  it("is the service time plus a flat travel allowance per stop", () => {
    expect(estimateMinutes(0, 20)).toBe(0);
    expect(estimateMinutes(1, 20)).toBe(27); // 20 + round(6.5)
    expect(estimateMinutes(4, 20)).toBe(106); // 80 + round(26)
    expect(estimateMinutes(3, 15)).toBe(65); // 45 + round(19.5) = 45 + 20
  });
});

describe("planCandidates", () => {
  const area: GeoJSON.Polygon = {
    type: "Polygon",
    coordinates: [[[-0.13, 51.49], [-0.12, 51.49], [-0.12, 51.50], [-0.13, 51.50], [-0.13, 51.49]]],
  };
  const list = [
    p({ id: "a", status: "suspected", lng: -0.1247, lat: 51.4962 }),
    p({ id: "b", status: "confirmed", lng: -0.1247, lat: 51.4962 }),
    p({ id: "c", status: "confirmed", lng: -0.30, lat: 51.60 }),
    p({ id: "d", status: "scheduled", lng: -0.1247, lat: 51.4962 }),
    p({ id: "e", status: "repaired", lng: -0.1247, lat: 51.4962 }),
  ];
  it("in manual mode the candidates are whatever the operator picked", () => {
    expect(planCandidates(list, { mode: "manual", area: null, selectedCount: 0 })).toBe(0);
    expect(planCandidates(list, { mode: "manual", area, selectedCount: 2 })).toBe(2);
  });
  it("in count and time modes it is the open queue, or the open queue inside the area", () => {
    expect(planCandidates(list, { mode: "count", area: null, selectedCount: 0 })).toBe(3);
    expect(planCandidates(list, { mode: "time", area: null, selectedCount: 9 })).toBe(3);
    expect(planCandidates(list, { mode: "count", area, selectedCount: 0 })).toBe(2);
  });
});
