# Route Planning UX Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the route-planning experience the spec describes: a real driver view at `/route/:id` with a drive playback and a follow mode, direction arrows on both screens, a one-click "Plan route" button, a Preview drive animation on the console as well as the crew page, and depot-or-pothole route anchors with open (non-loop) routes.

**Architecture:** The console (one Zustand store, one map, one modal sheet) POSTs `/api/plan-route`; the pure solver in `src/lib/solver/heuristic.ts` orders stops over an OSRM travel-time matrix; `src/lib/server/planRoute.ts` persists the plan to Supabase (`route_plans` + `work_orders`). The crew page is a login-free server-rendered page that reads the `route_plans_map` view and PATCHes `work_orders`. Anchors (where a route starts and ends) are resolved server-side from pothole ids; turn instructions come from OSRM `steps=true` and ride in `route_plans.objective` (jsonb) and in the plan response, so neither screen re-derives them.

**Tech Stack:** Next.js 16.3.4 (App Router, `src/`), React 19.2.8, TypeScript 5, maplibre-gl ^6.6.0 through react-map-gl ^8.1.2, zustand ^5.0.15, @supabase/supabase-js ^2.112.4, Tailwind 4 (design tokens live in `globals.css`), vitest ^4.1.11.

**Spec:** docs/superpowers/specs/2026-09-03-route-planning-ux-design.md

## Global Constraints

- Branch: `pathing-port`, which sits on `origin/console-merged` (open PR #2 into `main`). If PR #2 merges mid-build, rebase `pathing-port` onto `main` before continuing.
- Run every command from `dashboard/` unless a step says otherwise. Use `npm run dev`, never `npx next dev`: the `predev` script copies the MapLibre web worker into `public/maplibre/`, and the basemap does not initialise without it.
- Tokens only: never hard-code a hex, font, size, radius or shadow in a component. Only `src/app/globals.css` and `src/lib/map/tokens.ts` may name a literal colour. Spacing is the `--s1`..`--s7` scale (4 / 8 / 12 / 16 / 24 / 32 / 48 px).
- Two colour lanes of meaning and only two: `--action` (blue) is work proposed, `--committed` (green) is work committed to a crew. No red/amber/green status ramp. Colour never carries information without a text label.
- Copy is civil-service plain English: units on numbers, verbs with objects on buttons ("Plan route", "Dispatch to crew"), no exclamation marks, every failure is one plain sentence.
- Longitude first everywhere: EWKT is `SRID=4326;POINT(lng lat)`, GeoJSON is `[lng, lat]`, OSRM URLs are `lng,lat`. Google Maps deep links are the one `lat,lng` exception.
- Never read geography columns from the client. Read the `*_map` views (`lng` / `lat` / `path_geojson`). The one server-side exception is `crews.depot`, parsed with `parsePointWkb` from `src/lib/server/wkb.ts`.
- Next.js 16: `params` is a Promise in pages and route handlers (`await params`); API endpoints are `route.ts` files exporting `POST` / `GET`.
- **This design ships no database migration.** Nothing under `supabase/migrations/` may be touched: migrations auto-deploy to the live Supabase project on merge to `main`.
- OSRM is the only external routing dependency (`OSRM_BASE_URL`, default `https://router.project-osrm.org`). Nothing calls Google for a matrix or for turn instructions.
- Tests are vitest (`npx vitest run`), colocated as `*.test.ts` beside pure logic in `src/lib/`. Components get no unit tests; visual work is verified by the explicit manual steps in its task.
- TDD per task: write the failing test, watch it fail, implement, watch it pass, then `npm run lint` and `npx tsc --noEmit`, then commit. Commit messages are plain imperative sentences with no attribution of any kind and no co-author trailers.

---

## File structure

Every file this plan creates or modifies, and what each is for. Pure logic lives in `src/lib/` with a colocated `.test.ts`; components render and hold no business logic. All paths are under `dashboard/` unless they start with `docs/`.

**Created**

| File | Responsibility |
|---|---|
| `src/lib/crew/plan.ts` (+ `plan.test.ts`) | Pure mapper: nested `route_plans_map` row to a plain `CrewPlan` (sorted stops, anchors, steps, with fallbacks for plans saved before anchors existed) |
| `src/lib/crew/along.ts` (+ `along.test.ts`) | Pure along-route maths: cumulative distance, point-at-distance, step-at-distance |
| `src/lib/crew/playback.ts` (+ `playback.test.ts`) | Pure playback timing: compressed duration and minutes-left arithmetic |
| `src/lib/crew/geo.ts` (+ `geo.test.ts`) | Pure follow-mode geometry: bearing between fixes, distance to the route |
| `src/lib/map/arrow.ts` (+ `arrow.test.ts`) | Pure arrow bitmap builder for the MapLibre symbol layer (no glyph font involved) |
| `src/lib/console/nearest.ts` (+ `nearest.test.ts`) | Pure nearest-open-pothole helper for the one-click button |
| `src/lib/server/instructions.ts` (+ `instructions.test.ts`) | Pure renderer: OSRM manoeuvres to plain-English `RouteStep`s |
| `src/app/route/[id]/page.tsx` | Rewritten from stub: server component, fetch + not-found state |
| `src/components/crew/CrewRoute.tsx` | Client shell for the crew page: state, layout, playback and follow wiring |
| `src/components/crew/DriveMap.tsx` | Crew map: route line, arrows, numbered stops, anchor markers, position dot |
| `src/components/crew/StopCard.tsx` | Current stop: photo, Arrived / Done, after-photo upload, GMaps link |
| `src/components/crew/StopList.tsx` | All stops in driving order, done ones struck through |
| `src/components/crew/usePlayback.ts` | The animation clock (requestAnimationFrame); all maths delegated to `along.ts` / `playback.ts` |
| `src/components/console/map/PreviewDriveLayer.tsx` | Console mount of the same playback: marker, countdown, instruction banner |

**Modified**

| File | Change |
|---|---|
| `src/lib/types.ts` | Adds `RouteStep`, `ResolvedAnchor`; extends `PlanRouteRequest` (anchor ids) and `PlanRouteResponse` (`start`, `end`, `steps`) |
| `src/lib/solver/heuristic.ts` (+ test) | `endIndex` through `Constraints`, `tourKm`, `tourMin`, `marginalMin`, `twoOpt`, `solve` (open routes) |
| `src/lib/server/osrm.ts` (+ test) | `route()` adds `steps=true` and returns `{ geometry, steps }` |
| `src/lib/server/planRoute.ts` (+ test) | Anchor resolution, forced pothole stops, open-route matrix layout, forced-stop ETAs, steps and anchors into `objective` and the response |
| `src/lib/server/dispatch.ts` (+ test) | Google Maps legs read the resolved anchors from `objective`, depot fallback for old plans |
| `src/lib/console/store.ts` (+ test) | Area/drawing state removed; `planNearest()`, `previewDrive`, anchor dials (`AnchorChoice`), dial-to-mode mapping |
| `src/lib/console/area.ts` (+ test) | `rectPolygon` and `countInArea` removed (orphaned by the area-tool removal); `pointInPolygon` stays (server + synthetic still use it) |
| `src/lib/console/derive.ts` (+ test) | `planCandidates` loses its `area` parameter |
| `src/lib/data/synthetic.ts` | Synthetic plan response gains `steps: []` and depot `start` / `end` so the response type stays satisfied offline |
| `src/components/DispatchSheet.tsx` | Area row removed; four dials (Start, End, Selection, Budget); Preview drive button; first-leg distance line |
| `src/components/console/map/RouteLayer.tsx` | Direction arrows; start / end markers from `plan.start` / `plan.end` (replaces the synthetic `DEPOT` constant, a live bug in Supabase mode); fit-to-route |
| `src/components/console/map/MapLayers.tsx` | `AreaLayer` unmounted, `PreviewDriveLayer` mounted, `draft` prop gone |
| `src/components/console/map/ConsoleMap.tsx` | Drag-drawing props (`dragPan`, `cursor`, `mouseHandlers`) removed |
| `src/components/PotholeMap.tsx` | `useAreaDrag` removed; "Plan route" button added beside the map key |
| `src/components/Console.tsx` | `drawing` keyboard gate removed |

**Deleted**

| File | Why |
|---|---|
| `src/components/console/map/useAreaDrag.ts` | The shift-drag area tool is removed by decision (spec §2) |
| `src/components/console/map/AreaLayer.tsx` | Same |

---

## Tasks

Task order is the spec's build order (§12): demo-visible work first, the cut line after Task 14, and open routes plus pothole anchors last so running out of time costs nothing visible on stage. Tasks 1 to 4 are spec §7, Task 5 is §8, Tasks 6 to 7 are §6 (button), Tasks 8 to 13 are §9 plus the §5 `steps` contract, Task 14 is §7 (follow mode), Tasks 15 to 21 are §4, §5 and §6 (dials).

### Task 1: Crew plan mapper (pure)

The crew page needs the nested `route_plans_map` row flattened into plain data: stops in driving order, the route path, the start and end anchors, and the turn steps. Plans saved before this design stores anchors and steps must still work, so the mapper falls back to the path's endpoints (today every saved path begins and ends at the depot) and to an empty step list.

**Files:**
- Modify: `dashboard/src/lib/types.ts:91` (add `RouteStep` and `ResolvedAnchor` above the plan-route contract section)
- Create: `dashboard/src/lib/crew/plan.ts`
- Test: `dashboard/src/lib/crew/plan.test.ts`

**Interfaces:**
- Consumes: `RoutePlanMapRow`, `WorkOrderStatus` from `@/lib/types` (already exist).
- Produces (later tasks rely on these exact names):
  - In `@/lib/types`: `interface RouteStep { instruction: string; lng: number; lat: number; distance_m: number }` and `interface ResolvedAnchor { lng: number; lat: number; label: string }`.
  - In `@/lib/crew/plan`: `interface CrewStop`, `interface CrewPlan`, `function crewPlanFromRow(row: RoutePlanMapRow): CrewPlan | null`.

- [ ] **Step 1: Write the failing test**

Create `dashboard/src/lib/crew/plan.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { crewPlanFromRow } from "./plan";
import type { RoutePlanMapRow, WorkOrder } from "@/lib/types";

const pothole = (id: string, lng: number, lat: number, road: string | null) => ({
  id, authority_id: "x", road_name: road, status: "scheduled" as const, severity: 0.5,
  detection_count: 2, distinct_vehicles: 2, first_detected_at: "2026-09-01T00:00:00Z",
  last_detected_at: "2026-09-01T00:00:00Z", repaired_at: null, updated_at: "2026-09-01T00:00:00Z",
  lng, lat, photo_url: null, priority: 1,
});

const order = (id: string, stop: number, potholeId: string, lng: number, lat: number, road: string | null): WorkOrder => ({
  id, pothole_id: potholeId, crew_id: "c1", route_plan_id: "r1", stop_order: stop,
  status: "assigned", eta: "2026-09-04T08:20:00.000Z", started_at: null, completed_at: null,
  before_photo_url: null, after_photo_url: null, notes: null,
  pothole: pothole(potholeId, lng, lat, road),
});

function row(over: Partial<RoutePlanMapRow> = {}): RoutePlanMapRow {
  return {
    id: "r1", crew_id: "c1", plan_date: "2026-09-04", status: "published",
    total_km: 6, total_minutes: 70, baseline_km: 13, objective: null,
    path_geojson: { type: "LineString", coordinates: [[-0.1246, 51.4994], [-0.133, 51.4984], [-0.1246, 51.4994]] },
    crew: { id: "c1", authority_id: "x", name: "Crew A", shift_minutes: 480, repairs_per_shift: 12 },
    work_orders: [
      order("w2", 2, "p2", -0.129, 51.496, "Marsham Street"),
      order("w1", 1, "p1", -0.133, 51.4984, "Victoria Street"),
    ],
    ...over,
  };
}

describe("crewPlanFromRow", () => {
  it("flattens the row and sorts stops into driving order", () => {
    const plan = crewPlanFromRow(row());
    expect(plan).not.toBeNull();
    expect(plan?.crew_name).toBe("Crew A");
    expect(plan?.stops.map((s) => s.work_order_id)).toEqual(["w1", "w2"]);
    expect(plan?.stops[0]).toMatchObject({
      pothole_id: "p1", stop_order: 1, road_name: "Victoria Street", lng: -0.133, lat: 51.4984,
    });
    expect(plan?.path).toHaveLength(3);
  });

  it("falls back to the path endpoints as depot anchors and an empty step list", () => {
    const plan = crewPlanFromRow(row({ objective: null }));
    expect(plan?.start).toEqual({ lng: -0.1246, lat: 51.4994, label: "Depot" });
    expect(plan?.end).toEqual({ lng: -0.1246, lat: 51.4994, label: "Depot" });
    expect(plan?.steps).toEqual([]);
  });

  it("reads anchors and steps from objective when they are stored", () => {
    const plan = crewPlanFromRow(row({
      objective: {
        anchors: {
          start: { lng: -0.133, lat: 51.4984, label: "BCH-1111 - Victoria Street" },
          end: { lng: -0.1246, lat: 51.4994, label: "Depot" },
        },
        steps: [{ instruction: "Turn left onto Millbank", lng: -0.13, lat: 51.497, distance_m: 240 }],
      },
    }));
    expect(plan?.start.label).toBe("BCH-1111 - Victoria Street");
    expect(plan?.steps).toEqual([{ instruction: "Turn left onto Millbank", lng: -0.13, lat: 51.497, distance_m: 240 }]);
  });

  it("ignores cancelled work orders and returns null when nothing remains", () => {
    const cancelled = { ...order("w1", 1, "p1", -0.133, 51.4984, "Victoria Street"), status: "cancelled" as const };
    expect(crewPlanFromRow(row({ work_orders: [cancelled] }))).toBeNull();
    expect(crewPlanFromRow(row({ work_orders: [] }))).toBeNull();
    expect(crewPlanFromRow(row({ path_geojson: null }))).toBeNull();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/lib/crew/plan.test.ts`

Expected: FAIL with `Failed to resolve import "./plan"` (the module does not exist yet).

- [ ] **Step 3: Write the minimal implementation**

Add to `dashboard/src/lib/types.ts`, directly above the `/api/plan-route contract` section comment (line 92):

```ts
/** One turn instruction along a planned path (spec §5). */
export interface RouteStep {
  instruction: string; // "Turn left onto Millbank"
  lng: number;
  lat: number;
  distance_m: number;
}

/** A route anchor after the server resolved it to a coordinate (spec §5). */
export interface ResolvedAnchor {
  lng: number;
  lat: number;
  label: string; // "Depot", or the pothole's "ref - street"
}
```

Create `dashboard/src/lib/crew/plan.ts`:

```ts
import type { ResolvedAnchor, RoutePlanMapRow, RouteStep, WorkOrderStatus } from "@/lib/types";

/** One stop as the crew page shows it: the work order plus its pothole, flattened. */
export interface CrewStop {
  work_order_id: string;
  pothole_id: string;
  stop_order: number;
  status: WorkOrderStatus;
  eta: string | null;
  lng: number;
  lat: number;
  road_name: string | null;
  severity: number;
  photo_url: string | null;
  after_photo_url: string | null;
}

/** Everything the crew page renders, as plain data. No geography, no embeds. */
export interface CrewPlan {
  id: string;
  crew_name: string;
  plan_date: string;
  total_km: number | null;
  total_minutes: number | null;
  path: [number, number][];
  stops: CrewStop[];
  start: ResolvedAnchor;
  end: ResolvedAnchor;
  steps: RouteStep[];
}

function isAnchor(value: unknown): value is ResolvedAnchor {
  if (typeof value !== "object" || value === null) return false;
  const a = value as Record<string, unknown>;
  return typeof a.lng === "number" && typeof a.lat === "number" && typeof a.label === "string";
}

function isStep(value: unknown): value is RouteStep {
  if (typeof value !== "object" || value === null) return false;
  const s = value as Record<string, unknown>;
  return (
    typeof s.instruction === "string" && typeof s.lng === "number" &&
    typeof s.lat === "number" && typeof s.distance_m === "number"
  );
}

/**
 * The nested route_plans_map row, flattened for rendering. Returns null when
 * there is nothing drivable (no stops, or no path), which the page shows as
 * its not-found state.
 */
export function crewPlanFromRow(row: RoutePlanMapRow): CrewPlan | null {
  const path = row.path_geojson?.coordinates ?? [];
  const stops: CrewStop[] = [];
  for (const w of row.work_orders ?? []) {
    if (w.status === "cancelled" || w.stop_order === null || !w.pothole) continue;
    stops.push({
      work_order_id: w.id,
      pothole_id: w.pothole_id,
      stop_order: w.stop_order,
      status: w.status,
      eta: w.eta,
      lng: w.pothole.lng,
      lat: w.pothole.lat,
      road_name: w.pothole.road_name,
      severity: w.pothole.severity,
      photo_url: w.pothole.photo_url,
      after_photo_url: w.after_photo_url,
    });
  }
  stops.sort((a, b) => a.stop_order - b.stop_order);
  if (stops.length === 0 || path.length === 0) return null;

  const objective = (row.objective ?? {}) as Record<string, unknown>;
  const anchors = (
    typeof objective.anchors === "object" && objective.anchors !== null ? objective.anchors : {}
  ) as Record<string, unknown>;
  // Plans saved before anchors were stored always started and ended at the
  // depot, which is exactly where their saved path begins and ends.
  const first = path[0];
  const last = path[path.length - 1];
  const start = isAnchor(anchors.start) ? anchors.start : { lng: first[0], lat: first[1], label: "Depot" };
  const end = isAnchor(anchors.end) ? anchors.end : { lng: last[0], lat: last[1], label: "Depot" };
  const steps = Array.isArray(objective.steps) ? objective.steps.filter(isStep) : [];

  return {
    id: row.id,
    crew_name: row.crew?.name ?? "Crew",
    plan_date: row.plan_date,
    total_km: row.total_km,
    total_minutes: row.total_minutes,
    path,
    stops,
    start,
    end,
    steps,
  };
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/lib/crew/plan.test.ts`

Expected: PASS, 4 tests. Then `npm run lint` and `npx tsc --noEmit`, both clean.

- [ ] **Step 5: Commit**

```sh
git add src/lib/types.ts src/lib/crew/plan.ts src/lib/crew/plan.test.ts
git commit -m "Add the crew plan mapper"
```

### Task 2: Crew page fetch and static shell

`/route/:id` goes from stub to a real page: a server component fetches the nested plan row, maps it with `crewPlanFromRow`, and renders a client shell with the header and the stop list. The map lands in Task 3 and actions in Task 4. Rendering is not unit tested; the pure logic behind it was tested in Task 1.

**Files:**
- Modify: `dashboard/src/app/route/[id]/page.tsx:1-16` (replace the whole stub)
- Create: `dashboard/src/components/crew/CrewRoute.tsx`
- Create: `dashboard/src/components/crew/StopList.tsx`

**Interfaces:**
- Consumes: `crewPlanFromRow`, `CrewPlan`, `CrewStop` from `@/lib/crew/plan` (Task 1); `serverClient` from `@/lib/server/supabase`; `km`, `minutes`, `hhmm` from `@/lib/console/format`; `WorkOrderStatus` from `@/lib/types`.
- Produces: `default function CrewRoute({ plan }: { plan: CrewPlan })` and `function StopList({ stops, statuses, currentId }: { stops: CrewStop[]; statuses: Record<string, WorkOrderStatus>; currentId: string | null })`. Tasks 3, 4 and 12 modify `CrewRoute`; Task 4 passes live `statuses`.

- [ ] **Step 1: Rewrite the page**

Replace `dashboard/src/app/route/[id]/page.tsx` entirely:

```tsx
import { serverClient } from "@/lib/server/supabase";
import { crewPlanFromRow, type CrewPlan } from "@/lib/crew/plan";
import type { RoutePlanMapRow } from "@/lib/types";
import CrewRoute from "@/components/crew/CrewRoute";

// Crew page  - docs/ARCHITECTURE.md §6. Login-free, mobile-first. Reads the
// route_plans_map view (never a raw geography column; crews.depot arrives as
// WKB in the embed and is simply not read) and hands plain data to the shell.
export default async function CrewRoutePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  let plan: CrewPlan | null = null;
  try {
    const db = serverClient();
    const { data } = await db
      .from("route_plans_map")
      .select("*, crew:crews(*), work_orders(*, pothole:potholes_map(*))")
      .eq("id", id)
      .order("stop_order", { referencedTable: "work_orders", ascending: true });
    const row = (data ?? [])[0] as RoutePlanMapRow | undefined;
    plan = row ? crewPlanFromRow(row) : null;
  } catch {
    // A malformed id, missing Supabase config or a dead network all land on
    // the same honest answer: this link does not open a route.
    plan = null;
  }
  if (!plan) {
    return (
      <main style={{ padding: "var(--s5)", maxWidth: "42ch" }}>
        <h1 style={{ fontSize: "var(--t-title)", margin: 0 }}>Route not found</h1>
        <p className="secondary" style={{ margin: "var(--s2) 0 0", fontSize: "var(--t-small)", lineHeight: 1.5 }}>
          This route could not be loaded. Check the link in the dispatch email.
        </p>
      </main>
    );
  }
  return <CrewRoute plan={plan} />;
}
```

- [ ] **Step 2: Create the shell and the stop list**

Create `dashboard/src/components/crew/CrewRoute.tsx`:

```tsx
"use client";

import type { CrewPlan } from "@/lib/crew/plan";
import type { WorkOrderStatus } from "@/lib/types";
import { km, minutes } from "@/lib/console/format";
import { StopList } from "./StopList";

/**
 * The driver's screen. Mobile-first: header, map (Task 3), then a bottom
 * sheet with the current stop and the full list. Holds the page's only
 * client state; children take props and render.
 */
export default function CrewRoute({ plan }: { plan: CrewPlan }) {
  // Task 4 turns this into React state the stop actions write through.
  const statuses: Record<string, WorkOrderStatus> = Object.fromEntries(
    plan.stops.map((s) => [s.work_order_id, s.status]),
  );
  const current = plan.stops.find((s) => statuses[s.work_order_id] !== "done") ?? null;

  const totals = [
    `${plan.stops.length} ${plan.stops.length === 1 ? "stop" : "stops"}`,
    ...(plan.total_km === null ? [] : [km(plan.total_km)]),
    ...(plan.total_minutes === null ? [] : [minutes(plan.total_minutes)]),
  ].join(", ");

  return (
    <main style={{ height: "100dvh", display: "grid", gridTemplateRows: "auto 1fr auto", background: "var(--canvas)" }}>
      <header style={{ padding: "var(--s3) var(--s4)", background: "var(--surface)", borderBottom: "1px solid var(--rule)" }}>
        <h1 style={{ fontSize: "var(--t-title)", margin: 0, letterSpacing: "-0.015em" }}>{plan.crew_name}</h1>
        <p className="secondary" style={{ margin: 0, fontSize: "var(--t-small)" }}>
          <span className="data">{plan.plan_date}</span> · {totals}
        </p>
      </header>
      {/* The map replaces this placeholder in Task 3. */}
      <div style={{ background: "var(--canvas)" }} />
      <section
        style={{
          background: "var(--surface)", borderTop: "1px solid var(--rule)",
          padding: "var(--s3) var(--s4)", maxHeight: "45dvh", overflowY: "auto",
          display: "grid", gap: "var(--s3)", alignContent: "start",
        }}
      >
        <StopList stops={plan.stops} statuses={statuses} currentId={current?.work_order_id ?? null} />
      </section>
    </main>
  );
}
```

Create `dashboard/src/components/crew/StopList.tsx`:

```tsx
"use client";

import type { CrewStop } from "@/lib/crew/plan";
import type { WorkOrderStatus } from "@/lib/types";
import { hhmm } from "@/lib/console/format";

/** Every stop in driving order. Done ones are struck through, the current one is bold. */
export function StopList({
  stops,
  statuses,
  currentId,
}: {
  stops: CrewStop[];
  statuses: Record<string, WorkOrderStatus>;
  currentId: string | null;
}) {
  return (
    <ol style={{ margin: 0, padding: 0, listStyle: "none", display: "grid" }}>
      {stops.map((s, i) => {
        const done = statuses[s.work_order_id] === "done";
        const label = s.road_name ?? `${s.lat.toFixed(4)}, ${s.lng.toFixed(4)}`;
        return (
          <li
            key={s.work_order_id}
            style={{
              display: "flex", alignItems: "center", gap: "var(--s3)",
              padding: "var(--s2) 0",
              borderBottom: i === stops.length - 1 ? "none" : "1px solid var(--rule-soft)",
              opacity: done ? 0.55 : 1,
            }}
          >
            <span
              className="data"
              style={{
                width: 22, height: 22, flexShrink: 0, display: "grid", placeItems: "center",
                borderRadius: "var(--r-sm)", background: "var(--committed)",
                color: "var(--rail-ink)", fontSize: 11, fontWeight: 700,
              }}
            >
              {s.stop_order}
            </span>
            <span
              style={{
                flex: 1, minWidth: 0, fontSize: "var(--t-small)",
                fontWeight: s.work_order_id === currentId ? 600 : 400,
                textDecoration: done ? "line-through" : "none",
              }}
            >
              {label}
            </span>
            {s.eta && (
              <span className="data secondary" style={{ fontSize: 11 }}>
                eta {hhmm(s.eta)}
              </span>
            )}
          </li>
        );
      })}
    </ol>
  );
}
```

- [ ] **Step 3: Lint and typecheck**

Run: `npm run lint` and `npx tsc --noEmit`

Expected: both clean. If lint flags the unused `statuses` indirection, leave it as written; Task 4 makes it state.

- [ ] **Step 4: Manual verification**

The crew page reads Supabase (`route_plans_map` does not exist in the synthetic source), so `dashboard/.env.local` must hold the `NEXT_PUBLIC_SUPABASE_*` values.

1. Run `npm run dev`.
2. On `http://localhost:3000`, plan a route (select stops, open the sheet, Plan route) and dispatch it. Copy the `/route/{id}` link from the confirmation.
3. Open that link in a phone-sized viewport (devtools, 390 px wide). Look for: crew name, the date, "N stops, X km, Y min" with units, and the stops in driving order with ETAs; no map yet (empty middle band is expected until Task 3).
4. Open `http://localhost:3000/route/not-a-uuid`. Look for the one-sentence not-found state, not a crash.

- [ ] **Step 5: Commit**

```sh
git add src/app/route/[id]/page.tsx src/components/crew/CrewRoute.tsx src/components/crew/StopList.tsx
git commit -m "Build the crew page static shell"
```

### Task 3: Crew drive map

The middle band of the crew page becomes a MapLibre map: the committed-green route line, numbered stop markers, and the start / end anchor markers. The map fits the whole route on load. `children` and `overlay` slots let later tasks add the playback marker, banners and the position dot without reshaping this file.

**Files:**
- Create: `dashboard/src/components/crew/DriveMap.tsx`
- Modify: `dashboard/src/components/crew/CrewRoute.tsx` (replace the placeholder `<div />` with the map)

**Interfaces:**
- Consumes: `CrewPlan` from `@/lib/crew/plan` (Task 1); `buildMapStyle` from `@/lib/map/style`; `readMapTokens`, `readToken`, `MAP_FALLBACK` from `@/lib/map/tokens`.
- Produces: `function DriveMap({ plan, children, overlay, onUserPan }: { plan: CrewPlan; children?: ReactNode; overlay?: ReactNode; onUserPan?: () => void })`. Task 5 adds arrows inside it; Tasks 12 and 14 use `children` / `overlay` / `onUserPan`.

- [ ] **Step 1: Create the map component**

Create `dashboard/src/components/crew/DriveMap.tsx`:

```tsx
"use client";

import { useMemo, useRef, type ReactNode } from "react";
import Map, { Layer, Marker, Source } from "react-map-gl/maplibre";
import type { MapRef } from "react-map-gl/maplibre";
import { setWorkerUrl } from "maplibre-gl";

// Same worker trick as ConsoleMap: MapLibre derives its worker URL from
// import.meta.url, which the bundler does not provide. scripts/copy-maplibre-worker.mjs
// puts the worker in public/ (the predev script), so npm run dev is required.
if (typeof window !== "undefined") setWorkerUrl("/maplibre/maplibre-gl-worker.mjs");
import "maplibre-gl/dist/maplibre-gl.css";

import { buildMapStyle } from "@/lib/map/style";
import { MAP_FALLBACK, readMapTokens, readToken } from "@/lib/map/tokens";
import type { CrewPlan } from "@/lib/crew/plan";

/**
 * The driver's map: route line in --committed (a published plan is committed
 * work), numbered stops, start and end markers. `children` render inside the
 * map (markers, sources); `overlay` renders over it (banners, buttons).
 */
export function DriveMap({
  plan,
  children,
  overlay,
  onUserPan,
}: {
  plan: CrewPlan;
  children?: ReactNode;
  overlay?: ReactNode;
  onUserPan?: () => void;
}) {
  const style = useMemo(() => buildMapStyle(readMapTokens()), []);
  const committed = useMemo(() => readToken("--committed", MAP_FALLBACK.committed), []);
  const mapRef = useRef<MapRef>(null);

  const data = useMemo<GeoJSON.FeatureCollection>(
    () => ({
      type: "FeatureCollection",
      features: [
        { type: "Feature", properties: {}, geometry: { type: "LineString", coordinates: plan.path } },
      ],
    }),
    [plan.path],
  );

  const fitRoute = () => {
    const pts: [number, number][] = [
      ...plan.path,
      [plan.start.lng, plan.start.lat],
      [plan.end.lng, plan.end.lat],
    ];
    const lngs = pts.map((p) => p[0]);
    const lats = pts.map((p) => p[1]);
    mapRef.current?.fitBounds(
      [[Math.min(...lngs), Math.min(...lats)], [Math.max(...lngs), Math.max(...lats)]],
      { padding: 48, duration: 0 },
    );
  };

  const anchorSquare = (label: string) => (
    <div
      aria-label={label}
      style={{
        width: 12, height: 12, borderRadius: "var(--r-sm)",
        border: "1.5px solid var(--rail)", background: "var(--surface)",
      }}
    />
  );

  return (
    <section style={{ position: "relative", minHeight: 0 }}>
      <Map
        ref={mapRef}
        initialViewState={{ longitude: plan.start.lng, latitude: plan.start.lat, zoom: 12 }}
        mapStyle={style}
        style={{ position: "absolute", inset: 0 }}
        dragRotate={false}
        pitchWithRotate={false}
        attributionControl={{ compact: true }}
        onLoad={fitRoute}
        onDragStart={onUserPan}
      >
        <Source id="crew-route" type="geojson" data={data}>
          <Layer
            id="crew-route-line"
            type="line"
            layout={{ "line-cap": "round", "line-join": "round" }}
            paint={{ "line-color": committed, "line-width": 3 }}
          />
        </Source>
        <Marker longitude={plan.start.lng} latitude={plan.start.lat} anchor="center" style={{ zIndex: 30 }}>
          {anchorSquare(plan.start.label)}
        </Marker>
        <Marker longitude={plan.end.lng} latitude={plan.end.lat} anchor="center" style={{ zIndex: 30 }}>
          {anchorSquare(plan.end.label)}
        </Marker>
        {plan.stops.map((s) => (
          <Marker key={s.work_order_id} longitude={s.lng} latitude={s.lat} anchor="center" style={{ zIndex: 45 }}>
            <div
              className="data"
              style={{
                width: 18, height: 18, borderRadius: "var(--r-sm)", background: "var(--committed)",
                color: "var(--rail-ink)", display: "grid", placeItems: "center",
                fontSize: 11, fontWeight: 700, pointerEvents: "none",
              }}
            >
              {s.stop_order}
            </div>
          </Marker>
        ))}
        {children}
      </Map>
      {overlay}
    </section>
  );
}
```

- [ ] **Step 2: Mount it in the shell**

In `dashboard/src/components/crew/CrewRoute.tsx`, add the import and replace the placeholder:

```tsx
import { DriveMap } from "./DriveMap";
```

```tsx
      {/* was: <div style={{ background: "var(--canvas)" }} /> */}
      <DriveMap plan={plan} />
```

- [ ] **Step 3: Lint and typecheck**

Run: `npm run lint` and `npx tsc --noEmit`

Expected: both clean.

- [ ] **Step 4: Manual verification**

1. Run `npm run dev` (never `npx next dev`; the worker copy in `predev` is load-bearing).
2. Open a dispatched plan's `/route/{id}` in a 390 px viewport. Look for: the basemap drawn (not a blank grey band), one green route line, green numbered squares in driving order, and two small hollow squares at the route's start and end (they overlap on a loop, which is correct).
3. The whole route is framed on load with breathing room; pinch-zoom and pan work; rotation does not.

- [ ] **Step 5: Commit**

```sh
git add src/components/crew/DriveMap.tsx src/components/crew/CrewRoute.tsx
git commit -m "Draw the crew route map"
```

### Task 4: Stop actions (Arrived, after photo, Done)

The current stop gets a card with the before-photo, an Arrived button, an after-photo input and a Done button, per the unchanged contract in `docs/ARCHITECTURE.md` §6. State is optimistic: the button reflects the PATCH immediately and reverts with one plain sentence on failure. The Done PATCH fires the `work_orders_sync` trigger, the pothole flips to `repaired`, and the console pin goes green over Realtime - the demo's closing beat. This is I/O plus rendering, so verification is the demo script, not a unit test.

**Files:**
- Create: `dashboard/src/components/crew/StopCard.tsx`
- Modify: `dashboard/src/components/crew/CrewRoute.tsx` (statuses become state; the card renders above the list)

**Interfaces:**
- Consumes: `CrewStop` from `@/lib/crew/plan` (Task 1); `WorkOrderStatus` from `@/lib/types`; the browser Supabase client `supabase` from `@/lib/supabase`; `hhmm` from `@/lib/console/format`.
- Produces: `function StopCard({ stop, status, onStatus }: { stop: CrewStop; status: WorkOrderStatus; onStatus: (workOrderId: string, status: WorkOrderStatus) => void })` and `const SAVE_ERROR: string`.

- [ ] **Step 1: Create the stop card**

Create `dashboard/src/components/crew/StopCard.tsx`:

```tsx
"use client";

import { useState } from "react";
import { supabase } from "@/lib/supabase";
import { hhmm } from "@/lib/console/format";
import type { CrewStop } from "@/lib/crew/plan";
import type { WorkOrderStatus } from "@/lib/types";

export const SAVE_ERROR = "Could not save that. Check the signal and try again.";

/**
 * The stop the crew is working now. Optimistic: the PATCH is reflected
 * immediately and reverted with one plain sentence when it fails.
 */
export function StopCard({
  stop,
  status,
  onStatus,
}: {
  stop: CrewStop;
  status: WorkOrderStatus;
  onStatus: (workOrderId: string, status: WorkOrderStatus) => void;
}) {
  const [error, setError] = useState<string | null>(null);
  const [photoUrl, setPhotoUrl] = useState<string | null>(stop.after_photo_url);
  const [uploading, setUploading] = useState(false);

  async function patch(update: Record<string, unknown>, next: WorkOrderStatus) {
    const previous = status;
    setError(null);
    onStatus(stop.work_order_id, next);
    const { error: dbError } = await supabase
      .from("work_orders")
      .update(update)
      .eq("id", stop.work_order_id);
    if (dbError) {
      onStatus(stop.work_order_id, previous);
      setError(SAVE_ERROR);
    }
  }

  async function uploadAfterPhoto(file: File) {
    setUploading(true);
    setError(null);
    const path = `after_${stop.work_order_id}.jpg`;
    const { error: upError } = await supabase.storage
      .from("detections")
      .upload(path, file, { upsert: true, contentType: "image/jpeg" });
    if (upError) {
      setError(SAVE_ERROR);
    } else {
      setPhotoUrl(supabase.storage.from("detections").getPublicUrl(path).data.publicUrl);
    }
    setUploading(false);
  }

  const label = stop.road_name ?? `${stop.lat.toFixed(4)}, ${stop.lng.toFixed(4)}`;
  // Google Maps is the one place coordinates are latitude first.
  const gmaps = `https://www.google.com/maps/dir/?api=1&destination=${stop.lat.toFixed(6)},${stop.lng.toFixed(6)}&travelmode=driving`;

  return (
    <article style={{ display: "grid", gap: "var(--s2)" }}>
      <header style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: "var(--s3)" }}>
        <h2 style={{ margin: 0, fontSize: "var(--t-lead)", fontWeight: 600 }}>
          Stop {stop.stop_order}: {label}
        </h2>
        {stop.eta && (
          <span className="data secondary" style={{ fontSize: "var(--t-small)" }}>
            eta {hhmm(stop.eta)}
          </span>
        )}
      </header>
      {stop.photo_url && (
        <img
          src={stop.photo_url}
          alt="Before photo of the defect"
          style={{ maxWidth: "100%", borderRadius: "var(--r-md)", border: "1px solid var(--rule-soft)" }}
        />
      )}
      <p style={{ margin: 0, fontSize: "var(--t-small)" }}>
        <a className="data" href={gmaps} target="_blank" rel="noreferrer" style={{ color: "var(--action)" }}>
          Open in Google Maps
        </a>
      </p>
      <div style={{ display: "flex", gap: "var(--s2)", alignItems: "center", flexWrap: "wrap" }}>
        {status === "assigned" && (
          <button type="button" className="btn btn-commit" onClick={() => void patch({ status: "in_progress", started_at: new Date().toISOString() }, "in_progress")}>
            Arrived at this stop
          </button>
        )}
        {status === "in_progress" && (
          <>
            <label className="btn btn-secondary" style={{ cursor: "pointer" }}>
              {uploading ? "Uploading photo…" : photoUrl ? "Retake after photo" : "Take after photo"}
              <input
                type="file"
                accept="image/*"
                capture="environment"
                style={{ display: "none" }}
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) void uploadAfterPhoto(file);
                }}
              />
            </label>
            <button
              type="button"
              className="btn btn-commit"
              disabled={uploading}
              onClick={() => void patch({ status: "done", completed_at: new Date().toISOString(), after_photo_url: photoUrl }, "done")}
            >
              Mark this stop done
            </button>
          </>
        )}
      </div>
      {error && (
        <p role="alert" className="secondary" style={{ margin: 0, fontSize: "var(--t-small)" }}>
          {error}
        </p>
      )}
    </article>
  );
}
```

- [ ] **Step 2: Make statuses live state in the shell**

In `dashboard/src/components/crew/CrewRoute.tsx`, add the imports and replace the `statuses` constant:

```tsx
import { useState } from "react";
import { StopCard } from "./StopCard";
```

```tsx
  const [statuses, setStatuses] = useState<Record<string, WorkOrderStatus>>(() =>
    Object.fromEntries(plan.stops.map((s) => [s.work_order_id, s.status])),
  );
  const setStatus = (workOrderId: string, status: WorkOrderStatus) =>
    setStatuses((prev) => ({ ...prev, [workOrderId]: status }));
  const current = plan.stops.find((s) => statuses[s.work_order_id] !== "done") ?? null;
