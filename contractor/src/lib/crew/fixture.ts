// The fixture data source: three crews, four route plans, twenty-six stops, no
// backend.
//
// It exists because the solver (`/api/plan-route`) and dispatch
// (`/api/dispatch`) are still 501 stubs, so there is not one `route_plans` row
// in the database to build a crew screen against. Every screen and every action
// works here, and the Supabase source takes over the moment
// NEXT_PUBLIC_SUPABASE_URL is set.
//
// Two properties make it useful rather than decorative:
//   * Deterministic. Seeded PRNG, so the demo shows the same twenty-six holes
//     every time and a screenshot taken yesterday still matches.
//   * Persistent. Actions are written to localStorage as an overlay on the
//     generated base, so marking a stop done survives a refresh mid-demo — and
//     reaches other tabs through the `storage` event, which is the fixture's
//     stand-in for Realtime.

import type {
  BacklogGroups,
  CompletionPatch,
  Crew,
  CrewDetail,
  CrewStats,
  PotholeMapRow,
  RouteDetail,
  RouteSummary,
  Stop,
  WorkOrderStatus,
} from "@/lib/types";
import type { CrewDataSource } from "./source";
import { groupBacklog, refOf, sortStops, streetOf } from "./derive";
import { isoDate, minutesBetween } from "./format";

const SEED = 20260903;
const AUTHORITY = "00000000-0000-0000-0000-000000000001";
/** Crew A and its depot, matching the seed block in the init migration. */
const CREW_A = "00000000-0000-0000-0000-000000000006";
const DEPOT = { lat: 51.4994, lng: -0.1246 };

const STORAGE_KEY = "bachero.contractor.fixture.v1";

// ─── Deterministic randomness ────────────────────────────────────────────────

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** A v4-shaped id from the seeded stream, so references read like real ones. */
function uuid(rng: () => number): string {
  const hex = "0123456789abcdef";
  let out = "";
  for (let i = 0; i < 32; i++) out += hex[Math.floor(rng() * 16)];
  return [
    out.slice(0, 8),
    out.slice(8, 12),
    `4${out.slice(13, 16)}`,
    `a${out.slice(17, 20)}`,
    out.slice(20, 32),
  ].join("-");
}

// ─── The streets ─────────────────────────────────────────────────────────────
// Westminster, the same corridors the console's synthetic source uses, so the
// two demos describe one city.

const STREETS: readonly (readonly [string, number, number])[] = [
  ["Victoria Street", 51.4975, -0.1357],
  ["Horseferry Road", 51.4952, -0.131],
  ["Millbank", 51.4934, -0.1247],
  ["Marsham Street", 51.4949, -0.129],
  ["Great Peter Street", 51.4967, -0.1298],
  ["Vauxhall Bridge Road", 51.4924, -0.1385],
  ["Whitehall", 51.5045, -0.1263],
  ["Birdcage Walk", 51.5008, -0.133],
];

// ─── Shape of a generated plan ───────────────────────────────────────────────

interface PlanSpec {
  dayOffset: number;
  crewIndex: number;
  status: RouteSummary["status"];
  /** Status per stop, in route order. The story each route tells. */
  states: readonly WorkOrderStatus[];
  totalKm: number;
  totalMinutes: number;
  baselineKm: number;
}

const A = "assigned" as const;
const D = "done" as const;

const PLANS: readonly PlanSpec[] = [
  // Yesterday: worked, with one hole the crew could not close and one they ran
  // out of shift before reaching. That last one is the overdue case — a stop
  // that is on nobody's Today and still reads `scheduled` on the council's map.
  // Without it the Backlog screen's whole reason for existing is invisible.
  {
    dayOffset: -1,
    crewIndex: 0,
    status: "completed",
    states: [D, D, D, A, "cancelled", D, D],
    totalKm: 11.4,
    totalMinutes: 268,
    baselineKm: 17.2,
  },
  // Today, Crew A: the demo route. One done, one being worked, six to go.
  {
    dayOffset: 0,
    crewIndex: 0,
    status: "published",
    states: [D, "in_progress", A, A, A, A, A, A],
    totalKm: 14.2,
    totalMinutes: 312,
    baselineKm: 21.9,
  },
  // Today, Crew B: half done, so the board shows two different progresses.
  {
    dayOffset: 0,
    crewIndex: 1,
    status: "in_progress",
    states: [D, D, D, A, A, A],
    totalKm: 9.8,
    totalMinutes: 214,
    baselineKm: 13.1,
  },
  // Tomorrow: dispatched, untouched. Proves "upcoming" in the backlog.
  {
    dayOffset: 1,
    crewIndex: 2,
    status: "published",
    states: [A, A, A, A, A],
    totalKm: 7.6,
    totalMinutes: 178,
    baselineKm: 9.4,
  },
];

