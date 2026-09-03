import { describe, expect, it } from "vitest";
import { directionsLegs, directionsTo } from "@/lib/crew/gmaps";

const points = Array.from({ length: 12 }, (_, i) => ({
  lat: 51.5 + i / 1000,
  lng: -0.12 - i / 1000,
}));

describe("directionsTo", () => {
  it("puts latitude first — the one place in the project that does", () => {
    expect(directionsTo({ lat: 51.5072, lng: -0.1275 })).toContain(
      "destination=51.5072,-0.1275",
    );
  });
});

describe("directionsLegs", () => {
  it("returns nothing for no stops", () => {
    expect(directionsLegs([])).toEqual([]);
  });

  it("chunks so no link exceeds the platform's waypoint limit", () => {
    const legs = directionsLegs(points, { maxWaypoints: 8 });
    expect(legs.length).toBeGreaterThan(1);
    for (const leg of legs) {
      const waypoints = new URL(leg.url).searchParams.get("waypoints");
      const count = waypoints == null ? 0 : waypoints.split("|").length;
      expect(count).toBeLessThanOrEqual(8);
    }
  });

  it("covers every stop, with legs meeting end to end", () => {
    const legs = directionsLegs(points, { maxWaypoints: 3 });
    expect(legs[0].from).toBe(0);
    expect(legs[legs.length - 1].to).toBe(points.length - 1);
    for (let i = 1; i < legs.length; i++) {
      expect(legs[i].from).toBe(legs[i - 1].to);
    }
  });

  it("starts at the depot when one is known", () => {
    const depot = { lat: 51.4994, lng: -0.1246 };
    const [first] = directionsLegs(points.slice(0, 3), { origin: depot });
    expect(first.url).toContain("origin=51.4994,-0.1246");
  });

  it("handles a single stop as a plain destination", () => {
    const legs = directionsLegs([points[0]]);
    expect(legs).toHaveLength(1);
    expect(legs[0].url).toContain("destination=51.5,-0.12");
    expect(legs[0].url).not.toContain("waypoints=");
  });
});
