# Route Endpoints Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement `POST /api/plan-route` and `POST /api/dispatch` per `docs/ARCHITECTURE.md` §5 so the console works against the live Supabase project.

**Architecture:** Both are Next.js route handlers that do only I/O around pure, tested functions. `plan-route` loads candidates from `repair_queue` and the crew from `crews`, gets an OSRM duration/distance matrix with the depot at index 0, runs the existing `solve()` heuristic, fetches OSRM geometry, then replaces the crew's plan for that date (`route_plans` + `work_orders`) and returns the spec's response. `dispatch` loads the nested `route_plans_map` row, builds the crew email (crew page link first, Google Maps deep links chunked per leg), sends via Resend when a key exists, and sets `route_plans.status = 'published'`.

**Tech Stack:** Next.js 16 route handlers (`route.ts`, `export async function POST(request: Request)`), `@supabase/supabase-js` 2 (anon key; RLS is `demo_all`), OSRM public server (`OSRM_BASE_URL`), `resend` 6, `vitest` 4.

## Global Constraints

- All commands run from `dashboard/`. Work is on the jj bookmark `console-merged`. Commit with `jj commit -m "<msg>" dashboard docs` (path-restricted: never sweep stray working-copy files) then `jj bookmark set console-merged -r @-`. No push. Every commit message ends with the two trailer lines `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>` and `Claude-Session: https://claude.ai/code/session_01T93AKP7HijHL2mbegXmMBQ`.
- Request/response shapes are exactly ARCHITECTURE.md §5; the TypeScript contracts already exist in `src/lib/types.ts` (`PlanRouteRequest`, `PlanRouteStop`, `PlanRouteResponse`, `DispatchRequest`). Do not change them.
- Data rules (CLAUDE.md): never read geography columns from the client; the one server-side exception is `crews.depot`, parsed by a tested WKB helper. Longitude first in EWKT, GeoJSON and OSRM URLs; Google Maps links are `lat,lng`. `route_plans` is `unique (crew_id, plan_date)` and `work_orders` is `unique (route_plan_id, stop_order)`: replanning deletes the crew's existing plan for that date (its `work_orders` first, then the plan) before inserting. Inserting `work_orders` with `status: 'assigned'` is what marks potholes `scheduled` (trigger); deleting a plan's work orders does not un-schedule potholes, so before deleting, set those work orders to `cancelled` and reset their potholes' status to `confirmed` if they have no other open work order (do this explicitly with an update on `potholes` where status = 'scheduled' and id in the cancelled set).
- Errors: every non-2xx response is `{ "error": "<one plain sentence>" }` with status 400 (bad request), 404 (crew or plan not found), 502 (OSRM or Resend failed), 500 (database). The console shows its own sentence, but the server's must still be plain English.
- Env: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` (server uses the anon key; RLS is open), `OSRM_BASE_URL` (default `https://router.project-osrm.org`), `RESEND_API_KEY` (optional; when absent, dispatch still publishes and returns `sent: false`), `DISPATCH_FROM_EMAIL` (default `onboarding@resend.dev`), `NEXT_PUBLIC_APP_URL` (default `http://localhost:3000`).
- Pure logic lives in `src/lib/server/*.ts` with vitest tests; route handlers contain no logic beyond parsing, calling, and mapping errors. Tests never hit the network: OSRM and Resend are behind small interfaces that tests stub.
- Lint rules are errors; no disables. `npm run typecheck && npm run lint && npm test && npm run build` green before every commit.
- Live check at the end of each task against the real project using the values in `dashboard/.env.local` (the file exists; do not print its contents): `npm run dev` in the background and `curl` the endpoint. Report the responses. No browser.

---

## File Structure

| File | Responsibility |
|---|---|
| `src/lib/server/supabase.ts` | `serverClient()`: anon-key client for route handlers; throws a plain error if env is missing |
| `src/lib/server/wkb.ts` | `parsePointWkb(hex: string): [lng, lat]` for EWKB/WKB point hex from PostgREST |
| `src/lib/server/osrm.ts` | `OsrmClient` interface `{ table(points): Promise<Matrix>; route(points): Promise<LineString> }` and `createOsrmClient(baseUrl, fetchImpl = fetch)` |
| `src/lib/server/planRoute.ts` | `validatePlanRequest(body): PlanRouteRequest | { error }`, `pickCandidates(queue, req)` (point-in-polygon via `@/lib/console/area`), `buildEtas(order, matrix, serviceMin, startIso)`, `planRoute(deps, req): Promise<PlanRouteResponse>` orchestration with injected `db`, `osrm` |
| `src/lib/server/dispatch.ts` | `validateDispatchRequest`, `buildDispatchEmail(plan, appUrl): { subject, html, text }` with GMaps links chunked ≤ 8 waypoints per leg, `Mailer` interface, `dispatch(deps, req)` |
| `src/app/api/plan-route/route.ts` | Parse JSON, `planRoute`, map errors to status codes |
| `src/app/api/dispatch/route.ts` | Parse JSON, `dispatch`, map errors |
| `src/lib/server/*.test.ts` | Unit tests for every pure function and both orchestrations with stubbed deps |
| `.env.example` | Document `DISPATCH_FROM_EMAIL` default and Resend note |
| `CLAUDE.md` | "Where things go" bullets updated to point at `src/lib/server/` |

