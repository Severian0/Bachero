# Bachero — design system notes

Bachero is an operations console for a highway authority. It is looked at all day by someone
who is not excited to be looking at it, and the numbers on it are quoted at committee. The
design target is **public, official, plain**: a duty console that a councillor would recognise
as belonging to the same government as the forms they fill in, not a consumer map app.

The palette is derived from the **GOV.UK Design System**, because the reader is a public
official who recognises that register on sight and because every value in it has already been
checked for contrast. Type is **Public Sans** (a government-commissioned face, openly
licensed, the nearest honest equivalent to GDS Transport) over **IBM Plex Mono** for anything
that gets read down a phone or transcribed into a work order.

Take every colour, font, size, space, radius and shadow from `var(--…)`. Never hard-code a
hex.

---

## 0. Source of truth

**`dashboard/src/app/globals.css` is canonical.** It defines every token and every shared
class named in this document. Where this document and the stylesheet disagree, the stylesheet
wins and this document is wrong. If a token you want is not in that file, it does not exist —
do not invent one, and do not reach for a value between two steps of a scale.

Two files in the app may name a literal colour, and only two:

- `dashboard/src/app/globals.css` — the token definitions themselves.
- `dashboard/src/lib/map/tokens.ts` — MapLibre paints into a WebGL canvas, so it cannot read a
  custom property and cannot resolve `color-mix`. That file reads the tokens out of `:root` at
  runtime and carries a hex copy of each as the server-render and test fallback.

The pin, tag and row-marker table lives in `dashboard/src/lib/console/visual.ts`
(`STATUS_VISUAL`, `pinSize`, `severityFill`). Section 6 below documents it; the file is the
implementation.

**Historical files, reference only.** `docs/design/bachero-console.html` and
`docs/design/mockup/` (`industry.css`, `console.html`, `console.logic.js`) are an earlier
exploration on a different system — the Industry base, Inter, one steel accent, tokens named
`--color-*` and `--space-*`. None of those tokens exist any more. Those files are kept because
the interaction model in `console.logic.js` (linked selection, crosshair guides, the keyboard
map) survived the change of skin; read them for that and for nothing else. Do not copy a
colour, a font or a spacing value out of them.

Light theme only. There is no dark mode and none is planned; the console is an office tool.

---

## 1. Colour

### Ink

| Token | Value | Use |
|---|---|---|
| `--ink` | `#0b0c0c` | Body ink, headings, the severity bar, road hairlines on the map. |
| `--ink-2` | `#505a5f` | Secondary lines, captions, labels. The `.secondary` class. 7.0:1 on white. |
| `--ink-3` | `#4a5054` | Tertiary. Graticule tick numbers. Still 4.5:1 on the canvas. |

### Ground

| Token | Value | Use |
|---|---|---|
| `--surface` | `#ffffff` | The sheet. Where the work happens: the column, the record, the sheet, cards over the map. |
| `--canvas` | `#f3f2f1` | Inset and recessed areas: the page ground, section headers, footers, the map ground. |
| `--rule` | `#b1b4b6` | Real borders — the edge of a panel, an input, a card. |
| `--rule-soft` | `#e4e2e0` | Hairlines inside a panel: row separators, table cells, the graticule, map water. |

### Command chrome

The header bar carries one colour so the chrome reads as furniture rather than a strip laid on
top of the page. It sits flush against the working surface with no rule under it.

| Token | Value | Use |
|---|---|---|
| `--rail` | `#0b1e33` | The header. Also the undo toast, the coordinate chip on the map, the vehicle dot. |
| `--rail-2` | `#16304a` | A raised surface on the rail: the operator initials block, the Undo button. |
| `--rail-3` | `#21445f` | Hover on the rail. |
| `--rail-ink` | `#ffffff` | Type on the rail. 15.9:1. Also the number inside a scheduled pin or a stop marker. |
| `--rail-ink-2` | `#a8bdd1` | Secondary type on the rail. 8.3:1. The undo countdown bar. |
| `--rail-rule` | `#24435f` | Dividers on the rail. |
| `--feed-live` | `#5bc47f` | The connectivity dot when detections are arriving. |
| `--feed-idle` | `#c8a63a` | The connectivity dot when they are not. |

