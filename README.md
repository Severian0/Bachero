# Bachero

Bachero turns vehicles a council already runs — buses, bin trucks, sweepers — into a pothole-detection network. A phone mounted in each vehicle detects impacts with its accelerometer and GPS. The backend deduplicates and corroborates those detections into potholes: one vehicle's hit is *suspected*, a second vehicle over the same spot makes it *confirmed*. A solver turns the open queue into tomorrow's route for a named crew, an email dispatches it, and the crew closes the loop from a login-free mobile page by marking each stop done.

Full design, endpoint contracts, and the demo script: [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md). The visual design system — tokens, components, map styling, data states, copy — is [docs/design/DESIGN.md](docs/design/DESIGN.md); the stylesheet it documents, `dashboard/src/app/globals.css`, is the canonical version of it.

## Repository layout

| Directory | Role | Tech |
|---|---|---|
| `supabase/` | **Backend.** Schema, PostGIS clustering trigger, status-sync trigger, read-model views, storage bucket, realtime publication, demo seed. | Supabase (Postgres + PostGIS, Realtime, Storage) |
| `dashboard/` | **Frontend + server endpoints.** The operations console at `/` (map, repair queue, record panel, route planner and dispatch), the crew page at `/route/:id`, and the two API route handlers `/api/plan-route` and `/api/dispatch`. | Next.js 16, MapLibre, Tailwind 4, zustand, Resend, OSRM |
| `sensor/` | **Sensor app.** On-device detector; writes detections and GPS breadcrumbs straight to Supabase. | Flutter |
| `docs/` | Architecture spec, design system notes, and an earlier design exploration kept for reference. | Markdown, HTML |

There is no separate API server: the only server-side logic outside the database is the two route handlers in `dashboard/`, and everything else is the database talking to clients through PostgREST and Realtime.

## How data flows

```
phone ──POST detections──▶ trigger: cluster/confirm ──▶ potholes ──Realtime──▶ dashboard map
phone ──POST vehicle_positions (1 Hz)────────────────▶ vehicle_positions ──Realtime──▶ live dots
dashboard ──POST /api/plan-route──▶ OSRM + heuristic ──▶ route_plans + work_orders
dashboard ──POST /api/dispatch────▶ email (Resend) ──▶ crew page ──PATCH work_orders──▶ trigger ──▶ potholes.status = repaired
```

## Getting started

### 1. Database

Create a Supabase project, then apply the migration. It includes a demo seed (one authority, two vehicles with fixed UUIDs, one crew).

```sh
supabase login
supabase link --project-ref <ref>
supabase db push
```

Or paste `supabase/migrations/20260901000000_init.sql` into the SQL editor.

### 2. Dashboard

```sh
cd dashboard
cp .env.example .env.local     # optional: Supabase URL + anon key, Resend key
npm install
npm run dev                    # http://localhost:3000
```

With no `.env.local` the console runs on a synthetic fleet instead of Supabase: three vehicles glide along their routes, the network-scanned figure climbs, and the queue, the record panel, the planner and dispatch all work end to end, no backend required. No new detections arrive in synthetic mode, so the suspected-to-confirmed beat needs a Supabase project. Supabase takes over as soon as `NEXT_PUBLIC_SUPABASE_URL` is set.

Other commands: `npm run build`, `npm run lint`, `npm run typecheck`, `npm test`.

### 3. Sensor app

Flutter project; bootstrap instructions and the detector spec are in [sensor/README.md](sensor/README.md). Each phone is configured as one of the two seeded vehicles in `sensor/lib/config.dart`.

## Things to know before writing code

- Clients read the `*_map` views, never base tables with geography columns (PostgREST returns geography as hex WKB).
- Coordinates are longitude first everywhere except Google Maps links.
- Nothing inserts into `potholes` directly; inserting a `detection` creates or joins one via trigger.
- Row-level security is wide open for the demo. Do not expose the project URL publicly.