```

Then render the card in the bottom section, above the list:

```tsx
        {current ? (
          <StopCard
            key={current.work_order_id}
            stop={current}
            status={statuses[current.work_order_id]}
            onStatus={setStatus}
          />
        ) : (
          <p style={{ margin: 0, fontSize: "var(--t-small)", fontWeight: 600 }}>
            All stops are done. Head back to {plan.end.label === "Depot" ? "the depot" : plan.end.label}.
          </p>
        )}
        <StopList stops={plan.stops} statuses={statuses} currentId={current?.work_order_id ?? null} />
```

- [ ] **Step 3: Lint and typecheck**

Run: `npm run lint` and `npx tsc --noEmit`

Expected: both clean.

- [ ] **Step 4: Manual verification**

With Supabase configured and `npm run dev` running:

1. Dispatch a plan from the console, open `/route/{id}` on a phone-sized viewport, keep the console open in a second window.
2. Press "Arrived at this stop": the card switches to the photo and Done controls immediately.
3. Pick any image file for the after photo (desktop file picker stands in for the camera), then "Mark this stop done": the stop strikes through, the card advances to the next stop, and on the console the pin for that pothole turns green within a second or two (Realtime through the `work_orders_sync` trigger).
4. Confirm in Supabase Storage that `detections/after_{work_order_id}.jpg` exists.
5. Failure path: stop the network (devtools offline), press Arrived; the button reverts and the sentence "Could not save that. Check the signal and try again." appears.

- [ ] **Step 5: Commit**

```sh
git add src/components/crew/StopCard.tsx src/components/crew/CrewRoute.tsx
git commit -m "Add crew stop actions"
```

### Task 5: Direction arrows on both screens

Arrowheads along the route line, pointing the direction of travel (spec §8). The glyph is drawn programmatically into raw rgba pixels and registered with `map.addImage`, because the basemap's glyph font is not guaranteed to contain geometric shapes and a missing glyph renders as an empty box on stage. The bitmap builder is pure and unit tested; the symbol layers are visual and manually verified.

**Files:**
- Create: `dashboard/src/lib/map/arrow.ts`
- Test: `dashboard/src/lib/map/arrow.test.ts`
- Modify: `dashboard/src/components/console/map/RouteLayer.tsx` (arrows inside the existing `Source`)
- Modify: `dashboard/src/components/crew/DriveMap.tsx` (same, in `--committed`)

**Interfaces:**
- Consumes: `readToken`, `MAP_FALLBACK` from `@/lib/map/tokens` (the only place literal colours exist).
- Produces: `interface ArrowImage { width: number; height: number; data: Uint8ClampedArray }` and `function buildArrowImage(hexColor: string, size?: number): ArrowImage` in `@/lib/map/arrow`. No later task consumes these beyond this one.

- [ ] **Step 1: Write the failing test**

Create `dashboard/src/lib/map/arrow.test.ts`:

```ts
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
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/lib/map/arrow.test.ts`

Expected: FAIL with `Failed to resolve import "./arrow"`.

- [ ] **Step 3: Write the minimal implementation**

Create `dashboard/src/lib/map/arrow.ts`:

```ts
/** A bitmap in the shape map.addImage accepts: raw rgba pixels. */
export interface ArrowImage {
  width: number;
  height: number;
  data: Uint8ClampedArray;
}

