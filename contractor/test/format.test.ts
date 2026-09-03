import { describe, expect, it } from "vitest";
import {
  coordinate,
  dateLabel,
  dayOffset,
  hhmm,
  isoDate,
  kilometres,
  minutes,
  minutesBetween,
  percent,
  plural,
  severity,
} from "@/lib/crew/format";

describe("units", () => {
  it("carries the unit, and one decimal, on a distance", () => {
    expect(kilometres(14.24)).toBe("14.2 km");
    expect(kilometres(null)).toBe("— km");
  });

  it("rounds minutes to whole numbers", () => {
    expect(minutes(311.6)).toBe("312 min");
    expect(minutes(undefined)).toBe("— min");
  });

  it("prints severity to two decimals, always", () => {
    expect(severity(0.6)).toBe("0.60");
  });

  it("rounds a percentage", () => {
    expect(percent(0.3517)).toBe("35%");
  });
});

describe("plural", () => {
  it("never says 1 vehicles", () => {
    expect(plural(1, "vehicle")).toBe("1 vehicle");
    expect(plural(3, "vehicle")).toBe("3 vehicles");
  });

  it("takes an irregular plural", () => {
    expect(plural(11, "pass", "passes")).toBe("11 passes");
    expect(plural(1, "pass", "passes")).toBe("1 pass");
  });
});

describe("coordinate", () => {
  it("is latitude first, because a person reads it", () => {
    // Longitude first everywhere else in this project; this is the exception.
    expect(coordinate(51.5072, -0.1275)).toBe("51.50720, -0.12750");
  });
});

describe("dates", () => {
  it("uses the local calendar date, not UTC", () => {
    // 00:30 local on the 3rd is the 3rd, even where UTC still says the 2nd.
    const d = new Date(2026, 8, 3, 0, 30);
    expect(isoDate(d)).toBe("2026-09-03");
  });

  it("counts whole days between calendar dates", () => {
    expect(dayOffset("2026-09-03", "2026-09-04")).toBe(1);
    expect(dayOffset("2026-09-03", "2026-09-02")).toBe(-1);
    expect(dayOffset("2026-09-03", "2026-09-03")).toBe(0);
  });

  it("counts across a month boundary", () => {
    expect(dayOffset("2026-08-31", "2026-09-01")).toBe(1);
  });

  it("names the days a crew thinks in, and spells out the rest", () => {
    const today = "2026-09-03";
    expect(dateLabel("2026-09-03", today)).toBe("Today");
    expect(dateLabel("2026-09-04", today)).toBe("Tomorrow");
    expect(dateLabel("2026-09-02", today)).toBe("Yesterday");
    expect(dateLabel("2026-09-09", today)).toContain("September");
  });

  it("formats a time as HH:MM", () => {
    expect(hhmm(new Date(2026, 8, 3, 8, 5))).toBe("08:05");
  });

  it("measures a stop's duration, and refuses to guess without both ends", () => {
    const started = new Date(2026, 8, 3, 8, 0).toISOString();
    const done = new Date(2026, 8, 3, 8, 18).toISOString();
    expect(minutesBetween(started, done)).toBe(18);
    expect(minutesBetween(started, null)).toBeNull();
    expect(minutesBetween(null, done)).toBeNull();
  });
});
