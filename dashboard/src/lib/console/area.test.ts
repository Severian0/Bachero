import { describe, it, expect } from "vitest";
import { rectPolygon, countInArea, pointInPolygon } from "./area";
import type { Pothole } from "@/lib/data/types";

describe("area", () => {
  it("rectPolygon closes the ring regardless of drag direction", () => {
    const poly = rectPolygon([-0.13, 51.5], [-0.12, 51.49]);
    expect(poly.coordinates[0]).toHaveLength(5);
    expect(poly.coordinates[0][0]).toEqual(poly.coordinates[0][4]);
    expect(poly.coordinates[0][0]).toEqual([-0.13, 51.49]);
    expect(poly.coordinates[0][2]).toEqual([-0.12, 51.5]);
  });
  it("counts open potholes inside", () => {
    const mk = (lng: number, lat: number, status: Pothole["status"] = "confirmed") => ({ lng, lat, status } as Pothole);
    const poly = rectPolygon([-0.13, 51.5], [-0.12, 51.49]);
    expect(pointInPolygon([-0.125, 51.495], poly)).toBe(true);
    expect(pointInPolygon([-0.14, 51.495], poly)).toBe(false);
    expect(countInArea([mk(-0.125, 51.495), mk(-0.14, 51.495), mk(-0.125, 51.495, "repaired")], poly)).toBe(1);
    expect(countInArea([mk(-0.125, 51.495)], null)).toBe(0);
  });
});
