# Console map and operations column — design

Date: 2026-09-02. Owner: Jeremy (web app). Status: approved for planning.

The dashboard's one screen: a live map of potholes and vehicles on the left, an operations
column on the right, linked by hover and selection, with a route planner at the foot. This
spec covers the whole screen. The solver's I/O (OSRM calls, database writes), the dispatch
email, and the crew page are other people's work; this screen only calls their endpoints.

Design rules are `docs/design/DESIGN.md` and the mockup in `docs/design/mockup/`. Data and
endpoint contracts are `docs/ARCHITECTURE.md`. This document does not repeat either.

## 1. Decisions taken

| Decision | Choice | Why |
|---|---|---|
| Map engine | MapLibre GL via `react-map-gl/maplibre`, OpenFreeMap vector tiles | No key, no billing, full basemap control so the map matches DESIGN.md §5 |
| Routing service | OSRM public server (unchanged from spec) | Free, no key. Navigation for crews stays as Google Maps deep links from the crew page |
| Pin rendering | HTML markers (`<Marker>` with a React element) | Exact mockup look from CSS tokens; fine to a few hundred pins. Upgrade path: symbol layers |
| Demo city | London, Westminster | Matches the seeded crew depot at `POINT(-0.1246 51.4994)` |
| Data while building | Synthetic generator, Supabase behind a flag | Screen works with no backend; flag is `NEXT_PUBLIC_SUPABASE_URL` being set |
| Area tool | Shift-drag rectangle | Simplest to build and use; sent as a 4-point polygon |
| Detail panel | Click pins the inspector and expands it | Hover stays cheap; click is deliberate |
| After plan | Route summary with Dispatch button | Closes the loop on the same screen |
| Planner scope | Full: crew, mode (manual / count / time), budget, area | User's call |
| Solver heuristic | Shared pure function in `src/lib/solver/` | Same code for the synthetic planner and, if the solver owner adopts it, the real endpoint |
| State | `zustand` store | Map and column both read and write the same linked/selected state; avoids prop drilling |
| Tests | `vitest` on pure logic only | Component tests add little for a demo |

Desktop only. Light theme only.

## 2. File layout

```
dashboard/src/
  app/page.tsx                       renders <Console/>; server component, no data
  components/console/
    Console.tsx                      shell: header + main grid; mounts the data source
    ConsoleHeader.tsx                brand, live chip, km scanned, date
    map/
      ConsoleMap.tsx                 <Map> with style, controls, layers, overlays, area drag
      PotholePin.tsx                 one <Marker>; visual state from derive.pinStyle
      VehicleMarker.tsx              dot + label, position from the interpolator
      TrailLayer.tsx                 GeoJSON circle layer for breadcrumb tails
      RouteLayer.tsx                 GeoJSON line + numbered stop markers
      AreaLayer.tsx                  GeoJSON fill/line for the drawn rectangle
      CrosshairGuides.tsx            DOM lines + coordinate label for the linked pin
      Graticule.tsx                  canvas overlay, 64px grid with edge ticks
      MapKey.tsx                     legend card, bottom-left
      ScaleBar.tsx                   styled maplibre ScaleControl, bottom-right
    column/
      StatCells.tsx
      FilterChips.tsx
      QueueList.tsx / QueueRow.tsx
      Inspector.tsx                  hover readout, fixed min-height
      DetailPanel.tsx                pinned: detections, photo, Add to route, Dismiss
      Planner.tsx                    crew, mode, budget, area status, Plan route
      RouteSummary.tsx               km / min / % saved, email, Dispatch to crew
      Footer.tsx                     selection summary + primary action
      UndoToast.tsx                  10 s undo for dismissals
  lib/console/
    store.ts                         zustand store (section 4)
    derive.ts                        pure: priority, pinStyle, rowStyle, segments, evidence copy, filters, stats
    keyboard.ts                      key handling → store actions
    interpolate.ts                   vehicle position tween (1200 ms, --ease)
    format.ts                        "14.2 km", "312 min", "since 06:00", coordinate strings
  lib/data/
    types.ts                         ConsoleDataSource interface + Pothole/Vehicle/Crew/Detection shapes
    synthetic.ts                     seeded generator, fake realtime, client-side planner
    supabase.ts                      views + Realtime + fetch to /api/plan-route and /api/dispatch
    index.ts                         pick by env flag
  lib/solver/
    heuristic.ts                     pure: greedy insertion + 2-opt + baseline
    haversine.ts                     straight-line matrix for the synthetic planner
  lib/map/
    style.ts                         MapLibre style JSON built from tokens read at runtime
    tokens.ts                        readToken('--color-accent') etc. via getComputedStyle
```