interface Base {
  crews: Crew[];
  routes: RouteSummary[];
  stops: Stop[];
}

/** Local midnight `dayOffset` days from now, as YYYY-MM-DD. */
function planDate(dayOffset: number): string {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + dayOffset);
  return isoDate(d);
}

/** A timestamp at `hour:minute` on the plan's date. */
function atTime(date: string, hour: number, minute: number): string {
  const d = new Date(`${date}T00:00:00`);
  d.setHours(hour, minute, 0, 0);
  return d.toISOString();
}

function buildBase(): Base {
  const rng = mulberry32(SEED);

  const crews: Crew[] = [
    {
      id: CREW_A,
      authority_id: AUTHORITY,
      name: "Crew A — Horseferry depot",
      shift_minutes: 480,
      repairs_per_shift: 12,
    },
    {
      id: uuid(rng),
      authority_id: AUTHORITY,
      name: "Crew B — Millbank depot",
      shift_minutes: 480,
      repairs_per_shift: 10,
    },
    {
      id: uuid(rng),
      authority_id: AUTHORITY,
      name: "Crew C — Vauxhall depot",
      shift_minutes: 420,
      repairs_per_shift: 8,
    },
  ];

  const routes: RouteSummary[] = [];
  const stops: Stop[] = [];

  for (const spec of PLANS) {
    const crew = crews[spec.crewIndex];
    const date = planDate(spec.dayOffset);
    const routeId = uuid(rng);

    spec.states.forEach((state, index) => {
      const [name, baseLat, baseLng] = STREETS[Math.floor(rng() * STREETS.length)];
      const lat = baseLat + (rng() - 0.5) * 0.003;
      const lng = baseLng + (rng() - 0.5) * 0.004;
      const severity = Math.round((0.18 + rng() * 0.8) * 100) / 100;
      const vehicles = 2 + Math.floor(rng() * 5);
      const passes = vehicles * (2 + Math.floor(rng() * 9));
      const ageMonths = Math.round(rng() * 13 * 10) / 10;
      const potholeId = uuid(rng);

      const firstDetected = new Date(
        Date.now() - ageMonths * 30 * 86_400_000,
      ).toISOString();

      const pothole: PotholeMapRow = {
        id: potholeId,
        authority_id: AUTHORITY,
        road_name: name,
        status: state === "done" ? "repaired" : "scheduled",
        severity,
        detection_count: passes,
        distinct_vehicles: vehicles,
        first_detected_at: firstDetected,
        last_detected_at: new Date(Date.now() - rng() * 86_400_000).toISOString(),
        repaired_at: null,
        updated_at: new Date().toISOString(),
        lng,
        lat,
        photo_url: null,
        priority:
          severity * Math.log(1 + vehicles) * (1 + ageMonths),
      };

      // Stops are worked in order from 08:00, roughly 26 minutes apart.
      const etaMinutes = 8 * 60 + index * 26;
      const startedAt =
        state === "done" || state === "in_progress" || state === "cancelled"
          ? atTime(date, Math.floor(etaMinutes / 60), etaMinutes % 60)
          : null;
      const completedAt =
        state === "done" || state === "cancelled"
          ? atTime(
              date,
              Math.floor((etaMinutes + 18) / 60),
              (etaMinutes + 18) % 60,
            )
          : null;

      stops.push({
        id: uuid(rng),
        potholeId,
        routePlanId: routeId,
        crewId: crew.id,
        crewName: crew.name,
        planDate: date,
        stopOrder: index + 1,
        status: state,
        eta: atTime(date, Math.floor(etaMinutes / 60), etaMinutes % 60),
        startedAt,
        completedAt,
        beforePhotoUrl: null,
        afterPhotoUrl: null,
        notes:
          state === "cancelled"
            ? "Carriageway failure about 2 m across, deeper than a patch. Needs a planing gang and a lane closure."
            : null,
        pothole,
        ref: refOf(potholeId),
        street: streetOf(pothole),
      });
    });

    routes.push({
      id: routeId,
      crew,
      planDate: date,
      status: spec.status,
      totalKm: spec.totalKm,
      totalMinutes: spec.totalMinutes,
      baselineKm: spec.baselineKm,
      stopCount: spec.states.length,
      doneCount: spec.states.filter((s) => s === "done").length,
      escalatedCount: spec.states.filter((s) => s === "cancelled").length,
    });
  }

  return { crews, routes, stops };
}