const HEX = /^#([0-9a-f]{6})$/i;

/**
 * A right-pointing solid triangle. MapLibre rotates it to the line's
 * direction at render time (icon-rotation-alignment: "map"), so drawing it
 * once, pointing right, is enough. Pure pixels: no canvas, no DOM, no font.
 *
 * The colour must be a resolved #rrggbb literal (from readToken), because a
 * bitmap has no way to reference a CSS custom property.
 */
export function buildArrowImage(hexColor: string, size = 24): ArrowImage {
  const match = HEX.exec(hexColor.trim());
  if (!match) throw new Error("arrow colour must be a #rrggbb literal");
  const value = parseInt(match[1], 16);
  const r = (value >> 16) & 0xff;
  const g = (value >> 8) & 0xff;
  const b = value & 0xff;

  const data = new Uint8ClampedArray(size * size * 4);
  // Base along the left edge (inset by a margin), apex at the right inset by
  // the same margin. A pixel is inside while its distance from the midline is
  // under the half-height, which shrinks linearly towards the apex.
  const margin = size / 6;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const t = (x - margin) / (size - 2 * margin); // 0 at the base, 1 at the apex
      const halfHeight = (1 - t) * (size / 2 - margin);
      const inside = t >= 0 && t <= 1 && Math.abs(y - size / 2 + 0.5) <= halfHeight;
      const i = (y * size + x) * 4;
      data[i] = r;
      data[i + 1] = g;
      data[i + 2] = b;
      data[i + 3] = inside ? 255 : 0;
    }
  }
  return { width: size, height: size, data };
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/lib/map/arrow.test.ts`

Expected: PASS, 4 tests.

- [ ] **Step 5: Add the symbol layer to the console route**

In `dashboard/src/components/console/map/RouteLayer.tsx`, add the imports and the image registration:

```tsx
import { useEffect, useMemo, useState } from "react";
import { Layer, Marker, Source, useMap } from "react-map-gl/maplibre";
import { buildArrowImage } from "@/lib/map/arrow";
```

Inside the component, after the existing `action` memo:

```tsx
  const { current: map } = useMap();
  const [arrowReady, setArrowReady] = useState(false);
  useEffect(() => {
    const m = map?.getMap();
    if (!m) return;
    if (!m.hasImage("route-arrow-action")) m.addImage("route-arrow-action", buildArrowImage(action));
    setArrowReady(true);
  }, [map, action]);
```

Inside the `<Source id="route" …>` block, after the `route-line` layer:

```tsx
        {arrowReady && (
          <Layer
            id="route-arrows"
            type="symbol"
            layout={{
              "symbol-placement": "line",
              "symbol-spacing": 80,
              "icon-image": "route-arrow-action",
              "icon-size": 0.5,
              "icon-rotation-alignment": "map",
              "icon-allow-overlap": true,
              "icon-ignore-placement": true,
            }}
          />
        )}
```

- [ ] **Step 6: Add the same layer to the crew map**

In `dashboard/src/components/crew/DriveMap.tsx`, add the equivalent registration using the committed colour (`useMap` cannot be used here because this component renders the `Map` itself, so register on load):

```tsx
import { buildArrowImage } from "@/lib/map/arrow";
```

```tsx
  const [arrowReady, setArrowReady] = useState(false);
```

Change `onLoad` and add the layer after `crew-route-line`:

```tsx
        onLoad={() => {
          const m = mapRef.current?.getMap();
          if (m && !m.hasImage("route-arrow-committed")) {
            m.addImage("route-arrow-committed", buildArrowImage(committed));
          }
          setArrowReady(true);
          fitRoute();
        }}
```

```tsx
          {arrowReady && (
            <Layer
              id="crew-route-arrows"
              type="symbol"
              layout={{
                "symbol-placement": "line",
                "symbol-spacing": 80,
                "icon-image": "route-arrow-committed",
                "icon-size": 0.5,
                "icon-rotation-alignment": "map",
                "icon-allow-overlap": true,
                "icon-ignore-placement": true,
              }}
            />
          )}
```

(Also add `useState` to the React import in this file.)

- [ ] **Step 7: Lint, typecheck and verify manually**

Run: `npx vitest run`, `npm run lint`, `npx tsc --noEmit` - all clean.

Then `npm run dev`:

1. Console: plan any route. Look for small blue arrowheads spaced along the blue route line, all pointing the direction of travel (follow the stop numbers: 1 towards 2 towards 3). Zoom in; the arrows stay on the line and their count grows with length.
2. Crew page: open a dispatched `/route/{id}`. Same check in green.
3. Arrows must sit on the line, not float beside it, and never render as hollow boxes (that would mean a glyph was used instead of the image).

- [ ] **Step 8: Commit**

```sh
git add src/lib/map/arrow.ts src/lib/map/arrow.test.ts src/components/console/map/RouteLayer.tsx src/components/crew/DriveMap.tsx
git commit -m "Draw direction arrows along both route lines"
```

### Task 6: Remove the shift-drag area tool

The drawn-area planning tool is removed by decision (spec §2): the shift-drag rectangle, the drawing state, the area layer, and the sheet's area row all go. **The `area` field stays in `PlanRouteRequest` and the server keeps supporting it** (it is a candidate filter orthogonal to the dials; removing server support would be a drive-by) - so do not touch `src/lib/server/planRoute.ts`, `src/lib/data/synthetic.ts` or `pointInPolygon`. This task is deletion, so the cycle is inverted: update the tests to describe the smaller surface, make the code match, keep the whole suite green.

**Files:**
- Delete: `dashboard/src/components/console/map/useAreaDrag.ts`
- Delete: `dashboard/src/components/console/map/AreaLayer.tsx`
- Modify: `dashboard/src/lib/console/store.ts:18` (`PlannerConfig.area`), `:41` (`drawing`), `:91` (`setArea`), `:139-141` (defaults), `:221-224` (`setDrawing`, `setArea`), `:236` (request spread)
- Modify: `dashboard/src/lib/console/store.test.ts:142-149` (the drawing test)
- Modify: `dashboard/src/lib/console/area.ts` (remove `rectPolygon`, `countInArea`; keep `pointInPolygon`) and `area.test.ts` to match
- Modify: `dashboard/src/lib/console/derive.ts:88-101` (`planCandidates` loses `area`) and `derive.test.ts` to match
- Modify: `dashboard/src/components/console/map/MapLayers.tsx` (drop `AreaLayer` and the `draft` prop)
- Modify: `dashboard/src/components/console/map/ConsoleMap.tsx:26-37` (drop `dragPan`, `cursor`, `mouseHandlers` props)
- Modify: `dashboard/src/components/PotholeMap.tsx` (drop `useAreaDrag` and the props it fed)
- Modify: `dashboard/src/components/Console.tsx:38,131` (drop the `drawing` keyboard gate)
- Modify: `dashboard/src/components/DispatchSheet.tsx:49,94,347-356` (drop `setArea`, `countInArea` / `inArea`, and the area row)

**Interfaces:**
- Consumes: nothing new.
- Produces: `planCandidates(potholes: Pothole[], opts: { mode: "manual" | "count" | "time"; selectedCount: number }, plan?: PlanRouteResponse | null): number` - the `area` key is gone from `opts`. The store's public surface loses `setArea`, `setDrawing`, `drawing`, and `planner.area`. Later tasks rely on none of the removed names.

- [ ] **Step 1: Shrink the tests first**

- In `dashboard/src/lib/console/store.test.ts`, delete the test `"records that an area is being drawn, so the screen's keys stand down"` (lines 142 to 149).
- In `dashboard/src/lib/console/area.test.ts`, delete every test of `rectPolygon` and `countInArea`; keep the `pointInPolygon` tests exactly as they are.
- In `dashboard/src/lib/console/derive.test.ts`, update every `planCandidates` call to the two-key options object, for example `planCandidates(potholes, { mode: "count", selectedCount: 0 })`, and delete any case whose subject was area clipping.

- [ ] **Step 2: Run the suite to see the mismatch**

Run: `npx vitest run src/lib/console`

Expected: FAIL - the edited `derive.test.ts` calls no longer match the current `planCandidates` signature (TypeScript surfaces this as a failed transform or type error in the run).

- [ ] **Step 3: Make the code match**

1. Delete the two files:

```sh
git rm src/components/console/map/useAreaDrag.ts src/components/console/map/AreaLayer.tsx
```

2. `src/lib/console/store.ts`: remove `area: GeoJSON.Polygon | null;` from `PlannerConfig`; remove the `drawing` field and its doc comment from `ConsoleState`; remove `setArea` and `setDrawing` from `ConsoleActions` and their implementations; remove `area: null` and `drawing: false` from the initial state; and in `planRoute()` remove the line `...(planner.mode !== "manual" && planner.area ? { area: planner.area } : {}),`.

3. `src/lib/console/area.ts`: delete `rectPolygon` and `countInArea` (both orphaned by this removal), keep `pointInPolygon` and the `Pothole` import only if still used (it is not - drop it).

4. `src/lib/console/derive.ts`: replace `planCandidates` with the area-free version and drop the now-unused `pointInPolygon` import:

```ts
/**
 * How many potholes the current dials would feed the solver, which is what
 * the sheet's Plan button gate reads. Manual mode counts the operator's
 * selection; asking for a best N or a time budget means the open queue.
 *
 * The standing plan's own stops count too. They are `scheduled`, so the open
 * queue excludes them  - but /api/plan-route replaces a crew's plan for a date
 * and reads those potholes back in, so without this the button would go dead
 * the moment a route came back and replanning would be unreachable from here.
 */
export function planCandidates(
  potholes: Pothole[],
  { mode, selectedCount }: { mode: "manual" | "count" | "time"; selectedCount: number },
  plan?: PlanRouteResponse | null,
): number {
  if (mode === "manual") return selectedCount;
  const onPlan = new Set((plan?.stops ?? []).map((s) => s.pothole_id));
  return potholes.filter((p) => {
    const open = p.status === "suspected" || p.status === "confirmed";
    const carried = p.status === "scheduled" && onPlan.has(p.id);
    return open || carried;
  }).length;
}
```

5. `src/components/console/map/MapLayers.tsx`: remove the `AreaLayer` import and mount, and the `draft` prop - the component becomes `export function MapLayers()` with no props.

6. `src/components/console/map/ConsoleMap.tsx`: remove the `dragPan`, `cursor` and `mouseHandlers` props from the signature, the `<Map>` spread `{...mouseHandlers}`, and the `dragPan={dragPan}` / `cursor={cursor}` attributes (leave `dragRotate={false}` and the rest untouched). Remove the now-unused `MapLayerMouseEvent` import.

7. `src/components/PotholeMap.tsx`: remove the `useAreaDrag` import and call, and the `dragPan` / `cursor` / `mouseHandlers` props passed to `ConsoleMap`; `<MapLayers draft={draft} />` becomes `<MapLayers />`.

8. `src/components/Console.tsx`: remove the `drawing` selector (line 38) and take `drawing` out of the keyboard gate (line 131 becomes `if (sheetOpen) return;`) and out of the effect's dependency array.

9. `src/components/DispatchSheet.tsx`: remove the `setArea` selector (line 49), the `countInArea` import and the `inArea` variable (line 94), pass the new shape to `planCandidates` (`{ mode: planner.mode, selectedCount: selected.length }`), and delete the whole area row block (the `planner.mode !== "manual" && (...)` JSX at lines 347 to 356, including the Clear button).

- [ ] **Step 4: Run everything**

Run: `npx vitest run` then `npm run lint` then `npx tsc --noEmit`

Expected: all green and clean. Lint and tsc are the real net here - they catch any survivor still importing `useAreaDrag`, `AreaLayer`, `rectPolygon`, `countInArea`, `setArea`, `setDrawing` or `planner.area`.

- [ ] **Step 5: Manual verification**

`npm run dev`:

1. Shift-drag on the map does nothing (the map pans as normal drag; no rectangle, no crosshair cursor).
2. Open the sheet in "Best N" mode: no "No area · Shift-drag…" row anywhere.
3. Keyboard still works: arrows move the queue selection, Enter opens a record, Escape steps back, and Escape still closes the sheet.
4. Planning in every mode still works against the synthetic source (`Best N`, `Time budget`, and manual with a selection).

- [ ] **Step 6: Commit**

```sh
git add -A
git commit -m "Remove the shift-drag area tool"
```

### Task 7: The one-click Plan route button

A quiet button on the map, beside the key: one click plans a `manual` route from the crew's depot to the open pothole nearest the depot and back - today's wire shape exactly, no anchor fields, no server change. The nearest-pothole choice and the store action are pure and tested; the button itself is visual.

One recorded caveat: the client cannot read `crews.depot` (geography never reaches the browser), so the nearest-pothole search measures from the `DEPOT` constant in `src/lib/data/synthetic.ts`, which equals the seeded crew depot `POINT(-0.1246 51.4994)`. The server still anchors the actual route at the true depot, so a differently seeded depot could at worst pick a different "nearest" pothole, never a wrong route. The §5 anchor echo (Task 17) is what eventually gives the client the truth.

**Files:**
- Create: `dashboard/src/lib/console/nearest.ts`
- Test: `dashboard/src/lib/console/nearest.test.ts`
- Modify: `dashboard/src/lib/console/store.ts` (add `planNearest()` to `ConsoleActions` and the implementation)
- Test: `dashboard/src/lib/console/store.test.ts` (two new cases)
- Modify: `dashboard/src/components/PotholeMap.tsx` (button beside the key; the Legend keeps its box but hands its positioning to a shared wrapper)

**Interfaces:**
- Consumes: `haversineKm`, `LngLat` from `@/lib/solver/haversine`; `Pothole` from `@/lib/data/types`; `DEPOT` from `@/lib/data/synthetic`; the store's existing `planRoute()` action and `sheetOpen` flag.
- Produces: `function nearestOpenPothole(potholes: Pothole[], from: LngLat): Pothole | null` in `@/lib/console/nearest`; `planNearest(): Promise<void>` on the console store.

- [ ] **Step 1: Write the failing helper test**

Create `dashboard/src/lib/console/nearest.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { nearestOpenPothole } from "./nearest";
import type { Pothole } from "@/lib/data/types";

const base: Pothole = {
  id: "a", authority_id: "x", road_name: "Millbank", street: "Millbank", ref: "BCH-A", stop_order: null,
  status: "confirmed", severity: 0.5, detection_count: 2, distinct_vehicles: 2,
  first_detected_at: "2026-08-01T00:00:00Z", last_detected_at: "2026-09-01T00:00:00Z", repaired_at: null,
  updated_at: "2026-09-01T00:00:00Z", lng: -0.12, lat: 51.49, photo_url: null, priority: 1,
};
const p = (o: Partial<Pothole>): Pothole => ({ ...base, ...o });

