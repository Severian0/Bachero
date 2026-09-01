# Bachero — design system notes

Bachero is an operations console for highway authorities. It is looked at all day by
someone who is not excited to be looking at it. The design target is **calm, governmental,
griddy**: a technical drawing of a road network, not a consumer map app.

Visual foundation is the **Industry** design system (`industry.css`) — steel-blue on a light
technical ground, Barlow Condensed over Barlow, square corners, hairline borders,
registration marks. Everything below is Bachero's application of it. Take every colour,
font, space and radius from `var(--…)`; never hard-code a hex.

---

## 0. Source of truth and where the tokens live

Two artefacts describe the console:

- **This document** — the rationale: one accent, status by form, severity by size, linked
  selection, copy rules. Sections 1–8 are the intent.
- **`bachero-console.html`** — the rendered mockup exported from Claude Design (open it in a
  browser). Readable extracts are in `mockup/`: `industry.css` (the base system),
  `console.html` (markup) and `console.logic.js` (state, pin/row styling, keyboard).

Where the two disagree, **the mockup wins**; it is the later, seen version. The mockup applied
these overrides on top of the Industry system, and the codebase follows them:

| Topic | Sections below say | Mockup does | Codebase |
|---|---|---|---|
| Fonts | Barlow Condensed over Barlow | Inter for both, headings 600 | Inter via `next/font`; `--font-heading` = `--font-body` |
| Radii | 0 — square corners | `--radius-sm/md/lg` = 5 / 10 / 16px; chips and the primary button are pills (`--radius-lg`) | as mockup |
| Registration marks | every panel corner | none | none; `.blueprint`/`.corner` kept in CSS, unused |
| Pothole pin | hard square 12–22px | rounded square (5px), 12–23px, +5px when linked | as mockup |
| Header / column / rows / footer | 56px / 400px / 56–44px / 64px | 62px / 404px / 58–46px / 68px | as mockup |
| Inspector | fixed height | `min-height: 132px` | as mockup |

Everything else in sections 1–8 stands. To revert to the Barlow / square-corner look, change
the font import in `dashboard/src/app/layout.tsx` and the radius tokens in
`dashboard/src/app/globals.css`; nothing else should need to move.

**Tokens live in `dashboard/src/app/globals.css`.** They are exposed twice: as plain CSS
variables (`var(--color-accent)`, `var(--space-4)`) and as Tailwind 4 theme values, so
`bg-accent`, `text-accent-800`, `border-divider`, `font-heading`, `rounded-lg`, `shadow-sm`
and `p-4` all resolve to the same numbers. Tailwind's spacing multiplier is set to 3.4px, so
`p-4` is `--space-4` (13.6px) and `gap-6` is `--space-6` (20.4px) — the Industry scale.

Light theme only. There is no dark mode and none is planned; the console is an office tool.

---

## 1. Colour

| Role | Token | Use |
|---|---|---|
| Ground | `--color-bg` #f2f2f3 | The whole console. Never white. |
| Ink | `--color-text` #1d1f20 | Type, hairlines (at 8–16% via `--color-divider`). |
| Steel | `--color-accent` #5980a6 | The one accent. Confirmed data, primary action, focus ring. |
| Steel deep | `--color-accent-700/800/900` | Type on tinted fills, scheduled state, the reversed header strip. |
| Steel light | `--color-accent-100/200` | Selection tints, hover washes. |
| Neutral ramp | `--color-neutral-*` | Unconfirmed and inert data. |

**One accent, no status palette.** The temptation is red/amber/green for pothole severity.
Resist it: a red-dotted map of a city reads as an emergency, and this is a maintenance
backlog, not an incident feed. Status is encoded by **fill, weight and form**, severity by
**size**. The only exception is `repaired`, which drains to neutral and steps back.

Colour never carries information alone — every state also has a label in the queue row.

## 2. Type

- Headings, numerals, labels: `--font-heading` (Barlow Condensed 600).
- Body, table cells, prose: `--font-body` (Barlow 400/500).
- Identifiers, coordinates, timestamps: Barlow with `font-variant-numeric: tabular-nums`
  and `letter-spacing: .04em`. Numbers must align down a column.

| Level | Size / spacing | Where |
|---|---|---|
| Console title | 15px Condensed, uppercase, `.14em` | Header brand |
| Panel label | 10px Condensed, uppercase, `.16em`, 55% ink | Every panel gets one, top-left |
| Metric | 30px Condensed, tabular | Stat cells |
| Row primary | 14px body 500 | Street name |
| Row secondary | 11px body, 55% ink | Evidence line |
| Micro | 10px uppercase `.12em` | Tags, legend, axis marks |

Sentence case for prose, UPPERCASE only for labels 11px and under.

## 3. Grid and spacing

Strict columns, grid implied — the rhythm is visible in alignment, not in drawn boxes.

- Spacing scale is `--space-1…8` only (3.4 / 6.8 / 10.2 / 13.6 / 20.4 / 27.2). No other values.
- The console is a **two-column frame**: map fills the remainder, the operations column is a
  fixed **400px** (a queue row must never reflow while you are reading it).
- Header 56px, footer action bar 64px, both full-bleed.
- Panels are separated by a single 1px `--color-divider` rule, never by a gap and never by
  a shadow. Elevation is reserved for things that overlap the map.
- Inside a panel: `--space-4` padding, `--space-3` between related items, `--space-6`
  between groups.
- Every panel corner carries the Industry `+` registration marks. They are the only
  decoration in the product.

