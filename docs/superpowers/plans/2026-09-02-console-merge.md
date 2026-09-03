# Console Merge Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Merge two independently built console screens into one: the GOV.UK-styled shell, column, record panel, dispatch sheet and header from `ui/console-redesign`, running on the zustand store, data sources, solver and MapLibre map from `console-map`, with every user-facing feature of both preserved.

**Architecture:** One client screen at `/`. `src/components/Console.tsx` (theirs, rewritten) mounts the data source and keyboard, reads `useConsole`, and renders `Header`, `PotholeMap`, and either `OperationsColumn` or `RecordPanel`, plus `DispatchSheet` and the undo toast. Children take props as today; the shell derives them from the store. `PotholeMap` is our MapLibre map with their polish. Their `lib/model.ts` domain type is retired in favour of our `Pothole`/`Vehicle`/`Crew` from `src/lib/data/types.ts`; their `visual.ts` status table is kept and re-based on those types. Their fixtures, Google loader, nearest-neighbour route, and server-side loader are deleted.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript, Tailwind 4 with the GOV.UK tokens in `src/app/globals.css`, `react-map-gl/maplibre` 8, `zustand` 5, `@supabase/supabase-js` 2, `vitest` 4.

Base commit: `ed1d5fbe` on jj bookmark `console-merged` (merge of `console-map` `9a19962` and `ui/console-redesign` `2e0f500b`). Prior plan and spec: `docs/superpowers/plans/2026-09-02-console-map.md`, `docs/superpowers/specs/2026-09-02-console-map-design.md`. Inventory of their branch is in the SDD workspace of this plan as `inventory.md`.

## Global Constraints

- All app commands run from `dashboard/`. Work is on the jj bookmark `console-merged`, never `main`, never `console-map`, never `ui/console-redesign`. Commit with `jj commit -m "<msg>"` then `jj bookmark set console-merged -r @-`. No `jj git push`. Every commit message ends with the two trailer lines `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>` and `Claude-Session: https://claude.ai/code/session_01T93AKP7HijHL2mbegXmMBQ`.
- **Design system is theirs.** Tokens are the GOV.UK set in `src/app/globals.css`: ink `--ink/--ink-2/--ink-3`; ground `--surface/--canvas/--rule/--rule-soft`; rail `--rail*`; meaning `--action` (blue, work proposed, the primary button) and `--committed` (green, work committed to a crew: scheduled state, on-route ring, dispatch badges), `--severe` (grade-4 severity bar only), `--closed` (repaired); focus `--focus`; type `--font-ui` (Public Sans) / `--font-data` (IBM Plex Mono, tabular) with sizes `--t-micro…--t-metric`; space `--s1…--s7`; radii `--r-sm/--r-md/--r-lg/--r-full`; shadows `--shadow-1/2/3`; `--ease`. Never inline a hex outside `globals.css` and the MapLibre fallbacks in `src/lib/map/tokens.ts`. Never use the old Industry tokens (`--color-*`, `--ink-NN`, `--space-*`, `--font-body/--font-heading`, Tailwind `bg-accent` etc.); they no longer exist.
- Colour meaning: blue proposed, green committed, nothing else carries state. Severity is size and the segmented bar. Status text is always spelled out.
- Motion: tints 120 ms, status change 240 ms, vehicle glide 1200 ms, easing `--ease`. Hover states are tints or the existing pin scale; nothing else animates.
- Copy: civil-service plain English, units on numbers, verb-object buttons, no exclamation marks. Keep their existing copy where it exists.
- Lint rules `react-hooks/purity`, `react-hooks/set-state-in-effect`, `react-hooks/exhaustive-deps` are errors; no disables except the pre-existing `@next/next/no-img-element` on external photos.
- Every task ends with `npm run typecheck && npm run lint && npm test && npm run build` green with zero lint warnings, plus `npm run dev` in the background and `curl -s http://localhost:3000` returning 200. There is no browser; say so in reports.
- Data rules from CLAUDE.md: never read geography columns; longitude first except human-facing coordinate strings; nothing inserts into `potholes`; status changes come from `work_orders` except `false_positive`.

---

## File Structure (target state)

