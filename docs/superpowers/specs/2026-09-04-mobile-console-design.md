# Console on a phone — design

Date: 2026-09-04. Owner: Jeremy (web app). Status: approved for planning.

The console at `/` on a portrait phone (360–430px wide, touch), so a judge can watch the
map, tap a pin, read the record, press Plan nearest, dispatch in the sheet and see the pin
turn green. Same components, same store, same one modal. Nothing changes on a desktop.

This amends `docs/superpowers/specs/2026-09-02-console-map-design.md` §12, which put mobile
layout out of scope, and adds a phone frame to `docs/design/DESIGN.md` §3. Design rules are
DESIGN.md; data and endpoints are `docs/ARCHITECTURE.md`. Neither is repeated here.

## 1. Decisions taken

| Decision | Choice | Why |
|---|---|---|
| Frame model | Three grid rows: header, map, panel. The panel is a real row, not an overlay | The map is never covered, so no pin can hide under a sheet, no measured offsets, no MapLibre padding maths, no shadow inside the layout (DESIGN.md §3). Matches the in-repo phone precedent `components/crew/CrewRoute.tsx` |
| Panel contents | The unchanged `OperationsColumn` / `RecordPanel`, chosen by `pinnedId` as on desktop | Zero new panel components; the DispatchSheet stays the only interrupting surface |
| Panel heights | `queue` 50dvh, `record` 66dvh, `map` auto (handle + route bar only) | Set from store state, changed instantly. No transition: the motion budget is untouched |
| Panel control | One labelled two-state button in a 44px handle: "Show map" / "Show queue" | No grabber, no drag physics, no cycle; one tap either way |
| Hover on touch | None. Tap opens; the open record is the linked one | `pin()` already sets both ids; a "linked but not open" state has no touch affordance |
| Breakpoint | `max-width: 1023px`, in `globals.css` | Below it the phone frame; at 1024px and above the desktop grid is byte-identical |
| Layout state | CSS media queries plus one store field `panel`; no JS media-query hook for layout | The server render matches the client; no hydration branch |
| Viewport | `viewportFit: cover`, `interactiveWidget: resizes-content`, no `themeColor` | Safe-area insets for the header and the three bottom bars; a hex outside `globals.css` is forbidden |
| Two-finger rotate and pitch | Disabled | DESIGN.md §5 disables rotation and pitch; touch had been left at the MapLibre defaults |
| Zoom buttons | Hidden under `(pointer: coarse)`; Fit network stays | Pinch, double-tap and two-finger tap zoom; the top of the map is freed for the undo toast |
| Key (legend) | Kept as a bottom-left toggle "Show key" / "Hide key" | §5 mandates the key; it cannot be always-on over a 360px map |
| Docs | DESIGN.md §3/§5/§7 addenda, CLAUDE.md and the console-map spec corrected in the same change | The stylesheet is canonical and the docs must not disagree with it; the shift-drag text is already stale |

Light theme only. Landscape phones get the two-column rule in §2.

## 2. Breakpoints

All media queries live in `dashboard/src/app/globals.css`; media queries cannot read custom
properties, so the literals live there like 56/396/58 do.

| Query | Purpose |
|---|---|
| `@media (max-width: 1023px)` | The phone frame (§3). |
| `@media (max-width: 1023px) and (max-height: 520px)` | Landscape phones: back to two columns, `grid-template-columns: minmax(0,1fr) minmax(300px, 42%)`, panel height `auto`, handle hidden. |
| `@media (pointer: coarse)` | Touch targets (§5) and hidden scrollbars, at any width. |
| `@media (hover: hover)` | Wraps every existing `:hover` tint so a tapped control does not stay tinted. `:active` tints are added unconditionally. |

Unconditional fixes at every width: `html, body { overscroll-behavior: none }`; the header
gets `min-width: 0` (its ~1062px content minimum currently sizes the whole frame); the frame
gets `grid-template-columns: minmax(0,1fr)`.

## 3. Layout per state (portrait phone, 390×844)

Frame: `.console-frame` is `height: 100dvh; display: grid; grid-template-rows:
calc(var(--console-header-h) + env(safe-area-inset-top)) minmax(0,1fr) auto; overflow: hidden`.
`main.console-main` stops being a two-column grid and becomes `display: contents`, so the map
section and the aside are the frame's second and third rows.

