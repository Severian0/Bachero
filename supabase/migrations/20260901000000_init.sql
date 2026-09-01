-- =============================================================================
-- Bachero — initial migration
-- Supabase / Postgres 15+ with PostGIS
--
-- Path:  supabase/migrations/20260901000000_init.sql
-- Apply: `supabase db push`, or paste the whole file into the SQL editor.
--
-- Conventions
--   * Geography columns accept EWKT from clients:  "SRID=4326;POINT(<lng> <lat>)"
--   * PostgREST returns geography as hex WKB. Clients read through the *_map
--     views, which expose lng/lat and GeoJSON instead. Never read raw geography.
--   * Two layers: `detections` = immutable per-pass evidence written by phones;
--     `potholes` = the deduplicated entity with a lifecycle, materialised by the
--     clustering trigger. Clients never write to `potholes` except status.
-- =============================================================================

create extension if not exists postgis;
create extension if not exists pgcrypto;


-- ─── Enums ────────────────────────────────────────────────────────────────────

create type fleet_type        as enum ('bus','refuse_truck','street_sweeper','gritter','pool_car','test_phone');
create type pothole_status    as enum ('suspected','confirmed','scheduled','repaired','false_positive');
create type work_order_status as enum ('open','assigned','in_progress','done','cancelled');
create type route_status      as enum ('draft','published','in_progress','completed');


-- ─── Tenancy ──────────────────────────────────────────────────────────────────

create table authorities (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  boundary    geography(MultiPolygon, 4326),
  created_at  timestamptz not null default now()
);


-- ─── Fleet ────────────────────────────────────────────────────────────────────

create table vehicles (
  id            uuid primary key default gen_random_uuid(),
  authority_id  uuid not null references authorities(id),
  fleet_type    fleet_type not null,
  label         text not null,               -- reg plate / fleet number
  route_ref     text,                        -- bus route "X17", bin round "Tue-North"
  created_at    timestamptz not null default now()
);

create table devices (
  id              uuid primary key default gen_random_uuid(),
  vehicle_id      uuid references vehicles(id),
  platform        text check (platform in ('ios','android','ingest')),
  model           text,
  api_token_hash  text,                      -- for device auth if we skip Supabase Auth
  last_seen_at    timestamptz,
  created_at      timestamptz not null default now()
);

create table trips (
  id          uuid primary key default gen_random_uuid(),
  device_id   uuid not null references devices(id),
  vehicle_id  uuid not null references vehicles(id),
  started_at  timestamptz not null default now(),
  ended_at    timestamptz,
  distance_m  real,                          -- "km of road scanned today"
  path        geography(LineString, 4326)    -- optional; build from vehicle_positions on trip end
);

-- 1 Hz breadcrumb for the live map and coverage stats. NOT the accelerometer stream.
create table vehicle_positions (
  id           bigint generated always as identity primary key,
  trip_id      uuid not null references trips(id) on delete cascade,
  vehicle_id   uuid not null references vehicles(id),
  recorded_at  timestamptz not null,
  location     geography(Point, 4326) not null,
  speed_mps    real,
  heading_deg  real
);
create index vehicle_positions_vehicle_time_idx on vehicle_positions (vehicle_id, recorded_at desc);
create index vehicle_positions_location_idx     on vehicle_positions using gist (location);


-- ─── Evidence layer ───────────────────────────────────────────────────────────

-- One row per vehicle per pass over a bump. Immutable. Detection runs on-device.
create table detections (
  id              uuid primary key default gen_random_uuid(),   -- client may supply, so photo path matches
  trip_id         uuid references trips(id) on delete set null,
  device_id       uuid not null references devices(id),
  vehicle_id      uuid not null references vehicles(id),
  recorded_at     timestamptz not null,
  location        geography(Point, 4326) not null,
  gps_accuracy_m  real,
  speed_mps       real,
  heading_deg     real,
  accel_peak_z    real not null,             -- m/s², gravity removed, high-passed
  accel_window    real[],                    -- ~1 s of vertical samples around the peak, for re-scoring
  severity        real not null check (severity between 0 and 1),  -- speed-normalised, computed on-device
  photo_url       text,                      -- Storage public URL, if the camera was road-facing
  pothole_id      uuid,                      -- set by trigger; FK added below
  created_at      timestamptz not null default now()
);
create index detections_location_idx     on detections using gist (location);
create index detections_pothole_idx      on detections (pothole_id);
create index detections_vehicle_time_idx on detections (vehicle_id, recorded_at desc);


-- ─── Entity layer ─────────────────────────────────────────────────────────────