// ─── The overlay ─────────────────────────────────────────────────────────────
// Actions are stored separately from the generated base, so the base stays a
// pure function of the seed and a reset is one `localStorage.removeItem`.

interface Overlay {
  status?: WorkOrderStatus;
  startedAt?: string | null;
  completedAt?: string | null;
  notes?: string | null;
  afterPhotoUrl?: string | null;
}

type Overlays = Record<string, Overlay>;

function readOverlays(): Overlays {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    return raw == null ? {} : (JSON.parse(raw) as Overlays);
  } catch {
    // A private window, or a quota error. The demo still works, it just forgets.
    return {};
  }
}

function writeOverlays(overlays: Overlays): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(overlays));
  } catch {
    // Ignore: forgetting is better than failing mid-demo.
  }
}

function apply(stop: Stop, overlay: Overlay | undefined): Stop {
  if (overlay == null) return stop;
  const merged: Stop = {
    ...stop,
    status: overlay.status ?? stop.status,
    startedAt: overlay.startedAt !== undefined ? overlay.startedAt : stop.startedAt,
    completedAt:
      overlay.completedAt !== undefined ? overlay.completedAt : stop.completedAt,
    notes: overlay.notes !== undefined ? overlay.notes : stop.notes,
    afterPhotoUrl:
      overlay.afterPhotoUrl !== undefined
        ? overlay.afterPhotoUrl
        : stop.afterPhotoUrl,
  };
  // Keep the pothole's own status honest: the trigger would have moved it.
  merged.pothole = {
    ...merged.pothole,
    status:
      merged.status === "done"
        ? "repaired"
        : merged.status === "cancelled"
          ? "confirmed"
          : "scheduled",
  };
  return merged;
}

// ─── The source ──────────────────────────────────────────────────────────────