`--feed-live` and `--feed-idle` are chrome, not meaning. They say *is data arriving*. They
never say *proposed* or *committed*, and they appear nowhere except the dot in the header.

### Meaning — two lanes, and only two

**Blue is work proposed. Green is work committed to a crew.** That distinction is the whole
product, so it is the only place a second hue is spent. Nothing else on the screen carries
state in colour.

| Token | Value | Use |
|---|---|---|
| `--action` | `#1d70b8` | GOV.UK blue. Confirmed pins, the primary button, selected filter chips and mode buttons, the drawn area, the route line, fleet trails, the crosshair, the confirmed metric, inline links. 4.6:1 on white. |
| `--action-hover` | `#155a92` | Primary button hover. |
| `--action-ink` | `#ffffff` | Type on `--action`. |
| `--action-soft` | `#e7f0f7` | Tinted panel: the selected crew row, the unconfirmed-stops notice. |
| `--action-edge` | `#9dc2de` | Border on a soft blue panel or tag. |
| `--committed` | `#00703c` | GOV.UK green. Scheduled pins, the on-route ring, the stop badge, the row marker for a selected record, the Dispatch button. |
| `--committed-soft` | `#e0efe7` | The queue row of a record that is on the route; the dispatched confirmation panel. |
| `--committed-edge` | `#94c4ac` | Border on a soft green panel or tag. |
| `--severe` | `#942514` | **Grade-4 severity bar only.** Nothing else in the console is ever this colour. Because it is rare, it means something when you see it. |
| `--closed` | `#6f777b` | Repaired. Drains out of the working palette. |

Severity never uses blue or green: it has size and a bar of its own, so magnitude can never be
misread as state. Do not add a red/amber/green status ramp. A red-dotted map of a city reads
as an emergency, and this is a maintenance backlog, not an incident feed.

Colour never carries information alone. Every state is also spelled out in words, in the queue
row's evidence line and on the record's status tag.

### Focus

| Token | Value |
|---|---|
| `--focus` | `#ffdd00` |
| `--focus-ink` | `#0b0c0c` |

`:focus-visible` is a 3px `--focus` outline at zero offset with a `0 4px 0 0 --focus-ink`
underline — the GOV.UK yellow block. It is the single most recognisable civic interaction
detail there is and it costs nothing. Never remove it. `::selection` uses the same pair.

---

## 2. Type

- `--font-ui` — Public Sans, loaded through `next/font` as `--font-public-sans`, falling back
  to `system-ui, sans-serif`. Carries the interface.
- `--font-data` — IBM Plex Mono as `--font-plex-mono`, falling back to `ui-monospace,
  monospace`. Carries references, coordinates, clock times, counts, distances and durations —
  anything read aloud down a phone or transcribed into a work order.

Six sizes, no more. Anything between these is an accident.

| Token | Value | Where |
|---|---|---|
| `--t-micro` | 11px | Uppercase labels, legend, tags, axis marks. |
| `--t-small` | 13px | Secondary lines, evidence, captions, table cells, buttons. |
| `--t-body` | 15px | Row primary, body copy. The document base size. |
| `--t-lead` | 17px | Wordmark, panel titles. |
| `--t-title` | 21px | Record heading, dispatch sheet heading. |
| `--t-metric` | 30px | Counts and the planned distance. |

Body line-height is 1.5; headings 1.25 and weight 600.

Three type utility classes, all in `globals.css`:

- `.data` — `--font-data`, `font-variant-numeric: tabular-nums`, `-0.01em` tracking. Every
  number that sits in a column, every reference, every timestamp. Numbers must align.
- `.micro` — `--t-micro`, weight 600, `0.07em` tracking, uppercase, line-height 1.4. Panel
  labels and field legends. Uppercase is only ever used at this size.