| Path | Responsibility |
|---|---|
| `src/app/page.tsx` | Renders `<Console/>`; no data loading |
| `src/app/layout.tsx` | Their fonts (Public Sans, Plex Mono), `lang="en-GB"` (already merged) |
| `src/app/globals.css` | Their tokens + MapLibre overrides (already merged) |
| `src/components/Console.tsx` | Shell: data source lifecycle, keyboard, store → child props |
| `src/components/Header.tsx` | Their header, fed live/km/vehicles from the store |
| `src/components/PotholeMap.tsx` | MapLibre map composed from `src/components/console/map/*`, with their controls, legend, status panel |
| `src/components/console/map/*` | Our map internals (ConsoleMap, MapLayers, PotholePin, VehicleMarker, TrailLayer, RouteLayer, AreaLayer, CrosshairGuides, Graticule, ScaleBar, useAreaDrag), re-skinned |
| `src/components/OperationsColumn.tsx` | Their column on our types; bottom bar shows selection/plan state |
| `src/components/RecordPanel.tsx` | Their record panel on our types + our detections table |
| `src/components/DetectionFrame.tsx` | Kept as is (synthetic frame when no photo) |
| `src/components/DispatchSheet.tsx` | Their sheet + our planner (crew, mode, budget, area, service time) + our plan result and real dispatch |
| `src/components/Logo.tsx` | Kept |
| `src/lib/console/{store,derive,format,keyboard,area,interpolate}.ts` | Ours, with small extensions noted per task |
| `src/lib/console/visual.ts` | Their `STATUS_VISUAL` + `pinSize`, re-based on our `Pothole` (moved from `src/lib/visual.ts`) |
| `src/lib/console/branding.ts` | `AUTHORITY`, `DIRECTORATE`, `OPERATOR` constants (moved from their fixtures) |
| `src/lib/data/*`, `src/lib/solver/*`, `src/lib/map/*` | Ours, unchanged unless noted |
| Deleted | `src/components/console/Console.tsx`, `ConsoleHeader.tsx`, `column/*`, `map/MapKey.tsx`; `src/lib/{model,fixtures,potholes,route,geo,useMapEngine,mapStyle,visual}.ts`; `@types/google.maps`; `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY` |

Store ↔ their state mapping used throughout: `openId` = `pinnedId`; `linkedId` = `linkedId`; `routeIds` = `selected`; `dispatching` = new `sheetOpen`; `undo` = `pendingDismiss`; `filter` = `filter` with their order `all, confirmed, suspected, scheduled`.

---

### Task 1: Shell on the store

**Files:**
- Rewrite: `src/components/Console.tsx`, `src/app/page.tsx`
- Modify: `src/lib/console/store.ts` (add `sheetOpen` + `setSheetOpen`), `src/lib/console/derive.ts` (`FILTER_CYCLE` becomes `["all","confirmed","suspected","scheduled"]`; add `severityGrade(severity: number): 1|2|3|4` = `Math.min(4, Math.max(1, Math.ceil(severity * 4)))`), `src/lib/console/keyboard.ts` (Enter now opens the linked record via `pin`, not toggle; Esc: sheet open → close sheet, else pinned → unpin, else linked → unlink, else clear selection), tests for all three
- Create: `src/lib/console/branding.ts` (move `AUTHORITY`, `DIRECTORATE`, `OPERATOR` from `src/lib/fixtures.ts`; `AUTHORITY` may be overridden by `NEXT_PUBLIC_AUTHORITY_NAME`)
- Temporary adapter: in `src/lib/model.ts` add `export function toRecord(p: Pothole): ModelPothole` mapping our `Pothole` to their shape (`ref`, `street = displayName(p)`, `locality: ""`, `severity = severityGrade(p.severity)`, `priority`, `status`, `vehicleCount = distinct_vehicles`, `passCount = frameCount = detection_count`, `firstSeenIso/lastSeenIso`, `confidence: null`, `imageUrl = photo_url`, `stopOrder = stop_order`) and `toVehicleRecord(v: Vehicle)`. Task 3 deletes this file once the children take our types.

