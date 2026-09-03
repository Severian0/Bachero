import { describe, it, expect } from "vitest";
import { renderSteps } from "./instructions";
import type { OsrmStep } from "./osrm";

const step = (over: Partial<OsrmStep> & { maneuver: OsrmStep["maneuver"] }): OsrmStep => ({
  name: "", distance: 100, ...over,
});

describe("renderSteps", () => {
  it("renders turns with the road name", () => {
    const out = renderSteps([
      step({ name: "Millbank", maneuver: { type: "turn", modifier: "left", location: [-0.125, 51.494] } }),
      step({ name: "Horseferry Road", maneuver: { type: "end of road", modifier: "right", location: [-0.13, 51.495] } }),
    ]);
    expect(out.map((s) => s.instruction)).toEqual([
      "Turn left onto Millbank",
      "Turn right onto Horseferry Road",
    ]);
  });

  it("renders roundabouts with an ordinal exit", () => {
    const out = renderSteps([
      step({ name: "Vauxhall Bridge Road", maneuver: { type: "roundabout", exit: 2, location: [0, 0] } }),
      step({ maneuver: { type: "rotary", exit: 4, location: [0, 0] } }),
    ]);
    expect(out[0].instruction).toBe("At the roundabout take the second exit onto Vauxhall Bridge Road");
    expect(out[1].instruction).toBe("At the roundabout take the fourth exit");
  });

  it("renders depart, arrive, straight, slight turns and u-turns", () => {
    const instructions = renderSteps([
      step({ name: "Millbank", maneuver: { type: "depart", location: [0, 0] } }),
      step({ maneuver: { type: "arrive", location: [0, 0] } }),
      step({ name: "Whitehall", maneuver: { type: "continue", modifier: "straight", location: [0, 0] } }),
      step({ name: "Petty France", maneuver: { type: "turn", modifier: "slight right", location: [0, 0] } }),
      step({ name: "Millbank", maneuver: { type: "continue", modifier: "uturn", location: [0, 0] } }),
    ]).map((s) => s.instruction);
    expect(instructions).toEqual([
      "Head out on Millbank",
      "Arrive at the stop",
      "Continue straight on Whitehall",
      "Bear right onto Petty France",
      "Make a U-turn onto Millbank",
    ]);
  });

  it("copes with unknown types and nameless roads, and carries coordinates and distance", () => {
    const out = renderSteps([
      step({ distance: 240.6, maneuver: { type: "exotic future manoeuvre", location: [-0.13, 51.497] } }),
      step({ name: "Marsham Street", maneuver: { type: "new name", location: [0, 0] } }),
    ]);
    expect(out[0]).toEqual({ instruction: "Continue", lng: -0.13, lat: 51.497, distance_m: 241 });
    expect(out[1].instruction).toBe("Continue onto Marsham Street");
  });
});
