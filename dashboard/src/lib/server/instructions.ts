import type { OsrmStep } from "./osrm";
import type { RouteStep } from "@/lib/types";

const ORDINAL = ["first", "second", "third", "fourth", "fifth", "sixth", "seventh", "eighth"];

const ordinal = (n: number): string => ORDINAL[n - 1] ?? `number ${n}`;

/** " onto X", or nothing when OSRM has no road name - never a dangling "onto". */
const onto = (name: string): string => (name === "" ? "" : ` onto ${name}`);

function instructionOf(step: OsrmStep): string {
  const { type, modifier, exit } = step.maneuver;
  const name = step.name;

  if (type === "depart") return name === "" ? "Head out" : `Head out on ${name}`;
  if (type === "arrive") return "Arrive at the stop";
  if (type === "roundabout" || type === "rotary") {
    const base = exit === undefined
      ? "At the roundabout take the exit"
      : `At the roundabout take the ${ordinal(exit)} exit`;
    return base + onto(name);
  }
  if (modifier === "uturn") return `Make a U-turn${onto(name)}`;
  if (modifier === "straight") return name === "" ? "Continue straight" : `Continue straight on ${name}`;
  if (modifier === "slight left" || modifier === "slight right") {
    return `Bear ${modifier.slice("slight ".length)}${onto(name)}`;
  }
  if (modifier === "left" || modifier === "right") {
    if (type === "merge") return `Merge ${modifier}${onto(name)}`;
    return `Turn ${modifier}${onto(name)}`;
  }
  // "new name", "continue", and anything OSRM invents later.
  return name === "" ? "Continue" : `Continue onto ${name}`;
}

/**
 * OSRM manoeuvres to the plain-English steps stored on the plan (spec section 9).
 * One sentence per manoeuvre; coordinates ride along so the playback can snap
 * each step to its position on the path.
 */
export function renderSteps(steps: OsrmStep[]): RouteStep[] {
  return steps.map((s) => ({
    instruction: instructionOf(s),
    lng: s.maneuver.location[0],
    lat: s.maneuver.location[1],
    distance_m: Math.round(s.distance),
  }));
}
