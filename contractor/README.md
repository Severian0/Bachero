# Bachero contractor app

The repair contractor's side of Bachero. A crew works the route the council
dispatched, and a supervisor sees every crew's progress. It closes the loop the
console opens: marking a stop done flips `potholes.status` to `repaired`, which
turns the pin green on the console map.

Spec: [`docs/DESIGN.md`](docs/DESIGN.md) in this folder.
Data contracts: `../docs/ARCHITECTURE.md`. Design rules: `../docs/design/DESIGN.md`.

Next.js 16, App Router, `src/`, Tailwind 4, TypeScript, Vitest. Separate from
`dashboard/` — its own app, its own deploy, port 3001 in development.

**Everything this app needs is inside this folder**, including its migration and
its spec, so the branch touches no file anyone else is editing and cannot produce
a merge conflict. Two consequences, both deliberate, both below: the migration is
not where `supabase db push` looks, and the dispatch link needs a one-line change
in `dashboard/` that is not made here.

---

## Run it

```sh
npm install
npm run dev          # http://localhost:3001
```

That is the whole setup. With no `.env.local` the app runs on **fixture data**:
three crews, four route plans, twenty-six stops, and every action working. The
header says `Fixture data` so nobody mistakes it for the real thing.

Other commands:

```sh
npm run build
npm run lint
npm run typecheck        # tsc --noEmit
npm run check:tokens     # design tokens have not drifted from the dashboard
npm test                 # check:tokens, then vitest
```

## Screens

| Route | What it is |
|---|---|
| `/` | **Today.** Every crew's route with progress, and today's totals. |
| `/route/[id]` | **The job screen.** Route header, progress, stops in `stop_order`. |
| `/route/[id]/stop/[workOrderId]` | **The stop.** Where it is, the evidence, and the five actions. |
| `/backlog` | Outstanding work, grouped overdue / due today / dispatched ahead. |
| `/history` | Routes worked in the last fortnight. |
| `/crew/[id]` | One crew's routes and performance. |

Phone-first — the crew screens are used in a van. The board screens reflow for a
supervisor's laptop. Light theme only; no authentication, per `ARCHITECTURE.md` §6.

## What a crew can do at a stop

| Action | Effect |
|---|---|
| Mark arrived | `work_orders.status = 'in_progress'`, `started_at` stamped. |
| Take the after-photo | Resized to 720px at quality 78 in the browser, uploaded to the `detections` bucket, recorded on the work order. **Does not close the stop.** |
| Save note | `work_orders.notes`. What was found and what was done. |
| Mark stop done | `status = 'done'`, `completed_at` stamped. The trigger marks the pothole `repaired`. |
| Cannot repair — escalate | `status = 'cancelled'` with a required note. The pothole returns to the council's queue. |

Nothing here writes to `potholes`. Status flows one way — work order to pothole,
through `sync_pothole_status` — exactly as the schema intends.

## Running against the real database

```sh
cp .env.example .env.local     # Supabase URL + anon key
```

Two things are needed before there is anything to show:

**1. The escalation migration.** `sync_pothole_status` in the init migration has
no `cancelled` branch, so escalating a stop would strand its pothole: no longer
blocked in `repair_queue`, but still `scheduled`, which that view excludes. It
would vanish from the solver and stay scheduled on the map forever.

`migrations/20260903000000_cancel_returns_pothole.sql` adds the missing branch.
It sits in this folder rather than `supabase/migrations/` to keep the branch
conflict-free, and **the Supabase CLI does not look here**, so copy it across
before pushing:

```sh
cp migrations/20260903000000_cancel_returns_pothole.sql ../supabase/migrations/
cd .. && supabase db push
```

Or paste it into the SQL editor. Until it is applied, "Cannot repair — escalate"
strands the pothole silently; the app cannot detect it.

**2. A route to work.** `POST /api/plan-route` is still a 501 stub, so no
`route_plans` row exists. `scripts/seed-demo-route.sql` builds one by hand from
the six highest-priority potholes in `repair_queue` and prints the route id.
It needs potholes to exist first — run the sensor app, in Bench mode if you are
indoors.

Then open `/route/<id>`, mark a stop done, and check in the SQL editor:

```sql
select status, repaired_at from potholes where id = '<pothole id>';   -- repaired
```

That is the trigger firing, and it is beat 7 of the demo script.

## How it is put together