- `.secondary` — `--ink-2`. The one approved way to step type back.

Sentence case for prose. UPPERCASE only for `.micro` and the wordmark.

---

## 3. Space, radii, shadows

Spacing is `--s1…--s7` and nothing else: **4, 8, 12, 16, 24, 32, 48px**. Panel padding is
`--s4`, section padding `--s3 --s4`, groups inside a scrolling panel are `--s4` apart, the
dispatch sheet uses `--s4 --s5`.

| Token | Value |
|---|---|
| `--r-sm` | 3px — pins, stop badges, tags, small chips |
| `--r-md` | 6px — buttons, inputs, cards, panels over the map |
| `--r-lg` | 10px — the dispatch sheet |
| `--r-full` | 999px — the vehicle dot, scrollbar thumb |

| Token | Value | Use |
|---|---|---|
| `--shadow-1` | `0 1px 2px rgb(11 12 12 / .10), 0 1px 1px rgb(11 12 12 / .06)` | Anything resting on the map: pins, the legend, the controls, the scale bar. |
| `--shadow-2` | `0 4px 12px rgb(11 12 12 / .12), 0 1px 3px rgb(11 12 12 / .08)` | The undo toast, the map status notice. |
| `--shadow-3` | `0 16px 40px rgb(11 12 12 / .18), 0 2px 8px rgb(11 12 12 / .10)` | The dispatch sheet, the one modal thing in the product. |

Elevation is reserved for things that overlap the map or the page. Panels inside the layout
are separated by a single 1px rule (`--rule` between regions, `--rule-soft` inside one), never
by a gap and never by a shadow.

### The frame

One screen, at `/`. `100dvh`, no page scroll, `--canvas` ground.

- Rows: `56px minmax(0,1fr)` — the header, then everything else.
- Columns: `minmax(0,1fr) 396px` — the map takes the remainder, the operations column is fixed
  at 396px so a queue row can never reflow while you are reading it.
- The column and the record panel occupy the same 396px. Opening a record replaces the queue
  in place; nothing slides in over the map.
- Queue rows are `min-height: 58px`. Buttons are 38px, `.btn-sm` 30px, tags 22px.

---

## 4. Components

All of these classes are defined in `globals.css`. Use them; do not restyle a button inline.

**`.btn`** — 38px, `--t-small` weight 600, `--r-md`, 1px transparent border, `--s2` gap,
120ms linear transitions on background, border and colour. Variants:

| Class | Look | Use |
|---|---|---|
| `.btn-primary` | `--action` fill, `--action-ink` type; hover `--action-hover`; disabled `--canvas` fill with `--rule` border and `--ink-2` type | The one proposing action on screen: **Plan route**, **Add to route**. |
| `.btn-commit` | `--committed` fill, white type | Committing work to a crew: **Dispatch to crew**. Nothing else. |
| `.btn-secondary` | `--surface` fill, `--rule` border, `--ink` type; hover `--canvas` with an `--ink-2` border | Cancel, Discard plan, Remove from route, Fit network. |
| `.btn-quiet` | No fill, `--ink-2` type; hover `--canvas` and `--ink` | Back, Close, Remove, Clear, Dismiss as false positive. |
| `.btn-sm` | 30px, `--t-micro`, `0.04em` tracking | Any of the above in a dense row. |

There is exactly one `.btn-primary` and at most one `.btn-commit` visible at a time.

**`.tag`** — 22px, `--t-micro` weight 600, uppercase, `0.05em` tracking, `--r-sm`, 1px border.
Status is always spelled out inside it. Variants map one-to-one onto the lifecycle:
`.tag-suspected` (`--ink-2` on `--surface`, `--rule` border), `.tag-confirmed` (`--action` on
`--action-soft`, `--action-edge`), `.tag-scheduled` (`--committed` on `--committed-soft`,
`--committed-edge`), `.tag-repaired` (`--closed` on `--canvas`, `--rule`). The tag for a
status comes from `STATUS_VISUAL[status].tag`; do not pick one by hand.