Row types for the views stay in `src/lib/types.ts`. `lib/data/types.ts` defines the screen's
own shapes, which are a thin mapping from those rows (see section 5).

## 3. Map

**Basemap style** (`lib/map/style.ts`). Source: OpenFreeMap planet vector tiles
(`https://tiles.openfreemap.org/planet`), OpenMapTiles schema. Layers, in order:

1. `background`: `--color-bg`.
2. `water`: `--color-neutral-200`.
3. `road-minor`: `transportation` lines, all classes except motorway/trunk/primary, ink at 18%, 1px.
4. `road-major`: motorway/trunk/primary, ink at 28%, 2px.
5. `road-label-major`: `transportation_name` for the major classes only, 10px body font, ink at 55%, uppercase, letter-spacing 0.12em. Minimum zoom 13.

No buildings, landuse, parks, POIs, or transit. Colours are read from the CSS tokens at map
init through `readToken`; `color-mix` tokens are not parseable by MapLibre, so opacities are
given as layer `*-opacity` on the hex ink token.

**Initial view.** Centre on the crew depot, zoom 14.5. In Supabase mode, after the first
pothole load, fit to the bounds of open potholes plus the depot with 40px padding, once.

**Graticule.** A canvas overlay the size of the map container, redrawn on `move`. 1px lines
in ink at 5% every 64px in screen space, anchored to the container, not to geography. Tick
labels at the left and top edges every 4th line, 10px, ink at 45%, tabular. It sits between
the basemap and the markers and ignores pointer events.

**Pothole pins** (`PotholePin`). One `<Marker>` per pothole with a `div` child. Visual
state from `derive.pinStyle(pothole, { linked, selected })`, which returns size, fill,
stroke, glow, opacity, z-index, stop label. The table is the mockup's `renderVals`:

| status | fill | stroke | opacity |
|---|---|---|---|
| suspected | bg | ink 38% | 1 |
| confirmed | accent | accent | 1 |
| scheduled | accent-800 | accent-800 | 1, shows `stop_order` in bg colour |
| repaired | bg | neutral-300 | 0.55 |
| false_positive | not rendered | | |

`size = round(12 + severity × 11) + (linked or selected ? 5 : 0)` px; radius 5px. Glow:
selected `0 0 0 4px accent-200`, linked `0 0 0 5px accent at 24%`, else `--shadow-sm`.
Transitions: size, fill, stroke over `--dur-state`; glow over `--dur-tint`. Marker anchor is
centre. A 7px transparent padding around the square is the hit target. The pin has
`role="button"`, `aria-label` = street or coordinate plus status, `tabIndex=-1` (keyboard
navigation goes through the list, not the pins).

**Vehicles** (`VehicleMarker`, `interpolate.ts`). One `<Marker>` per vehicle: 11px accent
dot, 2px bg ring, `--shadow-sm`, with the label chip beside it. When a new position arrives,
the marker tweens from its current rendered position to the new one over `--dur-vehicle`
with `--ease` using requestAnimationFrame; positions arriving mid-tween restart from the
current interpolated point. Trails: the last 5 positions per vehicle as a GeoJSON circle
layer, 5px, accent, opacity stepping 0.28 → 0.10.

**Crosshair guides** (`CrosshairGuides`). When a pin is linked or pinned, two 1px lines in
accent at 40% span the full map width and height through the pin's projected point, plus a
label at the top edge offset 8px right with the coordinate as `lat, lng` to 4 decimals
(Google Maps order, since it is human-facing). Re-projected on `move`. Pointer-events none.

**Route** (`RouteLayer`). After a plan: a GeoJSON line layer, 2px accent, plus one small
`<Marker>` per stop drawn as a 16px accent-800 rounded square with the stop number in bg.
The depot is a 12px hollow square in accent-800. Scheduled pins already carry their stop
number, so on the route the two coincide by design.

**Area** (`AreaLayer`, `ConsoleMap` drag handler). Shift + mousedown starts a drag with map
panning disabled; mousemove updates a rectangle drawn as a GeoJSON polygon, fill accent at
8%, 1px accent line; mouseup stores the polygon in the store's planner config and re-enables
panning. Esc during a drag cancels. "Clear" in the planner removes it.

**Key and scale.** `MapKey` bottom-left, the mockup's four-row legend plus "Marker size
shows severity". `ScaleBar` bottom-right, restyled to a 2px ink-45% bar and 11px label.

**Hover.** `onMouseEnter` on a pin links it with source `map`. `onMouseLeave` on the map
section clears the link unless something is pinned.

