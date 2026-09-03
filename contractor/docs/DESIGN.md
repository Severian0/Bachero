# Contractor portal — design

Date: 2026-09-03. Owner: Parham (contractor app). Status: approved for planning.

The repair contractor's side of Bachero: a standalone Next.js app in `contractor/` where a crew
works the route the council dispatched, and a supervisor sees every crew's progress. It closes the
loop the console opens — marking a stop done flips `potholes.status` to `repaired`, which turns
the pin green on the console map (demo script beat 7).

Design rules are `docs/design/DESIGN.md` and the mockup in `docs/design/mockup/`. Data and endpoint
contracts are `docs/ARCHITECTURE.md`. This document does not repeat either.

## 1. Decisions taken

| Decision | Choice | Why |
|---|---|---|
| Shape | Full portal, not the single `/route/:id` page of ARCHITECTURE.md §6 | A contractor supervises crews as well as driving to holes |
| Codebase | Separate Next.js app in `contractor/`, dev on port 3001 | Zero collision with the console work in `dashboard/`; own deploy |
| Tokens | Verbatim copy of `dashboard/src/app/globals.css` + a drift check script | Same precedent as `sensor/lib/theme/tokens.dart`; two apps must not diverge |
| Data while building | `CrewDataSource` interface, fixture by default, Supabase when `NEXT_PUBLIC_SUPABASE_URL` is set | The solver and dispatch endpoints are 501 stubs; no `route_plans` rows exist yet |
| Auth | None, per ARCHITECTURE.md §6 | Demo RLS is wide open; the link is the key |
| Stop actions | Arrive, note, after-photo, done, escalate | `work_orders` already carries `notes`, `after_photo_url` and a `cancelled` status |
| Ordering | `work_orders` sorted by `stop_order` client-side | Removes any risk from ordering an embedded resource through a view |
| Tests | Vitest on pure logic only | Same call as the console spec |

Phone-first. Board screens reflow above 720px for a supervisor's laptop. Light theme only.

## 2. Screens

| Route | Purpose |
|---|---|
| `/` | Today. Every crew's route for today with progress. Entry point. |
| `/route/[id]` | The job screen: route header, progress, stops in `stop_order`. |
| `/route/[id]/stop/[workOrderId]` | Stop detail: evidence, navigate, the five actions. |
| `/backlog` | Work orders not done or cancelled, grouped overdue / today / upcoming. |
| `/history` | Completed routes, last 14 days. |
| `/crew/[id]` | One crew's routes and performance. |

Frame on every screen, from DESIGN.md §0 and proven on a phone in `sensor/lib/ui/console_screen.dart`:
header 62px, a 44px tab strip below it, panels separated by single 1px `--color-divider` rules
(never gaps, never shadows), stop rows 58px, action bar 68px carrying the one solid steel action.

## 3. Status without a status palette

DESIGN.md §1 forbids red/amber/green. Work-order state is fill, weight and form, and always also a
word — the same discipline `console.logic.js` `renderVals()` applies to pothole pins.

| `work_orders.status` | Row marker (3px) | Stop badge | Word |
|---|---|---|---|
| `assigned` | neutral-400 | hollow, 1.5px ink-38 stroke, number in ink-72 | Not started |
| `in_progress` | accent | solid accent, number in bg | In progress |
| `done` | neutral-300 | hollow neutral-300, row at 55% opacity | Done |
| `cancelled` | neutral-600 | hollow, 1.5px dashed neutral-600 | Escalated |
| `open` | neutral-300 | — | Unassigned |

Badges are 5px-radius rounded squares, matching the console pin. Severity keeps the 4-segment bar
(`ceil(severity × 4)` filled, minimum 1). Route progress is a **continuous** 2px accent rule plus
the words "4 of 12 stops done" — segmented bars mean severity and nothing else.

Copy is civil-service plain English: measurement before inference, units on every number, verb plus
object on buttons ("Mark stop done", "Navigate to stop 3", "Escalate to the council"), no
exclamation marks. Motion is 120 / 240 / 1200 ms with `--ease`; hover is a tint, never movement.