describe("nearestOpenPothole", () => {
  it("picks the closest suspected or confirmed pothole by straight-line distance", () => {
    const near = p({ id: "near", lng: 0.001, lat: 0 });
    const far = p({ id: "far", lng: 0.1, lat: 0 });
    expect(nearestOpenPothole([far, near], [0, 0])?.id).toBe("near");
  });

  it("ignores scheduled, repaired and dismissed potholes even when they are closer", () => {
    const closest = p({ id: "sched", status: "scheduled", lng: 0, lat: 0 });
    const repaired = p({ id: "rep", status: "repaired", lng: 0.0001, lat: 0 });
    const dismissed = p({ id: "fp", status: "false_positive", lng: 0.0002, lat: 0 });
    const open = p({ id: "open", lng: 0.01, lat: 0 });
    expect(nearestOpenPothole([closest, repaired, dismissed, open], [0, 0])?.id).toBe("open");
  });

  it("returns null when nothing is open, and is deterministic on ties", () => {
    expect(nearestOpenPothole([p({ id: "r", status: "repaired" })], [0, 0])).toBeNull();
    expect(nearestOpenPothole([], [0, 0])).toBeNull();
    const first = p({ id: "first", lng: 0.001, lat: 0 });
    const second = p({ id: "second", lng: 0.001, lat: 0 });
    expect(nearestOpenPothole([first, second], [0, 0])?.id).toBe("first");
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run src/lib/console/nearest.test.ts`

Expected: FAIL with `Failed to resolve import "./nearest"`.

- [ ] **Step 3: Implement the helper**

Create `dashboard/src/lib/console/nearest.ts`:

```ts
import { haversineKm, type LngLat } from "@/lib/solver/haversine";
import type { Pothole } from "@/lib/data/types";

/**
 * The open pothole nearest to `from`, by straight-line distance. "Open" means
 * suspected or confirmed - the statuses a new plan may claim. Strict `<`
 * keeps the first of a tie, so the result is deterministic. Null when the
 * queue holds nothing open, which the caller treats as "nothing to plan".
 */
export function nearestOpenPothole(potholes: Pothole[], from: LngLat): Pothole | null {
  let best: Pothole | null = null;
  let bestKm = Infinity;
  for (const p of potholes) {
    if (p.status !== "suspected" && p.status !== "confirmed") continue;
    const d = haversineKm(from, [p.lng, p.lat]);
    if (d < bestKm) {
      best = p;
      bestKm = d;
    }
  }
  return best;
}
```

Run: `npx vitest run src/lib/console/nearest.test.ts` - PASS, 3 tests.

- [ ] **Step 4: Write the failing store test**

Add to `dashboard/src/lib/console/store.test.ts` (inside the existing `describe`), plus the import `import { DEPOT } from "@/lib/data/synthetic";` at the top:

```ts
  it("planNearest plans a one-stop manual route to the open pothole nearest the depot and opens the sheet", async () => {
    const ds = fakeDs();
    const s = createConsoleStore();
    s.getState().setDataSource(ds);
    s.getState().setCrews([{ id: "c1", authority_id: "x", name: "Crew A", shift_minutes: 480, repairs_per_shift: 12 }]);
    s.getState().upsertPothole(p({ id: "near", lng: DEPOT[0] + 0.001, lat: DEPOT[1] }));
    s.getState().upsertPothole(p({ id: "far", lng: DEPOT[0] + 0.1, lat: DEPOT[1] }));
    s.getState().upsertPothole(p({ id: "closer-but-repaired", status: "repaired", lng: DEPOT[0], lat: DEPOT[1] }));
    await s.getState().planNearest();
    expect(ds.planRoute).toHaveBeenCalledWith(expect.objectContaining({
      crew_id: "c1", mode: "manual", pothole_ids: ["near"],
    }));
    expect(s.getState().sheetOpen).toBe(true);
    expect(s.getState().planState).toBe("planned");
  });

  it("planNearest does nothing when no pothole is open", async () => {
    const ds = fakeDs();
    const s = createConsoleStore();
    s.getState().setDataSource(ds);
    s.getState().setCrews([{ id: "c1", authority_id: "x", name: "Crew A", shift_minutes: 480, repairs_per_shift: 12 }]);
    s.getState().upsertPothole(p({ id: "r", status: "repaired" }));
    await s.getState().planNearest();
    expect(ds.planRoute).not.toHaveBeenCalled();
    expect(s.getState().sheetOpen).toBe(false);
  });
```

Run: `npx vitest run src/lib/console/store.test.ts`

Expected: FAIL - `planNearest is not a function`.

- [ ] **Step 5: Implement the store action**

In `dashboard/src/lib/console/store.ts`, add the imports:

```ts
import { nearestOpenPothole } from "./nearest";
import { DEPOT } from "@/lib/data/synthetic";
```

Add to `ConsoleActions`, next to `planRoute`:

```ts
  /** The one-click demo path: depot loop to the worst nearby open defect. */
  planNearest(): Promise<void>;
```

Add the implementation beside `planRoute()`:

```ts
      async planNearest() {
        const { crews, planner, potholes } = get();
        const crewId = planner.crewId ?? crews[0]?.id ?? null;
        // DEPOT matches the seeded crews.depot; the server anchors the real
        // route at the true depot either way (see Task 7 note in the plan).
        const nearest = nearestOpenPothole(Object.values(potholes), DEPOT);
        if (!ds || !crewId || !nearest) return;
        set((s) => ({
          planner: { ...s.planner, crewId, mode: "manual" },
          selected: [nearest.id],
          sheetOpen: true,
        }));
        await get().planRoute();
      },
```

Run: `npx vitest run src/lib/console/store.test.ts` - PASS.

- [ ] **Step 6: Put the button on the map**

In `dashboard/src/components/PotholeMap.tsx`:

1. Give `Legend` a shared bottom-left wrapper. Change `Legend`'s outer `<div>` style so it no longer positions itself: remove `position`, `left`, `bottom` and `zIndex` from it (keep padding, background, border, radius, shadow).
2. In the `overlay` prop, replace `<Legend />` with:

```tsx
          <div style={{ position: "absolute", left: "var(--s4)", bottom: "var(--s4)", zIndex: 50, display: "grid", gap: "var(--s2)", justifyItems: "start" }}>
            <PlanRouteButton />
            <Legend />
          </div>
```

3. Add the component at file scope:

```tsx
function PlanRouteButton() {
  const planNearest = useConsole((s) => s.planNearest);
  const planState = useConsole((s) => s.planState);
  return (
    <button
      type="button"
      className="btn btn-primary"
      style={{ boxShadow: "var(--shadow-1)" }}
      disabled={planState === "planning"}
      onClick={() => void planNearest()}
    >
      {planState === "planning" ? "Planning…" : "Plan route"}
    </button>
  );
}
```

- [ ] **Step 7: Lint, typecheck, verify manually**

Run: `npx vitest run`, `npm run lint`, `npx tsc --noEmit` - all clean.

`npm run dev`:

1. The button sits bottom-left above the key, blue (`btn-primary`: this is proposed work, not committed).
2. One click: the sheet opens already planned - a route from the depot to one nearby pothole and back, with totals. Under two seconds against the synthetic source.
3. While planning, the button reads "Planning…" and is disabled.
4. Dismiss every open pothole in a filtered demo state is impractical; instead confirm via the store test that the no-open-pothole case is inert.

- [ ] **Step 8: Commit**

```sh
git add src/lib/console/nearest.ts src/lib/console/nearest.test.ts src/lib/console/store.ts src/lib/console/store.test.ts src/components/PotholeMap.tsx
git commit -m "Add the one-click Plan route button"
```

### Task 8: OSRM turn steps

`osrm.route()` gains `steps=true` and returns the manoeuvres alongside the geometry. This changes the client's return shape, so the one call site in `planRoute.ts` and its test mock are updated in the same task to keep the suite green.

**Files:**
- Modify: `dashboard/src/lib/server/osrm.ts:26-70` (route response types and `route()`)
- Test: `dashboard/src/lib/server/osrm.test.ts:106-143` (the route describe block)
- Modify: `dashboard/src/lib/server/planRoute.ts:336` (`osrm.route` call site reads `.geometry`)
- Modify: `dashboard/src/lib/server/planRoute.test.ts:371` (the `makeOsrm` route mock)

**Interfaces:**
- Consumes: nothing new.
- Produces, in `@/lib/server/osrm` (Task 9 consumes `OsrmStep`; Task 10 consumes `OsrmRoute`):

```ts
export interface OsrmManoeuvre {
  type: string;               // "turn", "depart", "arrive", "roundabout", …
  modifier?: string;          // "left", "right", "slight left", "straight", "uturn", …
  exit?: number;              // roundabout exit count
  location: [number, number]; // [lng, lat]
}
export interface OsrmStep {
  name: string;               // road name; "" when OSRM has none
  distance: number;           // metres driven in this step
  maneuver: OsrmManoeuvre;
}
export interface OsrmRoute {
  geometry: LineString;
  steps: OsrmStep[];
}
// OsrmClient.route changes to: route(points: LngLat[]): Promise<OsrmRoute>;
```

- [ ] **Step 1: Update the route tests to the new contract**

In `dashboard/src/lib/server/osrm.test.ts`, replace the first test of `describe("createOsrmClient.route", …)` with the two below (the error-path tests at the end of the file stay as they are):

```ts
  it("requests steps=true and returns geometry plus flattened steps", async () => {
    const points: LngLat[] = [
      [-0.1246, 51.4994],
      [-0.13, 51.5],
    ];
    const coordinates = [
      [-0.1246, 51.4994],
      [-0.128, 51.4997],
      [-0.13, 51.5],
    ];
    const fetchImpl = vi.fn().mockResolvedValue(
      jsonResponse({
        code: "Ok",
        routes: [{
          geometry: { type: "LineString", coordinates },
          legs: [
            { steps: [
              { name: "Millbank", distance: 240.4, maneuver: { type: "depart", location: [-0.1246, 51.4994] } },
              { name: "Horseferry Road", distance: 120.2, maneuver: { type: "turn", modifier: "left", location: [-0.128, 51.4997] } },
            ] },
            { steps: [
              { name: "", distance: 0, maneuver: { type: "arrive", location: [-0.13, 51.5] } },
            ] },
          ],
        }],
      }),
    );
    const client = createOsrmClient(BASE_URL, fetchImpl);
    const route = await client.route(points);

    expect(fetchImpl).toHaveBeenCalledWith(
      `${BASE_URL}/route/v1/driving/-0.124600,51.499400;-0.130000,51.500000?overview=full&geometries=geojson&steps=true`,
    );
    expect(route.geometry).toEqual({ type: "LineString", coordinates });
    // Steps flatten across legs, in order.
    expect(route.steps.map((s) => s.maneuver.type)).toEqual(["depart", "turn", "arrive"]);
    expect(route.steps[1]).toEqual({
      name: "Horseferry Road",
      distance: 120.2,
      maneuver: { type: "turn", modifier: "left", exit: undefined, location: [-0.128, 51.4997] },
    });
  });

  it("returns an empty step list when the response carries no legs or steps", async () => {
    const coordinates = [
      [-0.1246, 51.4994],
      [-0.13, 51.5],
    ];
    const fetchImpl = vi.fn().mockResolvedValue(
      jsonResponse({ code: "Ok", routes: [{ geometry: { type: "LineString", coordinates } }] }),
    );
    const client = createOsrmClient(BASE_URL, fetchImpl);
    const route = await client.route([[0, 0], [1, 1]]);
    expect(route.geometry.coordinates).toEqual(coordinates);
    expect(route.steps).toEqual([]);
  });
```

- [ ] **Step 2: Run to verify the failure**

Run: `npx vitest run src/lib/server/osrm.test.ts`

Expected: FAIL - the URL assertion misses `&steps=true` and `route.geometry` is undefined (the old client returns the bare LineString).

- [ ] **Step 3: Implement the new route()**

In `dashboard/src/lib/server/osrm.ts`, replace the `OsrmRouteResponse` interface and the `route` method, add the new exported types from the Interfaces block above, and change the `OsrmClient` interface's `route` signature to `route(points: LngLat[]): Promise<OsrmRoute>`:

```ts
export interface OsrmManoeuvre {
  type: string;               // "turn", "depart", "arrive", "roundabout", …
  modifier?: string;          // "left", "right", "slight left", "straight", "uturn", …
  exit?: number;              // roundabout exit count
  location: [number, number]; // [lng, lat]
}

export interface OsrmStep {
  name: string;               // road name; "" when OSRM has none
  distance: number;           // metres driven in this step
  maneuver: OsrmManoeuvre;
}

/** What planRoute consumes: the drawn line plus the manoeuvres along it. */
export interface OsrmRoute {
  geometry: LineString;
  steps: OsrmStep[];
}

interface OsrmRouteResponse {
  code: string;
  routes?: {
    geometry: LineString;
    legs?: {
      steps?: {
        name?: string;
        distance?: number;
        maneuver?: { type?: string; modifier?: string; exit?: number; location?: [number, number] };
      }[];
    }[];
  }[];
}
```

```ts
    async route(points: LngLat[]): Promise<OsrmRoute> {
      const url = `${baseUrl}/route/v1/driving/${formatCoords(points)}?overview=full&geometries=geojson&steps=true`;
      const body = (await fetchJson(fetchImpl, url)) as OsrmRouteResponse;
      const first = body.routes?.[0];
      if (body.code !== "Ok" || !first?.geometry) {
        throw new Error("Route service unavailable");
      }
      // One route, several legs (one per waypoint pair); the banner wants a
      // single ordered list, so the legs are flattened here, once.
      const steps: OsrmStep[] = (first.legs ?? []).flatMap((leg) =>
        (leg.steps ?? []).flatMap((s) => {
          const location = s.maneuver?.location;
          if (!location) return [];
          return [{
            name: s.name ?? "",
            distance: s.distance ?? 0,
            maneuver: {
              type: s.maneuver?.type ?? "turn",
              modifier: s.maneuver?.modifier,
              exit: s.maneuver?.exit,
              location,
            },
          }];
        }),
      );
      return { geometry: first.geometry, steps };
    },
```

- [ ] **Step 4: Fix the two consumers in the same breath**

1. `dashboard/src/lib/server/planRoute.ts` line 336: `line = await osrm.route(routePoints);` becomes `line = (await osrm.route(routePoints)).geometry;` (Task 10 starts using the steps; today only the geometry is needed).
2. `dashboard/src/lib/server/planRoute.test.ts` in `makeOsrm` (line 371): the route mock becomes

```ts
    route: vi.fn<(points: LngLat[]) => Promise<OsrmRoute>>().mockResolvedValue({ geometry: LINE, steps: [] }),
```

and the import on line 10 becomes `import type { OsrmClient, OsrmRoute, LineString } from "./osrm";`. The `LINE` fixture itself is unchanged. In the test `"falls back to a straight-line path when the OSRM geometry fails"`, the rejected mock's type parameter changes the same way (`Promise<OsrmRoute>`).

- [ ] **Step 5: Run everything to verify it passes**

Run: `npx vitest run` then `npm run lint` then `npx tsc --noEmit`

Expected: all green - the osrm tests pass with the new shape and every planRoute test still passes byte-for-byte.

- [ ] **Step 6: Commit**

```sh
git add src/lib/server/osrm.ts src/lib/server/osrm.test.ts src/lib/server/planRoute.ts src/lib/server/planRoute.test.ts
git commit -m "Parse OSRM turn steps"
```

### Task 9: Turn instructions in plain English

A pure renderer from OSRM manoeuvres to the `RouteStep` sentences both playbacks display ("Turn left onto Millbank", "At the roundabout take the second exit"). Server-side, rendered once at plan time and stored, so phones never re-derive text.

**Files:**
- Create: `dashboard/src/lib/server/instructions.ts`
- Test: `dashboard/src/lib/server/instructions.test.ts`

**Interfaces:**
- Consumes: `OsrmStep` from `@/lib/server/osrm` (Task 8); `RouteStep` from `@/lib/types` (Task 1).
- Produces: `function renderSteps(steps: OsrmStep[]): RouteStep[]` - Task 10 calls it in `planRoute.ts`.

- [ ] **Step 1: Write the failing test**

Create `dashboard/src/lib/server/instructions.test.ts`:

```ts
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
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run src/lib/server/instructions.test.ts`

Expected: FAIL with `Failed to resolve import "./instructions"`.

- [ ] **Step 3: Implement the renderer**

Create `dashboard/src/lib/server/instructions.ts`:

```ts
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
 * OSRM manoeuvres to the plain-English steps stored on the plan (spec §9).
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
```

- [ ] **Step 4: Run it to verify it passes**

Run: `npx vitest run src/lib/server/instructions.test.ts`

Expected: PASS, 4 tests. Then `npm run lint` and `npx tsc --noEmit`, clean.

- [ ] **Step 5: Commit**

```sh
git add src/lib/server/instructions.ts src/lib/server/instructions.test.ts
git commit -m "Render turn instructions in plain English"
```

### Task 10: Steps onto the plan and into the response

`PlanRouteResponse` gains `steps: RouteStep[]` (spec §5): the console's Preview drive plays a proposal that is not yet saved, so it cannot read `objective.steps` from a database row - the response must carry the same array the server stores. The field is required, so the synthetic source and the store-test fake gain `steps: []` in the same task. When the OSRM route call falls back to a straight line, `steps` is empty and the playback banner falls back to street names (Task 12).

**Files:**
- Modify: `dashboard/src/lib/types.ts:118-125` (`PlanRouteResponse`)
- Modify: `dashboard/src/lib/server/planRoute.ts:334-340` (route call), `:360` (objective insert), `:421-428` (response)
- Modify: `dashboard/src/lib/data/synthetic.ts:204-209` (synthetic response)
- Modify: `dashboard/src/lib/console/store.test.ts:20,187,204,217` (fake responses gain `steps: []`)
- Test: `dashboard/src/lib/server/planRoute.test.ts` (objective assertion, one new steps test, fallback assertion)

**Interfaces:**
- Consumes: `renderSteps` from `@/lib/server/instructions` (Task 9); `OsrmRoute` from `@/lib/server/osrm` (Task 8); `RouteStep` from `@/lib/types` (Task 1).
- Produces: `PlanRouteResponse.steps: RouteStep[]` and `objective.steps` on the saved plan - consumed by Tasks 12, 13 and by `crewPlanFromRow` (already reading it since Task 1).

- [ ] **Step 1: Extend the failing tests**

In `dashboard/src/lib/server/planRoute.test.ts`:

1. In the first test (`"plans, persists and returns the spec response"`), the `objective` assertion becomes:

```ts
    expect(plan.objective).toEqual({
      request: COUNT_REQ,
      candidate_count: 2,
      estimated: false,
      considered_all: true,
      steps: [],
    });
```

2. Add a new test after it:

```ts
  it("renders the OSRM steps, stores them on the plan and echoes them in the response", async () => {
    const { db, tables } = makeDb(baseTables());
    const osrm = makeOsrm({
      route: vi.fn<(points: LngLat[]) => Promise<OsrmRoute>>().mockResolvedValue({
        geometry: LINE,
        steps: [
          { name: "Millbank", distance: 240.4, maneuver: { type: "turn", modifier: "left", location: [-0.125, 51.494] } },
        ],
      }),
    });
    const result = await planRoute({ db, osrm }, COUNT_REQ);
    const expected = [{ instruction: "Turn left onto Millbank", lng: -0.125, lat: 51.494, distance_m: 240 }];
    expect(result.steps).toEqual(expected);
    expect((tables.route_plans[0].objective as { steps: unknown }).steps).toEqual(expected);
  });
```

3. In `"falls back to a straight-line path when the OSRM geometry fails"`, add:

```ts
    expect(plan.steps).toEqual([]);
```

- [ ] **Step 2: Run to verify the failure**

Run: `npx vitest run src/lib/server/planRoute.test.ts`

Expected: FAIL - `result.steps` is undefined and the stored `objective` has no `steps` key.

- [ ] **Step 3: Implement**

1. `dashboard/src/lib/types.ts` - add the field to the response:

```ts
export interface PlanRouteResponse {
  route_plan_id: string;
  stops: PlanRouteStop[];
  total_km: number;
  total_minutes: number;
  baseline_km: number;
  path: { type: "LineString"; coordinates: [number, number][] };
  /** Turn instructions along `path`; empty when the route fell back to a straight line. */
  steps: RouteStep[];
}
```

2. `dashboard/src/lib/server/planRoute.ts` - add the imports:

```ts
import { renderSteps } from "./instructions";
import type { PlanRouteRequest, PlanRouteResponse, PlanRouteStop, PotholeMapRow, RouteStep } from "@/lib/types";
```

Replace the route-call block (which Task 8 left reading `.geometry`):

```ts
  let line: LineString;
  let steps: RouteStep[] = [];
  try {
    const routed = await osrm.route(routePoints);
    line = routed.geometry;
    steps = renderSteps(routed.steps);
  } catch {
    line = { type: "LineString", coordinates: routePoints.map(([lng, lat]): [number, number] => [lng, lat]) };
    estimated = true;
  }
```

In the `route_plans` insert, the objective becomes:

```ts
        objective: { request: req, candidate_count: candidates.length, estimated, considered_all: consideredAll, steps },
```

And the return gains the field:

```ts
    steps,
```

3. `dashboard/src/lib/data/synthetic.ts` - the synthetic `planRoute` return gains `steps: []` (the synthetic path is straight lines between stops; an empty step list is the honest value and exercises the banner's street-name fallback):

```ts
      return {
        route_plan_id: routeId, stops,
        total_km: Math.round(sol.totalKm * 10) / 10, total_minutes: Math.round(sol.totalMin),
        baseline_km: Math.round(sol.baselineKm * 10) / 10,
        path: { type: "LineString", coordinates: coords },
        steps: [],
      };
```

4. `dashboard/src/lib/console/store.test.ts` - every fake `planRoute` response object (the `fakeDs` default on line 20 and the inline mocks on lines 187, 204 and 217) gains `steps: []` beside `path`.

- [ ] **Step 4: Run everything to verify it passes**

Run: `npx vitest run` then `npm run lint` then `npx tsc --noEmit`

Expected: all green. The required field forces every response literal in the codebase through the compiler - if tsc names a construction site this plan missed, fix it the same way (`steps: []`).

- [ ] **Step 5: Commit**

```sh
git add src/lib/types.ts src/lib/server/planRoute.ts src/lib/server/planRoute.test.ts src/lib/data/synthetic.ts src/lib/console/store.test.ts
git commit -m "Carry turn steps on the plan and its response"
```

### Task 11: Along-route maths

The pure heart of the playback (spec §9): cumulative haversine distance over the path, a point at any distance along it, and the last turn instruction at or before that distance. Steps are snapped to their nearest path vertex once, at build time.

**Files:**
- Create: `dashboard/src/lib/crew/along.ts`
- Test: `dashboard/src/lib/crew/along.test.ts`

**Interfaces:**
- Consumes: `haversineKm` from `@/lib/solver/haversine`; `RouteStep` from `@/lib/types` (Task 1).
- Produces (Tasks 12 and 13 rely on these exact names):

```ts
export interface AlongTrack {
  totalKm: number;
  pointAt(km: number): [number, number];
  stepAt(km: number): RouteStep | null;
}
export function buildTrack(coordinates: [number, number][], steps: RouteStep[]): AlongTrack;
```

- [ ] **Step 1: Write the failing test**

Create `dashboard/src/lib/crew/along.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { buildTrack } from "./along";
import type { RouteStep } from "@/lib/types";

// A straight track due north along the prime meridian: 0°, 0.5°, 1° latitude.
// One degree of latitude is about 111.2 km.
const COORDS: [number, number][] = [
  [0, 0],
  [0, 0.5],
  [0, 1],
];

const STEPS: RouteStep[] = [
  { instruction: "Head out", lng: 0, lat: 0, distance_m: 55600 },
  { instruction: "Turn left onto Test Street", lng: 0.001, lat: 0.5, distance_m: 55600 },
];

describe("buildTrack", () => {
  it("accumulates the total distance", () => {
    expect(buildTrack(COORDS, []).totalKm).toBeCloseTo(111.2, 0);
  });

  it("pointAt interpolates linearly and clamps past both ends", () => {
    const t = buildTrack(COORDS, []);
    expect(t.pointAt(0)).toEqual([0, 0]);
    const mid = t.pointAt(t.totalKm / 2);
    expect(mid[0]).toBeCloseTo(0, 9);
    expect(mid[1]).toBeCloseTo(0.5, 3);
    const quarter = t.pointAt(t.totalKm / 4);
    expect(quarter[1]).toBeCloseTo(0.25, 3);
    expect(t.pointAt(t.totalKm * 10)).toEqual([0, 1]);
    expect(t.pointAt(-5)).toEqual([0, 0]);
  });

  it("stepAt returns the last instruction at or before the distance", () => {
    const t = buildTrack(COORDS, STEPS);
    // The second step snaps to the middle vertex, about 55.6 km along.
    expect(t.stepAt(1)?.instruction).toBe("Head out");
    expect(t.stepAt(t.totalKm / 2 - 1)?.instruction).toBe("Head out");
    expect(t.stepAt(t.totalKm / 2 + 1)?.instruction).toBe("Turn left onto Test Street");
    expect(t.stepAt(t.totalKm)?.instruction).toBe("Turn left onto Test Street");
  });

  it("stepAt is null with no steps", () => {
    expect(buildTrack(COORDS, []).stepAt(50)).toBeNull();
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run src/lib/crew/along.test.ts`

Expected: FAIL with `Failed to resolve import "./along"`.

- [ ] **Step 3: Implement**

Create `dashboard/src/lib/crew/along.ts`:

```ts
import { haversineKm } from "@/lib/solver/haversine";
import type { RouteStep } from "@/lib/types";

/** A path indexed by distance: where is km 3.2, and what was the last turn before it. */
export interface AlongTrack {
  /** Full length of the path in km. */
  totalKm: number;
  /** Point on the path `km` from its start; clamps to the ends. */
  pointAt(km: number): [number, number];
  /** Last turn instruction at or before `km`; null before the first one or when there are none. */
  stepAt(km: number): RouteStep | null;
}

/**
 * Precomputes cumulative distances once (spec §9). Each step is snapped to
 * its nearest vertex here, so stepAt is a plain comparison at animation time
 * - the requestAnimationFrame loop does no geometry.
 */
export function buildTrack(coordinates: [number, number][], steps: RouteStep[]): AlongTrack {
  const cum: number[] = [0];
  for (let i = 1; i < coordinates.length; i++) {
    cum.push(cum[i - 1] + haversineKm(coordinates[i - 1], coordinates[i]));
  }
  const totalKm = cum[cum.length - 1] ?? 0;

  const snapped = steps
    .map((step) => {
      let bestIndex = 0;
      let bestKm = Infinity;
      for (let i = 0; i < coordinates.length; i++) {
        const d = haversineKm([step.lng, step.lat], coordinates[i]);
        if (d < bestKm) {
          bestKm = d;
          bestIndex = i;
        }
      }
      return { km: cum[bestIndex], step };
    })
    .sort((a, b) => a.km - b.km);

  return {
    totalKm,

    pointAt(km: number): [number, number] {
      const target = Math.max(0, Math.min(km, totalKm));
      let i = 1;
      while (i < cum.length && cum[i] < target) i++;
      if (i >= cum.length) return coordinates[coordinates.length - 1];
      const span = cum[i] - cum[i - 1];
      const t = span === 0 ? 0 : (target - cum[i - 1]) / span;
      const [ax, ay] = coordinates[i - 1];
      const [bx, by] = coordinates[i];
      return [ax + (bx - ax) * t, ay + (by - ay) * t];
    },

    stepAt(km: number): RouteStep | null {
      let last: RouteStep | null = null;
      for (const s of snapped) {
        if (s.km <= km) last = s.step;
        else break;
      }
      return last;
    },
  };
}
```

- [ ] **Step 4: Run it to verify it passes**

Run: `npx vitest run src/lib/crew/along.test.ts`

Expected: PASS, 4 tests. Then `npm run lint` and `npx tsc --noEmit`, clean.

- [ ] **Step 5: Commit**

```sh
git add src/lib/crew/along.ts src/lib/crew/along.test.ts
git commit -m "Add along-route interpolation"
```

### Task 12: Playback clock and the crew Preview drive

The theatrical playback (spec §9): a marker drives the route in compressed time, the header counts down real minutes, and the banner changes as snapped turns pass. The timing arithmetic is pure and tested; the `requestAnimationFrame` hook is deliberately thin (it owns time and nothing else); the crew UI is manual-verified. `prefers-reduced-motion` replaces the moving marker with a stepped highlight through the stop list.

**Files:**
- Create: `dashboard/src/lib/crew/playback.ts`
- Test: `dashboard/src/lib/crew/playback.test.ts`
- Create: `dashboard/src/components/crew/usePlayback.ts`
- Modify: `dashboard/src/components/crew/CrewRoute.tsx` (Preview drive button, marker, banner, reduced-motion path)

**Interfaces:**
- Consumes: `buildTrack`, `AlongTrack` from `@/lib/crew/along` (Task 11); `RouteStep` from `@/lib/types`; `CrewPlan` from `@/lib/crew/plan`; `DriveMap`'s `children` / `overlay` slots (Task 3).
- Produces (Task 13 mounts the same hook on the console):

```ts
// @/lib/crew/playback
export function playbackDurationSec(totalMinutes: number): number;
export function minutesLeft(totalMinutes: number, km: number, totalKm: number): number;

// @/components/crew/usePlayback
export interface Playback {
  playing: boolean;
  km: number;
  position: [number, number];
  step: RouteStep | null;
  minutesLeft: number;
  play(): void;
  pause(): void;
  reset(): void;
}
export function usePlayback(track: AlongTrack, totalMinutes: number): Playback;
```

- [ ] **Step 1: Write the failing timing test**

Create `dashboard/src/lib/crew/playback.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { minutesLeft, playbackDurationSec } from "./playback";

describe("playbackDurationSec", () => {
  it("compresses a working day to about 30 seconds", () => {
    expect(playbackDurationSec(480)).toBe(30);
    expect(playbackDurationSec(60)).toBe(30);
  });
  it("plays a mid-length route proportionally faster", () => {
    expect(playbackDurationSec(40)).toBe(20);
  });
  it("never lets a short route flash by in under 8 seconds", () => {
    expect(playbackDurationSec(2)).toBe(8);
    expect(playbackDurationSec(0)).toBe(8);
  });
});

describe("minutesLeft", () => {
  it("scales real minutes by the fraction of the route remaining", () => {
    expect(minutesLeft(70, 0, 10)).toBe(70);
    expect(minutesLeft(70, 5, 10)).toBe(35);
    expect(minutesLeft(70, 10, 10)).toBe(0);
  });
  it("never goes negative and treats a zero-length route as finished", () => {
    expect(minutesLeft(70, 11, 10)).toBe(0);
    expect(minutesLeft(70, 0, 0)).toBe(0);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run src/lib/crew/playback.test.ts`

Expected: FAIL with `Failed to resolve import "./playback"`.

- [ ] **Step 3: Implement the timing module**

Create `dashboard/src/lib/crew/playback.ts`:

```ts
/**
 * Seconds the compressed playback runs (spec §9): a route plays in about 30
 * seconds, and the rate is capped so a 2-minute route does not flash by in
 * under 8 seconds. Half a second of playback per real minute, clamped.
 */
export function playbackDurationSec(totalMinutes: number): number {
  return Math.max(8, Math.min(30, totalMinutes * 0.5));
}

/** Real driving minutes left at `km` along a `totalKm` route of `totalMinutes`. */
export function minutesLeft(totalMinutes: number, km: number, totalKm: number): number {
  if (totalKm <= 0) return 0;
  return Math.max(0, totalMinutes * (1 - km / totalKm));
}
```

Run: `npx vitest run src/lib/crew/playback.test.ts` - PASS, 5 tests.

- [ ] **Step 4: Create the animation clock**

Create `dashboard/src/components/crew/usePlayback.ts`:

```ts
"use client";

import { useEffect, useRef, useState } from "react";
import type { AlongTrack } from "@/lib/crew/along";
import { minutesLeft, playbackDurationSec } from "@/lib/crew/playback";
import type { RouteStep } from "@/lib/types";

export interface Playback {
  playing: boolean;
  km: number;
  position: [number, number];
  step: RouteStep | null;
  minutesLeft: number;
  play(): void;
  pause(): void;
  reset(): void;
}

/**
 * The animation clock (spec §9): a requestAnimationFrame loop advancing km at
 * the compressed speed. Every route question is answered by the track, every
 * timing question by playback.ts - this hook owns time and nothing else, and
 * knows nothing about either screen's store.
 */
export function usePlayback(track: AlongTrack, totalMinutes: number): Playback {
  const [playing, setPlaying] = useState(false);
  const [km, setKm] = useState(0);
  const frame = useRef<number | null>(null);
  const last = useRef<number | null>(null);

  useEffect(() => {
    if (!playing) return;
    const speedKmPerSec = track.totalKm / playbackDurationSec(totalMinutes);
    const tick = (now: number) => {
      const dt = last.current === null ? 0 : (now - last.current) / 1000;
      last.current = now;
      setKm((k) => {
        const next = Math.min(track.totalKm, k + speedKmPerSec * dt);
        if (next >= track.totalKm) setPlaying(false);
        return next;
      });
      frame.current = requestAnimationFrame(tick);
    };
    frame.current = requestAnimationFrame(tick);
    return () => {
      if (frame.current !== null) cancelAnimationFrame(frame.current);
      frame.current = null;
      last.current = null;
    };
  }, [playing, track, totalMinutes]);

  return {
    playing,
    km,
    position: track.pointAt(km),
    step: track.stepAt(km),
    minutesLeft: minutesLeft(totalMinutes, km, track.totalKm),
    play() {
      // Replay from the start when the last run finished.
      if (km >= track.totalKm && track.totalKm > 0) setKm(0);
      setPlaying(true);
    },
    pause() {
      setPlaying(false);
    },
    reset() {
      setPlaying(false);
      setKm(0);
    },
  };
}
```

- [ ] **Step 5: Wire the preview into the crew page**

In `dashboard/src/components/crew/CrewRoute.tsx`:

1. Add imports:

```tsx
import { useEffect, useMemo, useState } from "react";
import { Marker } from "react-map-gl/maplibre";
import { buildTrack } from "@/lib/crew/along";
import { usePlayback } from "./usePlayback";
```

2. Inside the component, build the track and the clock, and detect reduced motion:

```tsx
  const track = useMemo(() => buildTrack(plan.path, plan.steps), [plan.path, plan.steps]);
  const playback = usePlayback(track, plan.total_minutes ?? 0);
  const reducedMotion =
    typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  // Reduced motion: no moving marker; instead a highlight steps through the
  // stop list, one stop per second, using the same play/pause state.
  const [steppedIndex, setSteppedIndex] = useState<number | null>(null);
  useEffect(() => {
    if (!reducedMotion || steppedIndex === null) return;
    if (steppedIndex >= plan.stops.length) {
      setSteppedIndex(null);
      return;
    }
    const timer = setTimeout(() => setSteppedIndex(steppedIndex + 1), 1000);
    return () => clearTimeout(timer);
  }, [reducedMotion, steppedIndex, plan.stops.length]);

  const previewActive = reducedMotion ? steppedIndex !== null : playback.km > 0;
  const togglePreview = () => {
    if (reducedMotion) {
      setSteppedIndex(steppedIndex === null ? 0 : null);
      return;
    }
    if (playback.playing) playback.pause();
    else playback.play();
  };
```

3. Add the button to the header (after the totals paragraph):

```tsx
        <button
          type="button"
          className="btn btn-secondary btn-sm"
          style={{ marginTop: "var(--s2)" }}
          onClick={togglePreview}
        >
          {reducedMotion
            ? steppedIndex === null ? "Preview drive" : "Stop preview"
            : playback.playing ? "Pause preview" : playback.km > 0 ? "Replay preview" : "Preview drive"}
        </button>
```

4. Compute the banner's fallback line (the straight-line fallback and the synthetic source both carry no steps, so the banner names the next stop instead of a turn):

```tsx
  const nextUndone = plan.stops.find((s) => statuses[s.work_order_id] !== "done");
  const fallbackLine = nextUndone
    ? `Next stop: ${nextUndone.road_name ?? `${nextUndone.lat.toFixed(4)}, ${nextUndone.lng.toFixed(4)}`}`
    : "All stops done";
```

5. Hand the marker and banner to the map (replace `<DriveMap plan={plan} />`):

```tsx
      <DriveMap
        plan={plan}
        overlay={
          !reducedMotion && previewActive ? (
            <div
              style={{
                position: "absolute", top: "var(--s3)", left: "50%", transform: "translateX(-50%)",
                zIndex: 60, padding: "var(--s2) var(--s4)", maxWidth: "90%",
                background: "var(--surface)", border: "1px solid var(--rule)",
                borderRadius: "var(--r-md)", boxShadow: "var(--shadow-2)", textAlign: "center",
              }}
            >
              <p className="data" style={{ margin: 0, fontSize: "var(--t-small)", fontWeight: 600 }}>
                about {Math.ceil(playback.minutesLeft)} min left
              </p>
              <p style={{ margin: 0, fontSize: "var(--t-small)" }}>
                {playback.step?.instruction ?? fallbackLine}
              </p>
            </div>
          ) : undefined
        }
      >
        {!reducedMotion && previewActive && (
          <Marker longitude={playback.position[0]} latitude={playback.position[1]} anchor="center" style={{ zIndex: 60 }}>
            <div
              aria-label="Preview vehicle"
              style={{
                width: 14, height: 14, borderRadius: "var(--r-full)",
                background: "var(--committed)", border: "2px solid var(--surface)",
                boxShadow: "var(--shadow-1)",
              }}
            />
          </Marker>
        )}
      </DriveMap>
```

6. When reduced motion is stepping, highlight the stepped stop in the list: pass `currentId={reducedMotion && steppedIndex !== null ? plan.stops[steppedIndex]?.work_order_id ?? null : current?.work_order_id ?? null}` to `StopList`.

- [ ] **Step 6: Lint and typecheck**

Run: `npx vitest run`, `npm run lint`, `npx tsc --noEmit` - all clean.

- [ ] **Step 7: Manual verification**

`npm run dev`, with a dispatched plan whose route came from real OSRM (plan while online):

1. Open `/route/{id}`, press "Preview drive". The green dot leaves the start marker and follows the route line - through its curves, not cutting corners.
2. The banner counts down in real minutes ("about 70 min left" shrinking), and the instruction changes as the dot passes turns ("Turn left onto …" with real street names). The whole run takes about 30 seconds; a one-stop plan takes at least 8 seconds.
3. Pause holds the dot; the button then offers resume; after the run ends, "Replay preview" restarts from the depot.
4. Turn on reduced motion (devtools rendering emulation): no moving dot; the stop list highlight steps down one stop per second instead.
5. Plan a route while offline from OSRM (or use the synthetic source): the banner shows "Next stop: {street}" instead of turn text - the playback still runs along the straight path.

- [ ] **Step 8: Commit**

```sh
git add src/lib/crew/playback.ts src/lib/crew/playback.test.ts src/components/crew/usePlayback.ts src/components/crew/CrewRoute.tsx
git commit -m "Add the drive playback to the crew page"
```

### Task 13: Preview drive on the console

The owner's decision (spec §6, §9): the sheet's summary gains a "Preview drive" button that plays the proposed route on the console map - marker, countdown, next instruction; no follow mode, no stop cards. The preview reads the `PlanRouteResponse` already in the store (`path`, totals, `steps`), because the plan is not saved to a crew's phone yet. Pressing it closes the sheet so the map is visible; a Stop preview control reopens it. Dispatching, discarding or replanning stops the playback - those transitions live in the store and are tested.

**Files:**
- Modify: `dashboard/src/lib/console/store.ts` (state `previewDrive`, action `setPreviewDrive`; cleared in `planRoute`, `resetPlan`, `dispatch`)
- Test: `dashboard/src/lib/console/store.test.ts`
- Create: `dashboard/src/components/console/map/PreviewDriveLayer.tsx`
- Modify: `dashboard/src/components/console/map/MapLayers.tsx` (mount the layer)
- Modify: `dashboard/src/components/DispatchSheet.tsx` (the button beside the totals)

**Interfaces:**
- Consumes: `buildTrack` from `@/lib/crew/along` (Task 11); `usePlayback` from `@/components/crew/usePlayback` (Task 12); `plan.steps` on the response (Task 10); `readToken`, `MAP_FALLBACK` from `@/lib/map/tokens`.
- Produces: store fields `previewDrive: boolean` and `setPreviewDrive(on: boolean): void`; component `PreviewDriveLayer`. Task 21 leaves all of this untouched.

- [ ] **Step 1: Write the failing store test**

Add to `dashboard/src/lib/console/store.test.ts`:

```ts
  it("preview drive stops on replan, discard and dispatch", async () => {
    const ds = fakeDs();
    const s = createConsoleStore();
    s.getState().setDataSource(ds);
    s.getState().setCrews([{ id: "c1", authority_id: "x", name: "Crew A", shift_minutes: 480, repairs_per_shift: 12 }]);
    s.getState().upsertPothole(base);
    s.getState().toggleSelected("a");

    expect(s.getState().previewDrive).toBe(false);
    await s.getState().planRoute();
    s.getState().setPreviewDrive(true);

    // Replanning proposes a different route; the old playback must not keep driving it.
    s.getState().toggleSelected("a");
    await s.getState().planRoute();
    expect(s.getState().previewDrive).toBe(false);

    s.getState().setPreviewDrive(true);
    await s.getState().dispatch(["crew@example.com"]);
    expect(s.getState().previewDrive).toBe(false);

    s.getState().setPreviewDrive(true);
    s.getState().resetPlan();
    expect(s.getState().previewDrive).toBe(false);
  });
```

- [ ] **Step 2: Run to verify the failure**

Run: `npx vitest run src/lib/console/store.test.ts`

Expected: FAIL - `previewDrive` is undefined and `setPreviewDrive` is not a function.

- [ ] **Step 3: Implement the store slice**

In `dashboard/src/lib/console/store.ts`:

1. `ConsoleState` gains, next to `planState`:

```ts
  /** The proposed route is playing on the map (Preview drive). */
  previewDrive: boolean;
```

2. `ConsoleActions` gains:

```ts
  setPreviewDrive(on: boolean): void;
```

3. Initial state gains `previewDrive: false`.
4. Implementation beside the other setters:

```ts
      setPreviewDrive(previewDrive) { set({ previewDrive }); },
```

5. `planRoute()` adds `previewDrive: false` to its `set({ planState: "planning", … })` call; `resetPlan()` adds `previewDrive: false` to its reset object; `dispatch()` adds `previewDrive: false` to its `set({ dispatchState: "sending", … })` call.

Run: `npx vitest run src/lib/console/store.test.ts` - PASS.

- [ ] **Step 4: Create the console layer**

Create `dashboard/src/components/console/map/PreviewDriveLayer.tsx`:

```tsx
"use client";

import { useEffect, useMemo } from "react";
import { Marker } from "react-map-gl/maplibre";
import { useConsole } from "@/lib/console/store";
import { buildTrack } from "@/lib/crew/along";
import { usePlayback } from "@/components/crew/usePlayback";
import type { RouteStep } from "@/lib/types";

/**
 * The console's mount of the crew playback (spec §9): same hook, same track,
 * different store. Deliberately smaller than the crew page - marker,
 * countdown and instruction only; the dispatcher is reading a proposal, not
 * driving it.
 */
export function PreviewDriveLayer() {
  const plan = useConsole((s) => s.plan);
  const previewDrive = useConsole((s) => s.previewDrive);
  if (!plan || !previewDrive) return null;
  return (
    <PreviewDrive
      path={plan.path.coordinates}
      steps={plan.steps}
      totalMinutes={plan.total_minutes}
    />
  );
}

function PreviewDrive({
  path,
  steps,
  totalMinutes,
}: {
  path: [number, number][];
  steps: RouteStep[];
  totalMinutes: number;
}) {
  const setPreviewDrive = useConsole((s) => s.setPreviewDrive);
  const setSheetOpen = useConsole((s) => s.setSheetOpen);
  const track = useMemo(() => buildTrack(path, steps), [path, steps]);
  const playback = usePlayback(track, totalMinutes);
  const reducedMotion =
    typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  // Autoplay on mount: the layer only exists while previewDrive is true.
  const { play } = playback;
  useEffect(() => {
    if (!reducedMotion) play();
    // play is stable per mount; run once.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const stop = () => {
    setPreviewDrive(false);
    setSheetOpen(true);
  };

  return (
    <>
      {!reducedMotion && (
        <Marker longitude={playback.position[0]} latitude={playback.position[1]} anchor="center" style={{ zIndex: 60 }}>
          <div
            aria-label="Preview vehicle"
            style={{
              width: 14, height: 14, borderRadius: "var(--r-full)",
              background: "var(--action)", border: "2px solid var(--surface)",
              boxShadow: "var(--shadow-1)",
            }}
          />
        </Marker>
      )}
      <div
        style={{
          position: "absolute", top: "var(--s4)", left: "50%", transform: "translateX(-50%)",
          zIndex: 70, display: "flex", alignItems: "center", gap: "var(--s3)",
          padding: "var(--s2) var(--s4)", background: "var(--surface)",
          border: "1px solid var(--rule)", borderRadius: "var(--r-md)", boxShadow: "var(--shadow-2)",
        }}
      >
        <span className="data" style={{ fontSize: "var(--t-small)", fontWeight: 600 }}>
          about {Math.ceil(playback.minutesLeft)} min left
        </span>
        <span style={{ fontSize: "var(--t-small)" }}>
          {reducedMotion
            ? "Motion is reduced. The route and its stops are shown without animation."
            : playback.step?.instruction ?? "Following the route"}
        </span>
        <button type="button" className="btn btn-quiet btn-sm" onClick={stop}>
          Stop preview
        </button>
      </div>
    </>
  );
}
```

- [ ] **Step 5: Mount it and add the button**

1. `dashboard/src/components/console/map/MapLayers.tsx` - import and mount after `<RouteLayer />`:

```tsx
import { PreviewDriveLayer } from "./PreviewDriveLayer";
```

```tsx
      <RouteLayer />
      <PreviewDriveLayer />
```

2. `dashboard/src/components/DispatchSheet.tsx` - add the selector beside the others:

```tsx
  const setPreviewDrive = useConsole((s) => s.setPreviewDrive);
```

In the `planned && (…)` totals block, put the button beside the km / minutes line (wrap the existing two spans and the button in one flex row):

```tsx
                  <div style={{ display: "flex", alignItems: "baseline", gap: "var(--s3)" }}>
                    <span className="data" style={{ fontSize: "var(--t-metric)", fontWeight: 600, lineHeight: 1 }}>
                      {km(planned.total_km)}
                    </span>
                    <span className="data secondary" style={{ fontSize: "var(--t-small)" }}>
                      {minutes(planned.total_minutes)}
                    </span>
                    <button
                      type="button"
                      className="btn btn-secondary btn-sm"
                      style={{ marginLeft: "auto" }}
                      onClick={() => {
                        setPreviewDrive(true);
                        setSheetOpen(false);
                      }}
                    >
                      Preview drive
                    </button>
                  </div>
```

- [ ] **Step 6: Lint, typecheck, verify manually**

Run: `npx vitest run`, `npm run lint`, `npx tsc --noEmit` - all clean.

`npm run dev`:

1. Plan a route, press "Preview drive" in the sheet. The sheet closes; a blue dot drives the proposed (blue) route; the banner counts down and shows turn instructions (with real OSRM steps) or "Following the route" (synthetic).
2. "Stop preview" halts it and reopens the sheet with the plan intact.
3. Preview again, then Discard plan from the sheet: the dot and banner disappear (store transition).
4. Preview, replan with a different selection: the old playback is gone before the new plan arrives.
5. Reduced motion: no dot; the banner states motion is reduced; Stop preview still works.

- [ ] **Step 7: Commit**

```sh
git add src/lib/console/store.ts src/lib/console/store.test.ts src/components/console/map/PreviewDriveLayer.tsx src/components/console/map/MapLayers.tsx src/components/DispatchSheet.tsx
git commit -m "Add Preview drive to the console"
```

### Task 14: Crew follow mode

The one place geolocation exists in the product (spec §7): requested only when the driver taps "Follow my position", never on load. Granted, `watchPosition` drives a dot with a heading wedge; the camera follows until the driver pans; a Re-centre button restores it. Denied, or the fix more than 2 km from the route, the page stays a fully usable list-and-map with a one-line notice. The geometry (bearing, distance to route) is pure and tested; the sensor wiring is manual-verified.

**Files:**
- Create: `dashboard/src/lib/crew/geo.ts`
- Test: `dashboard/src/lib/crew/geo.test.ts`
- Modify: `dashboard/src/components/crew/CrewRoute.tsx` (follow state, watch wiring, dot, notices, Re-centre)

**Interfaces:**
- Consumes: `haversineKm` from `@/lib/solver/haversine`; `DriveMap`'s `children` / `overlay` / `onUserPan` (Task 3); `useMap` from react-map-gl for the camera.
- Produces: `function bearingDeg(a: [number, number], b: [number, number]): number` (0 to 360, 0 = north) and `function minDistanceKm(point: [number, number], coordinates: [number, number][]): number` in `@/lib/crew/geo`. No later task consumes them.

- [ ] **Step 1: Write the failing geometry test**

Create `dashboard/src/lib/crew/geo.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { bearingDeg, minDistanceKm } from "./geo";

describe("bearingDeg", () => {
  it("is 0 due north, 90 due east, 180 due south, 270 due west", () => {
    expect(bearingDeg([0, 0], [0, 1])).toBeCloseTo(0, 5);
    expect(bearingDeg([0, 0], [1, 0])).toBeCloseTo(90, 5);
    expect(bearingDeg([0, 1], [0, 0])).toBeCloseTo(180, 5);
    expect(bearingDeg([1, 0], [0, 0])).toBeCloseTo(270, 5);
  });
});

describe("minDistanceKm", () => {
  const route: [number, number][] = [
    [0, 0],
    [0, 0.5],
    [0, 1],
  ];
  it("is near zero on the route and about 111 km one degree of longitude away", () => {
    expect(minDistanceKm([0, 0.5], route)).toBeCloseTo(0, 5);
    expect(minDistanceKm([1, 0.5], route)).toBeCloseTo(111.2, 0);
  });
  it("is Infinity for an empty route", () => {
    expect(minDistanceKm([0, 0], [])).toBe(Infinity);
  });
});
```

- [ ] **Step 2: Run to verify the failure**

Run: `npx vitest run src/lib/crew/geo.test.ts`

Expected: FAIL with `Failed to resolve import "./geo"`.

- [ ] **Step 3: Implement the geometry**

Create `dashboard/src/lib/crew/geo.ts`:

```ts
import { haversineKm } from "@/lib/solver/haversine";

/**
 * Initial bearing from a to b, degrees clockwise from north, in [0, 360).
 * Used for the heading wedge when the device reports no heading of its own.
 */
export function bearingDeg(a: [number, number], b: [number, number]): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const lng1 = toRad(a[0]);
  const lat1 = toRad(a[1]);
  const lng2 = toRad(b[0]);
  const lat2 = toRad(b[1]);
  const y = Math.sin(lng2 - lng1) * Math.cos(lat2);
  const x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(lng2 - lng1);
  return ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;
}

/**
 * Straight-line distance from a point to the nearest vertex of the path.
 * Vertex distance, not segment distance: OSRM paths have a vertex every few
 * tens of metres, which is precision to spare for a 2 km guard.
 */
export function minDistanceKm(point: [number, number], coordinates: [number, number][]): number {
  let best = Infinity;
  for (const c of coordinates) best = Math.min(best, haversineKm(point, c));
  return best;
}
```

Run: `npx vitest run src/lib/crew/geo.test.ts` - PASS, 3 tests.

- [ ] **Step 4: Wire the sensor into the crew shell**

In `dashboard/src/components/crew/CrewRoute.tsx`:

1. Add imports:

```tsx
import { useRef } from "react";
import { bearingDeg, minDistanceKm } from "@/lib/crew/geo";
```

2. Add the follow state and wiring inside the component:

```tsx
  type Follow = "off" | "on" | "paused" | "denied" | "far";
  const [follow, setFollow] = useState<Follow>("off");
  const [fix, setFix] = useState<{ lng: number; lat: number; headingDeg: number | null } | null>(null);
  const [farKm, setFarKm] = useState<number | null>(null);
  const watchId = useRef<number | null>(null);
  const lastFix = useRef<[number, number] | null>(null);

  const stopWatch = () => {
    if (watchId.current !== null) navigator.geolocation.clearWatch(watchId.current);
    watchId.current = null;
  };
  useEffect(() => stopWatch, []);

  const startFollow = () => {
    // Requested only on the tap, never on load: a permission prompt on open
    // would fire during the pitch's screen-share at the worst moment.
    if (!("geolocation" in navigator)) {
      setFollow("denied");
      return;
    }
    watchId.current = navigator.geolocation.watchPosition(
      (pos) => {
        const here: [number, number] = [pos.coords.longitude, pos.coords.latitude];
        const away = minDistanceKm(here, plan.path);
        const heading =
          typeof pos.coords.heading === "number" && !Number.isNaN(pos.coords.heading)
            ? pos.coords.heading
            : lastFix.current
              ? bearingDeg(lastFix.current, here)
              : null;
        lastFix.current = here;
        setFix({ lng: here[0], lat: here[1], headingDeg: heading });
        if (away > 2) {
          setFarKm(haversineKm(here, [plan.stops[0].lng, plan.stops[0].lat]));
          setFollow("far");
        } else {
          setFarKm(null);
          setFollow((f) => (f === "paused" ? "paused" : "on"));
        }
      },
      () => {
        stopWatch();
        setFollow("denied");
      },
      { enableHighAccuracy: true },
    );
  };
```

Also add `import { haversineKm } from "@/lib/solver/haversine";` for the first-stop distance.

3. Buttons in the header, beside the preview button:

```tsx
        {follow === "off" || follow === "denied" ? (
          <button type="button" className="btn btn-secondary btn-sm" style={{ marginTop: "var(--s2)", marginLeft: "var(--s2)" }} onClick={startFollow}>
            Follow my position
          </button>
        ) : follow === "paused" ? (
          <button type="button" className="btn btn-secondary btn-sm" style={{ marginTop: "var(--s2)", marginLeft: "var(--s2)" }} onClick={() => setFollow("on")}>
            Re-centre
          </button>
        ) : null}
```

4. Notices under the header (one plain sentence, not an error):

```tsx
        {follow === "denied" && (
          <p className="secondary" style={{ margin: "var(--s1) 0 0", fontSize: "var(--t-small)" }}>
            Location is off. Stops are shown in driving order.
          </p>
        )}
        {follow === "far" && farKm !== null && (
          <p className="secondary" style={{ margin: "var(--s1) 0 0", fontSize: "var(--t-small)" }}>
            You are <span className="data">{farKm.toFixed(1)} km</span> from the first stop. Use the stop's Google Maps link for the first leg.
          </p>
        )}
```

5. The dot with its heading wedge, inside `DriveMap` (beside the preview marker), plus camera-follow and pan-breaks-follow:

```tsx
        {fix && follow !== "denied" && (
          <Marker longitude={fix.lng} latitude={fix.lat} anchor="center" style={{ zIndex: 65 }}>
            <div style={{ position: "relative", width: 16, height: 16 }} aria-label="Your position">
              {fix.headingDeg !== null && (
                <svg
                  width="16" height="16" viewBox="0 0 16 16" aria-hidden
                  style={{ position: "absolute", inset: 0, transform: `rotate(${fix.headingDeg}deg)` }}
                >
                  <path d="M8 0 L11 6 L5 6 Z" fill="var(--action)" />
                </svg>
              )}
              <div
                style={{
                  position: "absolute", inset: 3, borderRadius: "var(--r-full)",
                  background: "var(--action)", border: "2px solid var(--surface)",
                }}
              />
            </div>
          </Marker>
        )}
        <FollowCamera target={follow === "on" && fix ? [fix.lng, fix.lat] : null} />
```

Pass `onUserPan={() => setFollow((f) => (f === "on" ? "paused" : f))}` to `DriveMap`. Add the small camera component at the bottom of `CrewRoute.tsx`:

```tsx
function FollowCamera({ target }: { target: [number, number] | null }) {
  const { current: map } = useMap();
  useEffect(() => {
    if (map && target) map.panTo(target, { duration: 500 });
  }, [map, target]);
  return null;
}
```

with `import { Marker, useMap } from "react-map-gl/maplibre";` replacing the plain Marker import.

- [ ] **Step 5: Lint and typecheck**

Run: `npx vitest run`, `npm run lint`, `npx tsc --noEmit` - all clean.

- [ ] **Step 6: Manual verification**

Geolocation needs a secure context: it works on `http://localhost:3000` on the dev machine, and on a phone only over the deployed https URL (a LAN IP gets the denied path automatically - that is designed behaviour, not a bug).

1. `npm run dev`, open `/route/{id}`, press "Follow my position", allow. With devtools sensor emulation set to a coordinate on the route: the blue dot appears, the map centres on it.
2. Change the emulated position along the route: the dot moves, the wedge points from the old fix towards the new one.
3. Pan the map by hand: the camera stops following; "Re-centre" appears and restores follow.
4. Deny permission (or emulate "location unavailable"): the page keeps the map and list; the sentence "Location is off. Stops are shown in driving order." appears; nothing else changes.
5. Emulate a position more than 2 km from the route: no auto-follow, and the "You are N.n km from the first stop" sentence appears with one decimal and a unit.

- [ ] **Step 7: Commit**

```sh
git add src/lib/crew/geo.ts src/lib/crew/geo.test.ts src/components/crew/CrewRoute.tsx
git commit -m "Add the crew follow mode"
```

---

**Cut line (spec §12).** Everything above this line is what the 2-minute pitch can show. Everything below is the invisible infrastructure the owner chose with eyes open: nothing above depends on it, the demo's fast path is the depot loop the contract already speaks, and stopping here leaves no stub visible on stage. Tasks 15 to 21 must land in order.

### Task 15: Open routes in the solver

The hardest piece (spec §4): the solver assumes a closed tour anchored at matrix index 0 in four places (`tourKm`, `tourMin`, `marginalMin`, `twoOpt`). Each gains an end index defaulting to 0, so the closed case stays byte-for-byte today's behaviour - the regression pin proves it against the existing fixtures. 2-opt on an open path is the standard path variant of the move: only the two boundary edges differ, which is exactly what the delta already computes. The known 2-opt approximation on asymmetric durations is pre-existing and deliberately not fixed here.

**Files:**
- Modify: `dashboard/src/lib/solver/heuristic.ts:4-9` (`Constraints`), `:31-50` (`tourKm`, `tourMin`, `marginalMin`), `:62-80` (`twoOpt`), `:82-129` (`solve`)
- Test: `dashboard/src/lib/solver/heuristic.test.ts`

**Interfaces:**
- Consumes: nothing new.
- Produces (Task 18 relies on these exact signatures):

```ts
export interface Constraints {
  mode: "manual" | "count" | "time";
  maxStops?: number;
  timeBudgetMin?: number;
  serviceMin: number;
  /** Matrix index the tour finishes at. 0 (the start) keeps today's closed loop. */
  endIndex?: number;
}
export function tourKm(order: number[], m: Matrix, end?: number): number;
export function tourMin(order: number[], m: Matrix, serviceMin: number, end?: number): number;
export function twoOpt(order: number[], m: Matrix, cost?: number[][], end?: number): number[];
// solve(candidates, m, c) reads c.endIndex ?? 0 and threads it everywhere.
```

- [ ] **Step 1: Write the failing tests**

Add to `dashboard/src/lib/solver/heuristic.test.ts`, after the existing fixtures (`pts`, `m`, `cands` stay untouched):

```ts
// The same square plus an end anchor 1.1 km east of the depot, at matrix
// index 5. Candidates keep indices 0..3 (matrix 1..4).
const ptsOpen: [number, number][] = [...pts, [0.01, 0]];
const mOpen: Matrix = buildMatrix(ptsOpen, 30);
const END = 5;

describe("open routes (endIndex)", () => {
  it("tourKm and tourMin charge the leg to the end anchor, not a return to the start", () => {
    expect(tourKm([0], mOpen, END)).toBeCloseTo(mOpen.distanceKm[0][1] + mOpen.distanceKm[1][END], 9);
    expect(tourMin([0], mOpen, 20, END)).toBeCloseTo(
      mOpen.durationMin[0][1] + mOpen.durationMin[1][END] + 20, 9,
    );
  });

  it("endIndex 0 and endIndex omitted both reproduce today's closed tour exactly", () => {
    const closed = solve(cands, m, { mode: "manual", serviceMin: 20 });
    const explicit = solve(cands, m, { mode: "manual", serviceMin: 20, endIndex: 0 });
    expect(explicit).toEqual(closed);
    expect(tourKm([0, 1, 2, 3], m, 0)).toBeCloseTo(tourKm([0, 1, 2, 3], m), 9);
    expect(tourMin([0, 1, 2, 3], m, 20, 0)).toBeCloseTo(tourMin([0, 1, 2, 3], m, 20), 9);
  });

  it("a time budget respects the leg to the end anchor", () => {
    const s = solve(cands, mOpen, { mode: "time", timeBudgetMin: 50, serviceMin: 20, endIndex: END });
    expect(s.order.length).toBeGreaterThan(0);
    expect(s.totalMin).toBeLessThanOrEqual(50);
    // The reported total is the open-path total, end leg included.
    expect(s.totalMin).toBeCloseTo(tourMin(s.order, mOpen, 20, END), 9);
    expect(s.totalKm).toBeCloseTo(tourKm(s.order, mOpen, END), 9);
  });

  it("2-opt uncrosses a deliberately crossed open path", () => {
    const crossed = [0, 1, 2, 3]; // nw, se, ne, sw crosses itself
    const result = twoOpt(crossed, mOpen, mOpen.durationMin, END);
    expect([...result].sort()).toEqual([0, 1, 2, 3]);
    expect(tourKm(result, mOpen, END)).toBeLessThan(tourKm(crossed, mOpen, END));
  });

  it("the baseline uses the same end, so the percent-shorter figure stays honest", () => {
    const s = solve(cands, mOpen, { mode: "manual", serviceMin: 0, endIndex: END });
    const chosen = [0, 1, 2, 3]; // priority order
    expect(s.baselineKm).toBeCloseTo(tourKm(chosen, mOpen, END), 9);
    expect(s.totalKm).toBeLessThanOrEqual(s.baselineKm + 1e-9);
  });
});
```

- [ ] **Step 2: Run to verify the failure**

Run: `npx vitest run src/lib/solver/heuristic.test.ts`

Expected: FAIL - `tourKm([0], mOpen, END)` still measures the return to index 0, and `solve` ignores `endIndex` (assertions on the end leg miss).

- [ ] **Step 3: Implement**

In `dashboard/src/lib/solver/heuristic.ts`:

1. `Constraints` gains the field (exact shape in the Interfaces block above).

2. The four cost sites take the end index, defaulting to 0:

```ts
export function tourKm(order: number[], m: Matrix, end = 0): number {
  if (order.length === 0) return 0;
  let km = m.distanceKm[0][mi(order[0])];
  for (let k = 0; k + 1 < order.length; k++) km += m.distanceKm[mi(order[k])][mi(order[k + 1])];
  return km + m.distanceKm[mi(order[order.length - 1])][end];   // was [0]
}

export function tourMin(order: number[], m: Matrix, serviceMin: number, end = 0): number {
  if (order.length === 0) return 0;
  let min = m.durationMin[0][mi(order[0])];
  for (let k = 0; k + 1 < order.length; k++) min += m.durationMin[mi(order[k])][mi(order[k + 1])];
  return min + m.durationMin[mi(order[order.length - 1])][end] + serviceMin * order.length;   // was [0]
}

/** Extra minutes from inserting candidate c between positions pos-1 and pos of `order`. */
function marginalMin(order: number[], c: number, pos: number, m: Matrix, serviceMin: number, end = 0): number {
  const prev = pos === 0 ? 0 : mi(order[pos - 1]);
  const next = pos === order.length ? end : mi(order[pos]);   // was 0
  return m.durationMin[prev][mi(c)] + m.durationMin[mi(c)][next] - m.durationMin[prev][next] + serviceMin;
}
```

3. `twoOpt` gains the end parameter after `cost` (the existing doc comment stays; only the boundary line changes):

```ts
export function twoOpt(order: number[], m: Matrix, cost: number[][] = m.durationMin, end = 0): number[] {
```

and inside the loop:

```ts
        const c = mi(o[j]), d = j === o.length - 1 ? end : mi(o[j + 1]);   // was 0
```

4. `solve` threads it through every call:

```ts
export function solve(candidates: Candidate[], m: Matrix, c: Constraints): Solution {
  const end = c.endIndex ?? 0;
```

- `marginalMin(order, i, pos, m, c.serviceMin, end)` in the insertion scan,
- `tourMin(trial, m, c.serviceMin, end)` in the time-budget check,
- `order = twoOpt(order, m, m.durationMin, end);`
- and the return:

```ts
  return {
    order,
    totalMin: tourMin(order, m, c.serviceMin, end),
    totalKm: tourKm(order, m, end),
    baselineKm: tourKm(chosen, m, end),
    skipped,
  };
```

- [ ] **Step 4: Run everything to verify it passes**

Run: `npx vitest run` then `npm run lint` then `npx tsc --noEmit`

Expected: all green. Every pre-existing heuristic test passes untouched - that, plus the explicit `endIndex: 0` pin, is the guarantee the closed case did not move.

- [ ] **Step 5: Commit**

```sh
git add src/lib/solver/heuristic.ts src/lib/solver/heuristic.test.ts
git commit -m "Support open routes in the solver"
```

### Task 16: Anchor ids in the request contract

The wire request gains `start_pothole_id` and `end_pothole_id` (spec §5). There is no coordinate anywhere in the request: the client names a pothole by id or stays silent, and the server resolves. Validation grows exactly two checks - each id, when present, must be a UUID - plus one normalisation: an end equal to the start collapses to "no end", a loop at that pothole. Whether an id names a pothole actually in the queue is checked later, in `planRoute.ts` (Task 18), where the queue is already loaded.

**Files:**
- Modify: `dashboard/src/lib/types.ts:96-105` (`PlanRouteRequest`)
- Modify: `dashboard/src/lib/server/planRoute.ts:53-108` (`validatePlanRequest`)
- Test: `dashboard/src/lib/server/planRoute.test.ts` (three new validation cases)

**Interfaces:**
- Consumes: the existing `UUID` regex already at the top of `planRoute.ts`.
- Produces: `PlanRouteRequest.start_pothole_id?: string` and `PlanRouteRequest.end_pothole_id?: string`. After `validatePlanRequest`, `end_pothole_id` is guaranteed distinct from `start_pothole_id`, so Task 18 can read `end_pothole_id !== undefined` as "the route is open".

- [ ] **Step 1: Write the failing tests**

Add to the `describe("validatePlanRequest", …)` block in `dashboard/src/lib/server/planRoute.test.ts`:

```ts
  it("accepts anchor pothole ids on any mode", () => {
    const ok = okOf(validatePlanRequest({
      ...base, mode: "count", max_stops: 3,
      start_pothole_id: POTHOLE_A, end_pothole_id: POTHOLE_B,
    }));
    expect(ok.start_pothole_id).toBe(POTHOLE_A);
    expect(ok.end_pothole_id).toBe(POTHOLE_B);
  });

  it("rejects a malformed anchor id with one plain sentence, before any lookup", () => {
    expect(errorOf(validatePlanRequest({ ...base, mode: "count", max_stops: 1, start_pothole_id: "nope" })))
      .toMatch(/start_pothole_id/);
    expect(errorOf(validatePlanRequest({ ...base, mode: "count", max_stops: 1, end_pothole_id: 7 })))
      .toMatch(/end_pothole_id/);
  });

  it("normalises an end equal to the start into a loop (no end)", () => {
    const ok = okOf(validatePlanRequest({
      ...base, mode: "count", max_stops: 1,
      start_pothole_id: POTHOLE_A, end_pothole_id: POTHOLE_A,
    }));
    expect(ok.start_pothole_id).toBe(POTHOLE_A);
    expect(ok.end_pothole_id).toBeUndefined();
  });
```

- [ ] **Step 2: Run to verify the failure**

Run: `npx vitest run src/lib/server/planRoute.test.ts`

Expected: FAIL - the accepted request drops both unknown fields, so `ok.start_pothole_id` is undefined and no error mentions the field names.

- [ ] **Step 3: Implement**

1. `dashboard/src/lib/types.ts` - extend the request:

```ts
export interface PlanRouteRequest {
  crew_id: string;
  plan_date: string; // YYYY-MM-DD
  mode: PlanMode;
  pothole_ids?: string[]; // manual
  max_stops?: number; // count
  time_budget_min?: number; // time
  area?: GeoJSON.Polygon;
  service_min_per_stop?: number;
  /** Start the route at this queue pothole instead of the crew depot. */
  start_pothole_id?: string;
  /** End the route at this queue pothole instead of back at the start. */
  end_pothole_id?: string;
}
```

2. `dashboard/src/lib/server/planRoute.ts` - in `validatePlanRequest`, after the `area` check and before the `req` object is built, add:

```ts
  if (raw.start_pothole_id !== undefined) {
    if (typeof raw.start_pothole_id !== "string" || !UUID.test(raw.start_pothole_id)) {
      return { error: "start_pothole_id must be a pothole UUID." };
    }
  }
  if (raw.end_pothole_id !== undefined) {
    if (typeof raw.end_pothole_id !== "string" || !UUID.test(raw.end_pothole_id)) {
      return { error: "end_pothole_id must be a pothole UUID." };
    }
  }
```

and extend the `req` construction with the two fields, normalising the loop case:

```ts
  const req: PlanRouteRequest = {
    crew_id: raw.crew_id,
    plan_date: raw.plan_date,
    mode: raw.mode,
    service_min_per_stop: serviceMin,
    ...(raw.area === undefined ? {} : { area: raw.area as GeoJSON.Polygon }),
    ...(raw.start_pothole_id === undefined ? {} : { start_pothole_id: raw.start_pothole_id as string }),
    // An end equal to the start is a loop at that pothole, which is exactly
    // what an omitted end already means - normalised here so the planner has
    // one branch fewer (spec §5).
    ...(raw.end_pothole_id === undefined || raw.end_pothole_id === raw.start_pothole_id
      ? {}
      : { end_pothole_id: raw.end_pothole_id as string }),
  };
```

- [ ] **Step 4: Run everything to verify it passes**

Run: `npx vitest run` then `npm run lint` then `npx tsc --noEmit`

Expected: all green - both fields are optional, so no existing caller or test moves.

- [ ] **Step 5: Commit**

```sh
git add src/lib/types.ts src/lib/server/planRoute.ts src/lib/server/planRoute.test.ts
git commit -m "Validate route anchor ids"
```

### Task 17: Resolved anchors echoed on every plan

`PlanRouteResponse` gains required `start` and `end` anchors (spec §5), and `planRoute.ts` writes the resolved pair into `objective.anchors` beside the request, so the crew page and the dispatch email never re-resolve an anchor. In this task both anchors are always the depot (labelled "Depot") - the pothole cases arrive in Task 18. Because the fields are required, the synthetic source and the store-test fakes gain them in the same task.

**Files:**
- Modify: `dashboard/src/lib/types.ts` (`PlanRouteResponse` gains `start`, `end`)
- Modify: `dashboard/src/lib/server/planRoute.ts` (anchor literals, objective, response)
- Modify: `dashboard/src/lib/data/synthetic.ts` (depot anchors on the synthetic response)
- Modify: `dashboard/src/lib/console/store.test.ts` (fake responses gain the anchors)
- Test: `dashboard/src/lib/server/planRoute.test.ts`

**Interfaces:**
- Consumes: `ResolvedAnchor` from `@/lib/types` (Task 1); `DEPOT` from `@/lib/data/synthetic`.
- Produces: `PlanRouteResponse.start: ResolvedAnchor` and `PlanRouteResponse.end: ResolvedAnchor`; `objective.anchors: { start: ResolvedAnchor; end: ResolvedAnchor }` on the saved plan. Tasks 18, 19 and 21 consume these.

- [ ] **Step 1: Write the failing tests**

In `dashboard/src/lib/server/planRoute.test.ts`:

1. In the first test, the `objective` assertion gains the anchors (the depot in the fixture is `POINT(-0.1246 51.4994)`):

```ts
    expect(plan.objective).toEqual({
      request: COUNT_REQ,
      candidate_count: 2,
      estimated: false,
      considered_all: true,
      steps: [],
      anchors: {
        start: { lng: -0.1246, lat: 51.4994, label: "Depot" },
        end: { lng: -0.1246, lat: 51.4994, label: "Depot" },
      },
    });
```

2. Add a new test after it:

```ts
  it("echoes the resolved depot anchors on the response", async () => {
    const { db } = makeDb(baseTables());
    const result = await planRoute({ db, osrm: makeOsrm() }, COUNT_REQ);
    expect(result.start).toEqual({ lng: -0.1246, lat: 51.4994, label: "Depot" });
    expect(result.end).toEqual({ lng: -0.1246, lat: 51.4994, label: "Depot" });
  });
```

- [ ] **Step 2: Run to verify the failure**

Run: `npx vitest run src/lib/server/planRoute.test.ts`

Expected: FAIL - `result.start` is undefined and the stored objective has no `anchors` key.

- [ ] **Step 3: Implement**

1. `dashboard/src/lib/types.ts` - the response gains the two required fields:

```ts
export interface PlanRouteResponse {
  route_plan_id: string;
  stops: PlanRouteStop[];
  total_km: number;
  total_minutes: number;
  baseline_km: number;
  path: { type: "LineString"; coordinates: [number, number][] };
  /** Turn instructions along `path`; empty when the route fell back to a straight line. */
  steps: RouteStep[];
  /** Where the route starts, resolved server-side (spec §5). */
  start: ResolvedAnchor;
  /** Where it ends; equals `start` on a closed loop. */
  end: ResolvedAnchor;
}
```

2. `dashboard/src/lib/server/planRoute.ts` - add `ResolvedAnchor` to the type import from `@/lib/types`. After the depot is parsed, resolve the anchors (both the depot for now):

```ts
  const startAnchor: ResolvedAnchor = { lng: depot[0], lat: depot[1], label: "Depot" };
  const endAnchor: ResolvedAnchor = startAnchor;
```

The `route_plans` insert's objective becomes:

```ts
        objective: {
          request: req,
          candidate_count: candidates.length,
          estimated,
          considered_all: consideredAll,
          steps,
          anchors: { start: startAnchor, end: endAnchor },
        },
```

And the return gains:

```ts
    start: startAnchor,
    end: endAnchor,
```

3. `dashboard/src/lib/data/synthetic.ts` - the synthetic response gains its depot anchors (add beside `steps: []`):

```ts
        start: { lng: DEPOT[0], lat: DEPOT[1], label: "Depot" },
        end: { lng: DEPOT[0], lat: DEPOT[1], label: "Depot" },
```

4. `dashboard/src/lib/console/store.test.ts` - every fake `planRoute` response object gains the same two anchor fields beside `steps: []` (use `{ lng: -0.1246, lat: 51.4994, label: "Depot" }` for both).

- [ ] **Step 4: Run everything to verify it passes**

Run: `npx vitest run` then `npm run lint` then `npx tsc --noEmit`

Expected: all green. As in Task 10, the compiler walks every response construction site; if it names one this plan missed, give it the depot anchors the same way.

- [ ] **Step 5: Commit**

```sh
git add src/lib/types.ts src/lib/server/planRoute.ts src/lib/server/planRoute.test.ts src/lib/data/synthetic.ts src/lib/console/store.test.ts
git commit -m "Echo resolved anchors from the planner"
```

### Task 18: Pothole anchors, forced stops and open routes through the planner

The server side of the dials (spec §4, §5): a `start_pothole_id` or `end_pothole_id` is looked up in the merged queue (the only anchor resolution the server performs - the depot comes from the crew row it already loads), becomes the anchor coordinate, is removed from the candidate list, and is prepended or appended as a forced stop with `stop_order` renumbered from 1. In `time` mode the budget hands `solve()` the minutes left after the forced stops' service time. The matrix layout is `[start, cand_1 … cand_N]` closed and `[start, cand_1 … cand_N, end]` open, so candidate `i` keeps matrix index `i + 1` and the closed case stays byte-for-byte today's behaviour.

**Files:**
- Modify: `dashboard/src/lib/server/planRoute.ts:143-156` (`buildEtas`), `:289-428` (the body of `planRoute`)
- Test: `dashboard/src/lib/server/planRoute.test.ts`

**Interfaces:**
- Consumes: `Constraints.endIndex` and the end-aware `tourKm` / `tourMin` (Task 15); `start_pothole_id` / `end_pothole_id` on the validated request (Task 16); `ResolvedAnchor` echo plumbing (Task 17); `potholeRef` from `@/lib/data/types` for anchor labels.
- Produces:

```ts
export interface EtaLayout {
  /** Matrix index 0 is itself a stop (a forced start pothole). */
  forcedStart: boolean;
  /** Matrix index the route finishes at; 0 keeps the loop. */
  endIndex: number;
  /** That finishing index is itself a stop (a forced end pothole). */
  forcedEnd: boolean;
}
export function buildEtas(order: number[], matrix: Matrix, serviceMin: number, startIso: string, layout?: EtaLayout): string[];
```

`buildEtas` without a layout reproduces today's behaviour exactly. No later task changes the planner again.

- [ ] **Step 1: Write the failing tests**

In `dashboard/src/lib/server/planRoute.test.ts`, extend the `buildEtas` describe block:

```ts
  it("a forced start stop's eta is the shift start, and its service delays every later leg", () => {
    const start = "2026-09-03T08:00:00.000Z";
    // Stop 1 is the forced start itself; then 20 min service + 5 min drive to A.
    expect(buildEtas([0], matrix, 20, start, { forcedStart: true, endIndex: 0, forcedEnd: false })).toEqual([
      "2026-09-03T08:00:00.000Z",
      "2026-09-03T08:25:00.000Z",
    ]);
  });

  it("a forced end stop's eta follows the final drive leg", () => {
    const start = "2026-09-03T08:00:00.000Z";
    // Depot -> A is 5 min; 20 min service; A -> end (index 2) is 10 min.
    expect(buildEtas([0], matrix, 20, start, { forcedStart: false, endIndex: 2, forcedEnd: true })).toEqual([
      "2026-09-03T08:05:00.000Z",
      "2026-09-03T08:35:00.000Z",
    ]);
  });
```

Then add a new describe block at the end of the file:

```ts
describe("planRoute with pothole anchors", () => {
  it("start_pothole_id becomes matrix point 0, a forced first stop, removed from the candidates", async () => {
    const { db, tables } = makeDb(baseTables());
    const osrm = makeOsrm();
    const req = okOf(validatePlanRequest({
      crew_id: CREW, plan_date: DATE, mode: "count", max_stops: 3, start_pothole_id: POTHOLE_A,
    }));

    const result = await planRoute({ db, osrm }, req);

    // A replaces the depot at matrix point 0; only B remains a candidate.
    expect(osrm.table).toHaveBeenCalledWith([
      [-0.129, 51.496],
      [-0.133, 51.4984],
    ]);
    expect(result.start).toMatchObject({ lng: -0.129, lat: 51.496 });
    expect(result.start.label).toContain("BCH-");
    expect(result.end).toEqual(result.start); // no end anchor: a loop at the pothole
    expect(result.stops.map((s) => s.pothole_id)).toEqual([POTHOLE_A, POTHOLE_B]);
    expect(result.stops.map((s) => s.stop_order)).toEqual([1, 2]);
    // The forced stop is worked first, at the shift start itself.
    expect(result.stops[0].eta).toBe(planStartIso(DATE));
    // Both stops get real work orders, renumbered from 1.
    expect(tables.work_orders).toHaveLength(2);
    expect(tables.work_orders[0]).toMatchObject({ pothole_id: POTHOLE_A, stop_order: 1, status: "assigned" });
    // The anchors stored on the plan match the echo.
    expect((tables.route_plans[0].objective as { anchors: { start: { label: string } } }).anchors.start.label)
      .toContain("BCH-");
  });

  it("end_pothole_id appends a matrix point and the route stays open", async () => {
    const { db } = makeDb(baseTables());
    const osrm = makeOsrm();
    const req = okOf(validatePlanRequest({
      crew_id: CREW, plan_date: DATE, mode: "manual", pothole_ids: [POTHOLE_A], end_pothole_id: POTHOLE_B,
    }));

    const result = await planRoute({ db, osrm }, req);

    // Points: depot (start), A (candidate), B (the appended end anchor).
    expect(osrm.table).toHaveBeenCalledWith([
      [-0.1246, 51.4994],
      [-0.129, 51.496],
      [-0.133, 51.4984],
    ]);
    expect(result.start).toEqual({ lng: -0.1246, lat: 51.4994, label: "Depot" });
    expect(result.end).toMatchObject({ lng: -0.133, lat: 51.4984 });
    expect(result.stops.map((s) => s.pothole_id)).toEqual([POTHOLE_A, POTHOLE_B]);
    // Geometry runs start -> stop -> end with no leg back to the depot.
    expect(osrm.route).toHaveBeenCalledWith([
      [-0.1246, 51.4994],
      [-0.129, 51.496],
      [-0.133, 51.4984],
    ]);
  });

  it("a plan of only forced anchor stops still drives between them", async () => {
    const { db } = makeDb(baseTables());
    // Manual mode names A, which is also the start anchor, so the solver gets
    // no free candidates at all; B is the end anchor.
    const req = okOf(validatePlanRequest({
      crew_id: CREW, plan_date: DATE, mode: "manual", pothole_ids: [POTHOLE_A],
      start_pothole_id: POTHOLE_A, end_pothole_id: POTHOLE_B,
    }));
    const result = await planRoute({ db, osrm: makeOsrm() }, req);
    expect(result.stops.map((s) => s.pothole_id)).toEqual([POTHOLE_A, POTHOLE_B]);
    // Drive A -> B (20 min in MATRIX) plus two 20-minute services.
    expect(result.total_minutes).toBe(60);
  });

  it("charges forced service time against a time budget", async () => {
    const { db } = makeDb(baseTables());
    const req = okOf(validatePlanRequest({
      crew_id: CREW, plan_date: DATE, mode: "time", time_budget_min: 60, start_pothole_id: POTHOLE_A,
    }));
    const result = await planRoute({ db, osrm: makeOsrm() }, req);
    expect(result.stops[0].pothole_id).toBe(POTHOLE_A);
    expect(result.total_minutes).toBeLessThanOrEqual(60);
  });

  it("400s when an anchor pothole is not in the repair queue", async () => {
    const { db } = makeDb(baseTables());
    const missing = "33333333-3333-3333-3333-333333333333";
    const start = okOf(validatePlanRequest({
      crew_id: CREW, plan_date: DATE, mode: "count", max_stops: 1, start_pothole_id: missing,
    }));
    await expect(planRoute({ db, osrm: makeOsrm() }, start)).rejects.toMatchObject({
      status: 400, message: "That start pothole is not in the repair queue.",
    });
    const end = okOf(validatePlanRequest({
      crew_id: CREW, plan_date: DATE, mode: "count", max_stops: 1, end_pothole_id: missing,
    }));
    await expect(planRoute({ db, osrm: makeOsrm() }, end)).rejects.toMatchObject({
      status: 400, message: "That end pothole is not in the repair queue.",
    });
  });
});
```

- [ ] **Step 2: Run to verify the failure**

Run: `npx vitest run src/lib/server/planRoute.test.ts`

Expected: FAIL - `buildEtas` rejects the fifth argument's effect (forced etas missing), and the anchor tests see the depot at matrix point 0 and no forced stops.

- [ ] **Step 3: Implement**

1. `dashboard/src/lib/server/planRoute.ts` - add the import this task needs, beside the
   existing ones:

```ts
import { potholeRef } from "@/lib/data/types";
```

2. Replace `buildEtas` with the layout-aware version. Without a layout it behaves exactly
   as before, so the existing eta tests keep passing:

```ts
export interface EtaLayout {
  /** Matrix index 0 is itself a stop (a forced start pothole). */
  forcedStart: boolean;
  /** Matrix index the route finishes at; 0 keeps the loop. */
  endIndex: number;
  /** That finishing index is itself a stop (a forced end pothole). */
  forcedEnd: boolean;
}

/**
 * ETA per stop: cumulative drive minutes from matrix index 0, with `serviceMin`
 * added after each stop. `order` holds candidate indices, so the matrix index of
 * candidate i is i + 1. A forced anchor pothole is a stop the solver never saw,
 * so the layout adds it at the front or the back by hand.
 */
export function buildEtas(
  order: number[],
  matrix: Matrix,
  serviceMin: number,
  startIso: string,
  layout?: EtaLayout,
): string[] {
  const startMs = new Date(startIso).getTime();
  const etas: string[] = [];
  let minutes = 0;
  let from = 0;

  // The crew starts the shift standing at the forced start pothole, so its eta is
  // the shift start itself and its service time delays every later leg.
  if (layout?.forcedStart) {
    etas.push(new Date(startMs).toISOString());
    minutes += serviceMin;
  }

  for (const candidate of order) {
    const node = candidate + 1;
    minutes += matrix.durationMin[from][node];
    etas.push(new Date(startMs + minutes * 60_000).toISOString());
    minutes += serviceMin;
    from = node;
  }

  if (layout?.forcedEnd) {
    minutes += matrix.durationMin[from][layout.endIndex];
    etas.push(new Date(startMs + minutes * 60_000).toISOString());
  }

  return etas;
}
```

3. Add two helpers above `planRoute`, for the anchor lookup and its label:

```ts
/** "BCH-1A2B - Millbank", the reference an operator can read down a phone. */
function anchorLabel(row: PotholeMapRow): string {
  return `${potholeRef(row.id)} - ${row.road_name ?? "Unnamed road"}`;
}

/**
 * An anchor pothole must be one the crew could actually be sent to, so it is
 * looked up in the merged queue rather than the filtered candidate list: manual
 * mode may not have named it, and a replan may still be holding it.
 */
function anchorPothole(
  queue: PotholeMapRow[],
  id: string | undefined,
  which: "start" | "end",
): PotholeMapRow | null {
  if (id === undefined) return null;
  const row = queue.find((p) => p.id === id);
  if (!row) throw new PlanRouteError(400, `That ${which} pothole is not in the repair queue.`);
  return row;
}
```

4. In the body of `planRoute`, replace the depot-only anchor literals from Task 17 with the
   resolved pair, immediately after `const queue = await loadQueue(db, existing);`:

```ts
  const startPothole = anchorPothole(queue, req.start_pothole_id, "start");
  const endPothole = anchorPothole(queue, req.end_pothole_id, "end");

  const startPoint: LngLat = startPothole ? [startPothole.lng, startPothole.lat] : depot;
  const startAnchor: ResolvedAnchor = startPothole
    ? { lng: startPothole.lng, lat: startPothole.lat, label: anchorLabel(startPothole) }
    : { lng: depot[0], lat: depot[1], label: "Depot" };

  // validatePlanRequest already normalised "end equals start" to a loop, so an end
  // pothole here is genuinely a different place.
  const endPoint: LngLat = endPothole ? [endPothole.lng, endPothole.lat] : startPoint;
  const endAnchor: ResolvedAnchor = endPothole
    ? { lng: endPothole.lng, lat: endPothole.lat, label: anchorLabel(endPothole) }
    : startAnchor;
```

5. Drop the anchors from the candidate list, and let a plan of nothing but forced stops
   through. Replace the `pickCandidates` block and its empty check:

```ts
  const anchorIds = new Set(
    [startPothole?.id, endPothole?.id].filter((id): id is string => id !== undefined),
  );
  const forcedCount = anchorIds.size;

  let candidates = pickCandidates(queue, req).filter((c) => !anchorIds.has(c.id));
  // Only an error when there is nothing at all to visit. Two anchor potholes and no
  // free candidates is a legitimate plan: drive from one to the other.
  if (candidates.length === 0 && forcedCount === 0) {
    throw new PlanRouteError(400, "No open potholes match that request.");
  }
  const consideredAll = candidates.length <= MAX_CANDIDATES;
  if (!consideredAll) candidates = candidates.slice(0, MAX_CANDIDATES);
```

6. Build the matrix over the anchors rather than the depot, and work out the end index.
   Replace the point list and the matrix block:

```ts
  const points: LngLat[] = [
    startPoint,
    ...candidates.map((c): LngLat => [c.lng, c.lat]),
    ...(endPothole ? [endPoint] : []),
  ];
  // Candidate i keeps matrix index i + 1, so a closed route is byte-for-byte the
  // behaviour before anchors existed.
  const endIndex = endPothole ? candidates.length + 1 : 0;

  let estimated = false;
  let matrix: Matrix;
  try {
    matrix = await osrm.table(points);
  } catch {
    matrix = buildMatrix(points, FALLBACK_KMH);
    estimated = true;
  }
```

7. Pass the end index and the reduced budget to the solver, and allow an empty solve when
   forced stops carry the plan:

```ts
  const serviceMin = req.service_min_per_stop ?? DEFAULT_SERVICE_MIN;
  // tourMin only charges service for stops the solver chose, so the forced ones are
  // taken off the budget before it is handed over.
  const solverBudget =
    req.time_budget_min === undefined
      ? undefined
      : req.time_budget_min - serviceMin * forcedCount;

  const solution = solve(
    candidates.map((c) => ({ id: c.id, priority: c.priority })),
    matrix,
    {
      mode: req.mode,
      maxStops: req.max_stops,
      timeBudgetMin: solverBudget,
      serviceMin,
      endIndex,
    },
  );
  if (solution.order.length === 0 && forcedCount === 0) {
    throw new PlanRouteError(400, "No route could be planned for those stops.");
  }
```

8. Assemble the ordered stops, the totals and the geometry. Replace the `ordered` and
   `line` block:

```ts
  const solverStops = solution.order.map((i) => candidates[i]);
  const ordered: PotholeMapRow[] = [
    ...(startPothole ? [startPothole] : []),
    ...solverStops,
    ...(endPothole ? [endPothole] : []),
  ];

  // With no solver stops the tour helpers return zero, so the one leg that still
  // has to be driven - start anchor straight to end anchor - is added by hand.
  const directMin = solution.order.length === 0 ? matrix.durationMin[0][endIndex] : 0;
  const directKm = solution.order.length === 0 ? matrix.distanceKm[0][endIndex] : 0;

  const routePoints: LngLat[] = [
    startPoint,
    ...solverStops.map((c): LngLat => [c.lng, c.lat]),
    endPoint,
  ];
  let line: LineString;
  let steps: RouteStep[];
  try {
    const routed = await osrm.route(routePoints);
    line = routed.geometry;
    steps = renderSteps(routed.steps);
  } catch {
    line = {
      type: "LineString",
      coordinates: routePoints.map(([lng, lat]): [number, number] => [lng, lat]),
    };
    steps = [];
    estimated = true;
  }

  const etas = buildEtas(solution.order, matrix, serviceMin, planStartIso(req.plan_date), {
    forcedStart: startPothole !== null,
    endIndex,
    forcedEnd: endPothole !== null,
  });
```

9. Fold the forced service time into the totals:

```ts
  const totalKm = round1(solution.totalKm + directKm);
  const totalMinutes = Math.round(solution.totalMin + directMin + serviceMin * forcedCount);
  const baselineKm = round1(solution.baselineKm + directKm);
```

Everything below this point - `replaceExistingPlan`, the `route_plans` insert with
`objective.anchors`, the `work_orders` insert mapping over `ordered` with
`stop_order: i + 1`, and the response - is unchanged from Task 17, because `ordered` and
`etas` are the same shape they always were, just longer.

- [ ] **Step 4: Run everything to verify it passes**

Run: `npx vitest run` then `npm run lint` then `npx tsc --noEmit`

Expected: all green. The back-compatibility pin from Task 15 matters most here - a request
with neither anchor id must still produce today's depot loop, byte for byte.

- [ ] **Step 5: Commit**

```sh
git add src/lib/server/planRoute.ts src/lib/server/planRoute.test.ts
git commit -m "Plan routes that start or end at a pothole"
```

---

### Task 19: Anchor choices in the console store

The client half of the dials (spec §6). The store learns which anchor the operator picked
and turns it into the two wire fields Task 16 added. Everything here is pure state and
mapping, so it is fully testable before any UI exists; Task 20 renders it.

`{ kind: "same" }` on `end` is the default and means a closed loop, so the request carries
no `end_pothole_id` at all - which is exactly today's behaviour and keeps the plan
byte-for-byte compatible until an operator changes a dial.

**Files:**
- Modify: `dashboard/src/lib/console/store.ts` (`PlannerConfig`, `ConsoleActions`, the initial state, `planRoute()`)
- Test: `dashboard/src/lib/console/store.test.ts`

**Interfaces:**
- Consumes: `PlanRouteRequest.start_pothole_id` / `end_pothole_id` (Task 16); the store's existing `planRoute()` action and `planner` slice.
- Produces:

```ts
export type AnchorChoice = { kind: "depot" } | { kind: "pothole"; id: string };
export type EndChoice = { kind: "same" } | { kind: "pothole"; id: string };
```

on `@/lib/console/store`, plus `planner.start: AnchorChoice`, `planner.end: EndChoice`,
and the actions `setStartAnchor(choice: AnchorChoice): void` and
`setEndAnchor(choice: EndChoice): void`. Task 20 renders these; Task 21 reads nothing from
them.

- [ ] **Step 1: Write the failing tests**

Add to `dashboard/src/lib/console/store.test.ts`, inside the existing `describe`:

```ts
  it("defaults to a depot loop and sends no anchor ids", async () => {
    const s = createConsoleStore();
    const sent: PlanRouteRequest[] = [];
    s.getState().setDataSource(fakeSource({ onPlan: (req) => sent.push(req) }));
    s.getState().setCrews([crew()]);
    s.getState().upsertPothole(p({ id: "a" }));
    s.getState().toggleSelected("a");
    s.getState().setPlanner({ mode: "manual" });

    await s.getState().planRoute();

    expect(s.getState().planner.start).toEqual({ kind: "depot" });
    expect(s.getState().planner.end).toEqual({ kind: "same" });
    expect(sent[0].start_pothole_id).toBeUndefined();
    expect(sent[0].end_pothole_id).toBeUndefined();
  });

  it("sends the chosen pothole anchors", async () => {
    const s = createConsoleStore();
    const sent: PlanRouteRequest[] = [];
    s.getState().setDataSource(fakeSource({ onPlan: (req) => sent.push(req) }));
    s.getState().setCrews([crew()]);
    s.getState().upsertPothole(p({ id: "a" }));
    s.getState().upsertPothole(p({ id: "b" }));
    s.getState().setPlanner({ mode: "count", maxStops: 3 });
    s.getState().setStartAnchor({ kind: "pothole", id: "a" });
    s.getState().setEndAnchor({ kind: "pothole", id: "b" });

    await s.getState().planRoute();

    expect(sent[0].start_pothole_id).toBe("a");
    expect(sent[0].end_pothole_id).toBe("b");
  });

  it("drops an end anchor equal to the start, because that is a loop", async () => {
    const s = createConsoleStore();
    const sent: PlanRouteRequest[] = [];
    s.getState().setDataSource(fakeSource({ onPlan: (req) => sent.push(req) }));
    s.getState().setCrews([crew()]);
    s.getState().upsertPothole(p({ id: "a" }));
    s.getState().setPlanner({ mode: "count", maxStops: 3 });
    s.getState().setStartAnchor({ kind: "pothole", id: "a" });
    s.getState().setEndAnchor({ kind: "pothole", id: "a" });

    await s.getState().planRoute();

    expect(sent[0].start_pothole_id).toBe("a");
    expect(sent[0].end_pothole_id).toBeUndefined();
  });
```

- [ ] **Step 2: Run to verify the failure**

Run: `npx vitest run src/lib/console/store.test.ts`

Expected: FAIL - `setStartAnchor is not a function`, and `planner.start` is undefined.

- [ ] **Step 3: Implement**

1. `dashboard/src/lib/console/store.ts` - export the two choice types above the
   `PlannerConfig` interface:

```ts
/** Where a planned route begins. The depot is the crew's own, read server-side. */
export type AnchorChoice = { kind: "depot" } | { kind: "pothole"; id: string };
/** Where it ends. "same" is a closed loop back to the start. */
export type EndChoice = { kind: "same" } | { kind: "pothole"; id: string };
```

2. `PlannerConfig` gains the two fields:

```ts
  start: AnchorChoice;
  end: EndChoice;
```

3. The initial planner state gains the defaults, which reproduce today's depot loop:

```ts
      start: { kind: "depot" },
      end: { kind: "same" },
```

4. `ConsoleActions` gains the two setters, and their implementations sit beside
   `setPlanner`:

```ts
  setStartAnchor(choice: AnchorChoice): void;
  setEndAnchor(choice: EndChoice): void;
```

```ts
      setStartAnchor(start) { set((s) => ({ planner: { ...s.planner, start } })); },
      setEndAnchor(end) { set((s) => ({ planner: { ...s.planner, end } })); },
```

5. In `planRoute()`, add the two wire fields to the request being built. Put these lines
   with the other conditional spreads:

```ts
          ...(planner.start.kind === "pothole" ? { start_pothole_id: planner.start.id } : {}),
          // An end equal to the start is a loop, and the server normalises it away
          // anyway; dropping it here keeps the request minimal and honest.
          ...(planner.end.kind === "pothole" &&
          !(planner.start.kind === "pothole" && planner.start.id === planner.end.id)
            ? { end_pothole_id: planner.end.id }
            : {}),
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run src/lib/console/store.test.ts` then `npx tsc --noEmit`

Expected: PASS, and the type checker is quiet.

- [ ] **Step 5: Commit**

```sh
git add src/lib/console/store.ts src/lib/console/store.test.ts
git commit -m "Hold the route's start and end choice in the console store"
```

---

### Task 20: The Start and End dials in the dispatch sheet

The visible half of the dials (spec §6). Two segmented rows above Selection and Budget,
each falling back to a select of the open queue when "Pothole" is chosen. Rendering only:
the mapping to the wire is already tested in Task 19, so this task's verification is
manual and stated as such rather than faked with a component test.

Copy follows the repo's civil-service rule: verb plus object on buttons, units on numbers,
no exclamation marks. The queue select shows "ref - street", the same string the server
uses for the anchor label, so the operator sees on screen what the crew reads on the sheet.

**Files:**
- Modify: `dashboard/src/components/DispatchSheet.tsx` (two new rows in the planning section)

**Interfaces:**
- Consumes: `AnchorChoice`, `EndChoice`, `planner.start`, `planner.end`, `setStartAnchor`, `setEndAnchor` from `@/lib/console/store` (Task 19); `displayName` from `@/lib/console/derive`; `potholeRef` from `@/lib/data/types`; the store's `potholes` map.
- Produces: nothing other tasks consume. This is the last UI task.

- [ ] **Step 1: Add the selectors and the open-queue list**

In `dashboard/src/components/DispatchSheet.tsx`, beside the existing `useConsole`
selectors:

```tsx
  const startAnchor = useConsole((s) => s.planner.start);
  const endAnchor = useConsole((s) => s.planner.end);
  const setStartAnchor = useConsole((s) => s.setStartAnchor);
  const setEndAnchor = useConsole((s) => s.setEndAnchor);
```

and, beside the existing `candidates` computation:

```tsx
  // Anchor choices are limited to work that is actually still open.
  const anchorable = all
    .filter((x) => x.status === "suspected" || x.status === "confirmed")
    .sort((a, b) => b.priority - a.priority);
```

- [ ] **Step 2: Render the two rows**

Insert immediately above the Selection row in the planning section. `Row` and the chip
styling already exist in this file; match the surrounding markup rather than inventing new
classes:

```tsx
              <Row label="Start">
                <div style={{ display: "flex", gap: "var(--s2)", flexWrap: "wrap" }}>
                  <button
                    type="button"
                    className="chip"
                    aria-pressed={startAnchor.kind === "depot"}
                    onClick={() => setStartAnchor({ kind: "depot" })}
                  >
                    Depot
                  </button>
                  <button
                    type="button"
                    className="chip"
                    aria-pressed={startAnchor.kind === "pothole"}
                    disabled={anchorable.length === 0}
                    onClick={() =>
                      setStartAnchor({ kind: "pothole", id: anchorable[0].id })
                    }
                  >
                    Pothole
                  </button>
                </div>
                {startAnchor.kind === "pothole" && (
                  <select
                    className="input"
                    aria-label="Start pothole"
                    value={startAnchor.id}
                    onChange={(e) => setStartAnchor({ kind: "pothole", id: e.target.value })}
                  >
                    {anchorable.map((x) => (
                      <option key={x.id} value={x.id}>
                        {potholeRef(x.id)} - {displayName(x)}
                      </option>
                    ))}
                  </select>
                )}
              </Row>

              <Row label="End">
                <div style={{ display: "flex", gap: "var(--s2)", flexWrap: "wrap" }}>
                  <button
                    type="button"
                    className="chip"
                    aria-pressed={endAnchor.kind === "same"}
                    onClick={() => setEndAnchor({ kind: "same" })}
                  >
                    Same as start
                  </button>
                  <button
                    type="button"
                    className="chip"
                    aria-pressed={endAnchor.kind === "pothole"}
                    disabled={anchorable.length === 0}
                    onClick={() => setEndAnchor({ kind: "pothole", id: anchorable[0].id })}
                  >
                    Pothole
                  </button>
                </div>
                {endAnchor.kind === "pothole" && (
                  <select
                    className="input"
                    aria-label="End pothole"
                    value={endAnchor.id}
                    onChange={(e) => setEndAnchor({ kind: "pothole", id: e.target.value })}
                  >
                    {anchorable.map((x) => (
                      <option key={x.id} value={x.id}>
                        {potholeRef(x.id)} - {displayName(x)}
                      </option>
                    ))}
                  </select>
                )}
              </Row>
```

Add `potholeRef` to the existing `@/lib/data/types` import if it is not already there.

- [ ] **Step 3: Check the whole suite still passes**

Run: `npx vitest run` then `npm run lint` then `npx tsc --noEmit`

Expected: all green. No test changes belong in this task; Task 19 already covers the
behaviour, and a component test of two selects would assert React, not the product.

- [ ] **Step 4: Verify by hand**

Run: `npm run dev` (not `npx next dev` - the `predev` script copies the MapLibre worker
into `public/maplibre/`, and without it the basemap never initialises).

Open `http://localhost:3000`, press Plan route, and in the sheet:

1. Start shows Depot selected and End shows Same as start. Plan a route: it behaves
   exactly as before.
2. Press Pothole on Start, choose a reference from the select, and plan. The first stop is
   that pothole and its arrival time is the start of the shift.
3. Press Pothole on End, choose a different reference, and plan. The last stop is that
   pothole, and the drawn line does not return to the depot.
4. Choose the same pothole for both. The route is a loop that begins and ends there, and
   it appears once in the stop list, not twice.

- [ ] **Step 5: Commit**

```sh
git add src/components/DispatchSheet.tsx
git commit -m "Add the start and end dials to the dispatch sheet"
```

---

### Task 21: Real start and end markers on the console map

`RouteLayer.tsx` draws its depot marker from the `DEPOT` constant in
`src/lib/data/synthetic.ts` regardless of data source. That is a live bug in Supabase mode
today: it is invisible only because the seeded crew depot happens to share those
coordinates, and it would point at the wrong place the moment the depot moves or a second
crew exists. Task 17 put the resolved anchors on the response, so the marker can finally
read the truth.

The sheet also gains the first-leg distance, because with the real data every pothole is
about 15.6 km from the depot and a 40 km total is otherwise unexplainable on screen
(spec §6, and the §13 risk it points at).

**Files:**
- Modify: `dashboard/src/lib/console/nearest.ts` (add `firstLegKm`)
- Test: `dashboard/src/lib/console/nearest.test.ts`
- Modify: `dashboard/src/components/console/map/RouteLayer.tsx` (markers from `plan.start` / `plan.end`)
- Modify: `dashboard/src/components/DispatchSheet.tsx` (the first-leg line)

**Interfaces:**
- Consumes: `PlanRouteResponse.start` / `.end` as `ResolvedAnchor` (Task 17); `haversineKm`, `LngLat` from `@/lib/solver/haversine`; `km` from `@/lib/console/format`.
- Produces: `function firstLegKm(plan: PlanRouteResponse): number` in `@/lib/console/nearest`. No later task consumes it.

- [ ] **Step 1: Write the failing test**

Add to `dashboard/src/lib/console/nearest.test.ts`:

```ts
describe("firstLegKm", () => {
  const planOf = (start: [number, number], stops: [number, number][]): PlanRouteResponse => ({
    route_plan_id: "r",
    stops: stops.map(([lng, lat], i) => ({
      work_order_id: `w${i}`, pothole_id: `p${i}`, stop_order: i + 1,
      eta: "2026-09-03T08:00:00.000Z", lng, lat, severity: 0.5, photo_url: null,
    })),
    total_km: 0, total_minutes: 0, baseline_km: 0,
    path: { type: "LineString", coordinates: [] },
    steps: [],
    start: { lng: start[0], lat: start[1], label: "Depot" },
    end: { lng: start[0], lat: start[1], label: "Depot" },
  });

  it("measures from the start anchor to the first stop", () => {
    // One degree of longitude at this latitude is about 69 km; 0.001 is about 69 m.
    const plan = planOf([0, 51.5], [[0.1, 51.5], [0.2, 51.5]]);
    expect(firstLegKm(plan)).toBeCloseTo(haversineKm([0, 51.5], [0.1, 51.5]), 9);
  });

  it("is zero when the plan has no stops", () => {
    expect(firstLegKm(planOf([0, 51.5], []))).toBe(0);
  });
});
```

- [ ] **Step 2: Run to verify the failure**

Run: `npx vitest run src/lib/console/nearest.test.ts`

Expected: FAIL - `firstLegKm is not a function`.

- [ ] **Step 3: Implement**

1. `dashboard/src/lib/console/nearest.ts` - append:

```ts
import type { PlanRouteResponse } from "@/lib/types";

/**
 * Straight-line distance from where the route starts to its first stop.
 *
 * Shown beside the totals because the crew depot can sit a long way from the
 * worked area, and a large total is otherwise unexplainable on screen.
 */
export function firstLegKm(plan: PlanRouteResponse): number {
  const first = plan.stops[0];
  if (!first) return 0;
  return haversineKm([plan.start.lng, plan.start.lat], [first.lng, first.lat]);
}
```

2. `dashboard/src/components/console/map/RouteLayer.tsx` - delete the
   `import { DEPOT } from "@/lib/data/synthetic";` line and replace the single depot
   `Marker` with markers driven by the plan. A closed loop has one marker, an open route
   has two:

```tsx
      <Marker longitude={plan.start.lng} latitude={plan.start.lat} anchor="center" style={{ zIndex: 30 }}>
        <div
          aria-label={plan.start.label}
          style={{ width: 12, height: 12, borderRadius: "var(--r-sm)", border: "1.5px solid var(--rail)", background: "var(--surface)" }}
        />
      </Marker>
      {(plan.end.lng !== plan.start.lng || plan.end.lat !== plan.start.lat) && (
        <Marker longitude={plan.end.lng} latitude={plan.end.lat} anchor="center" style={{ zIndex: 30 }}>
          <div
            aria-label={plan.end.label}
            style={{ width: 12, height: 12, borderRadius: "var(--r-sm)", border: "1.5px solid var(--rail)", background: "var(--rail)" }}
          />
        </Marker>
      )}
```

The end marker is filled rather than hollow so the two read as different without a second
colour, which the design rules forbid for carrying information.

3. `dashboard/src/components/DispatchSheet.tsx` - import `firstLegKm` from
   `@/lib/console/nearest` and add one line under the existing summary sentence, inside
   the `planned && (...)` block:

```tsx
                  {firstLegKm(planned) > 1 && (
                    <p className="secondary" style={{ margin: "var(--s1) 0 0", fontSize: "var(--t-small)" }}>
                      First stop {km(firstLegKm(planned))} from {planned.start.label}.
                    </p>
                  )}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run` then `npm run lint` then `npx tsc --noEmit`

Expected: all green, and lint reports no unused import where `DEPOT` used to be.

- [ ] **Step 5: Commit**

```sh
git add src/lib/console/nearest.ts src/lib/console/nearest.test.ts src/components/console/map/RouteLayer.tsx src/components/DispatchSheet.tsx
git commit -m "Draw the route's real start and end, and state the first leg"
```

---

## After the last task

Run the whole suite, the linter and the type checker one final time, then walk the demo
script in `docs/ARCHITECTURE.md` section 7 end to end with `npm run dev`: plan a route from
the console, press Preview drive, dispatch it, open `/route/{id}` at a phone-sized
viewport, press Preview drive there, mark a stop done, and watch the console pin turn
green.

If PR #2 merged into `main` while this plan was being executed, rebase `pathing-port` onto
`main` before opening a pull request, and re-run the suite afterwards.