## 4. Store

`lib/console/store.ts`, zustand, one store.

```ts
type LinkSource = 'row' | 'map' | 'keys'
type Mode = 'manual' | 'count' | 'time'
type Filter = 'open' | 'suspected' | 'confirmed' | 'scheduled' | 'all'

interface ConsoleState {
  // data (written by the data source)
  potholes: Record<string, Pothole>
  vehicles: Record<string, Vehicle>          // latest position + label + last 5 positions
  crews: Crew[]
  kmToday: number
  detections: Record<string, Detection[]>    // by pothole id, loaded on pin
  loadState: 'loading' | 'ready' | 'error'
  loadError?: string

  // interaction
  linkedId: string | null; linkSource: LinkSource | null
  pinnedId: string | null                    // detail panel open for this id
  selected: string[]                         // route candidates, insertion order
  filter: Filter
  density: 'comfortable' | 'compact'

  // planner
  planner: { crewId: string | null; mode: Mode; maxStops: number; timeBudgetMin: number;
             serviceMinPerStop: number; area: Polygon | null; planDate: string }
  planState: 'idle' | 'planning' | 'planned' | 'error'
  plan: PlanRouteResponse | null; planError?: string
  dispatchState: 'idle' | 'sending' | 'sent' | 'error'; dispatchError?: string

  // dismissal undo
  pendingDismiss: { id: string; previous: Pothole; expiresAt: number } | null
}
```

Actions: `link(id, source)`, `unlink()`, `pin(id)`, `unpin()`, `toggleSelected(id)`,
`clearSelection()`, `setFilter(f)`, `cycleFilter()`, `setPlanner(patch)`, `setArea(p)`,
`planRoute()`, `resetPlan()`, `dispatch(to)`, `dismiss(id)`, `undoDismiss()`, plus the
data-source writers `upsertPothole`, `removePothole`, `pushVehiclePosition`, `setCrews`,
`setKmToday`, `setDetections(id, rows)`.

Selectors (memoised, in `derive.ts`): `visibleRows` (filtered, sorted by priority desc),
`stats` (confirmed-open, suspected, scheduled-today counts), `selectionSummary` (count and a
minutes estimate of `n × serviceMin + n × 6.5` until a plan exists), `planCandidates`.

Rules the store enforces:

- `toggleSelected` ignores `repaired` and `false_positive` items.
- `pin(id)` also links it. `unpin` keeps the link until the pointer leaves.
- `dismiss(id)` marks the item `false_positive` locally, clears it from selection, and sets
  `pendingDismiss` with a 10 s expiry. `undoDismiss` restores `previous`. On expiry the data
  source's `dismiss` is called; in Supabase mode that is the PATCH. Only one pending dismissal
  at a time; a second dismissal commits the first immediately.
- A Realtime update for a pothole that is currently pinned or selected keeps it pinned and
  selected; if the update makes it `repaired` or `false_positive` it leaves the selection.
- `planRoute` in manual mode with an empty selection is disabled at the button, not guarded
  in the store.

## 5. Data layer

`lib/data/types.ts`:

```ts
interface ConsoleDataSource {
  load(): Promise<{ potholes: Pothole[]; vehicles: Vehicle[]; crews: Crew[]; kmToday: number }>
  subscribe(handlers: {
    onPothole(p: Pothole | { id: string; deleted: true }): void
    onVehiclePosition(v: VehiclePosition): void
  }): () => void
  detections(potholeId: string): Promise<Detection[]>
  dismiss(potholeId: string): Promise<void>
  planRoute(req: PlanRouteRequest): Promise<PlanRouteResponse>
  dispatch(req: DispatchRequest): Promise<void>
}
```

`Pothole` is `PotholeMapRow` plus `street: string | null` (from `road_name`; null renders as
the coordinate) and `ref: string` (`BCH-` + first 4 hex of the id, uppercase). `Vehicle` is
the latest `VehiclePositionRow` plus the trail. `Detection` is the `detections` row minus
`accel_window`.

**Synthetic** (`synthetic.ts`). Seeded PRNG (mulberry32, seed 20260902). Thirty coordinates
hand-placed on Westminster streets (Victoria Street, Horseferry Road, Millbank, Marsham
Street, Great Peter Street, Vauxhall Bridge Road, Whitehall, Birdcage Walk) with street
names, each given severity 0.18–0.98, 1–6 vehicles, passes, age 0–13 months and a status
drawn as the mockup does. Three vehicles walk fixed polylines along those streets, advancing
one vertex every 1.2 s, emitting a position each tick; `kmToday` starts at 148.6 and grows
0.11 per tick. `detections(id)` fabricates `passes` rows spread over the age. `dismiss`
resolves immediately. `planRoute` runs the shared heuristic on a haversine matrix at 25 km/h
plus `service_min_per_stop`, returns a path that is the straight polyline through the
ordered stops, and marks the chosen potholes `scheduled` with stop numbers through
`onPothole`. `dispatch` waits 600 ms and resolves.