```
docs/DESIGN.md             the spec for this app
migrations/                the one schema change it needs (see above)
scripts/                   token-drift check, demo seed SQL
src/
  app/                       one file per screen; each awaits `params` (Next 16)
  components/
    frame/                   AppHeader, TabStrip, ActionBar, AppFrame
    ui/console.tsx           every primitive, mirroring the sensor app's
                             lib/ui/widgets/console_widgets.dart
    route/                   the job screen, the stop, and its five actions
    board/                   today, backlog, history, crew
  lib/
    types.ts                 view rows (copied from the dashboard) + contractor shapes
    supabase.ts              lazily-created anon client
    crew/
      source.ts              the CrewDataSource interface
      fixture.ts             seeded, in-browser, persistent
      supabase.ts            the real thing
      index.ts               picks by env
      derive.ts              status → mark/word, severity, progress, backlog grouping
      format.ts              units, times, coordinates, plurals
      gmaps.ts               navigation links, chunked per leg
      photo.ts               720px / q78 resize
      outbox.ts              holds work when the van loses signal
      useLoad.ts             loading / ready / error, one pattern for six screens
test/                        vitest over the pure logic
```

`CrewDataSource` is the seam. Screens never know which implementation they have,
which is why the whole app is buildable and demoable with the solver unwritten.

## Design

The tokens in `src/app/globals.css` are a **verbatim copy** of
`dashboard/src/app/globals.css`, which is the source of truth. Two copies drift,
and a drifted copy is exactly the failure "make it match the rest" is about, so
`npm run check:tokens` compares the `:root` and `@theme inline` blocks and fails
if they differ. Change tokens in the dashboard, then copy them here. The same
arrangement as `sensor/lib/theme/tokens.dart`.

Contractor-only component classes are appended below the copied region, so the
check stays exact. They add what a phone needs and the desktop console does not:
a tab strip, a stop badge, a continuous progress rule.

**Status is never carried by colour alone.** There is one accent and no
red/amber/green:

| `work_orders.status` | Row marker | Badge | Word |
|---|---|---|---|
| `assigned` | neutral-400 | hollow, ink-38 stroke | Not started |
| `in_progress` | accent | solid accent | In progress |
| `done` | neutral-300 | hollow neutral-300, row at 55% | Done |
| `cancelled` | neutral-600 | hollow, **dashed** neutral-600 | Escalated |
| `open` | neutral-300 | hollow neutral-300 | Unassigned |

Severity keeps the console's 4-segment bar. Route progress is a *continuous* rule
— segmented bars mean severity and nothing else — and always carries the same
fact in words beside it.

## Where it fits — one change needed in `dashboard/`

The crew screens used to be planned for `dashboard/src/app/route/[id]/page.tsx`,
which is still the "not implemented yet" stub. They live here instead, so the
dispatch email's `/route/{id}` link has to point at this app.

Nothing in `dashboard/` is changed on this branch — that is the point — so
whoever owns `POST /api/dispatch` needs to build the crew link from a new
variable rather than `NEXT_PUBLIC_APP_URL`:

```sh
# dashboard/.env.local and .env.example
NEXT_PUBLIC_CONTRACTOR_URL=http://localhost:3001
```

If you also want old links and bookmarks to keep working, replace the body of
`dashboard/src/app/route/[id]/page.tsx` with a redirect:

```tsx
import { redirect } from "next/navigation";

export default async function CrewRoutePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  redirect(
    `${process.env.NEXT_PUBLIC_CONTRACTOR_URL ?? "http://localhost:3001"}/route/${id}`,
  );
}
```

That is a two-minute change in the dashboard owner's own file, deliberately left
for them to make.

## Not built

- **Authentication.** None, by design (`ARCHITECTURE.md` §6): the link is the
  key and demo RLS is wide open. Every caveat there applies here.
- **A durable outbox.** `outbox.ts` holds work through a tunnel and retries with
  the sensor app's backoff, but a crash loses the queue — the same deliberate
  limit as `sensor/lib/data/upload_queue.dart`.
- **Reordering or skipping stops.** It fights the solver's ordering and
  `unique (route_plan_id, stop_order)`.
- **Multi-authority tenancy.** `authority_id` is on everything, so it is a policy
  change rather than a schema change.

## A note for WSL

On a Windows drive under WSL (`/mnt/c/...`), inotify does not fire, so `next dev`
never sees a file change and Fast Refresh silently serves the old bundle. Restart
the dev server after editing, or work from the Linux filesystem.
