import type { Pothole } from "@/lib/data/types";

export function rectPolygon(a: [number, number], b: [number, number]): GeoJSON.Polygon {
  const [x1, x2] = [Math.min(a[0], b[0]), Math.max(a[0], b[0])];
  const [y1, y2] = [Math.min(a[1], b[1]), Math.max(a[1], b[1])];
  return { type: "Polygon", coordinates: [[[x1, y1], [x2, y1], [x2, y2], [x1, y2], [x1, y1]]] };
}

export function pointInPolygon([x, y]: [number, number], poly: GeoJSON.Polygon): boolean {
  const ring = poly.coordinates[0];
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i], [xj, yj] = ring[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

/** Open, unassigned potholes inside the area (the solver's candidates). */
export function countInArea(potholes: Pothole[], area: GeoJSON.Polygon | null): number {
  if (!area) return 0;
  return potholes.filter((p) => (p.status === "suspected" || p.status === "confirmed") && pointInPolygon([p.lng, p.lat], area)).length;
}