**Supabase** (`supabase.ts`). `load` reads `potholes_map` filtered to the three open
statuses plus `repaired` from today, `latest_vehicle_positions`, `crews`, and `kmToday` as
the sum of `trips.distance_m` started today (falls back to 0). `subscribe` opens the `map`
channel from ARCHITECTURE.md §4; on a pothole event it refetches that row from
`potholes_map` (DELETE removes). `detections` queries by `pothole_id` ordered by
`recorded_at desc`. `dismiss` PATCHes `potholes.status`. `planRoute` and `dispatch` POST the
two endpoints and throw with the response's `error` text on non-2xx.

`index.ts` exports `createDataSource()`: Supabase if `NEXT_PUBLIC_SUPABASE_URL` is set,
else synthetic. `Console.tsx` creates it once, calls `load`, then `subscribe`, and tears
down on unmount.

## 6. Solver heuristic

`lib/solver/heuristic.ts`, pure, no I/O:

```ts
interface Candidate { id: string; priority: number }
interface Constraints { mode: Mode; maxStops?: number; timeBudgetMin?: number; serviceMin: number }
interface Matrix { durationMin: number[][]; distanceKm: number[][] }   // index 0 = depot
function solve(candidates: Candidate[], m: Matrix, c: Constraints):
  { order: number[]; totalMin: number; totalKm: number; baselineKm: number }
```

Greedy insertion: start with `[depot, depot]`; repeatedly pick the unrouted candidate with
the highest `priority / marginalMinutes` at its cheapest insertion point, where marginal
minutes include service time; stop when `maxStops` is reached (count), when
`drive + service + return > timeBudgetMin` (time), or when candidates run out (manual takes
all). Then 2-opt until no improving swap. `baselineKm` is the same chosen stops in
descending priority order, depot to depot. Ties break on lower candidate index so results
are deterministic.

`haversine.ts` builds a `Matrix` from lng/lat points at a given average speed.

## 7. Column and interaction

Layout per the mockup: header 62px; column 404px; rows 58px (46px compact); footer 68px;
inspector min-height 132px. Panels separated by 1px `--color-divider`; no gaps, no shadows.

**Stat cells.** Three: confirmed and open, awaiting a second pass, scheduled today.

**Filter chips.** Open, Suspected, Confirmed, Scheduled. `aria-pressed` on the active one.
The queue header shows "N of M · sorted by priority".

**Queue rows.** 3px left marker by status (neutral-400 / accent / accent-800 / neutral-300),
street with ref, evidence line `"{v} vehicle(s) · {p} passes · {status}"`, 4-segment severity
bar with `ceil(severity × 4)` filled in the marker colour, priority to 1 decimal in heading
font. Background: selected accent-100, linked ink 5%, else transparent. Hover links with
source `row`. Click pins. When the link source is `map` or `keys`, the list scrolls the row
into view by adjusting `scrollTop`, never the page.

**Inspector** (unpinned). Street and ref, status tag, line 1 `"{v} distinct vehicles ·
{p} passes · last {HH:MM}"`, line 2 `"Severity {s} · age {a} months · priority {pr}"`, and a
hint: in route / one vehicle only / click for details. Empty state is the mockup's sentence.

**Detail panel** (pinned). Replaces the inspector and grows to `minmax(132px, 40%)` of the
column, pushing the queue, which is acceptable because pinning is a click, not a hover.
Contents: the inspector lines; the latest photo if any at 4:3 in a hairline frame, else a
hairline placeholder saying "No photo"; a table of detections (time, vehicle label,
severity, speed) capped at 8 with "and N more"; buttons "Add to route" / "Remove from
route" (secondary), "Dismiss as false positive" (ghost), and a close ×. Esc closes.

**Footer.** Left: `"{n} selected for tomorrow"` and `"~{min} min including travel · crew
{name}"`, or the empty-state copy. Right: the primary button, which reads "Plan route" in
idle, is disabled with the same label when nothing is selectable, "Planning…" while
planning, and is replaced by the route summary's actions once planned.