**Behaviour:** `Console.tsx` is `"use client"`, mounts the data source exactly as our old `components/console/Console.tsx` did (createDataSource → load → setAll/setVehicles/setCrews/setKmToday/setLoadState → subscribe with onPothole/onVehicle/onKmToday; cancellation guard), attaches the keyboard listener (skipping while `sheetOpen` or drawing), and renders their layout (`56px` header row, `minmax(0,1fr) 396px` columns) with: `Header` (Task 5 adapts its props; for now pass `live={isSupabaseConfigured() && loadState === "ready"}`), `PotholeMap` (unchanged Google version for this task; it receives `toRecord`-mapped props), `RecordPanel` when `pinnedId` else `OperationsColumn`, `DispatchSheet` when `sheetOpen`, and the undo toast bound to `pendingDismiss`/`undoDismiss`. Route selection = `selected`; "Plan route" → `setSheetOpen(true)`; their `onDispatched` → for now `resetPlan` + close (Task 4 replaces). `page.tsx` renders `<Console/>` with no props.

**Verification:** tests for `severityGrade` (0 → 1, 0.25 → 1, 0.26 → 2, 0.75 → 3, 1 → 4), `FILTER_CYCLE` order, keyboard Enter/Esc semantics; full suite, typecheck, lint, build, curl. Their `potholes.ts`/`fixtures.ts` may still exist but nothing imports them from the page path.

**Commit:** "Run the GOV.UK console shell on the console store"

---

### Task 2: MapLibre map behind the shell

**Files:**
- Rewrite: `src/components/PotholeMap.tsx` as a thin composition: `<ConsoleMap>` + `<MapLayers/>` + their `MapControls` (zoom in/out via `map.zoomIn/zoomOut` from `useMap`, "Fit network" → fitBounds over all non-false_positive potholes plus `DEPOT`) + their `Legend` (four statuses using `STATUS_VISUAL` swatches) + `MapStatusPanel` for `loading` (before first `load` resolves) and `failed` (tiles error; copy "Basemap unavailable. Pins are still placed by coordinate; the repair queue is unaffected.").
- Modify: `src/components/console/map/*` — re-skin to their tokens: pins use `STATUS_VISUAL[status].fill/stroke/opacity` (move `src/lib/visual.ts` → `src/lib/console/visual.ts`, typed on our `Pothole`, `pinSize(severityGrade(p.severity))` with their sizes), on-route ring `0 0 0 3px var(--committed)`, linked/open ring `0 0 0 3px color-mix(in srgb, var(--action) 35%, transparent)`, open scale 1.35 / linked 1.22 (their transform, `transition: transform 200ms var(--ease), box-shadow 120ms linear`); pins are `<button>`s with their `aria-label`, focusable (`tabIndex` 0), `onFocus`/`onBlur` link/unlink, `onMouseLeave` unlinks; pins outside the active filter dim to opacity 0.28 (`matchesFilter`); vehicle dot `var(--rail)` with white ring and their label chip; crosshair lines `var(--action)` at 45%, label chip `var(--rail)`/`var(--rail-ink)` in `.data`; route line `var(--action)` 2px, stop badges `var(--committed)` white numerals, depot hollow `var(--rail)`; area fill `var(--action)` 8%; trails `var(--action)`; graticule lines `var(--rule-soft)` at 60%, tick labels `.data` `--t-micro` `--ink-3`. `readMapTokens()` reads `--canvas` (ground), `--ink`, `--action`, `--committed`, `--rule` (water uses `--rule-soft`); update `tokens.ts` fallbacks to their hex values and `style.ts` accordingly.
- Pan to the opened record: when `pinnedId` changes to a pothole, `map.panTo([lng, lat])` (react-map-gl `useMap`), once per change.
- Delete: `src/lib/useMapEngine.ts`, `src/lib/mapStyle.ts`, `src/lib/geo.ts` (use `haversineKm` from `src/lib/solver/haversine.ts` if anything still needs it), `src/components/console/map/MapKey.tsx`; `npm uninstall @types/google.maps`; remove `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY` and its comment from `.env.example`.
- `Console.tsx` passes nothing to `PotholeMap` (it reads the store); `useAreaDrag` stays wired through `ConsoleMap` as before.

**Verification:** `style.test.ts` updated for the new token names; `derive.test.ts` pin tests updated (pin styling now comes from `visual.ts`; add `visual.test.ts` covering `pinSize` per grade and `STATUS_VISUAL` keys); grep shows no `--color-`, `--ink-\d\d`, `--space-` or `--font-body` anywhere under `src/`; full suite, typecheck, lint, build, curl.

