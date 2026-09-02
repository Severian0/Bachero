import { describe, it, expect } from "vitest";
import { km, minutes, hhmm, coord, plural, pct, monthsSince, todayISO } from "./format";
import { potholeRef, toPothole } from "@/lib/data/types";
import type { PotholeMapRow } from "@/lib/types";

describe("format", () => {
  it("km and minutes carry units", () => {
    expect(km(14.234)).toBe("14.2 km");
    expect(minutes(312.4)).toBe("312 min");
  });
  it("hhmm renders local 24h time", () => {
    const d = new Date(2026, 8, 2, 6, 5).toISOString();
    expect(hhmm(d)).toBe("06:05");
  });
  it("coord is lat, lng to 4 decimals", () => {
    expect(coord(51.49941, -0.12456)).toBe("51.4994, -0.1246");
  });
  it("plural", () => {
    expect(plural(1, "vehicle")).toBe("1 vehicle");
    expect(plural(3, "vehicle")).toBe("3 vehicles");
    expect(plural(2, "pass", "passes")).toBe("2 passes");
  });
  it("pct rounds a fraction to whole percent", () => {
    expect(pct(0.3516)).toBe("35%");
  });
  it("monthsSince uses 30-day months to 1 decimal", () => {
    const now = new Date("2026-09-02T00:00:00Z");
    expect(monthsSince("2026-07-03T00:00:00Z", now)).toBe(2);
  });
  it("todayISO is the calendar day the records are stamped in", () => {
    expect(todayISO(new Date("2026-09-02T23:14:00Z"))).toBe("2026-09-02");
    expect(todayISO(new Date("2026-01-05T00:00:00Z"))).toBe("2026-01-05");
  });
});

describe("toPothole", () => {
  const row: PotholeMapRow = {
    id: "9f3a6b2c-0000-0000-0000-000000000000", authority_id: "a", road_name: null,
    status: "confirmed", severity: 0.6, detection_count: 4, distinct_vehicles: 2,
    first_detected_at: "2026-08-01T00:00:00Z", last_detected_at: "2026-09-01T00:00:00Z",
    repaired_at: null, updated_at: "2026-09-01T00:00:00Z", lng: -0.13, lat: 51.5,
    photo_url: null, priority: 1.2,
  };
  it("derives ref from the id and keeps street null", () => {
    const p = toPothole(row);
    expect(p.ref).toBe("BCH-9F3A");
    expect(p.street).toBeNull();
    expect(p.stop_order).toBeNull();
  });
  it("uses road_name as street and passes stop_order", () => {
    expect(toPothole({ ...row, road_name: "Millbank" }, 3)).toMatchObject({ street: "Millbank", stop_order: 3 });
  });
  it("potholeRef is stable", () => {
    expect(potholeRef("abcd1234-x")).toBe("BCH-ABCD");
  });
});
