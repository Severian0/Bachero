import type { StyleSpecification } from "maplibre-gl";
import type { MapTokens } from "./tokens";

const MAJOR = ["motorway", "trunk", "primary"];
const NOT_ROAD = [...MAJOR, "rail", "transit", "path", "ferry", "aerialway", "track"];

/** DESIGN.md §5: a drawing, not a photograph. Ground, water, roads, major labels. Nothing else. */
export function buildMapStyle(t: MapTokens): StyleSpecification {
  return {
    version: 8,
    glyphs: "https://tiles.openfreemap.org/fonts/{fontstack}/{range}.pbf",
    sources: { openmaptiles: { type: "vector", url: "https://tiles.openfreemap.org/planet" } },
    layers: [
      { id: "background", type: "background", paint: { "background-color": t.bg } },
      { id: "water", type: "fill", source: "openmaptiles", "source-layer": "water", paint: { "fill-color": t.neutral200 } },
      {
        id: "road-minor", type: "line", source: "openmaptiles", "source-layer": "transportation",
        filter: ["all", ["==", ["geometry-type"], "LineString"], ["!", ["in", ["get", "class"], ["literal", NOT_ROAD]]]],
        paint: { "line-color": t.text, "line-opacity": 0.18, "line-width": 1 },
      },
      {
        id: "road-major", type: "line", source: "openmaptiles", "source-layer": "transportation",
        filter: ["all", ["==", ["geometry-type"], "LineString"], ["in", ["get", "class"], ["literal", MAJOR]]],
        paint: { "line-color": t.text, "line-opacity": 0.28, "line-width": 2 },
      },
      {
        id: "road-label-major", type: "symbol", source: "openmaptiles", "source-layer": "transportation_name", minzoom: 13,
        filter: ["in", ["get", "class"], ["literal", MAJOR]],
        layout: {
          "symbol-placement": "line", "text-field": ["get", "name"], "text-font": ["Noto Sans Regular"],
          "text-size": 10, "text-transform": "uppercase", "text-letter-spacing": 0.12,
        },
        paint: { "text-color": t.text, "text-opacity": 0.55, "text-halo-color": t.bg, "text-halo-width": 1 },
      },
    ],
  };
}
