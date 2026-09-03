-- =============================================================================
-- Bachero — a cancelled work order returns its pothole to the queue
--
-- Path:  contractor/migrations/20260903000000_cancel_returns_pothole.sql
--
--   *** THIS IS NOT WHERE THE SUPABASE CLI LOOKS. ***
--
--   It lives in the contractor app's folder so that this branch touches nothing
--   outside `contractor/` and cannot conflict with anyone else's work. The CLI
--   only reads `supabase/migrations/`, so `supabase db push` will NOT apply it
--   from here. To apply it, do one of:
--
--     cp contractor/migrations/20260903000000_cancel_returns_pothole.sql \
--        supabase/migrations/ && supabase db push
--
--   or paste this file into the SQL editor.
--
--   Until it is applied, the contractor app's "Cannot repair — escalate" action
--   silently strands the pothole (see below). The app cannot detect this; the
--   only symptom is a pothole that never comes back to the queue.
--
-- Why
--   `sync_pothole_status` in the init migration handles two transitions:
--   `done` -> the pothole is `repaired`, and `assigned`/`in_progress` -> the
--   pothole is `scheduled`. It does not handle `cancelled`.
--
--   That leaves a hole. When a crew reaches a stop it cannot repair — the
--   failure is 2 m across and needs a planing gang and a lane closure — the
--   honest record is `work_orders.status = 'cancelled'` with a note. But then:
--
--     * the work order no longer blocks the pothole in `repair_queue`
--       (the view excludes work orders that are `done` or `cancelled`), yet
--     * `potholes.status` is still `scheduled`, and `repair_queue` only admits
--       `suspected` and `confirmed`.
--
--   So the pothole matches neither condition and disappears: not on anyone's
--   route, not in the solver's candidates, and still drawn as `scheduled` on
--   the console map. The only way back would be an operator editing a row by
--   hand.
--
--   This adds the missing branch: cancelling a work order puts the pothole
--   back to `confirmed`, which is exactly what it was before it was scheduled.
--   The evidence is unchanged — the hole was corroborated and it is still
--   there — so `confirmed` is the truthful state, not `suspected`.
--
-- Written for the contractor app's "Cannot repair — escalate to the council"
-- action (`contractor/src/components/route/EscalateDialog.tsx`), which is the
-- only thing that produces a cancelled work order today.
--
-- `create or replace function` keeps the existing `work_orders_sync` trigger
-- bound to it, so no trigger is dropped or recreated.
-- =============================================================================

create or replace function sync_pothole_status()
returns trigger language plpgsql as $$
begin
  if new.status = 'done' and (tg_op = 'INSERT' or old.status is distinct from 'done') then
    update potholes
       set status = 'repaired',
           repaired_at = coalesce(new.completed_at, now()),
           updated_at = now()
     where id = new.pothole_id;

  -- New. A stop handed back to the council rejoins the repair queue.
  elsif new.status = 'cancelled'
        and (tg_op = 'INSERT' or old.status is distinct from 'cancelled') then
    update potholes
       set status = 'confirmed', updated_at = now()
     where id = new.pothole_id
       and status = 'scheduled';   -- never resurrect a repaired or dismissed hole

  elsif new.status in ('assigned','in_progress')
        and (tg_op = 'INSERT' or old.status is distinct from new.status) then
    update potholes
       set status = 'scheduled', updated_at = now()
     where id = new.pothole_id and status in ('suspected','confirmed');
  end if;
  return new;
end $$;