---

### Task 1: Server helpers — Supabase client, WKB parser, OSRM client

**Files:** create `src/lib/server/supabase.ts`, `src/lib/server/wkb.ts`, `src/lib/server/osrm.ts`, `src/lib/server/wkb.test.ts`, `src/lib/server/osrm.test.ts`.

**Requirements:**
- `parsePointWkb(hex)`: accepts PostGIS EWKB hex for a 2-D point with SRID (`0101000020E6100000` + 16 bytes) and plain WKB (`0101000000` + 16 bytes), little-endian; returns `[lng, lat]`; throws `Error("Unsupported WKB")` otherwise. Test with the seeded depot: PostGIS for `SRID=4326;POINT(-0.1246 51.4994)` is `0101000020E6100000` followed by the IEEE-754 doubles for -0.1246 and 51.4994 (compute them in the test with `Buffer`/`DataView`, not by hand), plus a big-endian variant and a garbage string.
- `createOsrmClient(baseUrl, fetchImpl)`: `table(points)` calls `${baseUrl}/table/v1/driving/{lng,lat;…}?annotations=duration,distance` and returns `{ durationMin, distanceKm }` (OSRM gives seconds and metres); `route(points)` calls `${baseUrl}/route/v1/driving/{coords}?overview=full&geometries=geojson` and returns the first route's geometry as `{ type: "LineString", coordinates }`. Non-`Ok` `code` or non-2xx → `Error("Route service unavailable")`. Tests stub `fetchImpl` and assert the exact URL (lng first, semicolon-separated, 6 decimals), unit conversion, and the error path.
- `serverClient()`: `createClient(url, key)` from env; throws `Error("Supabase is not configured")` if either is missing. No test needed beyond typecheck.

**Commit:** "Add server helpers: Supabase client, WKB point parser, OSRM client"

---

### Task 2: `POST /api/plan-route`

**Files:** create `src/lib/server/planRoute.ts`, `src/lib/server/planRoute.test.ts`; rewrite `src/app/api/plan-route/route.ts`.

**Requirements:**
- `validatePlanRequest(body)`: `crew_id` uuid string, `plan_date` `YYYY-MM-DD`, `mode` in manual/count/time; manual needs non-empty `pothole_ids`; count needs `max_stops` ≥ 1; time needs `time_budget_min` ≥ 1; `service_min_per_stop` defaults to 20; `area` optional Polygon. Returns the normalised request or `{ error }` sentence.
- `pickCandidates(queue: PotholeMapRow[], req)`: manual → rows whose id is in `pothole_ids` (preserve queue order); otherwise all rows, filtered by `area` with `pointInPolygon([lng, lat], area)`. Returns `[]` when nothing matches (the handler then returns 400 "No open potholes match that request.").
- `buildEtas(order, matrix, serviceMin, startIso)`: cumulative drive minutes from depot (matrix index 0), service added after each stop; returns ISO strings. Start time is `plan_date` at 08:00 local.
- `planRoute(deps, req)`: `deps = { db: SupabaseClient; osrm: OsrmClient; now?: () => Date }`. Steps: load crew (`crews` select `id, depot`), 404 if missing; parse depot; load `repair_queue` select `*` order `priority.desc`; pick candidates; matrix from `osrm.table([depot, …candidates])`; `solve(candidates.map(c => ({ id, priority })), matrix, { mode, maxStops, timeBudgetMin, serviceMin })`; if `order` is empty → error "No route could be planned for those stops."; `osrm.route([depot, …ordered stops, depot])`; **replace** any existing plan for `(crew_id, plan_date)`: select its id, select its work orders, update those work orders to `cancelled`, update their potholes to `confirmed` where status is `scheduled` and not referenced by another open work order, delete the work orders, delete the plan; insert `route_plans` `{ crew_id, plan_date, status: 'draft', path: EWKT LineString, total_km, total_minutes, baseline_km, objective: { request, candidate_count } }` returning id; insert `work_orders` rows `{ pothole_id, crew_id, route_plan_id, stop_order, status: 'assigned', eta }` returning ids; return the spec response with `stops` carrying `work_order_id`, `pothole_id`, `stop_order`, `eta`, `lng`, `lat`, `severity`, `photo_url`, plus `total_km`, `total_minutes`, `baseline_km` (1 dp / integer minutes) and `path`.
- Tests: validation cases; `pickCandidates` manual/area/none; `buildEtas`; `planRoute` end to end with a fake `db` (a tiny in-memory PostgREST-like stub covering the calls above) and a stub `osrm` returning a fixed matrix and line, asserting the inserted rows, the cancel-and-reset path when a prior plan exists, and the response shape.
- Handler: `POST` parses JSON (400 on invalid JSON), builds deps from `serverClient()` and `createOsrmClient(process.env.OSRM_BASE_URL ?? default)`, maps: validation → 400, crew missing → 404, OSRM error → 502, "No route could be planned" → 400, anything else → 500 with the sentence "The database request failed." Never leaks stack traces.
- Live check: with the dev server running, `curl -s -X POST localhost:3000/api/plan-route -H 'Content-Type: application/json' -d '{"crew_id":"00000000-0000-0000-0000-000000000006","plan_date":"2026-09-03","mode":"count","max_stops":3}'`. If the queue is empty on the live project (likely), expect 400 "No open potholes match that request."; then insert two detections via the REST API (POST `detections` with the seeded device/vehicle ids and two nearby Westminster points, EWKT lng-first) and re-run, expecting a 200 with 2 stops and OSRM-derived km. Leave the inserted rows; they are demo data. Report the exact responses.

