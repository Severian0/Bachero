# Bachero — MVP architecture

Bachero turns vehicles a council already runs — buses, bin trucks — into a pothole-detection network. Phones (later: fixed sensors) detect impacts, the backend deduplicates and corroborates them into potholes, a solver turns the queue into a crew's route for tomorrow, and the crew closes the loop by marking stops done.

Migration: `supabase/migrations/20260901000000_init.sql`. Everything below assumes it has been applied.

## 1. Components

| Component | Tech | Responsibility |
|---|---|---|
| Sensor app | Flutter, phone mounted in vehicle | Accelerometer + GPS (+ camera). Runs the detector on-device. Writes to Supabase directly with the anon key. |
| Backend | Supabase: Postgres + PostGIS, Realtime, Storage, Auth | Source of truth. Clustering and confirmation happen in a DB trigger. Realtime pushes `potholes` / `vehicle_positions` / `work_orders` changes to clients. Storage holds photos. |
| Dashboard | Next.js on Vercel, MapLibre/Mapbox | Live map (vehicles + potholes), detail panel, route planner, dispatch. |
| Server endpoints | Next.js API routes (or Supabase Edge Functions) | `POST /api/plan-route` (solver), `POST /api/dispatch` (email). Use OSRM's public server for distance matrix + geometry, Resend for email. |
| Crew page | `/route/:id`, login-free mobile web page | Stops in order, photos, GMaps links, "arrived" / "done" buttons. |

Data flow:

```
phone ──POST detections──▶ trigger: cluster/confirm ──▶ potholes ──Realtime──▶ dashboard map
phone ──POST vehicle_positions (1 Hz)────────────────▶ vehicle_positions ──Realtime──▶ live dots
dashboard ──POST /api/plan-route──▶ OSRM + heuristic ──▶ route_plans + work_orders
dashboard ──POST /api/dispatch────▶ email (Resend) ──▶ crew page ──PATCH work_orders──▶ trigger ──▶ potholes.status = repaired ──Realtime──▶ pin turns green
```

## 2. Data model

Four layers. Tables are in the migration; this is what they mean.

**Fleet** — `authorities` (tenant), `vehicles`, `devices` (a phone, attached to a vehicle), `trips` (one recording session), `vehicle_positions` (1 Hz breadcrumb, for the live map and "km scanned").

**Evidence** — `detections`. One row per vehicle per pass over a bump. Immutable. Carries the accelerometer signature (`accel_peak_z`, `accel_window`), speed, GPS accuracy, a speed-normalised `severity` in [0,1], and an optional `photo_url`. Phones write here and nowhere else meaningful.

**Entity** — `potholes`. The deduplicated thing with a lifecycle: `suspected → confirmed → scheduled → repaired`, or `false_positive`. Nobody inserts here. The `BEFORE INSERT` trigger on `detections`:

1. finds the nearest open pothole within 12 m (`ST_DWithin`, geography, so metres);
2. if none, creates one; otherwise increments `detection_count`, recomputes `distinct_vehicles`, takes `max(severity)`, moves the centroid to the weighted mean, and promotes `suspected → confirmed` once a **second distinct vehicle** has hit it;
3. stamps `pothole_id` on the detection.

Insert a detection, the map updates. That's the whole write path.

**Repair** — `crews` (with a depot), `route_plans` (one per crew per day; solver output incl. `baseline_km` and an `objective` blob), `work_orders` (pothole × crew, with `stop_order` on the route). A trigger on `work_orders.status` drives `potholes.status`: `assigned`/`in_progress → scheduled`, `done → repaired`.

**Read models** — clients read views, never base tables with geography (PostgREST returns geography as hex WKB):

| View | Use |
|---|---|
| `potholes_map` | every pothole + `lng`, `lat`, latest `photo_url`, `priority` |
| `repair_queue` | `potholes_map` filtered to open + unassigned — the solver's input |
| `latest_vehicle_positions` | one row per vehicle with `lng`, `lat`, label |
| `route_plans_map` | `route_plans` + `path_geojson`; embed `work_orders` through it |

`priority = severity × ln(1 + distinct_vehicles) × (1 + age_in_months)`. Arbitrary; tune it in the view.

## 3. Sensor app

### Detector (on-device)

- High-pass the vertical axis (removes gravity and road grade). Fire when |z| exceeds a threshold — start at ~2.5 m/s² and calibrate.
- 1 s debounce so one hole isn't three detections.
- Discard if GPS accuracy > 20 m or speed < 2 m/s (stationary jolts are doors and passengers).
- `severity = clamp(peak_z / (a + b · speed_mps), 0, 1)`. The same hole hits harder at speed, so divide it out. Fit `a`, `b` by driving over one known speed bump at two speeds.
- Keep ~1 s of raw vertical samples around the peak in `accel_window` so severity can be re-scored server-side later without re-driving.
- Post a GPS breadcrumb every second, batched every ~5 s.

### Requests