**Commit:** "Replace the Google map with the MapLibre map re-skinned to the GOV.UK tokens"

---

### Task 3: Column and record panel on our types

**Files:**
- Modify: `src/components/OperationsColumn.tsx`, `src/components/RecordPanel.tsx`, `src/components/DetectionFrame.tsx` to take our `Pothole` (from `src/lib/data/types.ts`): `street` → `displayName(p)`, `ref` → `p.ref`, severity grade via `severityGrade`, `vehicleCount` → `distinct_vehicles`, `passCount` → `detection_count`, `firstSeenIso/lastSeenIso` → `first_detected_at/last_detected_at`, `imageUrl` → `photo_url`, `stopOrder` → `stop_order`; drop `locality`, `confidence`, `frameCount` from copy (or show "—" where a label needs a value). Priority numeral uses `priority(p)`.
- `RecordPanel` gains the detections table from our old `DetailPanel` (Time / Vehicle / Severity / Speed, capped at 8 with "and N more", loading placeholder vs "No detections recorded."), reading `detections[p.id]` from the store; the shell passes `detections` and the panel calls nothing itself.
- Undo toast: keep their markup, bound to `pendingDismiss` with a 10 s bar (`DISMISS_UNDO_MS`), "Undo" → `undoDismiss`. Dismiss → `store.dismiss` (Supabase write in live mode).
- Bottom bar in `OperationsColumn`: shows `"{n} selected for tomorrow"` + `"~{min} min including travel · crew {name}"` before a plan (estimate `n × serviceMinPerStop + round(n × 6.5)`), `"Route planned · N stops · {km} km · {min} min"` after; "Plan route" button disabled unless candidates > 0 (same predicate as our old Footer: manual → selection count; count/time → `countInArea` if an area is set else open count); "Clear" → `clearSelection` (+ `resetPlan` when planned).
- Delete: `src/lib/model.ts` (and `toRecord`), `src/lib/fixtures.ts`, `src/lib/potholes.ts`, `src/lib/route.ts`. `Console.tsx` passes our types directly.

**Verification:** no remaining imports of `@/lib/model`, `@/lib/fixtures`, `@/lib/potholes`, `@/lib/route`; full suite, typecheck, lint, build, curl.

**Commit:** "Move the operations column and record panel onto the console data types"

---

### Task 4: Dispatch sheet becomes the planner and dispatcher

**Files:**
- Rewrite: `src/components/DispatchSheet.tsx`. Keep their modal frame, Escape-to-close, stop list with remove, the "unconfirmed stops" warning, and the crew radio list (crews from the store; no "unavailable" flag exists, so all enabled). Add from our old `Planner`: mode chips "Pick these" / "Best N" / "Time budget", the stops or minutes field by mode, "Minutes per stop", the area status line ("No area · Shift-drag on the map to draw one" / "Area drawn · {n} in area" + Clear), plan date shown. Primary action before a plan: "Plan route" → `store.planRoute()`; while planning "Planning…"; on error the store's sentence. After a plan: the sheet shows `km(total_km)`, `minutes(total_minutes)`, "{pct}% shorter than visiting by priority ({baseline})", the ordered stops with ETAs, remove-stop only in manual mode (toggleSelected then replan), an email field prefilled from `NEXT_PUBLIC_DEMO_CREW_EMAIL`, and "Dispatch to crew" → `store.dispatch(addresses)`; "Sending…"; the confirmation screen shows "Route dispatched", the crew name, `route_plan_id` as the reference, and a link to `/route/{route_plan_id}`; "Discard plan" → `resetPlan` + close.
- The route draws on the map as soon as the plan exists (RouteLayer already reads `plan`), and scheduled pins turn green via the store's upserts.
- `Console.tsx`: "Plan route" opens the sheet; closing the sheet keeps the plan; `sheetOpen` false hides it.

**Verification:** store tests unchanged and green; typecheck, lint, build, curl. Add a `derive`/format-level test only if new pure logic is introduced (e.g. an `addresses(text)` parser: test it).

**Commit:** "Turn the dispatch sheet into the planner and real dispatcher"