**Header** (56px + inset, `--rail`): Mark, wordmark, feed dot, one `.data` line "12.4 km
today", initials avatar. Hidden below 1024px: tagline, clock, operator name and authority,
the "vehicles reporting" line. The feed sentence, the reporting line and the operator text
stay in the DOM as `.visually-hidden` so status is still spelled out for assistive tech.

**Panel** (`aside.console-aside[data-panel]`, set by Console from `opened ? "record" : panel`):

| `data-panel` | Height | Map height | Contents, top to bottom |
|---|---|---|---|
| `queue` (default) | `var(--console-panel-h)` = 50dvh (422px) | 366px | Handle (44px, `--canvas`: `.micro` "Repair queue", `.secondary` "14 shown", right-aligned `.btn btn-quiet btn-sm` "Show map") · filter chips as a scrolling strip · list (`overflow-y: auto; overscroll-behavior: contain`, 58px rows, about four visible) · route bar. Hidden on the phone: the metrics strip (km is in the header, counts are on the chips) and the "Repair queue" heading (the handle replaces it). |
| `record` (`pinnedId` set) | `var(--console-record-h)` = 66dvh (557px) | 231px | `RecordPanel` unchanged: "Repair queue" back button row, scrolling body, footer with full-width "Add to route" / "Remove from route" and "Dismiss as false positive". `PanToOpenRecord` calls `map.resize()` then `map.panTo()`, so the pin lands in the centre of the 231px map. Back calls `closeRecord()` and the panel returns to whatever `panel` was. |
| `map` | `auto` (~106px) | ~682px | Handle (button reads "Show queue") and the route bar. The state for the live beats: vehicle tween, suspected → confirmed fill, the pin turning green after the crew marks a stop done. |

**Route bar** (bottom edge of the panel in every state): `padding-bottom: calc(var(--s3) +
env(safe-area-inset-bottom))`; text block `min-width: 0`; `flex-wrap: wrap` so the planned
line ("Route planned · 5 stops · 12.3 km · 140 min") sits above a full-width "Plan route" /
"Open route" button when it would otherwise wrap beside it. "Clear" becomes `.route-clear`:
same underlined text, `display: inline-flex; min-height: 38px` on coarse pointers.

**Sheet open**: `DispatchSheet` renders the same flow, bottom-anchored: scrim `padding: 0;
align-items: end`; panel `width: 100%; max-height: 100dvh; border-radius: var(--r-lg)
var(--r-lg) 0 0`; body `overscroll-behavior: contain`; footer `display: grid;
grid-template-columns: 1fr 1fr; padding-bottom: calc(var(--s3) + env(safe-area-inset-bottom))`
with the secondary button left. `bch-rise` stays as the entrance. Header and `main` are
`inert` while it is open. With `interactiveWidget: resizes-content` the viewport shrinks for
the keyboard on Android; on iOS the 17px inputs (§5) stop the focus zoom.

**Undo toast**: `position: fixed; top: calc(var(--console-header-h) + env(safe-area-inset-top)
+ var(--s3)); left: var(--s3); right: var(--s3); bottom: auto`, text `min-width: 0` and
wrapping, Undo 38px. It lies over the top of the map, the one place with no chrome once the
zoom cluster is hidden, and never over the route bar or Plan nearest. Same `--rail` card,
same `bch-rise`, same 10s bar.

Height changes are instant, like the record replacing the queue on desktop. MapLibre picks up
the new container size through `trackResize`; the only explicit `resize()` is the one before
`panTo`.

## 4. Touch interactions

Every touch affordance calls the store action the keyboard already calls. No parallel state.

