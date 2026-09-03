import { describe, it, expect } from "vitest";
import { pinSize, severityFill, SEVERITY_WORD, STATUS_VISUAL, timeOf, dayOf, whenOf } from "./visual";
import { severityGrade } from "./derive";

describe("STATUS_VISUAL", () => {
  it("covers every status the schema can produce, and only those", () => {
    expect(Object.keys(STATUS_VISUAL).sort()).toEqual(
      ["confirmed", "false_positive", "repaired", "scheduled", "suspected"],
    );
  });

  it("spends the second hue only on proposed and committed work", () => {
    expect(STATUS_VISUAL.confirmed.fill).toBe("var(--action)");
    expect(STATUS_VISUAL.scheduled.fill).toBe("var(--committed)");
    // Suspected is hollow, repaired drains out, dismissed leaves the map.
    expect(STATUS_VISUAL.suspected.fill).toBe("var(--surface)");
    expect(STATUS_VISUAL.repaired.opacity).toBe(0.55);
    expect(STATUS_VISUAL.false_positive.opacity).toBe(0);
  });

  it("always spells the status out, so colour never carries meaning alone", () => {
    expect(Object.values(STATUS_VISUAL).map((v) => v.label)).toEqual(
      ["Suspected", "Confirmed", "Scheduled", "Repaired", "Dismissed"],
    );
  });
});

describe("pinSize", () => {
  it("steps 14px to 26px across the four grades", () => {
    expect(pinSize(1)).toBe(14);
    expect(pinSize(2)).toBe(18);
    expect(pinSize(3)).toBe(22);
    expect(pinSize(4)).toBe(26);
  });

  it("clamps, so a grade from outside the range cannot draw an absurd pin", () => {
    expect(pinSize(0)).toBe(14);
    expect(pinSize(9)).toBe(26);
  });

  it("takes the grade the map derives from our 0-1 severity", () => {
    expect(pinSize(severityGrade(0.1))).toBe(14);
    expect(pinSize(severityGrade(1))).toBe(26);
  });
});

describe("severityFill", () => {
  it("fills in ink, except grade 4, the one place oxblood appears", () => {
    expect(severityFill(3, true)).toBe("var(--ink)");
    expect(severityFill(4, true)).toBe("var(--severe)");
    expect(severityFill(4, false)).toBe("var(--rule-soft)");
  });
  it("words every grade", () => {
    expect(SEVERITY_WORD.slice(1)).toEqual(["Minor", "Moderate", "Serious", "Severe"]);
  });
});

describe("time formatting", () => {
  it("reads the stamp in its own offset, with no locale drift", () => {
    expect(timeOf("2026-09-02T11:52:07Z")).toBe("11:52");
    expect(dayOf("2026-09-02T11:52:07Z")).toBe("2 Sep");
    expect(whenOf("2026-09-02T11:52:07Z", "2026-09-02")).toBe("Today, 11:52");
    expect(whenOf("2026-09-01T07:10:00Z", "2026-09-02")).toBe("1 Sep, 07:10");
  });
});
