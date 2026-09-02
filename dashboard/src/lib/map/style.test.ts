import { describe, it, expect } from "vitest";
import { buildMapStyle } from "./style";

const t = { bg: "#f2f2f3", text: "#1d1f20", accent: "#5980a6", accent800: "#2c455d", neutral200: "#e7e7ea" };

describe("buildMapStyle", () => {
  const s = buildMapStyle(t);
  it("uses OpenFreeMap tiles and glyphs", () => {
    expect((s.sources.openmaptiles as { url: string }).url).toBe("https://tiles.openfreemap.org/planet");
    expect(s.glyphs).toContain("tiles.openfreemap.org/fonts");
  });
  it("has exactly the five layers in order and no buildings or landuse", () => {
    expect(s.layers.map((l) => l.id)).toEqual(["background", "water", "road-minor", "road-major", "road-label-major"]);
  });
  it("paints ground and roads from tokens with the spec opacities", () => {
    const bg = s.layers[0] as { paint: { "background-color": string } };
    expect(bg.paint["background-color"]).toBe("#f2f2f3");
    const minor = s.layers[2] as { paint: Record<string, unknown> };
    expect(minor.paint["line-color"]).toBe("#1d1f20");
    expect(minor.paint["line-opacity"]).toBe(0.18);
    const major = s.layers[3] as { paint: Record<string, unknown> };
    expect(major.paint["line-opacity"]).toBe(0.28);
    expect(major.paint["line-width"]).toBe(2);
  });
});
