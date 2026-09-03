import { describe, it, expect } from "vitest";
import { buildMapStyle } from "./style";
import { MAP_FALLBACK, readMapTokens, readToken } from "./tokens";

const t = readMapTokens();

describe("map tokens", () => {
  it("names the GOV.UK tokens the console actually defines", () => {
    expect(MAP_FALLBACK).toEqual({
      canvas: "#f3f2f1",
      ink: "#0b0c0c",
      action: "#1d70b8",
      committed: "#00703c",
      ruleSoft: "#e4e2e0",
    });
  });

  it("falls back to those hexes off the browser, where no custom property can be read", () => {
    expect(readToken("--action", MAP_FALLBACK.action)).toBe("#1d70b8");
    expect(t).toEqual({
      ground: "#f3f2f1",
      ink: "#0b0c0c",
      action: "#1d70b8",
      committed: "#00703c",
      water: "#e4e2e0",
    });
  });
});

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
    expect(bg.paint["background-color"]).toBe("#f3f2f1");
    const water = s.layers[1] as { paint: Record<string, unknown> };
    expect(water.paint["fill-color"]).toBe("#e4e2e0");
    const minor = s.layers[2] as { paint: Record<string, unknown> };
    expect(minor.paint["line-color"]).toBe("#0b0c0c");
    expect(minor.paint["line-opacity"]).toBe(0.18);
    const major = s.layers[3] as { paint: Record<string, unknown> };
    expect(major.paint["line-opacity"]).toBe(0.28);
    expect(major.paint["line-width"]).toBe(2);
  });
});