## 4. Data layer

`src/lib/crew/source.ts` defines one interface; `fixture.ts` and `supabase.ts` implement it and
`index.ts` picks by env.

```ts
interface CrewDataSource {
  today(): Promise<RouteSummary[]>
  backlog(): Promise<BacklogGroups>
  history(days: number): Promise<RouteSummary[]>
  crew(id: string): Promise<CrewDetail | null>
  crews(): Promise<Crew[]>
  route(id: string): Promise<RouteDetail | null>
  subscribe(routeId: string, onWorkOrder: (w: WorkOrder) => void): () => void
  start(id: string): Promise<void>
  complete(id: string, patch: { afterPhotoUrl?: string; notes?: string }): Promise<void>
  escalate(id: string, notes: string): Promise<void>
  note(id: string, notes: string): Promise<void>
  uploadAfterPhoto(id: string, file: Blob): Promise<string>
}
```

Constraints carried over from `CLAUDE.md`:

- Read `route_plans_map` and `potholes_map`, never a base table with a geography column.
- The nested read is `route_plans_map?id=eq.{id}&select=*,crew:crews(*),work_orders(*,pothole:potholes_map(*))`.
  If embedding through the view fails, the same method falls back to three flat queries.
- Longitude first everywhere except human-facing coordinate strings and Google Maps links.
- Realtime on `work_orders` filtered `route_plan_id=eq.{id}` keeps two phones and the board in sync.

**Fixture.** Seeded mulberry32 (`20260903`), 3 crews, 4 route plans (yesterday part-done, two
today, one tomorrow), 26 stops on Westminster streets anchored near Crew A's seeded depot
`POINT(-0.1246 51.4994)`. Mutations persist to `localStorage` so a refresh mid-demo keeps progress.

## 5. Schema gaps this app closes

**Escalation orphans a pothole.** `sync_pothole_status` handles `done` and `assigned`/`in_progress`
but not `cancelled`, so a cancelled work order leaves the pothole `scheduled` — which `repair_queue`
excludes, so it never returns to the solver. Fixed in a new migration,
`supabase/migrations/20260903000000_cancel_returns_pothole.sql`, which adds a `cancelled` branch
setting the pothole back to `confirmed`. Shared infrastructure: flag it before applying.

**After-photo re-takes 409.** The storage policy grants `insert` on the `detections` bucket but not
`update`, so re-uploading `after_{work_order_id}.jpg` fails and `upsert` cannot help. Use the spec
path first and fall back to `after_{work_order_id}_{timestamp}.jpg` on conflict. Photos are resized
client-side to a 720px long edge at quality 78 — the same constants as `sensor/lib/config.dart`.

## 6. Loading, empty and error states

No skeleton shimmer. Pending data is a hairline placeholder box with the panel label still legible
(DESIGN.md §7). Empty states state the fact: "No routes dispatched for today.", "No stops in the
backlog.", "This route has no stops." Errors state what failed and what to do, in one sentence:
"Could not load the route. The work already recorded is unaffected; retry." with a Retry button.

## 7. Tests

Vitest, `environment: node` for pure logic, `jsdom` for the outbox.

- `derive.test.ts` — status → marker/badge/word for all five statuses; severity segments at 0,
  0.24, 0.25, 1; progress maths; backlog grouping across date boundaries; stop sorting.
- `format.test.ts` — units, plurals, times, coordinates (latitude first for people).
- `fixture.test.ts` — deterministic for the seed; `complete` advances progress; `escalate` removes
  the stop from the route and lands it in the backlog.
- `gmaps.test.ts` — `lat,lng` order, per-leg chunking at the waypoint limit.
- `outbox.test.ts` — retry backoff, ordering, persistence across a reload.

`npm run check:tokens` fails the build if `contractor/src/app/globals.css` and the dashboard's
token block have diverged.

## 8. Out of scope

The solver and dispatch endpoints, the console screen, authentication, multi-authority tenancy,
reordering or skipping stops (fights the solver and `unique (route_plan_id, stop_order)`),
background/offline recording beyond the in-memory outbox, and dark mode.