All PostgREST. Headers: `apikey: <anon>`, `Authorization: Bearer <anon>`, `Content-Type: application/json`. Geography as EWKT: `"SRID=4326;POINT(lng lat)"` — **longitude first**.

| When | Request | Body |
|---|---|---|
| Start recording | `POST /rest/v1/trips` + `Prefer: return=representation` | `{device_id, vehicle_id}` → returns `id` |
| Every ~5 s | `POST /rest/v1/vehicle_positions` | array of `{trip_id, vehicle_id, recorded_at, location, speed_mps, heading_deg}` |
| On detection, if camera | `POST /storage/v1/object/detections/{detection_id}.jpg` | image bytes. Generate the detection UUID on the phone first so the path matches. Public URL is `/storage/v1/object/public/detections/{detection_id}.jpg` |
| On detection | `POST /rest/v1/detections` | see below |
| Stop recording | `PATCH /rest/v1/trips?id=eq.{id}` | `{ended_at, distance_m}` |

Detection body:

```json
{
  "id": "…client-generated uuid…",
  "trip_id": "…", "device_id": "…", "vehicle_id": "…",
  "recorded_at": "2026-09-01T10:14:03.210Z",
  "location": "SRID=4326;POINT(-0.1275 51.5072)",
  "gps_accuracy_m": 6.5,
  "speed_mps": 8.2,
  "heading_deg": 271,
  "accel_peak_z": 4.7,
  "accel_window": [0.1, 0.3, 4.7, -3.9, 1.2],
  "severity": 0.62,
  "photo_url": "https://<project>.supabase.co/storage/v1/object/public/detections/<id>.jpg"
}
```

Nothing else to do; the trigger sets `pothole_id`.

## 4. Dashboard

| Purpose | Request |
|---|---|
| Initial pothole layer | `GET /rest/v1/potholes_map?status=in.(suspected,confirmed,scheduled)` |
| Live updates | Realtime `postgres_changes` on `public.potholes` (all events) and `public.vehicle_positions` (INSERT). On a pothole change, re-fetch that row from `potholes_map` (or compute lng/lat from the payload) |
| Initial vehicle dots | `GET /rest/v1/latest_vehicle_positions` |
| Detail panel | `GET /rest/v1/detections?pothole_id=eq.{id}&order=recorded_at.desc` |
| Dismiss a false positive | `PATCH /rest/v1/potholes?id=eq.{id}` `{"status":"false_positive"}` |
| Queue table / solver preview | `GET /rest/v1/repair_queue?order=priority.desc` |
| Crews | `GET /rest/v1/crews_map` (depot as `depot_lng`/`depot_lat`); the settings page writes `crews` with an EWKT `depot` |
| Plan a route | `POST /api/plan-route` (§5) |
| Dispatch | `POST /api/dispatch` (§5) |
| Route detail (one call, nested) | `GET /rest/v1/route_plans_map?id=eq.{id}&select=*,crew:crews(*),work_orders(*,pothole:potholes_map(*))&work_orders.order=stop_order` |

Realtime subscription (supabase-js):

```ts
supabase.channel('map')
  .on('postgres_changes', { event: '*', schema: 'public', table: 'potholes' }, onPothole)
  .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'vehicle_positions' }, onPosition)
  .subscribe();
```

## 5. Server endpoints

### `POST /api/plan-route`

The three planning modes ("pick these", "best N", "best use of T minutes in this area") are one solver with different constraints. Candidates × constraint × objective. Formally it's the orienteering problem (prize-collecting TSP); a heuristic is fine at ≤50 stops.

Request:

```json
{
  "crew_id": "…",
  "plan_date": "2026-09-02",
  "mode": "manual | count | time",
  "pothole_ids": ["…"],          // manual
  "max_stops": 12,               // count
  "time_budget_min": 480,        // time
  "area": { "type": "Polygon", "coordinates": [[[lng,lat], …]] },   // optional filter
  "service_min_per_stop": 20
}
```

Server steps:

1. Candidates = `repair_queue`, filtered by `pothole_ids` or point-in-polygon on `area` (turf on the server is fine).
2. Duration/distance matrix: `GET https://router.project-osrm.org/table/v1/driving/{lng,lat;lng,lat;…}?annotations=duration,distance` with the depot at index 0. Public demo server — rate-limited, no SLA, fine for a hackathon.
3. Greedy insertion: repeatedly add the candidate maximising `priority / marginal_minutes` at its best insertion point, until the budget (stop count or `drive + service + return-to-depot ≤ time_budget_min`) is exhausted. Then 2-opt.
4. `baseline_km` = the same stops visited in descending priority order, unoptimised. This is the "% saved" number the dashboard shows.
5. Geometry: `GET https://router.project-osrm.org/route/v1/driving/{coords}?overview=full&geometries=geojson`.
6. Insert `route_plans` (path, totals, `objective` = the request + candidate count) and `work_orders` (`status: assigned`, `stop_order`, `eta`). The trigger marks the potholes `scheduled`.

Response:

