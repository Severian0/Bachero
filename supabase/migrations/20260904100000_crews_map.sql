-- =============================================================================
-- Bachero — crews, readable and writable from the dashboard
--
-- Path:  supabase/migrations/20260904100000_crews_map.sql
-- Apply: `supabase db push`, or paste this file into the SQL editor.
--
-- Why
--   `crews.depot` is a geography column, and PostgREST hands geography to a
--   browser as hex WKB. The dashboard's settings page lets an operator add a
--   crew and place its depot on the map, so it needs the depot back as a
--   longitude and a latitude, the same way `potholes_map` exposes `location`.
--
-- What
--   `crews_map`: every crew column plus `depot_lng` / `depot_lat`. Clients
--   read this view and write the base table (PostgREST accepts EWKT text,
--   `SRID=4326;POINT(lng lat)`, for a geography column). The route solver
--   keeps reading `crews.depot` server-side.
-- =============================================================================

create view crews_map with (security_invoker = true) as
select c.*,
       st_x(c.depot::geometry) as depot_lng,
       st_y(c.depot::geometry) as depot_lat
from crews c;