## 4. Components

**Panel** — `.blueprint` + four `.corner` marks; transparent, hairline border, a 10px
uppercase label pinned top-left inside the frame. No fills, no rounding.

**Metric cell** — Condensed numeral over a micro label; cells sit in an equal-width row
divided by hairlines. Units are set separately at 55% ink so the numeral column stays clean.

**Queue row** — a 3px left marker (the status mark), street name, evidence line, severity
bar, priority numeral right-aligned. Three states: rest, linked (hover/keyboard),
selected. Rows are 56px at default density, 44px in compact.

**Severity bar** — a 4-unit segmented bar, filled from the left in steel. Segmented rather
than continuous so severity reads as a measured grade, not a mood.

**Tag** — `.tag-outline` for status, uppercase 10px. Status text is always spelled out.

**Buttons** — the plan/dispatch action is the one solid steel object on screen
(`.btn-primary`). Everything else is `.btn-secondary` or `.btn-ghost`.

**Inspector** — a fixed-height readout at the foot of the operations column. It is fixed
height on purpose: hovering rows must never move the layout underneath the cursor.

## 5. Map styling

The map is a drawing, not a photograph.

- Ground `--color-bg`; a 1px graticule at `--color-text` 5% every 64px, with tick labels at
  the edges. The graticule is what makes the surface read as survey rather than satellite.
- Roads: hairlines in ink at 18%; primary corridors at 28% and 2px. No labels except on
  corridors carrying a monitored route.
- No terrain, no buildings, no colour fills, no 3D. If a basemap is used in production,
  desaturate it fully and tint it to the accent — the map must never out-colour the data.
- Vehicle: a 7px steel dot with a 1px ink ring and a fading breadcrumb tail. Position
  updates transition over 1.2s ease-out; a jumping dot reads as a bug.
- Pothole pin: a square, not a teardrop. Squares tile with the graticule and can be sized
  honestly by severity (12–22px). Pins are the only elements allowed above the graticule.
- Selected and linked pins draw full-height/width crosshair guides to the map edges with
  the coordinate printed at the margin. This is the drafting move that ties the map to the
  list — the guide is how you find a pin among two hundred.
- Route geometry, when drawn, is a 2px steel line with numbered square stop markers.

## 6. Data states

Lifecycle from the schema: `suspected → confirmed → scheduled → repaired`, plus
`false_positive`.

| State | Pin | Row marker | Meaning to the operator |
|---|---|---|---|
| `suspected` | Hollow square, 1px ink 40% | Neutral-400 | One vehicle. Evidence, not a fact. |
| `confirmed` | Solid steel square | Steel | A second vehicle corroborated it. Actionable. |
| `scheduled` | Steel square with a white stop number | Steel-800 | On a crew's route; carries `stop_order`. |
| `repaired` | Hollow neutral square, 45% opacity | Neutral-300 | Closed. Stays visible for the day, then drops out. |
| `false_positive` | Removed from the map | — | Dismissal is one click and always undoable for 10s. |

Rules:
- The `suspected → confirmed` transition is the product's central claim, so it gets the
  only animation with any energy: the pin fills over 240ms and the row's evidence line
  increments its vehicle count.
- Never let `suspected` look like an error or a warning. It is a lower-confidence
  observation and should read as lighter, not louder.
- Severity is the pin's size and the row's segmented bar. Priority is the row's numeral.
  Do not conflate them — priority includes age and corroboration, and operators will be
  asked to justify the ordering.
- Counts anywhere in the UI are always attributable: "24 confirmed" is a filter chip that
  filters, never a decorative statistic.

## 7. Motion and interaction

Motion exists to preserve continuity, not to entertain.

- Durations: 120ms for state tints, 240ms for a status change, 1200ms for vehicle
  interpolation. Easing `cubic-bezier(.2,.6,.2,1)`. Nothing else animates.
- **Linked selection is the main mechanism.** Hovering or keyboard-focusing a queue row
  links its pin: the pin grows, its crosshair guides draw, its coordinate prints at the
  margin. Hovering a pin links its row: the row tints and the list scrolls it into view
  (by adjusting the container's scroll offset, never by yanking the page).
- Click toggles the item into tomorrow's route. Selection is multi and persists across
  filter changes; the footer bar always states what is selected and what it costs.
- Keyboard is first-class: `↑ ↓` move the link, `Enter` toggles selection, `Esc` clears,
  `F` cycles the filter. The linked row and the linked pin are the same concept as focus.
- Focus ring is the Industry default — 2px steel, 2px offset. Never removed.
- Hover states are tints, never movement. Nothing on this screen shifts position on hover.
- No skeleton shimmer. Pending data shows a hairline placeholder box with the panel label
  still legible.

## 8. Copy and voice

Civil-service plain English. The reader is accountable to a committee.

- State the measurement, then the inference. "3 vehicles, 11 passes" before "confirmed".
- Numbers carry units and periods: "14.2 km", "312 min", "since 06:00".
- No exclamation marks, no encouragement, no "Oops". A failure states what failed and what
  to do: "Route service unavailable. The queue is unaffected; retry dispatch."
- Actions are verbs with objects: "Plan route", "Dispatch to crew", "Dismiss as false
  positive" — never "Go", "Submit", "Confirm".
- Never claim certainty the data does not have. `suspected` is "one vehicle, unconfirmed",
  not "possible pothole".
- Uncertainty is stated once, in the inspector, not repeated as warnings.