-- The thing that actually gets repaired. Materialised by clustering detections.
create table potholes (
  id                 uuid primary key default gen_random_uuid(),
  authority_id       uuid not null references authorities(id),
  location           geography(Point, 4326) not null,   -- running centroid of its detections
  road_name          text,                              -- reverse-geocode later
  status             pothole_status not null default 'suspected',
  severity           real not null,                     -- max over detections
  detection_count    int  not null default 1,
  distinct_vehicles  int  not null default 1,
  first_detected_at  timestamptz not null,
  last_detected_at   timestamptz not null,
  repaired_at        timestamptz,
  updated_at         timestamptz not null default now()
);
create index potholes_location_idx on potholes using gist (location);
create index potholes_status_idx   on potholes (authority_id, status);

alter table detections
  add constraint detections_pothole_fk
  foreign key (pothole_id) references potholes(id) on delete set null;

-- Clustering. A detection within RADIUS of an open pothole joins it, else creates one.
-- A second *distinct vehicle* promotes suspected -> confirmed.
create or replace function match_or_create_pothole()
returns trigger language plpgsql as $$
declare
  v_pothole_id uuid;
  v_authority  uuid;
  v_distinct   int;
  v_radius_m   constant real := 12;   -- GPS noise + lane width. Raise to ~20 if one hole splits into two pins.
begin
  select authority_id into v_authority from vehicles where id = new.vehicle_id;

  select p.id into v_pothole_id
  from potholes p
  where p.authority_id = v_authority
    and p.status in ('suspected','confirmed','scheduled')
    and st_dwithin(p.location, new.location, v_radius_m)
  order by p.location <-> new.location
  limit 1;

  if v_pothole_id is null then
    insert into potholes (authority_id, location, severity, first_detected_at, last_detected_at)
    values (v_authority, new.location, new.severity, new.recorded_at, new.recorded_at)
    returning id into v_pothole_id;
  else
    select count(*) into v_distinct from (
      select vehicle_id from detections where pothole_id = v_pothole_id
      union
      select new.vehicle_id
    ) s;

    update potholes p set
      detection_count   = p.detection_count + 1,
      distinct_vehicles = v_distinct,
      severity          = greatest(p.severity, new.severity),
      -- weighted running mean: the point 1/(n+1) of the way from the old centroid to the new fix
      location          = st_lineinterpolatepoint(
                            st_makeline(p.location::geometry, new.location::geometry),
                            1.0 / (p.detection_count + 1)
                          )::geography,
      last_detected_at  = greatest(p.last_detected_at, new.recorded_at),
      status            = case when p.status = 'suspected' and v_distinct >= 2
                               then 'confirmed'::pothole_status
                               else p.status end,
      updated_at        = now()
    where p.id = v_pothole_id;
  end if;

  new.pothole_id := v_pothole_id;
  return new;
end $$;

create trigger detections_cluster
before insert on detections
for each row execute function match_or_create_pothole();


-- ─── Repair layer ─────────────────────────────────────────────────────────────

create table crews (
  id                 uuid primary key default gen_random_uuid(),
  authority_id       uuid not null references authorities(id),
  name               text not null,
  depot              geography(Point, 4326) not null,
  shift_minutes      int not null default 480,
  repairs_per_shift  int not null default 12,
  created_at         timestamptz not null default now()
);

create table route_plans (
  id             uuid primary key default gen_random_uuid(),
  crew_id        uuid not null references crews(id),
  plan_date      date not null,
  status         route_status not null default 'draft',
  path           geography(LineString, 4326),
  total_km       real,
  total_minutes  real,
  baseline_km    real,       -- unoptimised comparison, for the "% saved" number
  objective      jsonb,      -- solver inputs/outputs: mode, budget, weights, candidate count
  created_at     timestamptz not null default now(),
  unique (crew_id, plan_date)
);

create table work_orders (
  id                uuid primary key default gen_random_uuid(),
  pothole_id        uuid not null references potholes(id),
  crew_id           uuid references crews(id),
  route_plan_id     uuid references route_plans(id) on delete set null,
  stop_order        int,
  status            work_order_status not null default 'open',
  eta               timestamptz,
  started_at        timestamptz,
  completed_at      timestamptz,
  before_photo_url  text,
  after_photo_url   text,
  notes             text,
  created_at        timestamptz not null default now(),
  unique (route_plan_id, stop_order)
);
create index work_orders_pothole_idx on work_orders (pothole_id);
create index work_orders_crew_idx    on work_orders (crew_id, status);

