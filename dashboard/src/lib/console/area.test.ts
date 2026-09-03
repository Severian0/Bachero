import { describe, it, expect } from "vitest";
import { pointInPolygon } from "./area";

// A closed rectangle ring, longitude first, as GeoJSON requires.
const RECT: GeoJSON.Polygon = {
  type: "Polygon",
  coordinates: [[[-0.13, 51.49], [-0.12, 51.49], [-0.12, 51.5], [-0.13, 51.5], [-0.13, 51.49]]],
};

describe("pointInPolygon", () => {
  it("accepts a point inside the ring and rejects one outside", () => {
    expect(pointInPolygon([-0.125, 51.495], RECT)).toBe(true);
    expect(pointInPolygon([-0.14, 51.495], RECT)).toBe(false);
    expect(pointInPolygon([-0.125, 51.52], RECT)).toBe(false);
  });

  it("handles a concave ring, where a bounding box would be wrong", () => {
    // An L shape: the notch in the top right is outside despite being within
    // the shape's overall extent.
    const L: GeoJSON.Polygon = {
      type: "Polygon",
      coordinates: [[[0, 0], [2, 0], [2, 1], [1, 1], [1, 2], [0, 2], [0, 0]]],
    };
    expect(pointInPolygon([0.5, 0.5], L)).toBe(true);
    expect(pointInPolygon([0.5, 1.5], L)).toBe(true);
    expect(pointInPolygon([1.5, 1.5], L)).toBe(false);
  });
});
