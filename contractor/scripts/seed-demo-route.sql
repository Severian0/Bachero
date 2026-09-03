-- Bachero — a dispatched route for the demo.
--
-- The contractor app reads `route_plans` and `work_orders`. Those rows are
-- normally created by `POST /api/plan-route`, which is still a 501 stub, so
-- until the solver lands there is nothing in the database for a crew to work.
-- This makes one route by hand: the six highest-priority potholes in the queue,
-- assigned to the seeded Crew A, dated today.
--
-- Prerequisite: at least one pothole in `repair_queue`. Potholes are created by
-- inserting detections, so either run the sensor app (Bench mode is enough) or
-- insert a few detection rows for a seeded vehicle.
--
-- Safe to re-run: the plan is unique on (crew_id, plan_date), and the second run
-- reuses it. Stops already worked keep their status, because `repair_queue`
-- excludes potholes that already carry an open work order.
--
-- Run it in the SQL editor, or: psql "$DATABASE_URL" -f seed-demo-route.sql

with plan as (
  insert into route_plans (
    crew_id, plan_date, status, total_km, total_minutes, baseline_km, objective
  )
  values (
    '00000000-0000-0000-0000-000000000006',  -- Crew A, from the init migration's seed
    current_date,
    'published',
    14.2, 312, 21.9,                          -- plausible totals; the solver will compute real ones
    '{"mode":"count","max_stops":6,"seeded_by":"contractor/scripts/seed-demo-route.sql"}'::jsonb
  )
  on conflict (crew_id, plan_date)
    do update set status = 'published'
  returning id
),
picks as (
  select id, row_number() over (order by priority desc) as n
  from repair_queue
  limit 6
)
insert into work_orders (pothole_id, crew_id, route_plan_id, stop_order, status, eta)
select
  picks.id,
  '00000000-0000-0000-0000-000000000006',
  plan.id,
  picks.n,
  'assigned',
  -- 08:00 local, then roughly 26 minutes a stop.
  current_date + time '08:00' + (picks.n - 1) * interval '26 minutes'
from picks, plan
on conflict (route_plan_id, stop_order) do nothing;

-- The route to open. Paste the id into the contractor app: /route/<id>
select
  r.id           as route_plan_id,
  c.name         as crew,
  r.plan_date,
  count(w.id)    as stops
from route_plans r
join crews c on c.id = r.crew_id
left join work_orders w on w.route_plan_id = r.id
where r.crew_id = '00000000-0000-0000-0000-000000000006'
  and r.plan_date = current_date
group by r.id, c.name, r.plan_date;