```json
{
  "route_plan_id": "…",
  "stops": [{ "work_order_id": "…", "pothole_id": "…", "stop_order": 1, "eta": "…",
              "lng": -0.13, "lat": 51.50, "severity": 0.8, "photo_url": "…" }],
  "total_km": 14.2, "total_minutes": 312, "baseline_km": 21.9,
  "path": { "type": "LineString", "coordinates": [[lng,lat], …] }
}
```

### `POST /api/dispatch`

Request: `{ "route_plan_id": "…", "to": ["crew@council.gov.uk"] }`.

Builds the email — stops in order with severity and before-photos, a link to `/route/{id}`, and Google Maps deep links — sends via Resend, sets `route_plans.status = 'published'`.

GMaps link format:
`https://www.google.com/maps/dir/?api=1&origin=LAT,LNG&destination=LAT,LNG&waypoints=LAT,LNG|LAT,LNG&travelmode=driving`
Waypoint limits vary by platform (~9 on desktop, fewer on mobile). Make the crew page the primary link and chunk GMaps links per leg.

## 6. Crew page (`/route/:id`)

No login. Fetches the same nested `route_plans_map` query as the dashboard.

| Action | Request |
|---|---|
| Arrived | `PATCH /rest/v1/work_orders?id=eq.{id}` `{"status":"in_progress","started_at":"…"}` |
| After photo | `POST /storage/v1/object/detections/after_{work_order_id}.jpg` |
| Done | `PATCH /rest/v1/work_orders?id=eq.{id}` `{"status":"done","completed_at":"…","after_photo_url":"…"}` |

The `done` PATCH fires the trigger, the pothole becomes `repaired`, and Realtime turns the pin green on the dashboard. End the demo on that.

## 7. Demo script and gotchas

Beats, in order:

1. Live map: two phones registered as two vehicles, dots moving, "km scanned today" ticking.
2. Phone A hits a hole → pin appears, `suspected`.
3. Phone B hits the same hole → same pin, count 2, `confirmed`. **This is the network effect; don't skip it.** Confirmation needs a second *vehicle*, so two phones, not one phone twice.
4. Detail panel: passes, severity, photo.
5. Dismiss a speed bump as `false_positive` — frame it as a feature, because your judges' route will have speed bumps and manholes.
6. Plan: pick "best 6 stops in this area", show the route and the km saved vs baseline.
7. Dispatch email → open crew page on a phone → mark one done → pin goes green.

Gotchas:

- Poor GPS splits one hole into two pins: raise `v_radius_m` in the trigger from 12 to ~20.
- `lng` before `lat` in EWKT. Every geospatial bug in the next 48 hours will be this.
- The seed has two vehicles/devices with fixed UUIDs; hardcode them in the sensor app config.
- RLS is wide open (`demo_all` policies). Do not put this URL on a slide.

## 8. Deliberately not built

- Snapping potholes to OSM road segments / street names (`potholes.road_name` exists for a reverse-geocode later).
- Time partitioning on `vehicle_positions`.
- Real device auth. `devices.api_token_hash` is there; the check would live in an Edge Function.
- Multi-tenant RLS. `authority_id` is on everything so it's a policy change, not a schema change.

## 9. Pitch skeleton

**Problem.** The 2026 ALARM survey puts the carriageway repair backlog for England and Wales at a record £18.62bn — about 12 years of work — with local roads resurfaced on average once every 97 years. Councils filled 1.9 million potholes last year (over 5,200 a day) at a cost of £149.3m, roughly £79 per hole. The AA attended 137,000 pothole-related callouts in January–February 2026 alone, up 25,000 year on year; around three in ten drivers report pothole damage in the past year, averaging £590 per repair. Sources: [Highways News](https://highways-news.com/breaking-news-local-authorities-face-18-62bn-road-repairs-backlog/), [Motor Transport](https://motortransport.co.uk/industry-news/18bn-twelve-year-backlog-of-pothole-repairs-despite-extra-funding-alarm-survey-reveals/89734.article).

**Who has it.** Highway authorities (~200 in England and Wales) — finding potholes is a cost before fixing them is. Drivers, and disproportionately cyclists and motorcyclists. DfT and the Treasury, who learn the state of the network from an annual survey with a 79% response rate.

**Current solution.** Reactive and sample-based: public reports (FixMyStreet, council apps) skew to vocal residents; routine safety inspections cover a street every few weeks to months; machine condition surveys run annually; crews work off an inspector's list, not an optimised route. Commercial: Gaist, Route Reports and Vaisala RoadAI already sell camera systems mounted on council vehicles — expect a judge to raise this. The answer is cost and coverage, not the idea: a phone-grade accelerometer is a rounding error against a camera unit, so it can go on every vehicle rather than a pilot handful.

**New solution.** Every bus route scanned daily and every residential street weekly, by vehicles the council already pays to drive, at near-zero marginal cost. Multiple passes corroborate rather than duplicate; severity is measured rather than reported; the output isn't a map, it's tomorrow's route for a named crew, with the loop closed when they mark it done. For the Parliament room: one schema across authorities gives DfT a live national backlog instead of an annual survey.