-- Work-order status drives pothole status. Closes the loop from crew page -> map.
create or replace function sync_pothole_status()
returns trigger language plpgsql as $$
begin
  if new.status = 'done' and (tg_op = 'INSERT' or old.status is distinct from 'done') then
    update potholes
       set status = 'repaired',
           repaired_at = coalesce(new.completed_at, now()),
           updated_at = now()
     where id = new.pothole_id;
  elsif new.status in ('assigned','in_progress')
        and (tg_op = 'INSERT' or old.status is distinct from new.status) then
    update potholes
       set status = 'scheduled', updated_at = now()
     where id = new.pothole_id and status in ('suspected','confirmed');
  end if;
  return new;
end $$;

create trigger work_orders_sync
after insert or update of status on work_orders
for each row execute function sync_pothole_status();


-- ─── Read models ──────────────────────────────────────────────────────────────
-- Clients read these, not the base tables, so geography never reaches the browser.

-- Every pothole with lng/lat, latest photo, and the routing priority.
create view potholes_map with (security_invoker = true) as
select p.*,
       st_x(p.location::geometry) as lng,
       st_y(p.location::geometry) as lat,
       (select d.photo_url from detections d
         where d.pothole_id = p.id and d.photo_url is not null
         order by d.recorded_at desc limit 1)                                  as photo_url,
       -- priority = severity × corroboration × age (months). Tune freely.
       p.severity
         * ln(1 + p.distinct_vehicles)
         * (1 + extract(epoch from now() - p.first_detected_at) / 86400 / 30)  as priority
from potholes p;

-- Solver input: open, unassigned potholes.
create view repair_queue with (security_invoker = true) as
select m.*
from potholes_map m
where m.status in ('suspected','confirmed')
  and not exists (
    select 1 from work_orders w
    where w.pothole_id = m.id and w.status not in ('done','cancelled')
  );

-- Live vehicle dots.
create view latest_vehicle_positions with (security_invoker = true) as
select distinct on (vp.vehicle_id)
       vp.vehicle_id, vp.trip_id, vp.recorded_at,
       st_x(vp.location::geometry) as lng,
       st_y(vp.location::geometry) as lat,
       vp.speed_mps, vp.heading_deg,
       v.label, v.fleet_type, v.route_ref
from vehicle_positions vp
join vehicles v on v.id = vp.vehicle_id
order by vp.vehicle_id, vp.recorded_at desc;

-- Route plans with the path as GeoJSON. Embed work_orders through this view.
create view route_plans_map with (security_invoker = true) as
select r.*,
       st_asgeojson(r.path::geometry)::jsonb as path_geojson
from route_plans r;


-- ─── Storage ──────────────────────────────────────────────────────────────────

insert into storage.buckets (id, name, public)
values ('detections', 'detections', true)
on conflict (id) do nothing;

create policy demo_storage_read   on storage.objects for select using      (bucket_id = 'detections');
create policy demo_storage_insert on storage.objects for insert with check (bucket_id = 'detections');


-- ─── Realtime ─────────────────────────────────────────────────────────────────

alter publication supabase_realtime add table potholes, vehicle_positions, work_orders, route_plans;


-- ─── RLS ──────────────────────────────────────────────────────────────────────
-- Wide open for the demo. Before anyone real touches it: scope every policy by
-- authority_id via a user -> authority mapping, and move device writes behind
-- an Edge Function that validates devices.api_token_hash.

do $$ declare t text;
begin
  foreach t in array array[
    'authorities','vehicles','devices','trips','vehicle_positions',
    'detections','potholes','crews','route_plans','work_orders'
  ] loop
    execute format('alter table %I enable row level security', t);
    execute format('create policy demo_all on %I for all using (true) with check (true)', t);
  end loop;
end $$;


-- ─── Seed (demo only — drop this block before it becomes a real migration) ────

insert into authorities (id, name)
values ('00000000-0000-0000-0000-000000000001', 'Demo Council');

-- Two vehicles so the second-vehicle confirmation can be demonstrated.
insert into vehicles (id, authority_id, fleet_type, label) values
  ('00000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000001', 'test_phone', 'Phone A (bus 24)'),
  ('00000000-0000-0000-0000-000000000004', '00000000-0000-0000-0000-000000000001', 'test_phone', 'Phone B (bin round N)');

insert into devices (id, vehicle_id, platform) values
  ('00000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-000000000002', 'android'),
  ('00000000-0000-0000-0000-000000000005', '00000000-0000-0000-0000-000000000004', 'ios');

insert into crews (id, authority_id, name, depot) values
  ('00000000-0000-0000-0000-000000000006', '00000000-0000-0000-0000-000000000001', 'Crew A',
   'SRID=4326;POINT(-0.1246 51.4994)');
