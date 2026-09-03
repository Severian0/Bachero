# Route planning - dispatcher dials and a driver navigation view

Date: 2026-09-03. Status: design, not yet built. Branch context: `pathing-port`.
Revised 2026-09-03: route anchors narrowed to the depot or a pothole (the owner's decision).

Design rules are `docs/design/DESIGN.md` and `CLAUDE.md`; data and endpoint contracts are
`docs/ARCHITECTURE.md`. This document changes the §5 contract and the §6 crew page and says
exactly how; it does not repeat the rest.

## 1. Problem

The planner today is one modal (`DispatchSheet.tsx`) with three modes and a shift-drag
rectangle, and it always plans the same journey shape: depot, stops, back to the same depot.
The crew page (`/route/:id`) is a stub. Two things are missing for a route to feel like a
route:

- The dispatcher cannot say where the day starts or ends. The depot is hard-wired into the
  solver (matrix index 0), into `planRoute.ts` (`routePoints` begins and ends at the parsed
  `crews.depot`), and even into the console's `RouteLayer.tsx`, which draws the depot marker
  from the synthetic `DEPOT` constant regardless of data source.
- The crew has nothing to drive with. The dispatch email links to `/route/:id`, which
  renders "not implemented yet".

The goal is a Google-Maps-style experience split across the two screens: the console plans
(where from, where to, how much, chosen by whom), and the crew page drives (map, arrows,
your position, next instruction, arrived / done buttons, and a demo animation of the drive).

## 2. Decisions already made

Fixed, agreed with the product owner; not up for re-litigation here.

| Decision | Choice |
|---|---|
| Split | Planning stays on the console; `/route/:id` becomes the driver view. Two screens, one plan. `crews`, `plan_date`, `route_plans` and the dispatch email all stay meaningful. |
| Four dials | Start (crew depot / a pothole; default depot). End (same as start / a pothole; default same as start, keeping the depot-to-depot loop). Budget (time or stop count; default time). Selection (automatic or manual; default automatic). Nothing else anchors a route: no addresses and no browser location on the console. Crews start and end their day at a depot - "You aren't filling in potholes from home." |
| Existing modes | Budget and Selection are the existing `mode: manual / count / time` regrouped. Start and End are new. |
| Scope | Narrowed by the owner from an earlier, wider draft: open routes, direction arrows, a drive animation with a countdown and changing directions, and the crew page build. Because anchors are the depot or a pothole only, there is no address lookup, no new table, and **no migration at all**. The narrowing was the owner's call. |
| Area tool | The shift-drag rectangle goes. A "Plan route" button replaces it; its one-click default is start at the crew depot, drive to the open pothole nearest the depot, loop back. |
| Animation intent | It should "display the purpose of the feature, not necessarily how it works" - a theatrical playback is sanctioned. |

Two terms used throughout:

- **Anchor** - a coordinate the route must start or end at: the crew's depot, or an open
  pothole. A pothole anchor is also a stop.
- **Open route** - a route whose end anchor differs from its start anchor. Today every
  route is closed (a loop).

## 3. Architecture

Nothing moves between tiers. The console still POSTs `/api/plan-route`; the solver stays a
pure function in `src/lib/solver/heuristic.ts`; the crew page stays a login-free page that
reads `route_plans_map` and PATCHes `work_orders`. What changes:

```
console  ── POST /api/plan-route { …, start_pothole_id?, end_pothole_id? } ─▶ planRoute.ts
planRoute ── resolves anchors: crews.depot, or a queue pothole by id ───────▶ [lng, lat] start / end
planRoute ── OSRM /table (matrix incl. anchors) ────────────────────────────▶ solve(candidates, matrix, { endIndex })
planRoute ── OSRM /route?steps=true ────────────────────────────────────────▶ path + turn instructions
planRoute ── route_plans (objective carries anchors + steps) ───────────────▶ work_orders as today
crew page ── route_plans_map nested query ──────────────────────────────────▶ map + arrows + instructions + playback
```

Design rules that shape everything below:

- **Anchors are resolved to coordinates on the server, from ids.** The client names a
  pothole or stays silent; it never sends a coordinate. An earlier draft of this design
  resolved anchors on the client, and rejected server-side resolution because its four
  anchor kinds would have meant four server branches and an address-lookup dependency
  inside the solver path. With only two kinds of
  anchor that reasoning inverts: the depot is a column on the `crews` row `planRoute.ts`
  already loads, and the pothole lookup is the same queue lookup the forced-stop handling
  needs anyway (§4). There is no browser-only source left, so the client holds nothing
  the server does not already hold, and letting it send coordinates would only create a
  way for the two to disagree. Rejected: keeping client-side resolution - it would force
  coordinate range validation and a trust decision that an id-based contract makes
  unnecessary, for no gain.
- **The matrix stays on OSRM.** Google's Route Matrix bills per element - origins times
  destinations - so one 60-candidate plan is 62 × 62 = 3,844 billable events against a
  10,000 per month free tier. Three plans would end the month. OSRM stays the default and
  nothing in this design calls Google for a matrix.
- **Turn instructions come from OSRM too** (`steps=true` on the existing `/route` call),
  not Google Compute Routes. §9 says why.
- **No schema change, and no migration at all.** Anchors and steps ride in
  `route_plans.objective` (jsonb, already documented as "solver inputs/outputs"), and
  nothing else in this design touches the database. This matters because migrations
  auto-deploy: anything merged to `main` is applied to the live Supabase project by the
  GitHub integration. A design that ships no migration cannot break the live database on
  merge, so the whole feature can ride in ordinary UI and server PRs with no separately
  reviewed database work.

## 4. Solver changes - open routes

This is the hardest piece. The current solver assumes a closed tour anchored at matrix
index 0:

- `tourKm` / `tourMin` in `heuristic.ts` add a final leg back to index 0.
- `marginalMin` uses index 0 as `next` when inserting after the last stop.
- `twoOpt` uses index 0 as the neighbour beyond both ends of the order.

An open route is a change to the cost function in all four places, not a flag.

### Matrix layout

`planRoute.ts` builds the point list for `osrm.table()` as:

```
closed (end = start):   [start, cand_1 … cand_N]                     end index = 0
open   (end ≠ start):   [start, cand_1 … cand_N, end]                end index = N + 1
```

Candidate `i` stays at matrix index `i + 1` (`mi` in `heuristic.ts` is untouched), so the
closed case is byte-for-byte today's behaviour and every existing test still passes. The
end, when distinct, is appended after the candidates; its index is `points.length - 1`.
`MAX_CANDIDATES` clipping happens before the matrix is built, as now, so the end index is
stable.

### `heuristic.ts`

`Constraints` gains one field:

```ts
export interface Constraints {
  mode: "manual" | "count" | "time";
  maxStops?: number;
  timeBudgetMin?: number;
  serviceMin: number;
  /** Matrix index the tour finishes at. 0 (the start) keeps today's closed loop. */
  endIndex?: number;
}
```

Every helper takes the end index, defaulting to 0:

```ts
export function tourKm(order: number[], m: Matrix, end = 0): number {
  if (order.length === 0) return 0;
  let km = m.distanceKm[0][mi(order[0])];
  for (let k = 0; k + 1 < order.length; k++) km += m.distanceKm[mi(order[k])][mi(order[k + 1])];
  return km + m.distanceKm[mi(order[order.length - 1])][end];   // was [0]
}
```

`tourMin` changes identically. `marginalMin`'s slot after the last stop becomes the end:

```ts
const next = pos === order.length ? end : mi(order[pos]);        // was 0
```

`twoOpt`'s boundary beyond the last position becomes the end:

```ts
const d = j === o.length - 1 ? end : mi(o[j + 1]);               // was 0
```

That is the whole change. 2-opt on an open path is still valid - reversing an interior
segment of a path is the standard path variant of the move; only the two boundary edges
differ, which is exactly what the delta already computes.

**Known approximation, unchanged:** the 2-opt delta assumes the cost of a leg is the same
in both directions, but an OSRM duration matrix is mildly asymmetric (one-way systems,
turn costs). The reversed segment's interior legs change direction and the delta ignores
that. This is pre-existing behaviour on the closed tour and this design does not silently
fix it; at 60 stops a full-recompute 2-opt would be affordable if it ever matters.

**Budget semantics:** in `time` mode the budget now covers start → stops → end. For a
closed route that is today's "including the return leg"; for an open route the return leg
is simply the leg to the end anchor. `baselineKm` keeps its meaning - the same chosen
stops in descending priority order, start to end - so the "% shorter" number stays honest.

### Forced stops (anchor is a pothole)

When `start_pothole_id` or `end_pothole_id` is set, that pothole is both anchor and stop.
Handled in `planRoute.ts`, not in `solve()`, so the solver keeps its clean "anchors are
coordinates" model:

1. Look the pothole up server-side (from the merged queue that `loadQueue` already builds,
   so a replan can reuse a pothole the outgoing plan holds). Its coordinates become the
   anchor. This lookup is the only anchor resolution the server performs: the depot case
   reads `crews.depot` from the crew row `planRoute.ts` already loads, exactly as today.
   Not found or not open: 400, "That start pothole is not in the repair queue." (or end,
   respectively).
2. Remove it from the candidate list so the solver cannot also insert it mid-route.
3. In `time` mode, pass `timeBudgetMin - serviceMin × forcedCount` to `solve()`, because
   `tourMin` only charges service for solver-chosen stops.
4. After solving, prepend / append the forced pothole(s) to the ordered stop list and
   renumber `stop_order` from 1. They get work orders like any other stop, so the
   `work_orders_sync` trigger schedules them and the replan release path in
   `replaceExistingPlan` (cancel, reset freed potholes to `confirmed`, delete) keeps
   working untouched - it operates on pothole ids, not on how they were chosen.
5. The same id as both start and end pothole means a loop at that pothole: one forced
   stop, `endIndex = 0` (§5 normalises this case before it reaches here).

ETAs: `buildEtas` currently walks the matrix from index 0. It gains the forced stops: a
forced start stop's ETA is the shift start itself, and its service minutes offset every
later leg; a forced end stop's ETA follows the final drive leg. The cumulative-minutes
loop structure is unchanged.

### Geometry

`routePoints` becomes `[start, ...orderedStops, end]` (with `end` omitted when it equals
`start`, keeping the loop's duplicate depot point as today). Forced potholes are the
anchors themselves, so nothing is duplicated.

## 5. API contract changes

In `dashboard/src/lib/types.ts`:

```ts
export interface PlanRouteRequest {
  // …existing fields unchanged…
  start_pothole_id?: string;   // omit for the crew depot
  end_pothole_id?: string;     // omit for "same as start"
}

export interface RouteStep {
  instruction: string;   // "Turn left onto Millbank"
  lng: number;
  lat: number;
  distance_m: number;
}

export interface PlanRouteResponse {
  // …existing fields unchanged…
  start: { lng: number; lat: number; label: string };
  end: { lng: number; lat: number; label: string };
  steps: RouteStep[];    // empty when the OSRM route call fell back to a straight line
}
```

There is no coordinate anywhere in the request. The client names a pothole by id or stays
silent (the depot; a loop); the server resolves both anchors to coordinates (§3) and
echoes them, labelled ("Depot", or the pothole's "ref - street"), in the response.

`steps` is in the response as well as in `objective` because the console's Preview drive
(§6) plays a proposal that has not been fetched back from the database - the plan is in
the store, not on a crew's phone yet. The crew page reads the same array from
`objective.steps` on the saved plan. One shape, two sources, so `usePlayback.ts` takes it
as a plain argument and neither screen re-derives it.

- **Existing callers do not break.** Both request fields are optional and their absence
  reproduces today's behaviour exactly (depot loop), so the synthetic data source, the
  store's `planRoute()` action, and every existing test keep working before the console
  learns the new dials. The response additions are new fields beside old ones;
  `DispatchSheet.tsx` and `RouteLayer.tsx` read named fields and are unaffected until
  updated.
- `validatePlanRequest` grows exactly two checks: `start_pothole_id` and `end_pothole_id`,
  when present, must each be a UUID, stated as one plain sentence. An `end_pothole_id`
  equal to `start_pothole_id` is normalised to "no end" - a loop at that pothole (§4's
  single forced stop, `endIndex = 0`). Whether an id names a pothole actually in the queue
  is checked later, in `planRoute.ts`, where the queue is already loaded (§4's 400).
- `route_plans.objective` already stores the whole request; `planRoute.ts` additionally
  writes the **resolved** anchors (coordinates plus label) into `objective` beside it, so
  the crew page and `dispatch.ts` never re-resolve an anchor. No schema change (§3). The
  response's `start` / `end` echo lets `RouteLayer.tsx` finally draw the real start
  marker instead of the synthetic `DEPOT` constant - a live bug in Supabase mode today.
- `dispatch.ts` builds Google Maps deep links from the depot today; it must read the
  resolved anchors from `objective`, falling back to the crew depot for plans made before
  this change.
- The `area` filter stays in the contract (it is a candidate filter, orthogonal to the
  dials) even though the console stops offering a way to draw one; removing server support
  would be a drive-by.

## 6. Console (dispatcher) UI

All inside `DispatchSheet.tsx` and the store; the sheet remains the product's only
interrupting surface. The console never asks the browser for the operator's position -
the only geolocation in the product is the crew page's follow mode (§7).

### The four dials

The sheet's planning section becomes four labelled rows, in this order: Start, End,
Selection, Budget.

- **Start** - a segmented choice: "Depot" (default), "Pothole".
  - Depot: the crew's `depot`, as today. This is where the day starts unless the
    dispatcher deliberately says otherwise.
  - Pothole: a select listing the open queue as "ref - street" (the data is already in
    the store). Rejected: an arm-a-mode-then-click-the-map interaction - more build for a
    picker the queue list already provides.
- **End** - "Same as start" (default), "Pothole". Same picker.
- **Selection** - "Automatic" (default) / "Manual". Manual maps to the existing
  `mode: "manual"` and uses the map selection as today.
- **Budget** - "Time" (default) / "Stops", with the existing minutes / stops inputs.
  Disabled with a note when Selection is Manual ("Manual selection visits every chosen
  stop").

The mapping to the wire `mode` is mechanical and lives in the store: Manual → `manual`;
Automatic + Stops → `count`; Automatic + Time → `time`. No API change for these two dials.

### Store changes (`src/lib/console/store.ts`)

`PlannerConfig` gains:

```ts
type AnchorChoice =
  | { kind: "depot" }
  | { kind: "pothole"; id: string };

planner: {
  // …existing…
  start: AnchorChoice;                     // default { kind: "depot" }
  end: AnchorChoice | { kind: "same" };    // default { kind: "same" }
}
```

The `planRoute()` action maps choices to wire fields mechanically: `depot` and `same`
omit the field, `pothole` sends the id as `start_pothole_id` / `end_pothole_id`. No
lookups, no coordinates, no asynchronous resolution step. `area` and `setArea` are
removed from the store along with the drawing state (`drawing`), `useAreaDrag.ts` and
`AreaLayer.tsx`; `ConsoleMap.tsx` drops the drag handlers. The `area` field stays in the
request type per §5 but nothing sends it.

### The Plan route button

Shift-drag is gone; in its place the map gets one quiet button (bottom-left, over the
map, beside the key): **"Plan route"**. One click:

1. Find the nearest open pothole to the crew's depot by straight-line distance (a pure
   helper next to `haversineKm`; client-side, no request - the depot and the queue are
   both already in the store).
2. POST a `manual` plan for the default crew: `pothole_ids: [nearest]`, no anchor fields
   (a depot loop - today's wire shape exactly).
3. Open the sheet showing the result, exactly as a planned state shows today.

This is the demo's fast path: press one button, a route appears from the depot to the
worst nearby road defect and back. The sheet's full dials remain the deliberate path.
Rejected: making the button plan a full day (time budget) - the one-click promise is
"show me a route now", and one stop keeps it under two seconds even on the public OSRM
server.

### Route display

`RouteLayer.tsx` draws the start marker from `plan.start` and, when the route is open, a
distinct end marker from `plan.end` (same 12 px hollow square; the open case labels them
"Start" / "End" instead of "Depot"). Direction arrows per §8. When the start is far from
the stops - the real data has every pothole about 15.6 km from the seeded depot - the
summary line gains "first stop 15.6 km away" so the total is explainable, and the map
fits the whole route including the start. §13 records the design-level consequence of
that distance.

### Preview drive on the console

Once a plan comes back, the sheet's summary gains a "Preview drive" button beside the
totals. It plays the proposed route on the console map: vehicle marker, countdown, and the
next instruction, using the same `usePlayback.ts` and `along.ts` as the crew page (§9). No
follow mode, no stop cards - the dispatcher is reading a proposal, not driving it.

The plan is not yet saved to a crew's phone at this point, so the preview reads the
`PlanRouteResponse` already in the store: `path`, `total_km`, `total_minutes`, and the
steps echoed back with it. Dispatching, discarding or replanning stops the playback, and
`prefers-reduced-motion` gets the same stepped-highlight treatment as the crew page.

## 7. Crew page (driver) UI

`/route/:id` goes from stub to the driver view. Mobile-first, tokens only, no login, and
it must remain useful with everything denied or absent.

### Files

```
dashboard/src/app/route/[id]/page.tsx     server component: fetch + not-found state
dashboard/src/components/crew/
  CrewRoute.tsx                           client shell: state, layout, playback wiring
  DriveMap.tsx                            MapLibre map: route line, arrows, stops, position dot
  StopCard.tsx                            current stop: photo, arrived / done, GMaps link
  StopList.tsx                            all stops in order, done ones struck through
usePlayback.ts (in components/crew/)      the animation clock (§9)
dashboard/src/lib/crew/
  along.ts                                pure: cumulative distance, point-at-distance, step-at-distance
  along.test.ts
```

The server component runs the documented nested query
(`route_plans_map?id=eq.{id}&select=*,crew:crews(*),work_orders(*,pothole:potholes_map(*))&work_orders.order=stop_order`)
through `serverClient()` and passes plain data down. It reads `path_geojson`, the stops'
`lng`/`lat` from the embedded `potholes_map` rows, and the anchors and steps from
`objective` - never a raw geography column (`crews.depot` arrives as WKB in the embed and
is simply not read).

### Layout

Top to bottom: a slim header (crew name, plan date, "N stops, X km, Y min"); the map
(the `buildMapStyle` basemap, route line in `--committed` because a published plan is
committed work, arrows, numbered stop markers, start / end markers); a bottom sheet with
the current stop card and the stop list beneath it.

### Actions (unchanged contract, ARCHITECTURE.md §6)

- **Arrived**: PATCH `work_orders` `{status: "in_progress", started_at}`.
- **After photo**: `<input type="file" accept="image/*" capture="environment">`, upload
  to the `detections` bucket as `after_{work_order_id}.jpg`.
- **Done**: PATCH `{status: "done", completed_at, after_photo_url}`. The trigger flips
  the pothole to `repaired` and the console pin goes green over Realtime - the demo's
  closing beat.
- Each stop card carries a Google Maps deep link
  (`https://www.google.com/maps/dir/?api=1&destination=LAT,LNG&travelmode=driving`) -
  the one place coordinates are latitude first.

State is optimistic: the button reflects the PATCH immediately and reverts with one plain
sentence on failure ("Could not save that. Check the signal and try again.").

### Geolocation (follow mode)

This section is intact and deliberate: the follow mode is the one place geolocation
exists in the product. Removing the browser's location from the console's planner (§2)
changes nothing here - the driver following their own position on the road is a separate
feature from the dispatcher choosing where a route starts.

- Requested only when the driver taps "Follow my position", never on load. A permission
  prompt on open would fire during the pitch's screen-share at the worst moment.
- Granted: `watchPosition` drives a position dot with a heading wedge (from
  `GeolocationCoordinates.heading` when moving, else the bearing between successive
  fixes). The map follows the dot only while the driver has not panned; a pan breaks
  follow, a "Re-centre" button restores it.
- The next-instruction banner (§9's step logic) keys off whichever position source is
  active: the real dot when following, the playback marker during a preview.
- Denied, or the fix is more than 2 km from the route: the page stays fully usable as a
  list-and-map. A one-line notice, not an error: "Location is off. Stops are shown in
  driving order." The far case additionally shows "You are 18.4 km from the first stop"
  and leans on the GMaps deep link for the first leg.
- Secure-context trap: the browser geolocation API only works on `https` or
  `localhost`. A crew phone opening the page via a LAN IP gets no geolocation at all, so
  the dispatch email's `NEXT_PUBLIC_APP_URL` must be the deployed https URL for the
  follow mode to exist on a phone. The page's denied path covers this automatically.

## 8. Direction arrows

Arrowheads along the route line, pointing the direction of travel, on both screens.

- **How:** a MapLibre symbol layer over the route source with
  `symbol-placement: "line"`, `symbol-spacing: 80` (px), `icon-rotation-alignment: "map"`
  and `icon-ignore-placement: true`. `maplibre-gl` is pinned at `^6.6.0` in
  `dashboard/package.json`; line placement of symbols has been core MapLibre behaviour
  since long before 6.x, so no upgrade is needed.
- **The glyph:** an arrow drawn programmatically into an `ImageData` at map load and
  registered with `map.addImage("route-arrow", …)` - about fifteen lines in
  `src/lib/map/arrow.ts`. Rejected: a text glyph like "▶" via `text-field`, because the
  style's glyph stack (Noto Sans from OpenFreeMap) is not guaranteed to contain geometric
  shape codepoints, and a missing glyph renders as an empty box on stage. The arrow
  colour comes from `src/lib/map/tokens.ts` (`--action` on the console's proposed route,
  `--committed` on the crew page), one of the two files allowed to touch literal colours.
- Arrows need only the geometry, so they survive the straight-line OSRM fallback
  unchanged.

## 9. Animation

A "Preview drive" button plays the route: a vehicle marker moves along the path, the
header counts down, and the instruction banner changes as turns pass.

**It runs on both screens.** On the crew page it previews the drive ahead. On the console
it plays the proposed route inside the dispatch sheet, before the operator commits, which
is the owner's decision and reverses the earlier draft's "crew page only". The reasoning:
the planning beat otherwise ends on a static line and a percentage, and that percentage is
structurally weak while the depot sits far from the worked area (§13). Motion carries the
moment the number cannot. The cost is small because both screens mount the same
`usePlayback.ts` and `along.ts` against the same shape of data - the console holds a
`PlanRouteResponse`, the crew page a `route_plans_map` row, and both expose
`path_geojson`-shaped coordinates, `total_km`, `total_minutes` and `objective.steps`. The
playback hook therefore takes that data as plain arguments and knows nothing about either
screen's store.

On the console the preview is deliberately smaller: marker, countdown and instruction
banner on the existing map, no follow mode and no stop cards. Dispatching, discarding or
replanning stops it.

**It is theatrical, and that is the design.** The geometry, the stop order, the ETAs and
the turn instructions are all real data from the plan; only the clock is compressed. A
route of `total_minutes` plays in about 30 seconds (`playbackRate =
total_minutes × 60 / 30`, capped so a 2-minute route does not flash by in under 8
seconds). This is the honest version of the owner's brief - "display the purpose of the
feature, not necessarily how it works" - and it is far cheaper than simulating movement
from live positions, which the demo could not produce on stage anyway (nobody drives the
route mid-pitch).

Mechanics, all client-side, no requests:

- `src/lib/crew/along.ts` precomputes cumulative haversine distances over
  `path_geojson.coordinates` once. `pointAt(km)` linearly interpolates between the two
  bracketing vertices; `stepAt(km)` returns the last turn instruction whose along-route
  distance is at or before `km` (each stored step is snapped to its nearest along-route
  distance when the page loads). Pure, tested.
- `usePlayback.ts` is a `requestAnimationFrame` clock: `km += speedKmPerSecond × dt`,
  driving the marker through `pointAt`, the banner through `stepAt`, and the countdown as
  `total_minutes × (1 - km / total_km)` rendered as "about N min left". Pause and replay;
  `prefers-reduced-motion` replaces the moving marker with a stepped highlight through the
  stop list.
- The countdown and the stop ETAs shown during playback are the plan's real
  `work_orders.eta` values, so what the judges see is what the crew would see.

**Where instructions come from:** OSRM, by adding `steps=true&overview=full` to the
existing `/route` call in `src/lib/server/osrm.ts`. Each OSRM step carries a manoeuvre
(type, modifier, road name, location) which `planRoute.ts` renders server-side into plain
English ("Turn left onto Millbank", "At the roundabout take the second exit") and stores
as `objective.steps: { instruction, lng, lat, distance_m }[]` - typically well under 200
entries for a day's route, a few tens of kilobytes of jsonb. Cost: zero; it is the same
request the plan already makes. Rejected: Google Compute Routes (one billable event per
plan is affordable, but it adds a second routing provider, a key dependency and a
translation layer for something invisible in the pitch); rejected: faking turns from
bearing changes in the geometry (free, but produces "turn left" with no street names when
OSRM gives real ones for the same request). When the OSRM call fails and the plan falls
back to the straight-line path, `steps` is empty and the banner shows the next stop's
street name instead of a turn - the playback still runs.

## 10. Error handling and degradation

The existing failure ladder (OSRM down → straight-line matrix and path, marked
`estimated`) is preserved and extended. Every failure is one plain sentence in the sheet
or a one-line notice on the crew page; nothing throws a state away.

| Failure | Behaviour |
|---|---|
| Geolocation denied (crew page) | List-and-map mode; "Location is off. Stops are shown in driving order." |
| Real position far from route (crew page) | No auto-follow; distance to first stop stated; GMaps deep link for the first leg. |
| OSRM `/table` down | Straight-line matrix at 25 km/h, `estimated: true`, as today - anchors included. |
| OSRM `/route` down | Straight polyline through the ordered points, `estimated: true`; no `steps`, so no turn banner; arrows still drawn. |
| Anchor pothole not in the queue | 400, "That start pothole is not in the repair queue." (or end). |
| Anchor id not a UUID | 400 from `validatePlanRequest`, one plain sentence, before any lookup. |
| Unreachable anchor (Infinity matrix cell) | The existing 400, "Some of those potholes cannot be reached by road." - the message already covers anchors because they are matrix points. |
| Start and stops far apart (the real data: 93 potholes ~15.6 km from the depot, all within ~330 m of each other) | Not an error. The summary states the first-leg distance; the map fits the whole route; the time budget honestly absorbs the transit. The design never assumes a pleasing spread. §13 records the structural consequence. |
| Replan with anchors | Unchanged path through `replaceExistingPlan`: cancel old work orders, reset freed potholes to `confirmed` (except carried-over ones), delete, insert. Forced anchor stops participate as ordinary work orders. |

## 11. Testing strategy

Vitest, pure logic only, as the repo already does. New and extended:

- `heuristic.test.ts` - open-route cases: totals with `endIndex ≠ 0` exclude a return
  leg; time budget respects the leg to the end; 2-opt uncrosses a deliberately crossed
  open path; and a regression pin that `endIndex: 0` (and omitted) reproduces today's
  closed-tour outputs exactly on the existing fixtures.
- `planRoute.test.ts` - request without anchor fields is byte-identical to today (the
  back-compat pin); `start_pothole_id` resolves server-side to matrix point 0, is removed
  from the candidates, renumbered from 1, and charged service time against the budget;
  `end_pothole_id` appends a matrix point and the response echoes both anchors with
  labels; `end_pothole_id` equal to `start_pothole_id` collapses to a loop; an id not in
  the queue is a 400; a malformed id is a 400 from validation; `objective` carries the
  resolved anchors and steps.
- `osrm.test.ts` - `steps=true` parsing, including a response with no steps.
- `along.test.ts` - cumulative distances; `pointAt` at 0, mid-leg, and past the end
  (clamps); `stepAt` picks the right instruction either side of a turn.
- `store.test.ts` - dial-to-mode mapping; choice-to-wire-field mapping (depot and
  same-as-start omit the field, pothole sends the id); the nearest-pothole-to-the-depot
  helper.
- Verification for the visual pieces (arrows, playback, crew page actions) is by running
  the demo script end to end - plan from the console, open `/route/:id` on a phone-sized
  viewport, press Preview drive, mark a stop done, watch the pin turn green. Component
  tests add little here for a demo, matching the console spec's judgement.

## 12. Build order

Demo-visible work first; the deadline is unknown, so everything after the cut line must
be genuinely skippable without leaving stubs visible on stage.

1. **Crew page, static driver view.** Fetch, map, route line, numbered stops, stop cards
   with Arrived / photo / Done, GMaps links. This is demo beat 7 and today it is a stub -
   the highest-value item on the list. No solver or contract changes needed.
2. **Direction arrows** on both screens. Small, visible, no server work.
3. **"Plan route" button** and shift-drag removal. The button needs no solver or contract
   change at all: its plan is a `manual` depot loop with one stop - today's wire shape -
   and the nearest-pothole-to-the-depot helper is client-side (§6). Purely console work.
4. **Preview drive animation** with countdown and changing instructions. Needs
   `steps=true` and `objective.steps` from §9, plus `along.ts` / `usePlayback.ts`.
   Crew page first, then the console preview - the second is a second mount of the same
   hook, so it is minutes rather than hours, and it is what gives the planning beat
   motion.
5. **Crew-page geolocation follow mode.** Real position dot, heading, re-centre.

**- cut line -** everything above is what the 2-minute pitch can show.

6. **Open routes and pothole anchors**: `endIndex` through `heuristic.ts`,
   `start_pothole_id` / `end_pothole_id` through §5, forced pothole stops per §4, and the
   Start / End dials in the sheet (§6). The dials land with this step - before it, the
   sheet's defaults (depot, same as start) are the only behaviour, which is today's
   behaviour.

Step 6 is the invisible infrastructure the owner chose with eyes open; it is sequenced
last because nothing above the cut line depends on it - the demo's fast path is the depot
loop the contract already speaks - so running out of time costs nothing the audience
would see.

## 13. Risks and open questions

- **The public OSRM server is the single point of failure for demo day.** Rate-limited,
  no commitment, and now carrying an extra `steps=true` payload. The `estimated`
  fallback keeps the product alive but visibly poorer (straight lines, no turns).
  Mitigation worth one hour if time allows: a `OSRM_BASE_URL` pointed at a local
  Docker OSRM with the Greater London extract, which also removes the rate limit.
- **The depot's position is now structural, not cosmetic.** Every route begins and ends
  at `crews.depot` by construction - there is no other kind of start. With the real data
  (93 potholes about 15.6 km from the seeded depot, all within about 330 m of each
  other), roughly 31 km of dead transit - the drive out plus the drive back - is baked
  into every possible plan, and the solver can only optimise the short local tour between
  the fixed legs. That is why the optimised total and the priority-order baseline differ
  by only about 1 percent, and no solver change can improve it. Moving `crews.depot`
  nearer the worked area is the team's decision, not this design's; what changed is the
  stakes - it is now a correctness issue for the headline "% shorter" number, not a
  demo cosmetic.
- **2-opt on asymmetric durations** remains an approximation (§4). Acceptable at this
  scale; recorded so it is attacked deliberately, not discovered.
- **`objective` is becoming a grab-bag** (request, candidate count, `estimated`, now
  resolved anchors and steps). Fine for the MVP because everything in it is write-once at
  plan time, but the moment anything needs indexing or updating it should graduate to
  columns - in its own migration.
- **Venue geolocation** may be poor indoors (wifi positioning, tens of metres of error).
  Only the crew page's follow mode is exposed - the console never reads a position - and
  it might jitter; the 2 km far-from-route guard keeps it from thrashing the camera.
**Both of the earlier open questions are now decided by the owner.**

- **Preview drive runs on the console as well as the crew page.** Decided yes (§9). The
  planning beat otherwise ends on a static line and a percentage that the depot problem
  holds near 1 percent, so the moment needs something the number cannot give it. The
  second mount is cheap because the playback hook takes plain data, not a store.
- **The crew page does not subscribe to Realtime.** Decided no. A replan while a crew is
  out would rewrite the driver's list under their thumb - the stop they are standing at
  could renumber or vanish - and handling that honestly means locking the in-progress
  stop, confirming the change and defining what "in progress" means when the plan moved.
  That is a design problem of its own for an edge the demo never reaches, and a page
  reload already covers it. Worth naming on a "what next" slide if a judge asks.