export function createFixtureSource(): CrewDataSource {
  const base = buildBase();
  const listeners = new Map<string, Set<(stop: Stop) => void>>();

  const stopsNow = (): Stop[] => {
    const overlays = readOverlays();
    return base.stops.map((s) => apply(s, overlays[s.id]));
  };

  const summarise = (route: RouteSummary, stops: readonly Stop[]): RouteSummary => {
    const mine = stops.filter((s) => s.routePlanId === route.id);
    return {
      ...route,
      stopCount: mine.length,
      doneCount: mine.filter((s) => s.status === "done").length,
      escalatedCount: mine.filter((s) => s.status === "cancelled").length,
    };
  };

  const mutate = (workOrderId: string, patch: Overlay): void => {
    const overlays = readOverlays();
    overlays[workOrderId] = { ...overlays[workOrderId], ...patch };
    writeOverlays(overlays);
    const stop = stopsNow().find((s) => s.id === workOrderId);
    if (stop?.routePlanId == null) return;
    for (const listener of listeners.get(stop.routePlanId) ?? []) listener(stop);
  };

  // Another tab acting on the same route is the fixture's stand-in for Realtime.
  if (typeof window !== "undefined") {
    window.addEventListener("storage", (event) => {
      if (event.key !== STORAGE_KEY) return;
      for (const stop of stopsNow()) {
        if (stop.routePlanId == null) continue;
        for (const listener of listeners.get(stop.routePlanId) ?? []) listener(stop);
      }
    });
  }

  const routeSummaries = (): RouteSummary[] => {
    const stops = stopsNow();
    return base.routes.map((r) => summarise(r, stops));
  };

  return {
    async today() {
      const today = isoDate(new Date());
      return routeSummaries().filter((r) => r.planDate === today);
    },

    async backlog(): Promise<BacklogGroups> {
      return groupBacklog(stopsNow(), isoDate(new Date()));
    },

    async history(days: number) {
      const cutoff = planDate(-Math.abs(days));
      return routeSummaries()
        .filter(
          (r) =>
            r.planDate >= cutoff &&
            r.planDate <= isoDate(new Date()) &&
            r.doneCount + r.escalatedCount > 0,
        )
        .sort((a, b) => b.planDate.localeCompare(a.planDate));
    },

    async crews() {
      return base.crews;
    },

    async crew(id: string): Promise<CrewDetail | null> {
      const crew = base.crews.find((c) => c.id === id);
      if (crew == null) return null;
      const stops = stopsNow();
      const routes = routeSummaries()
        .filter((r) => r.crew.id === id)
        .sort((a, b) => b.planDate.localeCompare(a.planDate));
      return { crew, routes, stats: statsFor(id, routes, stops) };
    },

    async route(id: string): Promise<RouteDetail | null> {
      const stops = stopsNow();
      const route = base.routes.find((r) => r.id === id);
      if (route == null) return null;
      return {
        ...summarise(route, stops),
        stops: sortStops(stops.filter((s) => s.routePlanId === id)),
      };
    },

    subscribe(routeId, onChange) {
      const set = listeners.get(routeId) ?? new Set();
      set.add(onChange);
      listeners.set(routeId, set);
      return () => {
        set.delete(onChange);
      };
    },

    async start(workOrderId) {
      mutate(workOrderId, {
        status: "in_progress",
        startedAt: new Date().toISOString(),
        completedAt: null,
      });
    },

    async complete(workOrderId, patch: CompletionPatch) {
      mutate(workOrderId, {
        status: "done",
        completedAt: new Date().toISOString(),
        ...(patch.afterPhotoUrl != null
          ? { afterPhotoUrl: patch.afterPhotoUrl }
          : {}),
        ...(patch.notes != null ? { notes: patch.notes } : {}),
      });
    },

    async escalate(workOrderId, notes) {
      mutate(workOrderId, {
        status: "cancelled",
        completedAt: new Date().toISOString(),
        notes,
      });
    },

    async note(workOrderId, notes) {
      mutate(workOrderId, { notes });
    },

    async uploadAfterPhoto(workOrderId, image) {
      // A data URL, so the photo survives a refresh like a real upload would.
      const url = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onerror = () => reject(new Error("Could not read the photo."));
        reader.onload = () => resolve(String(reader.result));
        reader.readAsDataURL(image);
      });
      mutate(workOrderId, { afterPhotoUrl: url });
      return url;
    },
  };
}

/** Depot for the route's crew — Crew A's is the seeded one, the rest sit near it. */
export const fixtureDepot = DEPOT;

function statsFor(
  crewId: string,
  routes: readonly RouteSummary[],
  stops: readonly Stop[],
): CrewStats {
  const mine = stops.filter((s) => s.crewId === crewId);
  const durations = mine
    .map((s) => minutesBetween(s.startedAt, s.completedAt))
    .filter((m): m is number => m != null && m > 0);
  return {
    routes: routes.length,
    stopsDone: mine.filter((s) => s.status === "done").length,
    stopsEscalated: mine.filter((s) => s.status === "cancelled").length,
    kilometres: routes.reduce((sum, r) => sum + (r.totalKm ?? 0), 0),
    averageMinutesPerStop:
      durations.length === 0
        ? null
        : durations.reduce((a, b) => a + b, 0) / durations.length,
  };
}