**Metric cell** — a `.data` numeral at `--t-metric`, weight 600, `-0.03em` tracking, over a
`--t-small` `.secondary` label that says what it counts. Units are set separately at
`--t-small` so the numeral column stays clean. Three cells across the top of the operations
column, divided by `--rule-soft`. The confirmed count is the only one tinted `--action`; the
rest are `--ink`.

**Filter chip** — a full-width row of equal buttons, 30px, `--r-md`. On: `--action` fill,
`--action-ink` type. Off: `--surface` with a `--rule` border. Each carries its count in
`.data`. Chips filter the map as well as the list, and they carry `aria-pressed`.

**Queue row** — a 3px left marker in the status colour (or `--committed` when the record is on
the route), the street name at `--t-body` weight 600 with the reference in `.data .secondary`
beside it, the evidence line under it (`3 vehicles · 11 passes · confirmed`), a 4-segment
severity bar of 8×16px blocks, and the priority to one decimal in `.data`, right-aligned in a
26px column. Background: `--committed-soft` when on the route, `--canvas` when linked,
`--surface` at rest; `--rule-soft` bottom border; 0.62 opacity when repaired.

**Severity bar** — four segments, filled from the left by `severityFill(grade, filled)`:
`--rule-soft` when empty, `--ink` when filled, `--severe` when the grade is 4. Segmented
rather than continuous so severity reads as a measured grade, not a mood. 8×16px in a queue
row, 26×6px in the record.

**Fact list** — the record's evidence block: a bordered `--r-md` box of label/value rows, the
label `.secondary` at `--t-small`, the value in `.data`, `--rule-soft` between rows. The
measurement is always on the left and the inference is stated once underneath, in prose.

**Detection frame** (`DetectionFrame.tsx`) — the evidence slot. If the record has a
`photo_url` it is shown. Otherwise the component draws the **detector's own output** — a dark
carriageway and the accepted bounding box, deterministically seeded from the record id so
server and client agree. It never draws a stock photograph: inventing a picture of a defect
that was never photographed would be a fabricated record, and this console is quoted at
committee.

**Card over the map** — `--surface`, 1px `--rule`, `--r-md`, `--shadow-1`, `--s3 --s4`
padding, a `.micro .secondary` heading. The legend, the zoom cluster and the status notice all
use this.

**Undo toast** — bottom-left, `--rail` on `--rail-ink`, `--r-md`, `--shadow-2`, with the Undo
button on `--rail-2` and a 2px `--rail-ink-2` bar draining across the bottom for the 10 s
window. The countdown is drawn honestly rather than left to a silent timer.

---

## 5. Map styling

The map is a drawing, not a photograph. It is MapLibre (`react-map-gl/maplibre`) on
OpenFreeMap vector tiles, with the style built in `dashboard/src/lib/map/style.ts` from the
tokens read by `dashboard/src/lib/map/tokens.ts`.

**Basemap — four layers, and that is all.**

| Layer | Paint |
|---|---|
| Background | `--canvas` |
| Water | `--rule-soft` — a hairline lighter than the ground, so it reads as a shape rather than a colour |
| Minor roads | 1px hairline, `--ink` at 18% opacity |
| Major roads (motorway, trunk, primary) | 2px, `--ink` at 28% |
| Major road labels, from zoom 13 | 10px uppercase, `0.12em` tracking, `--ink` at 55%, `--canvas` halo |

No buildings, no landuse, no parks, no terrain, no colour fills, no 3D — rotation and pitch
are disabled on the map itself. Rail, transit, paths, ferries, aerialways and tracks are
filtered out. The data must always out-rank the map.

**Graticule** — a 64px survey grid drawn over the basemap in `--rule-soft` at 60%, with a
`.data` tick number in `--ink-3` on every fourth line. It is what makes the surface read as an
instrument rather than a consumer map, and it sits between the scale bar and the pins as a
sense of distance.