**Undo toast.** Sits above the footer, full column width, hairline top: "Dismissed {street}
as false positive." with an "Undo" ghost button and a 10 s countdown drawn as a 2px
accent bar shrinking left to right.

**Keyboard** (`keyboard.ts`, window listener while the console is mounted, ignored when a
text input has focus): `↓`/`↑` move the link through `visibleRows` (source `keys`); `Enter`
toggles the linked item's selection; `Esc` unpins if pinned, else clears the link, else
clears selection; `F` cycles the filter in chip order. Focus ring is the token default.

## 8. Planner

`Planner.tsx`, between the queue and the footer, collapsed to one line ("Planning for
{crew} · {mode}") until the footer's Plan route is first pressed or the line is clicked;
then expanded:

- Crew: select from `crews`; defaults to the first.
- Mode: segmented control, "Pick these" / "Best N" / "Time budget".
- Budget: for Best N a stops number (default `crew.repairs_per_shift`); for Time budget a
  minutes number (default `crew.shift_minutes`); hidden for Pick these.
- Service time: minutes per stop, default 20.
- Area: "No area · Shift-drag on the map to draw one" or "Area drawn · {n} in area" with a
  Clear button. Ignored in Pick these mode.
- Date: tomorrow, shown, not editable.

Plan route validation: Pick these needs a selection; Best N and Time budget need at least
one open unassigned pothole in the area or the queue. The request body follows
ARCHITECTURE.md §5 exactly; `pothole_ids` is the selection in manual mode.

On success: `plan` is stored, the route draws, chosen potholes are updated to `scheduled`
with stop numbers (Supabase mode gets this through Realtime; synthetic through `onPothole`),
the planner collapses, and `RouteSummary` shows `"{total_km} km · {total_minutes} min"`,
`"{pct}% shorter than visiting by priority"` computed as `1 − total_km / baseline_km`, the
stop list as compact rows, an email input (comma-separated, prefilled from
`NEXT_PUBLIC_DEMO_CREW_EMAIL` if set), "Dispatch to crew" (primary) and "Discard plan"
(ghost, calls `resetPlan`, which only clears local state; the database row is the solver
owner's concern and this is noted in the UI as "Plan stays saved for {crew}").

On error: `planError` shown as one sentence under the planner, e.g. "Route service
unavailable. The queue is unaffected; try again." The button re-enables.

Dispatch: "Sending…" then "Sent to {n} address(es)" with the crew page link
`/route/{route_plan_id}` shown for the demo; on error one sentence and the button re-enables.

## 9. Header

Brand block, then `"{n} vehicles reporting"` with the breathing dot (n = vehicles with a
position in the last 60 s; "Feed paused" when 0 in Supabase mode, never in synthetic), `"{km}
km scanned today"` tabular, and the date chip. Authority name from the first crew's
authority, else "Demo Council".

## 10. Loading, empty and error states

- Loading: each panel keeps its label and shows a hairline box where content goes. No
  shimmer, no spinner.
- Load error: the queue panel shows "Could not load the queue. {error}" and a "Retry"
  secondary button; the map still renders the basemap.
- Empty queue after filter: "No {filter} potholes." in the queue body.
- Tiles unreachable: MapLibre's error is caught and a one-line notice sits at the top of the
  map: "Basemap unavailable. Pins are still placed by coordinate."

## 11. Tests

Vitest with `environment: node` for `lib/` and a `jsdom` project for the store.

- `derive.test.ts`: priority formula against three hand-computed values; `pinStyle` for
  each status × linked/selected; `rowStyle`; `severitySegments` at 0, 0.24, 0.25, 1;
  evidence copy singular/plural; filter predicate; stats.
- `heuristic.test.ts`: manual mode visits all candidates; count mode stops at N; time mode
  respects the budget including return leg; 2-opt uncrosses a deliberately crossed
  4-stop tour; `baselineKm` ≥ `totalKm` on a fixed matrix; determinism.
- `store.test.ts`: link/pin/unpin/select transitions; dismissal undo and expiry with fake
  timers; realtime update of a selected item that becomes repaired removes it from the
  selection; `cycleFilter` order.
- `interpolate.test.ts`: tween reaches the target at t = 1200 ms and restarts from the
  current point on a mid-tween update.
- `synthetic.test.ts`: generator is deterministic for the seed; `planRoute` marks stops
  scheduled with contiguous stop numbers from 1.

`npm test` runs them; `npm run typecheck` is added as `tsc --noEmit`.

## 12. Out of scope

The solver route handler's OSRM calls and database writes, the dispatch email, the crew
page, mobile layout, dark mode, clustering pins at low zoom, snapping synthetic points to
roads, and any authentication.
