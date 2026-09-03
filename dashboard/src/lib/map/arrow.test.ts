import { describe, it, expect } from "vitest";
import { buildArrowImage } from "./arrow";

const alphaAt = (data: Uint8ClampedArray, size: number, x: number, y: number) =>
  data[(y * size + x) * 4 + 3];

describe("buildArrowImage", () => {
  it("returns a size x size rgba bitmap", () => {
    const img = buildArrowImage("#1d70b8", 24);
    expect(img.width).toBe(24);
    expect(img.height).toBe(24);
    expect(img.data).toHaveLength(24 * 24 * 4);
  });

  it("paints the triangle in the given colour and leaves the corners transparent", () => {
    const img = buildArrowImage("#1d70b8", 24);
    // A pixel just right of the base, on the midline, is inside the triangle.
    const i = (12 * 24 + 6) * 4;
    expect([img.data[i], img.data[i + 1], img.data[i + 2], img.data[i + 3]]).toEqual([29, 112, 184, 255]);
    expect(alphaAt(img.data, 24, 0, 0)).toBe(0);
    expect(alphaAt(img.data, 24, 23, 0)).toBe(0);
    expect(alphaAt(img.data, 24, 0, 23)).toBe(0);
  });

  it("points right: opaque near the left base, transparent past the right apex margin", () => {
    const img = buildArrowImage("#00703c", 24);
    expect(alphaAt(img.data, 24, 6, 12)).toBe(255);
    expect(alphaAt(img.data, 24, 23, 12)).toBe(0);
  });

  it("rejects anything that is not a #rrggbb literal", () => {
    expect(() => buildArrowImage("var(--action)")).toThrow("#rrggbb");
    expect(() => buildArrowImage("#fff")).toThrow("#rrggbb");
  });
});