---

### Task 5: Header on live data

**Files:**
- Modify: `src/components/Header.tsx` to take `{ live, kmToday, reporting }` and show their feed indicator ("Detector feed live" when live, "Fixture data, feed not connected" otherwise; while loading show the dot only), `"{km} km scanned today"` via `km()`, `plural(reporting, "vehicle") + " reporting"`; operator block from `branding.ts`; authority from `branding.AUTHORITY`.
- `Console.tsx` supplies `live = isSupabaseConfigured() && loadState === "ready"`, `kmToday`, `reporting` (vehicles with a position in the last 60 s).

**Verification:** typecheck, lint, build, curl shows the header strings.

**Commit:** "Feed the header from the console store"

---

### Task 6: Cleanup and consistency

**Files:**
- Delete: `src/components/console/Console.tsx`, `src/components/console/ConsoleHeader.tsx`, `src/components/console/column/` (all), any now-unused files under `src/components/console/map/`.
- Verify no dead exports remain in `src/lib/console/*` (e.g. `useVisibleRows` if it moved); keep `derive.ts` functions that are still used; delete `pinStyle`/`rowStyle` if `visual.ts` replaced them and update `derive.test.ts`.
- `grep -rn '#[0-9a-fA-F]\{3,6\}' src --include=*.tsx --include=*.ts` returns only `globals.css`-adjacent fallbacks in `src/lib/map/tokens.ts`.
- `package.json`: no unused dependencies (`npx depcheck` or manual).

**Verification:** full suite, typecheck, lint, build, curl.

**Commit:** "Remove the superseded console components and dead code"

---

### Task 7: Documentation

**Files:**
- Rewrite `docs/design/DESIGN.md` to describe the GOV.UK system now in `globals.css`: intent (public official, committee register), token tables (ink, ground, rail, meaning with the blue/green two-lane rule, severity/closed, focus), type (Public Sans / Plex Mono, six sizes), space `--s1…--s7`, radii, shadows, motion (unchanged durations), components (btn variants, tags, `.data`, `.micro`), map styling (MapLibre drawing surface: `--canvas` ground, `--rule-soft` water, roads as hairlines in `--ink`, no buildings; pins per `STATUS_VISUAL`; sizes by grade), data states table (suspected hollow, confirmed `--action`, scheduled `--committed` with stop number, repaired `--closed` faded, false_positive removed), interaction (linked selection, keyboard `↑↓ Enter Esc F`, Shift-drag area), copy rules. Keep section 0 as "Source of truth": the stylesheet is canonical; `docs/design/mockup/` and `bachero-console.html` are the earlier Industry-system exploration, retained for reference only.
- Update root `CLAUDE.md`: Layout bullets (components now flat under `dashboard/src/components/` with internals under `components/console/map/`), Design rules section (GOV.UK tokens, blue/green rule, no `--color-*`), Where-things-go bullets for the console.
- Update `README.md` Dashboard step if paths changed.

**Verification:** `grep -n 'Industry\|Inter\b\|--color-' docs/design/DESIGN.md CLAUDE.md` shows only the section-0 historical note.

**Commit:** "Document the GOV.UK design system and the merged console"

---

### Task 8: Final verification

- `npm test && npm run typecheck && npm run lint && npm run build`; build lists `/`, `/api/dispatch`, `/api/plan-route`, `/route/[id]`.
- Dev server curl for `/` contains "Bachero", "Detector feed" or "Fixture data", the filter chips, and "Plan route".
- Write a manual demo checklist for beats 1, 4, 5, 6 into the report.
- Commit anything outstanding; `jj bookmark set console-merged -r @-`; no push.

---

## Self-review notes

Every feature from the inventory of `ui/console-redesign` maps to a task: shell/layout/keyboard/undo (1, 3), map controls/legend/status/dimming/pan-to-open/focusable pins (2), column/record panel/detection frame (3), dispatch sheet flow with crews and warning (4), header (5). Every feature from `console-map` maps to a task: store/realtime/data switch (1), MapLibre map with route/trails/area/vehicles/guides (2), detections table and dismiss writes (3), planner modes/area/solver/real endpoints (4), km/vehicles reporting (5). Deleted files are listed explicitly in the target File Structure.