**Pothole pin** — a square, because a circle reads as a dot on a map and a dot reads as
decoration. `--r-sm` corners, a 1.5px border, fill and stroke from `STATUS_VISUAL` (section
6). Size is `pinSize(grade)` and nothing else: **14 / 18 / 22 / 26px** for grades 1–4. It is a
real `<button>` with a 44px hit area, so the whole map is keyboard-reachable and focus links
the row beside it exactly as hover does. A scheduled pin carries its stop number inside, in
`.data` at 10px in `--rail-ink`. Records outside the current filter drop to 0.28 opacity
rather than disappearing, so the operator keeps their bearings. Stacking: 30 at rest, 40 on
the route, 50 linked, 60 open.

Rings and scale, all on the pin itself:

- On the route: a 3px `--committed` ring.
- Linked or open: a 3px ring of `--action` at 35%.
- Linked: `scale(1.22)`. Open: `scale(1.35)`. 200ms on `--ease`.

**Crosshair guides** — the linked or open record draws a 1px full-height and full-width line
in `--action` at 45% to the map edges, with the coordinate printed at the top margin on a
`--rail` chip in `.data`. This is the drafting move that ties the map to the list: it is how
you find one pin among two hundred, and it is where the coordinate an operator reads down the
phone is printed.

**Vehicle** — a 10px `--r-full` dot in `--rail` with a 2px `--surface` ring and `--shadow-1`,
with the vehicle label beside it on a `--rail` chip in `.data`. Positions glide over 1200ms; a
dot that jumps between reports reads as a bug rather than as a van driving down a road.

**Trails** — the last few reported positions behind each vehicle as 2.5px `--action` circles,
fading from 0.28 opacity by 0.045 a step to a floor of 0.1. The current position is the
marker, not a trail dot.

**Route** — a 2px `--action` line with round caps and joins. The depot is a 12px `--surface`
square with a 1.5px `--rail` border. Each stop is a 16px `--committed` square carrying its
number in `--rail-ink`: the line is the proposal, the numbered stops are the commitment.

**Plan area** — a rectangle drawn by shift-dragging: `--action` fill at 8% with a 1px
`--action` outline. The draft rectangle under the cursor is painted the same way, so nothing
changes appearance on release.

**Chrome** — zoom in/out and **Fit network** top-right; the key bottom-left, listing the four
visible states with a note that marker size shows severity; the MapLibre scale bar and
attribution restyled to the tokens in `globals.css`.

**When the map has nothing to draw** — while tiles load, a full-bleed `--canvas` panel says
*Loading road network*. If tiles fail, the notice moves to a small card at the top, because
the pins are still placed correctly by coordinate: *"Basemap unavailable. Pins are still
placed by coordinate; the repair queue is unaffected."* A tile failure is not a data failure
and is sticky — the operator must not be told the console recovered when it did not.

---

## 6. Data states

Lifecycle from the schema: `suspected → confirmed → scheduled → repaired`, plus
`false_positive`. Status is never set by the console except `false_positive`; it follows the
work orders.

The table below is `STATUS_VISUAL` in `dashboard/src/lib/console/visual.ts`.

| State | Pin fill / stroke | Pin opacity | Row marker | Tag | Meaning to the operator |
|---|---|---|---|---|---|
| `suspected` | `--surface` / `--ink-2` — hollow | 1 | `--rule` | `.tag-suspected` | One vehicle. Evidence, not a finding. |
| `confirmed` | `--action` / `--action` — solid blue | 1 | `--action` | `.tag-confirmed` | A second, distinct vehicle corroborated it. Proposable. |
| `scheduled` | `--committed` / `--committed` — solid green, stop number inside | 1 | `--committed` | `.tag-scheduled` | Committed to a crew and carrying a `stop_order`. |
| `repaired` | `--surface` / `--rule` — hollow grey | 0.55 | `--rule` | `.tag-repaired` (`--closed`) | Closed. Faded, and drops out at the end of the day. |
| `false_positive` | transparent | 0 | transparent | — | Removed from the map and the queue entirely. Labelled *Dismissed* where it is named at all. |

