import { describe, it, expect } from "vitest";
import {
  priority, pinStyle, rowStyle, severitySegments, severityGrade, evidenceLine, inspectorLines,
  matchesFilter, visibleRows, stats, isSelectable, FILTER_CYCLE,
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

describe("pinStyle", () => {
  it("suspected is hollow, confirmed solid accent, scheduled accent-800 with stop number", () => {
    expect(pinStyle(p({ status: "suspected" }), { linked: false, selected: false })).toMatchObject({
      fill: "var(--color-bg)", stroke: "var(--ink-38)", opacity: 1, stopLabel: "", hidden: false });
    expect(pinStyle(base, { linked: false, selected: false })).toMatchObject({ fill: "var(--color-accent)", stroke: "var(--color-accent)" });
    expect(pinStyle(p({ status: "scheduled", stop_order: 3 }), { linked: false, selected: false })).toMatchObject({
      fill: "var(--color-accent-800)", stopLabel: "3" });
  });
  it("repaired fades, false_positive hides", () => {
    expect(pinStyle(p({ status: "repaired" }), { linked: false, selected: false })).toMatchObject({ opacity: 0.55, stroke: "var(--color-neutral-300)" });
    expect(pinStyle(p({ status: "false_positive" }), { linked: false, selected: false }).hidden).toBe(true);
  });
  it("size is 12 + severity×11, +5 when linked or selected; glow and z follow", () => {
    const rest = pinStyle(p({ severity: 1 }), { linked: false, selected: false });
    expect(rest.size).toBe(23);
    expect(rest.z).toBe(20);
    const sel = pinStyle(p({ severity: 0 }), { linked: false, selected: true });
    expect(sel.size).toBe(17);
    expect(sel.glow).toBe("0 0 0 4px var(--color-accent-200)");
    expect(sel.z).toBe(50);
    const linked = pinStyle(base, { linked: true, selected: true });
    expect(linked.glow).toBe("0 0 0 5px color-mix(in srgb, var(--color-accent) 24%, transparent)");
    expect(linked.z).toBe(60);
  });
});

describe("rowStyle", () => {
  it("marker by status, background by selection then link", () => {
    expect(rowStyle(p({ status: "suspected" }), { linked: false, selected: false })).toEqual({
      mark: "var(--color-neutral-400)", bg: "transparent", priColor: "var(--ink-72)" });
    expect(rowStyle(base, { linked: true, selected: false })).toMatchObject({ mark: "var(--color-accent)", bg: "var(--ink-5)", priColor: "var(--color-accent-800)" });
    expect(rowStyle(p({ status: "scheduled" }), { linked: true, selected: true })).toMatchObject({ mark: "var(--color-accent-800)", bg: "var(--color-accent-100)" });
    expect(rowStyle(p({ status: "repaired" }), { linked: false, selected: false }).mark).toBe("var(--color-neutral-300)");
  });
});

describe("severitySegments", () => {
  it("fills ceil(severity×4), minimum 1", () => {
    expect(severitySegments(0)).toEqual([true, false, false, false]);
    expect(severitySegments(0.24)).toEqual([true, false, false, false]);
    expect(severitySegments(0.25)).toEqual([true, false, false, false]);
    expect(severitySegments(0.26)).toEqual([true, true, false, false]);
    expect(severitySegments(1)).toEqual([true, true, true, true]);
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
  it("inspector lines", () => {
    const l = inspectorLines(base, now);
    expect(l.title).toBe("Millbank BCH-1111");
    expect(l.status).toBe("Confirmed");
    expect(l.line1).toMatch(/^2 distinct vehicles · 6 passes · last \d\d:\d\d$/);
    expect(l.line2).toBe("Severity 0.50 · age 1 months · priority 1.1");
  });
  it("falls back to the coordinate when there is no street", () => {
    expect(inspectorLines(p({ street: null }), now).title).toBe("51.4962, -0.1247 BCH-1111");
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