**Commit:** "Implement POST /api/plan-route with OSRM and the shared solver"

---

### Task 3: `POST /api/dispatch`, docs

**Files:** create `src/lib/server/dispatch.ts`, `src/lib/server/dispatch.test.ts`; rewrite `src/app/api/dispatch/route.ts`; update `.env.example`, `CLAUDE.md`.

**Requirements:**
- `validateDispatchRequest(body)`: `route_plan_id` uuid, `to` non-empty array of strings containing `@`.
- `buildDispatchEmail(plan, appUrl)`: `plan` is the nested `route_plans_map` row with `crew` and `work_orders` (each with `pothole: potholes_map` row) ordered by `stop_order`. Subject `Repair route for {crew.name}, {plan_date}: {n} stops`. HTML and text bodies: opening line with totals (`{total_km} km`, `{total_minutes} min`), the crew page link `{appUrl}/route/{id}` as the primary call to action, then the stops in order (`{stop_order}. {road_name or "lat, lng"} — severity {x.xx} — eta {HH:MM}` with the before-photo `<img>` when `photo_url` exists), then "Open in Google Maps" links chunked per leg: each link `https://www.google.com/maps/dir/?api=1&origin=LAT,LNG&destination=LAT,LNG&waypoints=LAT,LNG|…&travelmode=driving` with at most 8 waypoints, first leg starting at the depot, last leg ending at the depot. Depot coordinates come from `crew.depot` via `parsePointWkb`. Plain English, no exclamation marks.
- `Mailer` interface `{ send(msg: { from, to, subject, html, text }): Promise<{ id: string }> }`; `createResendMailer(apiKey)` wraps `resend`; when `RESEND_API_KEY` is absent the handler uses a `noopMailer` and the response says `sent: false`.
- `dispatch(deps, req)`: `deps = { db, mailer: Mailer | null, appUrl, from }`. Load `route_plans_map?id=eq.{id}&select=*,crew:crews(*),work_orders(*,pothole:potholes_map(*))&work_orders.order=stop_order`; 404 if missing; build email; send if mailer; update `route_plans` set `status = 'published'`; return `{ route_plan_id, sent: boolean, to, crew_page: "{appUrl}/route/{id}", message_id?: string }`. Mailer failure → error "Email service unavailable." with status 502 and the plan left unpublished.
- Tests: validation; email builder (subject, link, stop lines, chunking with 1, 8, 9 and 20 stops — assert leg boundaries and lat,lng order); `dispatch` with a fake db and a stub mailer, both the sent and the no-mailer paths, and the mailer-failure path leaves status untouched.
- Handler: parse JSON, deps from env, map errors as in Task 2.
- Docs: `.env.example` documents the Resend key as optional with the default sender; `CLAUDE.md` "Where things go" points the solver and dispatch bullets at `src/lib/server/planRoute.ts` and `dispatch.ts`, and states the replan cancel-and-reset rule.
- Live check: dispatch the plan created in Task 2 with `to: ["<the user's email is not known to you; use test@example.com>"]`; expect 200 with `sent: false` if no key is configured (check `grep -c RESEND_API_KEY= .env.local` without printing values), and confirm via REST that `route_plans.status` is `published`.

**Commit:** "Implement POST /api/dispatch with Resend and Google Maps legs"

---

## Out of scope
The crew page `/route/[id]`, device auth, OSRM self-hosting, email templates beyond plain HTML.