A record that is on the route overrides the row marker with `--committed` and tints the row
`--committed-soft`, whatever its status: green always means committed.

Rules:

- **`suspected → confirmed` is the product's central claim.** It is the one transition with
  any energy: the pin fills and the evidence line increments its vehicle count. Budget 240ms.
- Never let `suspected` look like an error or a warning. It is a lower-confidence observation
  and should read lighter, not louder. It is hollow, not amber.
- Severity is the pin's size and the row's segmented bar. Priority is the row's numeral
  (`severity × ln(1 + vehicles) × age`, mirroring the `potholes_map` view). Do not conflate
  them — operators will be asked to justify the ordering.
- Grades are words as well as numbers: *Minor, Moderate, Serious, Severe*, quoted as
  "grade 3 of 4".
- Counts anywhere in the UI are attributable: "24 confirmed, awaiting a route" is a filter
  chip that filters, never a decorative statistic.

---

## 7. Motion and interaction

### Motion

Motion exists to preserve continuity, not to entertain. Easing is `--ease`
(`cubic-bezier(.2,.6,.2,1)`) for anything that is not a linear tint.

| Duration | What |
|---|---|
| 120ms linear | State tints: button, chip and row backgrounds and borders; the pin's ring. |
| 200ms `--ease` | The pin's scale when a record is linked or opened. |
| 240ms | The budget for a status change. Nothing may take longer to settle. |
| 1200ms | Vehicle interpolation between reported positions. |

Two named keyframes exist and no more: `bch-rise` (180–200ms, the undo toast and the dispatch
sheet arriving) and `bch-pulse` (2.4s, the live feed dot). `prefers-reduced-motion: reduce`
collapses every animation and transition to 0.01ms.

Hover states are tints, never movement. Nothing on this screen shifts position on hover except
the pin, which scales in place.

### Linked selection

**This is the main mechanism.** One record at a time is *linked* — the hover-or-focus state
shared by the map and the list — and one may be *open* in the record panel.

- Hovering or keyboard-focusing a queue row links its pin: the pin grows, its crosshair guides
  draw, and its coordinate prints at the margin.
- Hovering or focusing a pin links its row: the row tints `--canvas` and the list scrolls it
  into view by moving the container's own scroll offset, never by yanking the page.
- Clicking either **opens the record**. Adding a record to a route is a decision, and
  decisions are made in the record, where the evidence for them is on screen.
- Opening a record pans the map to it once — not on every re-render, so the camera never
  fights a pan the operator has just made.
- Selection for a route is multi and persists across filter changes. The bottom bar always
  states what is selected and what it is estimated to cost.

### Keyboard

Keyboard is first class; the linked row and the linked pin are the same idea as focus. Handled
in `dashboard/src/lib/console/keyboard.ts`.

| Key | Action |
|---|---|
| `↑` `↓` | Move the link up and down the visible queue. Moves the pin and the row together. |
| `Enter` | Open the linked record. |
| `Esc` | One step back per press, outermost first: close the dispatch sheet → close the record → drop the link → clear the route selection. |
| `F` | Cycle the filter: All → Confirmed → Suspected → Scheduled. |

Keys are ignored while focus is in an `input`, `textarea` or `select`. The screen's listener
stands down entirely while the dispatch sheet is open (it is modal and runs its own keys,
including a focus trap on `Tab`) and while a shift-drag is in progress (Escape belongs to the
drag).

### Shift-drag: the plan area

Shift and drag on the map draws a rectangle. On release it becomes the planner's area and
switches the planning mode from *Pick these* to *Best N* — an area is a statement about where,
so the console stops asking the operator to also say which. Nothing opens on release: the
column's bottom bar reports the switch as "Area drawn · N in area · Best N" with a Clear
beside it, and the sheet states the same area when it is next opened. Escape during the drag
cancels it.

### The record panel

