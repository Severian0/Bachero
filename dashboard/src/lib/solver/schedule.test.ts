import { describe, it, expect } from "vitest";
import { shiftStartMs, zoneOffsetMs } from "./schedule";

describe("shiftStartMs", () => {
  it("is 07:00 UTC during British Summer Time", () => {
    // 2 September is BST (UTC+1), so an 08:00 local shift starts at 07:00Z.
    expect(new Date(shiftStartMs("2026-09-02")).toISOString()).toBe("2026-09-02T07:00:00.000Z");
  });

  it("is 08:00 UTC in winter, when London is on UTC", () => {
    expect(new Date(shiftStartMs("2026-01-15")).toISOString()).toBe("2026-01-15T08:00:00.000Z");
  });

  it("honours a different start hour", () => {
    expect(new Date(shiftStartMs("2026-01-15", 6)).toISOString()).toBe("2026-01-15T06:00:00.000Z");
  });

  it("treats UTC as its own zone", () => {
    expect(new Date(shiftStartMs("2026-09-02", 8, "UTC")).toISOString()).toBe("2026-09-02T08:00:00.000Z");
  });

  it("returns NaN for an unparseable date rather than silently picking one", () => {
    expect(Number.isNaN(shiftStartMs("not-a-date"))).toBe(true);
  });
});

describe("zoneOffsetMs", () => {
  it("reports one hour ahead for London in summer", () => {
    expect(zoneOffsetMs(Date.UTC(2026, 6, 1, 12), "Europe/London")).toBe(3_600_000);
  });

  it("reports no offset for London in winter", () => {
    expect(zoneOffsetMs(Date.UTC(2026, 0, 1, 12), "Europe/London")).toBe(0);
  });
});