| Desktop | Phone | Mechanism |
|---|---|---|
| Hover a pin or row → link | Nothing. There is no "linked but not open" state on touch | `PotholePin`, `QueueRow` and the map `<section>` move from `onMouseEnter/Leave` to `onPointerEnter/Leave`, ignored when `e.pointerType === "touch"`. Mouse and pen still hover. `onFocus/onBlur` stay for keyboards |
| Click a pin or row → open | Tap → open. `pin(id)` links and opens in one step; the pin scales to 1.35 under the finger, guides and coordinate draw for the open record | Existing `onClick` |
| Esc → close record | "Repair queue" back button | New store action `closeRecord()` = `{ pinnedId: null, linkedId: null }`, used by Back on every pointer. `unpin()` and the Esc ladder in `keyboard.ts` are unchanged |
| Esc → drop link | Tap on empty map | `onClick` on `<Map>` → `unlink()`. A no-op while a record is open (store guard); the pin button's `stopPropagation` keeps a pin tap from reaching it |
| Esc → clear selection | "Clear" in the route bar | Existing, 38px hit on coarse pointers |
| Esc → close sheet | Close X (38px on coarse pointers), Cancel, Back to the queue | Existing `setSheetOpen(false)` |
| F → cycle filter | Filter chips | Existing; the row scrolls horizontally |
| ↑ ↓ Enter | No touch form needed | — |
| Shift-drag plan area | Nothing | The tool no longer exists in this workspace (jj `ospnpoopzzyn`). The stale sentences in CLAUDE.md and DESIGN.md come out |
| Two-finger rotate / pitch | Disabled | `touchPitch={false}`, `maxPitch={0}`, and in `onLoad` `e.target.touchZoomRotate.disableRotation()`. Pinch zoom stays. Same fix in `crew/DriveMap.tsx` |
| Mouse leaves the map → unlink | Not needed | Touch never sets `linkedId`, so nothing can go stale |
| Hover tints | `:active` tints, same tokens, 120ms | `@media (hover: hover)` around the `:hover` rules |

Rejected: long-press to add to route (adding is a decision made in the record) and "tap once
to link, tap again to open" (a hidden two-step with no visible affordance). Pins keep their
14–26px visuals from `pinSize()` and the 44px hit box.

## 5. Map chrome and touch targets

Below 1024px:

- **Top-right**: "Fit network" (`.btn btn-secondary btn-sm`) alone; the zoom cluster is
  `display: none` under `(pointer: coarse)`. Both `fitBounds` call sites use one helper,
  `fitAll(map, points, padding)`, from `lib/console/camera.ts`; on coarse pointers the padding
  is `{ top: 56, right: 16, bottom: 56, left: 16 }` and `maxZoom` is 16 so the seeded cluster
  spreads under a finger. Desktop keeps `padding: 40, maxZoom: 15`.
- **Bottom-left**: a row of "Plan nearest" (`.btn btn-primary`, unchanged) and "Show key"
  (`.btn btn-secondary btn-sm`, `aria-expanded`). The Legend card is hidden until tapped,
  appears above the row (no animation), and "Hide key" removes it. Same `LEGEND` table, same
  `STATUS_VISUAL`. Desktop keeps the always-visible card. The row is at most 190px wide so it
  never meets the scale bar at 360px.
- **Bottom-right**: scale bar and compact attribution unchanged.
- **Top-centre notices** (`MapStatusPanel` failed card, `PreviewDriveLayer` banner):
  `left: var(--s4); right: var(--s4); transform: none; max-width: none; flex-wrap: wrap`;
  "Stop preview" gets `flex-shrink: 0`.
- **CrosshairGuides**: when `pt.x > containerWidth / 2` the coordinate chip anchors to the left
  of the guide, so it never clips at the map edge.
- The map section drops its `border-right`; the aside carries `border-top: 1px solid var(--rule)`.
- Graticule ticks, vehicle labels and the loading cover are unchanged.

Touch targets, `@media (pointer: coarse)`, in `globals.css`:

| Control | Desktop | Coarse pointer |
|---|---|---|
| `.btn` | 38px | 38px |
| `.btn-sm` (Back, Dismiss, Fit network, Show key, Remove, sheet close X) | 30px | 38px |
| `.chip` (filter chips) and `.seg` (sheet mode and dial buttons) | 30px | 38px |
| `.input` | 38px, 13px type | 38px, `font-size: var(--t-lead)` (17px, clears iOS's 16px zoom threshold) |
| `.toast-undo` | 30px | 38px |
| `.route-clear` | text link | `min-height: 38px` |
| Pin hit box | 44px | 44px |
| Queue row | 58px | 58px |
| `.tag` | 22px | 22px |
| `::-webkit-scrollbar` | 10px | `display: none` |

38px is the existing `.btn` height; no new size is introduced.

## 6. Tokens, classes and modules

New tokens in `:root` (frame literals, beside 56/396/58 in spirit):

```css
--console-header-h: 56px;
--console-panel-h: 50dvh;
--console-record-h: 66dvh;
```

New shared classes in `globals.css`. Each carries the value that is inline today, so the
desktop render does not change; the media blocks then override them.

| Class | Carries today's | Phone / coarse override |
|---|---|---|
| `.console-frame` | `height: 100dvh; display: grid; grid-template-rows: var(--console-header-h) minmax(0,1fr); grid-template-columns: minmax(0,1fr); background: var(--canvas); overflow: hidden` | rows `calc(var(--console-header-h) + env(safe-area-inset-top)) minmax(0,1fr) auto` |
| `.console-header` | header flex bar, `min-width: 0` | `padding-top: env(safe-area-inset-top)` |
| `.console-main` | `display: grid; grid-template-columns: minmax(0,1fr) 396px; min-height: 0` | `display: contents`; landscape: `minmax(0,1fr) minmax(300px, 42%)` |
| `.console-map` | map section: `position: relative; min-width: 0; overflow: hidden; background: var(--canvas); border-right: 1px solid var(--rule)` | `border-right: 0` |
| `.console-aside` | `display: grid; grid-template-rows: auto minmax(0,1fr); min-height: 0; border-left: 1px solid var(--rule); background: var(--surface)` (the `auto` row is the handle, 0px on desktop) | `border-left: 0; border-top: 1px solid var(--rule)`; `[data-panel="queue"] { height: var(--console-panel-h) }`, `[data-panel="record"] { height: var(--console-record-h) }`, `[data-panel="map"] { height: auto }` and `[data-panel="map"] :is(.col-chips, .col-list) { display: none }` |
| `.panel-handle` | `display: none` | `display: flex; align-items: center; gap: var(--s3); height: 44px; padding: 0 var(--s4); background: var(--canvas); border-bottom: 1px solid var(--rule-soft)` |
| `.hdr-tagline`, `.hdr-clock`, `.hdr-operator-text`, `.hdr-reporting` | as today | `display: none` |
| `.hdr-feed-words` | as today | `.visually-hidden` treatment |
| `.visually-hidden` | `position: absolute; width: 1px; height: 1px; overflow: hidden; clip-path: inset(50%); white-space: nowrap` | — |
| `.col-metrics`, `.col-heading` | as today | `display: none`; landscape rule shows `.col-metrics` again |
| `.col-chips`, `.chip` | chip row and chip (30px, `flex: 1`, count badge) | `.col-chips { overflow-x: auto; scrollbar-width: none } .chip { flex: 0 0 auto; padding: 0 var(--s3) }`; coarse: `.chip { height: 38px }` |
| `.col-list` | `overflow-y: auto; min-height: 0` | `overscroll-behavior: contain` |
| `.col-bar` | route bar | `flex-wrap: wrap; padding-bottom: calc(var(--s3) + env(safe-area-inset-bottom))`; `.col-bar .btn { flex: 1 1 100% }` when `[data-planned]` |
| `.route-clear` | underlined text button | coarse: `display: inline-flex; align-items: center; min-height: 38px` |
| `.record-foot` | record footer | `padding-bottom: calc(var(--s3) + env(safe-area-inset-bottom))` |
| `.map-controls` | top-right stack | coarse: `.map-controls .map-zoom { display: none }` |
| `.map-corner` | bottom-left stack | `display: flex; gap: var(--s2); max-width: 190px; flex-wrap: wrap` |
| `.map-key` | Legend card | phone: hidden unless `[data-open]` |
| `.map-notice` | top-centre card / banner | `left: var(--s4); right: var(--s4); transform: none; max-width: none; flex-wrap: wrap` |
| `.undo-toast`, `.toast-undo` | fixed bottom-left card and its 30px button | phone: top strip (§3); coarse: button 38px |
| `.sheet-scrim`, `.sheet`, `.sheet-body`, `.sheet-foot` | scrim / dialog / body / footer | phone: §3 "Sheet open" |
| `.input` | the `INPUT` const: 38px, `--t-small`, `--rule` border, `--r-md` | coarse: `font-size: var(--t-lead)` |
| `.seg` | mode and dial buttons, 30px | coarse: 38px |

Media blocks: `(hover: hover)` around `.btn-*:hover` and `::-webkit-scrollbar-thumb:hover`;
`:active` twins of each tint added unconditionally; `(pointer: coarse)` per the table in §5;
`(max-width: 1023px)` and the landscape block per §2–3.

Store (`lib/console/store.ts`): `panel: "queue" | "map"` (default `"queue"`), `setPanel(panel)`,
`closeRecord()`. Desktop ignores `panel`. Tests in `store.test.ts`: default, `setPanel`,
`closeRecord` clears both ids, `unpin` still leaves `linkedId`.

New modules, no hooks:

- `dashboard/src/lib/console/pointer.ts` — `coarsePointer(): boolean`, a `matchMedia("(pointer: coarse)")`
  read at call time (the existing idiom in `PreviewDriveLayer.tsx:43`), used only inside
  handlers and effects, never during render.
- `dashboard/src/lib/console/camera.ts` — `boundsOf(points)` (pure, tested in `camera.test.ts`)
  and `fitAll(map, points, { padding, maxZoom })`.

No `useMediaQuery` hook: layout is CSS, the two JS decisions (fit padding, hover gating)
are per-event reads.

## 7. Viewport

`dashboard/src/app/layout.tsx`:

```ts
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  interactiveWidget: "resizes-content",
};
```

`env(safe-area-inset-*)` is consumed in exactly four places: the header, the route bar, the
record footer and the sheet footer.

## 8. Copy

Handle: "Repair queue" / "N shown" / "Show map" / "Show queue". Map: "Show key" / "Hide key".
Everything else is unchanged; the hidden header words stay for screen readers. No exclamation
marks.

## 9. Motion

Unchanged: 120ms tints (now also `:active`), 200ms pin scale, 1200ms vehicle tween, `bch-rise`
for the toast and the sheet. Panel height changes, the key card and the handle toggle do not
animate. `prefers-reduced-motion` still collapses everything.

## 10. Implementation tasks

Ordered. Tasks within a phase own disjoint files and can run concurrently; each phase waits
for the one before. Every task passes `npm run typecheck`, `npm run lint` and `npm test`
(from `dashboard/`). Screenshot checks use the CDP harness in the session scratchpad
(`measure.mjs`, `flow.mjs`) against `./node_modules/.bin/next dev --webpack -p 3123` with
mobile emulation at 390×844, plus one desktop capture at 1440×900 to prove nothing moved.

### Phase A — foundations (one task, serial)

**A1. Tokens, classes, viewport, store, helpers.**
Files: `dashboard/src/app/globals.css`, `dashboard/src/app/layout.tsx`,
`dashboard/src/lib/console/store.ts`, `dashboard/src/lib/console/store.test.ts`,
`dashboard/src/lib/console/pointer.ts` (new), `dashboard/src/lib/console/camera.ts` (new),
`dashboard/src/lib/console/camera.test.ts` (new).
Do: add the three tokens, every class in §6 with today's values, the four media blocks,
`overscroll-behavior` on `html, body`, the `viewport` export, `panel`/`setPanel`/`closeRecord`,
`coarsePointer()`, `boundsOf()`/`fitAll()`.
Accept: typecheck, lint, vitest green with the new store and camera tests; desktop screenshot at
1440×900 identical to baseline (no component uses the classes yet, so it must be).

### Phase B — components (six tasks, parallel)

**B1. Shell.** File: `dashboard/src/components/Console.tsx`.
Do: replace the inline frame/main/aside/toast styles with `.console-frame/.console-header/.console-main/.console-aside/.undo-toast/.toast-undo`; `data-panel={opened ? "record" : panel}` on the aside; render `.panel-handle` (Repair queue · N shown · Show map/Show queue calling `setPanel`) as the aside's first child; `onBack={closeRecord}`; `inert={sheetOpen}` on header and `main`; drop the stale shift-drag comments.
Accept: typecheck; 390×844 screenshot shows header, map, panel stacked with the handle visible and no horizontal overflow (`documentElement.scrollWidth === 390`, aside width 390); tapping Show map leaves only handle and route bar; 1440×900 unchanged.

**B2. Header.** File: `dashboard/src/components/Header.tsx`.
Do: `className="console-header"` with `minWidth: 0`; `.hdr-tagline/.hdr-clock/.hdr-operator-text/.hdr-reporting` on the pieces; feed sentence in `.hdr-feed-words`; `Stats` renders the km line first so it is the survivor; `Rule` takes `className`.
Accept: typecheck; 390×844 screenshot shows mark, wordmark, feed dot, "km today" line and avatar inside 390px, header height 56px + inset; 1440×900 unchanged.

**B3. Column and record.** Files: `dashboard/src/components/OperationsColumn.tsx`, `dashboard/src/components/RecordPanel.tsx`.
Do: `.col-metrics/.col-chips/.chip/.col-heading/.col-list/.col-bar/.route-clear` classes; `data-planned` on the bar when a plan stands; `onPointerEnter/Leave` gated on `pointerType !== "touch"` in `QueueRow`; replace `scrollIntoView` with a `scrollTop` write on `listRef`; `.record-foot` on the record footer; remove the orphaned `inArea` comment.
Accept: typecheck; 390×844 screenshot in `queue` state shows chips as one scrolling row with no spill, at least three 58px rows, route bar at the bottom with Plan route full width once planned; the record screenshot shows the footer buttons pinned; 1440×900 unchanged.

**B4. Map surface and chrome.** Files: `dashboard/src/components/PotholeMap.tsx`, `dashboard/src/components/console/map/ConsoleMap.tsx`, `dashboard/src/components/crew/DriveMap.tsx`.
Do: `.console-map` on the section (border via CSS); `touchPitch={false}`, `maxPitch={0}`, `disableRotation()` in `onLoad`; `onClick` → `unlink` through a new `onMapClick` prop; section `onPointerLeave` gated on `pointerType !== "touch"`; both fits through `fitAll` with `coarsePointer()` padding; `.map-controls/.map-zoom/.map-corner/.map-key/.map-notice`; Show key toggle (local `useState`); `map.resize()` before `panTo` in `PanToOpenRecord`; the same touch options in `DriveMap`.
Accept: typecheck; 390×844 screenshot shows Fit network top-right, Plan nearest + Show key bottom-left, no zoom cluster, key card only after tap; opening a record centres the pin in the 231px map (measure pin marker y within ±20px of the map's centre); 1440×900 unchanged.

**B5. Map overlays.** Files: `dashboard/src/components/console/map/PotholePin.tsx`, `dashboard/src/components/console/map/CrosshairGuides.tsx`, `dashboard/src/components/console/map/PreviewDriveLayer.tsx`.
Do: pin `onPointerEnter/Leave` gated on `pointerType !== "touch"` (visuals and 44px box unchanged); chip flip past the map's midline; banner to `.map-notice` with Stop preview `flexShrink: 0`.
Accept: typecheck; 390×844 preview screenshot shows the banner inside the map width with Stop preview visible; record screenshot with a pin in the right half shows the coordinate chip left of the guide; 1440×900 unchanged.

**B6. Dispatch sheet.** File: `dashboard/src/components/DispatchSheet.tsx`.
Do: `.sheet-scrim/.sheet/.sheet-body/.sheet-foot`; `INPUT` → `className="input"`; `.seg` on mode and dial buttons; email field `type="email" multiple inputMode="email" autoCapitalize="none" autoCorrect="off" spellCheck={false}`; number fields `inputMode="numeric" enterKeyHint="done"`, committing on change as well as blur; stop rows as a `22px minmax(0,1fr) auto` grid with eta `white-space: nowrap`; scrim dismissal on `onPointerDown`; the remaining literals (`fontSize: 11`, `gap: 6`, `height: 30/38`) to tokens and classes.
Accept: typecheck; 390×844 sheet screenshots (choose and planned) show a full-width bottom-anchored dialog with both footer buttons visible, input computed font-size 17px under coarse emulation; 1440×900 sheet unchanged.

### Phase C — documents and proof (one task, serial)

**C1. Docs and verification.** Files: `docs/design/DESIGN.md`, `CLAUDE.md`,
`docs/superpowers/specs/2026-09-02-console-map-design.md`.
Do: DESIGN.md §3 "The frame on a phone" (rows, the three panel heights, the handle, the
coarse-pointer sizes as frame literals), §5 phone chrome placement and the key toggle, §7
"Touch" table and removal of the shift-drag paragraphs; CLAUDE.md drops `AreaLayer`/`useAreaDrag`
and the shift-drag sentence and names the 1023px breakpoint and the `panel` states; console-map
spec §12 points here. Run the full flow (`flow.mjs`) at 390×844 and 844×390 and archive the
captures.
Accept: `npm run typecheck && npm run lint && npm test`; the seven demo beats in
`ARCHITECTURE.md` §7 reproduced at 390×844; 1440×900 pixel-identical to baseline.

## 11. Unchanged on desktop (≥1024px)

The 56px header with every piece; `main` as `minmax(0,1fr) 396px`; the aside as the 396px
column with the record replacing the queue in place; always-visible Legend; zoom cluster and
Fit network top-right with `padding: 40, maxZoom: 15`; undo toast bottom-left; centred 560px
dispatch sheet with 13px inputs; hover linking on rows, pins and the map section for mouse and
pen; `↑↓ Enter Esc F`; `unpin()` semantics and the Esc ladder; all 38/30/22px control heights;
`STATUS_VISUAL`, pin sizes, the basemap, the motion budget; the store's existing fields and
tests. The only desktop-visible changes are behavioural, not visual: `inert` on header and
`main` while the sheet is open, `:active` tints, `overscroll-behavior: none`, and the header
no longer being able to size the frame between 1024 and ~1062px (it clips instead).

## 12. Rulings

1. **Winner.** Proposal 3 (stacked frame driven by the store) by the judges' totals (22.5 vs
   21 vs 16). Proposal 2's overlay sheet is rejected outright: it contradicts DESIGN.md §3,
   adds movement, and its `padding` prop mechanism is unverified.
2. **Header height stays 56px**, not 48px via `var(--s7)`: a spacing token is not a frame
   dimension, and the desktop rail should not change register on a phone. The wordmark is
   kept at every width (judge 1); the tagline, clock and operator text go below 1024px.
3. **Record panel is 66dvh** (the winner's value). 231px of map at 844px is enough to centre
   one pin; the record body scrolls.
4. **Hover gating uses pointer events ignoring `pointerType === "touch"`**, not `"mouse"` only,
   so pen users keep hover. `pointerenter/leave` mirror `mouseenter/leave` semantics, so the
   desktop change is nil.
5. **Zoom cluster hidden on coarse pointers** (winner and majority) rather than kept at 44px
   (judge 3). Double-tap, two-finger tap and pinch remain; the freed top edge hosts the toast.
6. **Key kept as a toggle**, not hidden (judge 3, DESIGN.md §5). It appears without animation
   so `bch-rise` keeps its two uses.
7. **`viewportFit: cover` is in** (winner, judge 3) with insets in exactly four places; no
   `themeColor`.
8. **Metrics strip and heading are hidden on the phone**; the km figure lives in the header
   and the counts on the chips. The landscape rule shows the strip again because the column is
   full height there.
9. **Graticule ticks and vehicle labels are unchanged** (judge 3): the instrument reading is
   the point of them; clipping at the edge is tolerated.
10. **`.visually-hidden` is added to `globals.css`** rather than relying on Tailwind's
    `sr-only`, and named so it cannot collide with it.
11. **Camera helper lives in `lib/console/camera.ts`** with a pure, tested `boundsOf`, so B4
    and no other task owns both fit sites and the helper is written once in Phase A.
12. **No JS layout hook.** Layout is CSS; `coarsePointer()` is read in handlers only.
13. **Panel heights do not animate.** The 240ms status budget is for status, not chrome.
14. **`DriveMap.tsx` gets the same touch options** even though the crew directory is orphaned:
    two lines, same gap, same file family as B4.
15. **Docs are corrected in this change** (shift-drag, AreaLayer, useAreaDrag) because §0 says
    the stylesheet and the documents may not disagree, and they already do.
16. **Android system back is not handled**; a swipe-back leaves the console. Follow-up if it
    bites in the demo.
17. **Clustering stays out of scope**; `maxZoom: 16` on coarse pointers and the queue list are
    the disambiguation for overlapping pins.