Replaces the queue in the same 396px column: back to the queue, the street name at
`--t-title`, the status tag and reference, the detection frame, the severity grade, the
evidence fact list, one sentence of stated uncertainty, and the detections table (time,
vehicle, severity, speed; capped at 8 rows with "and N more"). The footer holds **Add to
route** — offered for `suspected` and `confirmed` — and **Remove from route**, which stays
available for a `scheduled` record still on the current route so a stop dropped from a plan can
be reached again. Below it, **Dismiss as false positive**, one click and undoable for 10 s.

### The dispatch sheet

Committing a crew's day is the accountable act in this product, so it is the one thing that
interrupts: a modal dialogue, `--shadow-3`, `--r-lg`, over a `rgb(11 12 12 / 0.55)` scrim.
`DispatchSheet.tsx` holds the planner; it has no facts of its own beyond the email field, so
what it shows and what the map draws can never disagree.

The flow is one direction and states what is committed at each step:

1. **Choose.** Crew (radio rows, selected row on `--action-soft`), mode — *Pick these* /
   *Best N* / *Time budget* — and the numbers for that mode (stops, minutes, minutes per
   stop). Defaults come from the crew's own `repairs_per_shift` and `shift_minutes`. An area,
   if one was drawn, narrows the candidates.
2. **Plan route.** `.btn-primary`, disabled with no crew or no candidates. Once a route has
   been planned the column's button reads **Open route** and stays live, so closing the sheet
   never strands the plan behind it. A plan that comes back with no stops is a failure, not an
   empty route: *"No route could be planned for those stops. The queue is unaffected; adjust
   the selection and try again."*
3. **Read the answer.** Total distance at `--t-metric`, the duration beside it, how much
   shorter it is than visiting by priority, and the stops in the order a crew would drive
   them, each numbered on an `--action` badge with its reference, grade, status and ETA. Any
   suspected stop is called out in an `--action-soft` notice by name: *"Sending a crew to an
   unconfirmed defect is your decision to record."* The crew is now stated, not offered — the
   route was solved for that crew, and reassigning it means planning again.
4. **Dispatch to crew.** `.btn-commit`, the only green button, disabled until an address is
   entered. Removing a stop from a planned route re-plans without it; the plan is the solver's
   answer, not a list to edit.
5. **Sent.** Work order reference, crew, stops, addresses, the crew page link, and a
   `--committed-soft` panel confirming the stops now show as scheduled on the map.

### Loading and failure

- No skeleton shimmer. A pending value shows a hairline `--canvas` placeholder with the panel
  label still legible, and the header simply says nothing until the figure is real — "0.0 km"
  must never appear ahead of the real number.
- A block that is waiting holds its height so nothing else on the screen shifts under the
  cursor.
- A failure names what failed and what it does not affect. The queue is usable when the map is
  not, and the sheet keeps the plan when the email fails.
- The queue distinguishes three states. While the source is loading it shows three 58px
  `--rule-soft` hairline rows and no words, because "nothing here" is not yet known to be
  true. When the load has failed it says *"Could not load the queue. {reason}"* with a
  `.btn-secondary` **Retry** that runs the load again. Only once the load is ready does an
  empty list say *"Nothing matches this filter. Choose All to see the whole queue."*

---

## 8. Copy and voice

Civil-service plain English. The reader is accountable to a committee.

- State the measurement, then the inference: "3 vehicles, 11 passes" before "confirmed".
- Numbers carry units and periods: "14.2 km", "312 min", "scanned today", "grade 3 of 4".
- No exclamation marks, no encouragement, no "Oops". A failure states what failed and what to
  do: *"Route service unavailable. The queue is unaffected; try again."*
- Actions are verbs with objects: "Plan route", "Dispatch to crew", "Add to route", "Dismiss
  as false positive" — never "Go", "Submit", "OK".
- Never claim certainty the data does not have. `suspected` is "one vehicle only. This is an
  observation, not a finding."
- Uncertainty is stated once, in the record, and never repeated as a warning banner.
- Every dispatch is attributed to a named person at a named authority. Say who.
- British spelling, `en-GB`. Times are 24-hour and local to the record.
