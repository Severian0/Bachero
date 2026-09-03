# Console Map and Operations Column Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the dashboard's console screen: a MapLibre map of potholes and vehicles linked to an operations column with queue, inspector, detail panel, route planner and dispatch, running on synthetic data by default and Supabase when configured.

**Architecture:** One Next.js page renders `<Console/>`. A zustand store holds data and interaction state; a `ConsoleDataSource` (synthetic or Supabase, chosen by env flag) writes data into it. Pure logic (styling derivation, solver heuristic, tweening, formatting) lives under `src/lib/` and is unit-tested; React components under `src/components/console/` only render store state and dispatch actions.

**Tech Stack:** Next.js 16 (App Router, `src/`), React 19, TypeScript, Tailwind 4 with the tokens in `src/app/globals.css`, `react-map-gl` 8 (`react-map-gl/maplibre`) over `maplibre-gl` 6, OpenFreeMap vector tiles, `zustand` 5, `@supabase/supabase-js` 2, `vitest` 4.

Spec: `docs/superpowers/specs/2026-09-02-console-map-design.md`. Design rules: `docs/design/DESIGN.md`. Data contracts: `docs/ARCHITECTURE.md`.

## Global Constraints

- All commands run from `dashboard/`. Work is on the jj bookmark `console-map`, never `main`. Commits use jj: `jj commit -m "<msg>"` (commits the working copy and opens a new empty change), then `jj bookmark set console-map -r @-` to advance the bookmark. Do not touch the `main` bookmark. Every commit message ends with the two trailer lines `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>` and `Claude-Session: https://claude.ai/code/session_01T93AKP7HijHL2mbegXmMBQ`.
- Tokens only: never hard-code a hex, font, radius or shadow in a component. Use `var(--…)` or the Tailwind aliases (`bg-accent`, `text-ink-55`, `border-divider`, `rounded-lg`, `shadow-sm`, `font-heading`). Spacing is `p-1…p-8` (3.4px × n) or `var(--space-n)`; no other values. Exception: MapLibre style JSON needs literal colours, which are read from the CSS tokens at runtime (Task 9).
- One accent, no status colours. Status is fill/weight/form; severity is size and the segmented bar; priority is the numeral.
- Motion: 120 ms tints (`--dur-tint`), 240 ms status change (`--dur-state`), 1200 ms vehicle interpolation (`--dur-vehicle`), easing `--ease`. Nothing else animates. Hover never moves anything.
- Copy: civil-service plain English, measurement before inference, units on numbers ("14.2 km", "312 min"), button labels are verb + object ("Plan route", "Dispatch to crew", "Dismiss as false positive"), no exclamation marks.
- Never read geography columns from Supabase; read the views. Coordinates are `[lng, lat]` everywhere except human-facing coordinate strings and Google Maps links, which are `lat, lng`.
- Frame sizes: header 62px, column 404px, row 58px (46px compact), footer 68px, inspector min-height 132px, all available as `--console-*` tokens.
- Desktop only, light theme only, no auth.
- Next 16: `params` is a Promise; route handlers are `route.ts`. Check `node_modules/next/dist/docs/01-app/` before using an unfamiliar API.

---

## File Structure

Created under `dashboard/src/`:

| File | Responsibility |
|---|---|
| `lib/data/types.ts` | Screen-facing shapes (`Pothole`, `Vehicle`, `VehiclePosition`, `Crew`, `Detection`) and the `ConsoleDataSource` interface; mapping from view rows |
| `lib/console/format.ts` | Number, time and coordinate formatting; pluralisation |
| `lib/console/derive.ts` | Pure derivations: `priority`, `pinStyle`, `rowStyle`, `severitySegments`, `evidenceLine`, `inspectorLines`, `matchesFilter`, `stats`, `visibleRows` |
| `lib/solver/haversine.ts` | Straight-line `Matrix` from points at a given speed |
| `lib/solver/heuristic.ts` | Pure `solve()`: greedy insertion + 2-opt + baseline |
| `lib/console/store.ts` | zustand store factory `createConsoleStore` and the singleton `useConsole` |
| `lib/console/interpolate.ts` | Pure tween for vehicle positions |
| `lib/data/synthetic.ts` | Seeded synthetic `ConsoleDataSource` |
| `lib/data/supabase.ts` | Supabase-backed `ConsoleDataSource` |
| `lib/data/index.ts` | `createDataSource()` picks by env flag |
| `lib/map/tokens.ts` | `readToken(name)` from computed styles |
| `lib/map/style.ts` | `buildMapStyle(tokens)` MapLibre style JSON |
| `lib/console/keyboard.ts` | `handleKey(e, store)` mapping keys to actions |
| `components/console/Console.tsx` | Shell, data source lifecycle, keyboard listener |
| `components/console/ConsoleHeader.tsx` | Brand, live chip, km, date |
| `components/console/map/*.tsx` | `ConsoleMap`, `Graticule`, `MapKey`, `ScaleBar`, `PotholePin`, `VehicleMarker`, `TrailLayer`, `CrosshairGuides`, `AreaLayer`, `RouteLayer` |
| `components/console/column/*.tsx` | `StatCells`, `FilterChips`, `QueueList`, `QueueRow`, `Inspector`, `DetailPanel`, `UndoToast`, `Planner`, `RouteSummary`, `Footer` |
| `app/page.tsx` | Renders `<Console/>` (modified) |
| `vitest.config.ts`, `src/test/setup.ts` | Test runner config |

Existing files touched: `package.json` (deps, scripts), `src/app/globals.css` (MapLibre control restyle only), `src/app/page.tsx`, `src/lib/types.ts` (unchanged unless a view column is missing), `.env.example` (one new var), root `CLAUDE.md` (Task 15).

---

### Task 1: Tooling — dependencies, vitest, scripts

**Files:**
- Modify: `package.json`
- Create: `vitest.config.ts`, `src/test/setup.ts`, `src/lib/console/format.test.ts` (smoke test only, replaced in Task 2)

**Interfaces:**
- Produces: `npm test`, `npm run test:watch`, `npm run typecheck`; path alias `@/` resolving to `src/` in tests.

- [ ] **Step 1: Install dependencies**

```bash
npm install react-map-gl@8 zustand@5
npm install -D vitest@4 jsdom@30 @vitest/coverage-v8@4
```

- [ ] **Step 2: Add scripts to `package.json`**

Replace the `"scripts"` block with:

```json
"scripts": {
  "dev": "next dev",
  "build": "next build",
  "start": "next start",
  "lint": "eslint",
  "typecheck": "tsc --noEmit",
  "test": "vitest run",
  "test:watch": "vitest"
}
```

- [ ] **Step 3: Create `vitest.config.ts`**

```ts
import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  resolve: { alias: { "@": path.resolve(__dirname, "src") } },
  test: {
    environment: "node",
    include: ["src/**/*.test.ts", "src/**/*.test.tsx"],
    setupFiles: ["src/test/setup.ts"],
    environmentMatchGlobs: [["src/lib/console/store.test.ts", "jsdom"]],
  },
});
```

If vitest 4 rejects `environmentMatchGlobs`, delete that line and put `// @vitest-environment jsdom` as the first line of `store.test.ts` in Task 5 instead.

- [ ] **Step 4: Create `src/test/setup.ts`**

```ts
// Shared test setup. Keep empty unless a global is genuinely needed by many tests.
export {};
```

- [ ] **Step 5: Write a smoke test `src/lib/console/format.test.ts`**

```ts
import { describe, it, expect } from "vitest";

describe("vitest wiring", () => {
  it("runs", () => {
    expect(1 + 1).toBe(2);
  });
});
```

- [ ] **Step 6: Run the suite and the typecheck**

Run: `npm test && npm run typecheck`
Expected: 1 test passes; tsc exits 0. If tsc complains about `vitest.config.ts` (`__dirname` under ESM), change `path.resolve(__dirname, "src")` to `new URL("./src", import.meta.url).pathname`.

- [ ] **Step 7: Commit**

```bash
jj commit -m "Add vitest, zustand and react-map-gl to the dashboard

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01T93AKP7HijHL2mbegXmMBQ"
```

---

### Task 2: Data shapes and formatting helpers

**Files:**
- Create: `src/lib/data/types.ts`, `src/lib/console/format.ts`
- Replace: `src/lib/console/format.test.ts`

**Interfaces:**
- Consumes: `PotholeMapRow`, `VehiclePositionRow`, `Crew`, `PlanRouteRequest`, `PlanRouteResponse`, `DispatchRequest` from `src/lib/types.ts`.
- Produces:
  - `Pothole = PotholeMapRow & { street: string | null; ref: string; stop_order: number | null }`
  - `VehiclePosition = { vehicle_id: string; lng: number; lat: number; recorded_at: string; speed_mps: number | null; heading_deg: number | null }`
  - `Vehicle = { id: string; label: string; fleet_type: string; position: VehiclePosition; trail: VehiclePosition[] }`
  - `Detection = { id: string; pothole_id: string; vehicle_id: string; vehicle_label: string | null; recorded_at: string; severity: number; speed_mps: number | null; photo_url: string | null }`
  - `PotholeUpdate = Pothole | { id: string; deleted: true }`
  - `interface ConsoleDataSource { load(); subscribe(handlers); detections(id); dismiss(id); planRoute(req); dispatch(req) }` exactly as the spec §5
  - `toPothole(row: PotholeMapRow, stop_order?: number | null): Pothole`, `potholeRef(id: string): string`
  - `format.ts`: `km(n)`, `minutes(n)`, `hhmm(iso)`, `coord(lat, lng)`, `plural(n, singular, pluralWord?)`, `pct(fraction)`, `monthsSince(iso, now?)`

- [ ] **Step 1: Write failing tests in `src/lib/console/format.test.ts`**

```ts
import { describe, it, expect } from "vitest";
import { km, minutes, hhmm, coord, plural, pct, monthsSince } from "./format";
import { potholeRef, toPothole } from "@/lib/data/types";
import type { PotholeMapRow } from "@/lib/types";

describe("format", () => {
  it("km and minutes carry units", () => {
    expect(km(14.234)).toBe("14.2 km");
    expect(minutes(312.4)).toBe("312 min");
  });
  it("hhmm renders local 24h time", () => {
    const d = new Date(2026, 8, 2, 6, 5).toISOString();
    expect(hhmm(d)).toBe("06:05");
  });
  it("coord is lat, lng to 4 decimals", () => {
    expect(coord(51.49941, -0.12456)).toBe("51.4994, -0.1246");
  });
  it("plural", () => {
    expect(plural(1, "vehicle")).toBe("1 vehicle");
    expect(plural(3, "vehicle")).toBe("3 vehicles");
    expect(plural(2, "pass", "passes")).toBe("2 passes");
  });
  it("pct rounds a fraction to whole percent", () => {
    expect(pct(0.3516)).toBe("35%");
  });
  it("monthsSince uses 30-day months to 1 decimal", () => {
    const now = new Date("2026-09-02T00:00:00Z");
    expect(monthsSince("2026-07-03T00:00:00Z", now)).toBe(2);
  });
});

describe("toPothole", () => {
  const row: PotholeMapRow = {
    id: "9f3a6b2c-0000-0000-0000-000000000000", authority_id: "a", road_name: null,
    status: "confirmed", severity: 0.6, detection_count: 4, distinct_vehicles: 2,
    first_detected_at: "2026-08-01T00:00:00Z", last_detected_at: "2026-09-01T00:00:00Z",
    repaired_at: null, updated_at: "2026-09-01T00:00:00Z", lng: -0.13, lat: 51.5,
    photo_url: null, priority: 1.2,
  };
  it("derives ref from the id and keeps street null", () => {
    const p = toPothole(row);
    expect(p.ref).toBe("BCH-9F3A");
    expect(p.street).toBeNull();
    expect(p.stop_order).toBeNull();
  });
  it("uses road_name as street and passes stop_order", () => {
    expect(toPothole({ ...row, road_name: "Millbank" }, 3)).toMatchObject({ street: "Millbank", stop_order: 3 });
  });
  it("potholeRef is stable", () => {
    expect(potholeRef("abcd1234-x")).toBe("BCH-ABCD");
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run src/lib/console/format.test.ts`
Expected: FAIL, modules `./format` and `@/lib/data/types` not found.

- [ ] **Step 3: Create `src/lib/data/types.ts`**

```ts
import type {
  Crew, PotholeMapRow, VehiclePositionRow, PlanRouteRequest, PlanRouteResponse, DispatchRequest,
} from "@/lib/types";

export type { Crew, PlanRouteRequest, PlanRouteResponse, DispatchRequest };

/** A pothole as the console shows it: the potholes_map row plus display fields. */
export type Pothole = PotholeMapRow & {
  street: string | null; // road_name; null renders as the coordinate
  ref: string;           // "BCH-" + first 4 hex of the id, uppercase
  stop_order: number | null; // set while scheduled on a route
};

export interface VehiclePosition {
  vehicle_id: string;
  lng: number;
  lat: number;
  recorded_at: string;
  speed_mps: number | null;
  heading_deg: number | null;
}

export interface Vehicle {
  id: string;
  label: string;
  fleet_type: string;
  position: VehiclePosition;
  trail: VehiclePosition[]; // most recent last, max 5
}

export interface Detection {
  id: string;
  pothole_id: string;
  vehicle_id: string;
  vehicle_label: string | null;
  recorded_at: string;
  severity: number;
  speed_mps: number | null;
  photo_url: string | null;
}

export type PotholeUpdate = Pothole | { id: string; deleted: true };

export interface LoadResult {
  potholes: Pothole[];
  vehicles: Vehicle[];
  crews: Crew[];
  kmToday: number;
}

export interface SubscribeHandlers {
  onPothole(p: PotholeUpdate): void;
  onVehiclePosition(v: VehiclePosition): void;
}

export interface ConsoleDataSource {
  load(): Promise<LoadResult>;
  subscribe(handlers: SubscribeHandlers): () => void;
  detections(potholeId: string): Promise<Detection[]>;
  dismiss(potholeId: string): Promise<void>;
  planRoute(req: PlanRouteRequest): Promise<PlanRouteResponse>;
  dispatch(req: DispatchRequest): Promise<void>;
}

export function potholeRef(id: string): string {
  return "BCH-" + id.replace(/-/g, "").slice(0, 4).toUpperCase();
}

export function toPothole(row: PotholeMapRow, stop_order: number | null = null): Pothole {
  return { ...row, street: row.road_name, ref: potholeRef(row.id), stop_order };
}

export function toVehicle(row: VehiclePositionRow): Vehicle {
  const position: VehiclePosition = {
    vehicle_id: row.vehicle_id, lng: row.lng, lat: row.lat, recorded_at: row.recorded_at,
    speed_mps: row.speed_mps, heading_deg: row.heading_deg,
  };
  return { id: row.vehicle_id, label: row.label, fleet_type: row.fleet_type, position, trail: [position] };
}
```

- [ ] **Step 4: Create `src/lib/console/format.ts`**

```ts
export const km = (n: number) => `${n.toFixed(1)} km`;
export const minutes = (n: number) => `${Math.round(n)} min`;

export function hhmm(iso: string): string {
  const d = new Date(iso);
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

/** Human-facing coordinate: lat, lng (the one place that order is used). */
export const coord = (lat: number, lng: number) => `${lat.toFixed(4)}, ${lng.toFixed(4)}`;

export function plural(n: number, singular: string, pluralWord = singular + "s"): string {
  return `${n} ${n === 1 ? singular : pluralWord}`;
}

export const pct = (fraction: number) => `${Math.round(fraction * 100)}%`;

/** Age in 30-day months, 1 decimal. */
export function monthsSince(iso: string, now: Date = new Date()): number {
  const days = (now.getTime() - new Date(iso).getTime()) / 86_400_000;
  return Math.round((days / 30) * 10) / 10;
}
```

- [ ] **Step 5: Run tests**

Run: `npx vitest run src/lib/console/format.test.ts`
Expected: all pass.

- [ ] **Step 6: Commit**

```bash
jj commit -m "Add console data shapes and formatting helpers

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01T93AKP7HijHL2mbegXmMBQ"
```

---

### Task 3: Derivations — priority, pin and row styling, filters, stats

**Files:**
- Create: `src/lib/console/derive.ts`, `src/lib/console/derive.test.ts`

**Interfaces:**
- Consumes: `Pothole` from Task 2; `plural`, `hhmm`, `monthsSince`, `coord` from Task 2.
- Produces:
  - `type Filter = "open" | "suspected" | "confirmed" | "scheduled" | "all"`; `FILTER_CYCLE: Filter[] = ["open","suspected","confirmed","scheduled"]`; `FILTER_LABELS: Record<Filter,string>`
  - `priority(p: Pick<Pothole,"severity"|"distinct_vehicles"|"first_detected_at">, now?: Date): number`
  - `interface PinStyle { size: number; fill: string; stroke: string; glow: string; opacity: number; z: number; stopLabel: string; hidden: boolean }`; `pinStyle(p, flags: { linked: boolean; selected: boolean }): PinStyle`
  - `interface RowStyle { mark: string; bg: string; priColor: string }`; `rowStyle(p, flags): RowStyle`
  - `severitySegments(severity: number): boolean[]` (length 4)
  - `evidenceLine(p): string`; `inspectorLines(p, now?): { title: string; status: string; line1: string; line2: string }`; `STATUS_LABEL: Record<PotholeStatus,string>`
  - `matchesFilter(p, f: Filter): boolean`; `visibleRows(potholes: Pothole[], f: Filter): Pothole[]`; `stats(potholes: Pothole[]): { confirmedOpen: number; suspected: number; scheduled: number }`
  - `isSelectable(p): boolean`

- [ ] **Step 1: Write failing tests `src/lib/console/derive.test.ts`**

```ts
import { describe, it, expect } from "vitest";
import {
  priority, pinStyle, rowStyle, severitySegments, evidenceLine, inspectorLines,
  matchesFilter, visibleRows, stats, isSelectable, FILTER_CYCLE,
} from "./derive";
import type { Pothole } from "@/lib/data/types";

const now = new Date("2026-09-02T12:00:00Z");
const base: Pothole = {
  id: "11111111-0000-0000-0000-000000000000", authority_id: "a", road_name: "Millbank", street: "Millbank",
  ref: "BCH-1111", stop_order: null, status: "confirmed", severity: 0.5, detection_count: 6,
  distinct_vehicles: 2, first_detected_at: "2026-08-03T12:00:00Z", last_detected_at: "2026-09-02T06:30:00Z",
  repaired_at: null, updated_at: "2026-09-02T06:30:00Z", lng: -0.1247, lat: 51.4962, photo_url: null, priority: 0,
};
const p = (o: Partial<Pothole>): Pothole => ({ ...base, ...o });

describe("priority", () => {
  it("is severity × ln(1+vehicles) × (1 + age months)", () => {
    // age 30 days = 1 month → factor 2; ln(3) = 1.0986; 0.5 × 1.0986 × 2 = 1.0986
    expect(priority(base, now)).toBeCloseTo(1.0986, 3);
    expect(priority(p({ distinct_vehicles: 1, first_detected_at: now.toISOString() }), now)).toBeCloseTo(0.5 * Math.log(2), 6);
    expect(priority(p({ severity: 0 }), now)).toBe(0);
  });
});

describe("pinStyle", () => {
  it("suspected is hollow, confirmed solid accent, scheduled accent-800 with stop number", () => {
    expect(pinStyle(p({ status: "suspected" }), { linked: false, selected: false })).toMatchObject({
      fill: "var(--color-bg)", stroke: "var(--ink-38)", opacity: 1, stopLabel: "", hidden: false });
    expect(pinStyle(base, { linked: false, selected: false })).toMatchObject({ fill: "var(--color-accent)", stroke: "var(--color-accent)" });
    expect(pinStyle(p({ status: "scheduled", stop_order: 3 }), { linked: false, selected: false })).toMatchObject({
      fill: "var(--color-accent-800)", stopLabel: "3" });
  });
  it("repaired fades, false_positive hides", () => {
    expect(pinStyle(p({ status: "repaired" }), { linked: false, selected: false })).toMatchObject({ opacity: 0.55, stroke: "var(--color-neutral-300)" });
    expect(pinStyle(p({ status: "false_positive" }), { linked: false, selected: false }).hidden).toBe(true);
  });
  it("size is 12 + severity×11, +5 when linked or selected; glow and z follow", () => {
    const rest = pinStyle(p({ severity: 1 }), { linked: false, selected: false });
    expect(rest.size).toBe(23);
    expect(rest.z).toBe(20);
    const sel = pinStyle(p({ severity: 0 }), { linked: false, selected: true });
    expect(sel.size).toBe(17);
    expect(sel.glow).toBe("0 0 0 4px var(--color-accent-200)");
    expect(sel.z).toBe(50);
    const linked = pinStyle(base, { linked: true, selected: true });
    expect(linked.glow).toBe("0 0 0 5px color-mix(in srgb, var(--color-accent) 24%, transparent)");
    expect(linked.z).toBe(60);
  });
});

describe("rowStyle", () => {
  it("marker by status, background by selection then link", () => {
    expect(rowStyle(p({ status: "suspected" }), { linked: false, selected: false })).toEqual({
      mark: "var(--color-neutral-400)", bg: "transparent", priColor: "var(--ink-72)" });
    expect(rowStyle(base, { linked: true, selected: false })).toMatchObject({ mark: "var(--color-accent)", bg: "var(--ink-5)", priColor: "var(--color-accent-800)" });
    expect(rowStyle(p({ status: "scheduled" }), { linked: true, selected: true })).toMatchObject({ mark: "var(--color-accent-800)", bg: "var(--color-accent-100)" });
    expect(rowStyle(p({ status: "repaired" }), { linked: false, selected: false }).mark).toBe("var(--color-neutral-300)");
  });
});

describe("severitySegments", () => {
  it("fills ceil(severity×4), minimum 1", () => {
    expect(severitySegments(0)).toEqual([true, false, false, false]);
    expect(severitySegments(0.24)).toEqual([true, false, false, false]);
    expect(severitySegments(0.25)).toEqual([true, false, false, false]);
    expect(severitySegments(0.26)).toEqual([true, true, false, false]);
    expect(severitySegments(1)).toEqual([true, true, true, true]);
  });
});

describe("copy", () => {
  it("evidence line states measurement then inference", () => {
    expect(evidenceLine(base)).toBe("2 vehicles · 6 passes · confirmed");
    expect(evidenceLine(p({ distinct_vehicles: 1, detection_count: 1, status: "suspected" }))).toBe("1 vehicle · 1 pass · suspected");
  });
  it("inspector lines", () => {
    const l = inspectorLines(base, now);
    expect(l.title).toBe("Millbank BCH-1111");
    expect(l.status).toBe("Confirmed");
    expect(l.line1).toMatch(/^2 distinct vehicles · 6 passes · last \d\d:\d\d$/);
    expect(l.line2).toBe("Severity 0.50 · age 1 months · priority 1.1");
  });
  it("falls back to the coordinate when there is no street", () => {
    expect(inspectorLines(p({ street: null }), now).title).toBe("51.4962, -0.1247 BCH-1111");
  });
});

describe("filters and stats", () => {
  const list = [
    p({ id: "a", status: "suspected", severity: 0.2 }),
    p({ id: "b", status: "confirmed", severity: 0.9 }),
    p({ id: "c", status: "scheduled" }),
    p({ id: "d", status: "repaired" }),
    p({ id: "e", status: "false_positive" }),
  ];
  it("open = suspected + confirmed; all excludes false_positive", () => {
    expect(list.filter((x) => matchesFilter(x, "open")).map((x) => x.id)).toEqual(["a", "b"]);
    expect(list.filter((x) => matchesFilter(x, "all")).map((x) => x.id)).toEqual(["a", "b", "c", "d"]);
    expect(list.filter((x) => matchesFilter(x, "scheduled")).map((x) => x.id)).toEqual(["c"]);
  });
  it("visibleRows sorts by priority desc", () => {
    expect(visibleRows(list, "open").map((x) => x.id)).toEqual(["b", "a"]);
  });
  it("stats count confirmed-open, suspected, scheduled", () => {
    expect(stats(list)).toEqual({ confirmedOpen: 1, suspected: 1, scheduled: 1 });
  });
  it("only open and scheduled items are selectable", () => {
    expect(list.map(isSelectable)).toEqual([true, true, true, false, false]);
  });
  it("filter cycle is the chip order", () => {
    expect(FILTER_CYCLE).toEqual(["open", "suspected", "confirmed", "scheduled"]);
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run src/lib/console/derive.test.ts`
Expected: FAIL, `./derive` not found.

- [ ] **Step 3: Create `src/lib/console/derive.ts`**

```ts
import type { Pothole } from "@/lib/data/types";
import type { PotholeStatus } from "@/lib/types";
import { coord, hhmm, monthsSince, plural } from "./format";

export type Filter = "open" | "suspected" | "confirmed" | "scheduled" | "all";
export const FILTER_CYCLE: Filter[] = ["open", "suspected", "confirmed", "scheduled"];
export const FILTER_LABELS: Record<Filter, string> = {
  open: "Open", suspected: "Suspected", confirmed: "Confirmed", scheduled: "Scheduled", all: "All",
};
export const STATUS_LABEL: Record<PotholeStatus, string> = {
  suspected: "Suspected", confirmed: "Confirmed", scheduled: "Scheduled", repaired: "Repaired", false_positive: "Dismissed",
};

type Flags = { linked: boolean; selected: boolean };

/** Mirrors potholes_map.priority: severity × ln(1 + vehicles) × (1 + age in 30-day months). */
export function priority(
  p: Pick<Pothole, "severity" | "distinct_vehicles" | "first_detected_at">, now: Date = new Date(),
): number {
  const ageMonths = (now.getTime() - new Date(p.first_detected_at).getTime()) / 86_400_000 / 30;
  return p.severity * Math.log(1 + p.distinct_vehicles) * (1 + ageMonths);
}

export interface PinStyle {
  size: number; fill: string; stroke: string; glow: string; opacity: number; z: number; stopLabel: string; hidden: boolean;
}

export function pinStyle(p: Pothole, { linked, selected }: Flags): PinStyle {
  let fill = "var(--color-bg)", stroke = "var(--ink-38)", opacity = 1;
  if (p.status === "confirmed") { fill = "var(--color-accent)"; stroke = "var(--color-accent)"; }
  if (p.status === "scheduled") { fill = "var(--color-accent-800)"; stroke = "var(--color-accent-800)"; }
  if (p.status === "repaired") { stroke = "var(--color-neutral-300)"; opacity = 0.55; }
  const size = Math.round(12 + p.severity * 11) + (linked || selected ? 5 : 0);
  let glow = "var(--shadow-sm)";
  if (selected) glow = "0 0 0 4px var(--color-accent-200)";
  if (linked) glow = "0 0 0 5px color-mix(in srgb, var(--color-accent) 24%, transparent)";
  return {
    size, fill, stroke, glow, opacity,
    z: linked ? 60 : selected ? 50 : 20,
    stopLabel: p.status === "scheduled" && p.stop_order != null ? String(p.stop_order) : "",
    hidden: p.status === "false_positive",
  };
}

export interface RowStyle { mark: string; bg: string; priColor: string }

export function rowStyle(p: Pothole, { linked, selected }: Flags): RowStyle {
  let mark = "var(--color-neutral-400)";
  if (p.status === "confirmed") mark = "var(--color-accent)";
  if (p.status === "scheduled") mark = "var(--color-accent-800)";
  if (p.status === "repaired") mark = "var(--color-neutral-300)";
  return {
    mark,
    bg: selected ? "var(--color-accent-100)" : linked ? "var(--ink-5)" : "transparent",
    priColor: selected || linked ? "var(--color-accent-800)" : "var(--ink-72)",
  };
}

export function severitySegments(severity: number): boolean[] {
  const filled = Math.max(1, Math.ceil(severity * 4));
  return [0, 1, 2, 3].map((i) => i < filled);
}

export const displayName = (p: Pothole) => p.street ?? coord(p.lat, p.lng);

export function evidenceLine(p: Pothole): string {
  return `${plural(p.distinct_vehicles, "vehicle")} · ${plural(p.detection_count, "pass", "passes")} · ${STATUS_LABEL[p.status].toLowerCase()}`;
}

export function inspectorLines(p: Pothole, now: Date = new Date()) {
  return {
    title: `${displayName(p)} ${p.ref}`,
    status: STATUS_LABEL[p.status],
    line1: `${p.distinct_vehicles} distinct vehicles · ${p.detection_count} passes · last ${hhmm(p.last_detected_at)}`,
    line2: `Severity ${p.severity.toFixed(2)} · age ${monthsSince(p.first_detected_at, now)} months · priority ${priority(p, now).toFixed(1)}`,
  };
}

export function matchesFilter(p: Pothole, f: Filter): boolean {
  if (f === "all") return p.status !== "false_positive";
  if (f === "open") return p.status === "suspected" || p.status === "confirmed";
  return p.status === f;
}

export function visibleRows(potholes: Pothole[], f: Filter, now: Date = new Date()): Pothole[] {
  return potholes
    .filter((p) => matchesFilter(p, f))
    .map((p) => ({ p, pr: priority(p, now) }))
    .sort((a, b) => b.pr - a.pr)
    .map((x) => x.p);
}

export function stats(potholes: Pothole[]) {
  return {
    confirmedOpen: potholes.filter((p) => p.status === "confirmed").length,
    suspected: potholes.filter((p) => p.status === "suspected").length,
    scheduled: potholes.filter((p) => p.status === "scheduled").length,
  };
}

export const isSelectable = (p: Pothole) =>
  p.status === "suspected" || p.status === "confirmed" || p.status === "scheduled";
```

- [ ] **Step 4: Run tests**

Run: `npx vitest run src/lib/console/derive.test.ts`
Expected: all pass. If the `line2` age assertion fails on rounding, the test's `first_detected_at` is exactly 30 days before `now`, so `monthsSince` must return `1`; check `Math.round((days/30)*10)/10`.

- [ ] **Step 5: Commit**

```bash
jj commit -m "Add console derivations: priority, pin and row styling, filters, stats

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01T93AKP7HijHL2mbegXmMBQ"
```

---

### Task 4: Solver heuristic and haversine matrix

**Files:**
- Create: `src/lib/solver/haversine.ts`, `src/lib/solver/heuristic.ts`, `src/lib/solver/heuristic.test.ts`

**Interfaces:**
- Produces:
  - `type LngLat = [number, number]`
  - `interface Matrix { durationMin: number[][]; distanceKm: number[][] }` (index 0 = depot)
  - `haversineKm(a: LngLat, b: LngLat): number`; `buildMatrix(points: LngLat[], speedKmh: number): Matrix`
  - `interface Candidate { id: string; priority: number }`
  - `interface Constraints { mode: "manual" | "count" | "time"; maxStops?: number; timeBudgetMin?: number; serviceMin: number }`
  - `interface Solution { order: number[]; totalMin: number; totalKm: number; baselineKm: number }` where `order` lists candidate indices (0-based into `candidates`; matrix index is `i + 1`)
  - `solve(candidates: Candidate[], m: Matrix, c: Constraints): Solution`
  - `tourKm(order: number[], m: Matrix): number`, `tourMin(order, m, serviceMin): number`

- [ ] **Step 1: Write failing tests `src/lib/solver/heuristic.test.ts`**

```ts
import { describe, it, expect } from "vitest";
import { buildMatrix, haversineKm } from "./haversine";
import { solve, tourKm, tourMin } from "./heuristic";
import type { Matrix } from "./haversine";

// Depot at 0, four stops on a square 1 km apart, in an order that makes the
// priority tour cross itself: 1 (NW), 2 (SE), 3 (NE), 4 (SW).
const pts: [number, number][] = [
  [0, 0], [-0.005, 0.009], [0.005, -0.009], [0.005, 0.009], [-0.005, -0.009],
];
const m: Matrix = buildMatrix(pts, 30);
const cands = [
  { id: "nw", priority: 4 }, { id: "se", priority: 3 }, { id: "ne", priority: 2 }, { id: "sw", priority: 1 },
];

describe("haversine", () => {
  it("1 degree of latitude is ~111 km", () => {
    expect(haversineKm([0, 0], [0, 1])).toBeCloseTo(111.2, 0);
  });
  it("matrix is symmetric with zero diagonal and minutes = km / speed × 60", () => {
    expect(m.distanceKm[0][0]).toBe(0);
    expect(m.distanceKm[1][2]).toBeCloseTo(m.distanceKm[2][1], 9);
    expect(m.durationMin[1][2]).toBeCloseTo((m.distanceKm[1][2] / 30) * 60, 9);
  });
});

describe("solve", () => {
  it("manual mode visits every candidate exactly once", () => {
    const s = solve(cands, m, { mode: "manual", serviceMin: 20 });
    expect([...s.order].sort()).toEqual([0, 1, 2, 3]);
  });
  it("count mode stops at maxStops, preferring high priority per minute", () => {
    const s = solve(cands, m, { mode: "count", maxStops: 2, serviceMin: 20 });
    expect(s.order).toHaveLength(2);
    expect(s.order).toContain(0);
  });
  it("time mode respects the budget including service and the return leg", () => {
    const s = solve(cands, m, { mode: "time", timeBudgetMin: 50, serviceMin: 20 });
    expect(s.totalMin).toBeLessThanOrEqual(50);
    expect(s.order.length).toBeGreaterThan(0);
    expect(s.order.length).toBeLessThan(4);
    const none = solve(cands, m, { mode: "time", timeBudgetMin: 1, serviceMin: 20 });
    expect(none.order).toEqual([]);
    expect(none.totalKm).toBe(0);
  });
  it("2-opt produces a tour no longer than the priority-order baseline", () => {
    const s = solve(cands, m, { mode: "manual", serviceMin: 0 });
    expect(s.totalKm).toBeLessThanOrEqual(s.baselineKm + 1e-9);
    expect(s.baselineKm).toBeCloseTo(tourKm([0, 1, 2, 3], m), 9);
    // The square's perimeter (~4.2 km incl. depot legs) beats the crossed tour.
    expect(s.totalKm).toBeLessThan(s.baselineKm);
  });
  it("tourMin adds service time per stop", () => {
    expect(tourMin([0], m, 20)).toBeCloseTo(m.durationMin[0][1] + m.durationMin[1][0] + 20, 9);
  });
  it("is deterministic", () => {
    const a = solve(cands, m, { mode: "count", maxStops: 3, serviceMin: 20 });
    const b = solve(cands, m, { mode: "count", maxStops: 3, serviceMin: 20 });
    expect(a).toEqual(b);
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run src/lib/solver`
Expected: FAIL, modules not found.

- [ ] **Step 3: Create `src/lib/solver/haversine.ts`**

```ts
export type LngLat = [number, number];

/** Matrix with the depot at index 0; candidates follow in order. */
export interface Matrix { durationMin: number[][]; distanceKm: number[][] }

export function haversineKm(a: LngLat, b: LngLat): number {
  const R = 6371;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b[1] - a[1]);
  const dLng = toRad(b[0] - a[0]);
  const s = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a[1])) * Math.cos(toRad(b[1])) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}

/** Straight-line matrix at a constant speed. Used by the synthetic planner only. */
export function buildMatrix(points: LngLat[], speedKmh: number): Matrix {
  const n = points.length;
  const distanceKm = points.map((a) => points.map((b) => haversineKm(a, b)));
  const durationMin = distanceKm.map((row) => row.map((km) => (km / speedKmh) * 60));
  void n;
  return { durationMin, distanceKm };
}
```

- [ ] **Step 4: Create `src/lib/solver/heuristic.ts`**

```ts
import type { Matrix } from "./haversine";

export interface Candidate { id: string; priority: number }
export interface Constraints {
  mode: "manual" | "count" | "time";
  maxStops?: number;
  timeBudgetMin?: number;
  serviceMin: number;
}
/** `order` holds candidate indices (0-based). Matrix index of candidate i is i + 1; depot is 0. */
export interface Solution { order: number[]; totalMin: number; totalKm: number; baselineKm: number }

const mi = (i: number) => i + 1;

export function tourKm(order: number[], m: Matrix): number {
  if (order.length === 0) return 0;
  let km = m.distanceKm[0][mi(order[0])];
  for (let k = 0; k + 1 < order.length; k++) km += m.distanceKm[mi(order[k])][mi(order[k + 1])];
  return km + m.distanceKm[mi(order[order.length - 1])][0];
}

export function tourMin(order: number[], m: Matrix, serviceMin: number): number {
  if (order.length === 0) return 0;
  let min = m.durationMin[0][mi(order[0])];
  for (let k = 0; k + 1 < order.length; k++) min += m.durationMin[mi(order[k])][mi(order[k + 1])];
  return min + m.durationMin[mi(order[order.length - 1])][0] + serviceMin * order.length;
}

/** Extra minutes from inserting candidate c between positions pos-1 and pos of `order`. */
function marginalMin(order: number[], c: number, pos: number, m: Matrix, serviceMin: number): number {
  const prev = pos === 0 ? 0 : mi(order[pos - 1]);
  const next = pos === order.length ? 0 : mi(order[pos]);
  return m.durationMin[prev][mi(c)] + m.durationMin[mi(c)][next] - m.durationMin[prev][next] + serviceMin;
}

function twoOpt(order: number[], m: Matrix): number[] {
  const o = [...order];
  let improved = true;
  while (improved) {
    improved = false;
    for (let i = 0; i < o.length - 1; i++) {
      for (let j = i + 1; j < o.length; j++) {
        const a = i === 0 ? 0 : mi(o[i - 1]), b = mi(o[i]);
        const c = mi(o[j]), d = j === o.length - 1 ? 0 : mi(o[j + 1]);
        const delta = m.distanceKm[a][c] + m.distanceKm[b][d] - m.distanceKm[a][b] - m.distanceKm[c][d];
        if (delta < -1e-9) {
          o.splice(i, j - i + 1, ...o.slice(i, j + 1).reverse());
          improved = true;
        }
      }
    }
  }
  return o;
}

export function solve(candidates: Candidate[], m: Matrix, c: Constraints): Solution {
  const remaining = new Set(candidates.map((_, i) => i));
  let order: number[] = [];

  while (remaining.size > 0) {
    if (c.mode === "count" && order.length >= (c.maxStops ?? 0)) break;
    let best: { i: number; pos: number; score: number; cost: number } | null = null;
    for (const i of remaining) {
      for (let pos = 0; pos <= order.length; pos++) {
        const cost = marginalMin(order, i, pos, m, c.serviceMin);
        const score = candidates[i].priority / Math.max(cost, 1e-6);
        if (!best || score > best.score + 1e-12 || (Math.abs(score - best.score) <= 1e-12 && i < best.i)) {
          best = { i, pos, score, cost };
        }
      }
    }
    if (!best) break;
    const trial = [...order.slice(0, best.pos), best.i, ...order.slice(best.pos)];
    if (c.mode === "time" && tourMin(trial, m, c.serviceMin) > (c.timeBudgetMin ?? 0)) {
      remaining.delete(best.i); // does not fit here; a cheaper candidate might
      continue;
    }
    order = trial;
    remaining.delete(best.i);
  }

  order = twoOpt(order, m);
  const chosen = [...order].sort((a, b) => candidates[b].priority - candidates[a].priority || a - b);
  return {
    order,
    totalMin: tourMin(order, m, c.serviceMin),
    totalKm: tourKm(order, m),
    baselineKm: tourKm(chosen, m),
  };
}
```

- [ ] **Step 5: Run tests**

Run: `npx vitest run src/lib/solver`
Expected: all pass. If the 2-opt test fails on "totalKm < baselineKm", print both; the crossed priority tour (NW→SE→NE→SW) must be longer than the perimeter tour. If they are equal the reversal condition is wrong — check the `delta` indices.

- [ ] **Step 6: Commit**

```bash
jj commit -m "Add pure route solver heuristic and haversine matrix

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01T93AKP7HijHL2mbegXmMBQ"
```

---

### Task 5: Console store

**Files:**
- Create: `src/lib/console/store.ts`, `src/lib/console/store.test.ts`

**Interfaces:**
- Consumes: `Pothole`, `Vehicle`, `VehiclePosition`, `Crew`, `Detection`, `PotholeUpdate`, `ConsoleDataSource`, `PlanRouteRequest`, `PlanRouteResponse` (Task 2); `Filter`, `FILTER_CYCLE`, `isSelectable` (Task 3).
- Produces:
  - `type LinkSource = "row" | "map" | "keys"`; `type Mode = "manual" | "count" | "time"`
  - `interface PlannerConfig { crewId: string | null; mode: Mode; maxStops: number; timeBudgetMin: number; serviceMinPerStop: number; area: GeoJSON.Polygon | null; planDate: string }`
  - `interface ConsoleState` and `interface ConsoleActions` as below; `type ConsoleStore = ConsoleState & ConsoleActions`
  - `createConsoleStore(): UseBoundStore<StoreApi<ConsoleStore>>`; `useConsole` (singleton)
  - `DISMISS_UNDO_MS = 10_000`
  - The store does not call the data source itself except through `setDataSource(ds)`; `planRoute`, `dispatch`, `commitDismiss` and `loadDetections` use the stored `ds`.

- [ ] **Step 1: Write failing tests `src/lib/console/store.test.ts`**

```ts
// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createConsoleStore, DISMISS_UNDO_MS } from "./store";
import type { ConsoleDataSource, Pothole } from "@/lib/data/types";

const base: Pothole = {
  id: "a", authority_id: "x", road_name: "Millbank", street: "Millbank", ref: "BCH-A", stop_order: null,
  status: "confirmed", severity: 0.5, detection_count: 2, distinct_vehicles: 2,
  first_detected_at: "2026-08-01T00:00:00Z", last_detected_at: "2026-09-01T00:00:00Z", repaired_at: null,
  updated_at: "2026-09-01T00:00:00Z", lng: -0.12, lat: 51.49, photo_url: null, priority: 1,
};
const p = (o: Partial<Pothole>): Pothole => ({ ...base, ...o });

function fakeDs(over: Partial<ConsoleDataSource> = {}): ConsoleDataSource {
  return {
    load: vi.fn(async () => ({ potholes: [], vehicles: [], crews: [], kmToday: 0 })),
    subscribe: vi.fn(() => () => {}),
    detections: vi.fn(async () => []),
    dismiss: vi.fn(async () => {}),
    planRoute: vi.fn(async () => ({ route_plan_id: "r1", stops: [], total_km: 1, total_minutes: 2, baseline_km: 3, path: { type: "LineString", coordinates: [] } })),
    dispatch: vi.fn(async () => {}),
    ...over,
  };
}

describe("console store", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("link, pin, unpin, unlink", () => {
    const s = createConsoleStore();
    s.getState().upsertPothole(base);
    s.getState().link("a", "row");
    expect(s.getState()).toMatchObject({ linkedId: "a", linkSource: "row" });
    s.getState().pin("a");
    expect(s.getState().pinnedId).toBe("a");
    s.getState().unpin();
    expect(s.getState().pinnedId).toBeNull();
    expect(s.getState().linkedId).toBe("a");
    s.getState().unlink();
    expect(s.getState().linkedId).toBeNull();
  });

  it("pin also links, and loads detections through the data source", async () => {
    const ds = fakeDs({ detections: vi.fn(async () => [{ id: "d1", pothole_id: "a", vehicle_id: "v", vehicle_label: "Bus", recorded_at: "2026-09-01T00:00:00Z", severity: 0.4, speed_mps: 5, photo_url: null }]) });
    const s = createConsoleStore();
    s.getState().setDataSource(ds);
    s.getState().upsertPothole(base);
    s.getState().pin("a");
    expect(s.getState().linkedId).toBe("a");
    await vi.runAllTimersAsync();
    expect(s.getState().detections["a"]).toHaveLength(1);
  });

  it("toggleSelected ignores repaired and false_positive", () => {
    const s = createConsoleStore();
    s.getState().upsertPothole(base);
    s.getState().upsertPothole(p({ id: "r", status: "repaired" }));
    s.getState().toggleSelected("a");
    s.getState().toggleSelected("r");
    expect(s.getState().selected).toEqual(["a"]);
    s.getState().toggleSelected("a");
    expect(s.getState().selected).toEqual([]);
  });

  it("a realtime update that repairs a selected item removes it from the selection", () => {
    const s = createConsoleStore();
    s.getState().upsertPothole(base);
    s.getState().toggleSelected("a");
    s.getState().upsertPothole(p({ status: "repaired" }));
    expect(s.getState().selected).toEqual([]);
    s.getState().upsertPothole(p({ id: "b" }));
    s.getState().toggleSelected("b");
    s.getState().upsertPothole(p({ id: "b", severity: 0.9 }));
    expect(s.getState().selected).toEqual(["b"]);
  });

  it("removePothole clears link, pin and selection for that id", () => {
    const s = createConsoleStore();
    s.getState().upsertPothole(base);
    s.getState().pin("a");
    s.getState().toggleSelected("a");
    s.getState().removePothole("a");
    expect(s.getState()).toMatchObject({ linkedId: null, pinnedId: null, selected: [] });
    expect(s.getState().potholes["a"]).toBeUndefined();
  });

  it("dismiss is undoable for 10 s, then commits through the data source", async () => {
    const ds = fakeDs();
    const s = createConsoleStore();
    s.getState().setDataSource(ds);
    s.getState().upsertPothole(base);
    s.getState().toggleSelected("a");
    s.getState().dismiss("a");
    expect(s.getState().potholes["a"].status).toBe("false_positive");
    expect(s.getState().selected).toEqual([]);
    expect(s.getState().pendingDismiss?.id).toBe("a");
    s.getState().undoDismiss();
    expect(s.getState().potholes["a"].status).toBe("confirmed");
    expect(s.getState().pendingDismiss).toBeNull();
    expect(ds.dismiss).not.toHaveBeenCalled();

    s.getState().dismiss("a");
    vi.advanceTimersByTime(DISMISS_UNDO_MS);
    await vi.runAllTimersAsync();
    expect(ds.dismiss).toHaveBeenCalledWith("a");
    expect(s.getState().pendingDismiss).toBeNull();
  });

  it("a second dismissal commits the first immediately", async () => {
    const ds = fakeDs();
    const s = createConsoleStore();
    s.getState().setDataSource(ds);
    s.getState().upsertPothole(base);
    s.getState().upsertPothole(p({ id: "b" }));
    s.getState().dismiss("a");
    s.getState().dismiss("b");
    await vi.runAllTimersAsync();
    expect(ds.dismiss).toHaveBeenCalledWith("a");
    expect(s.getState().pendingDismiss?.id).toBe("b");
  });

  it("cycleFilter follows chip order and wraps", () => {
    const s = createConsoleStore();
    expect(s.getState().filter).toBe("open");
    s.getState().cycleFilter();
    expect(s.getState().filter).toBe("suspected");
    s.getState().setFilter("scheduled");
    s.getState().cycleFilter();
    expect(s.getState().filter).toBe("open");
  });

  it("planRoute builds the request from planner config and stores the result", async () => {
    const ds = fakeDs();
    const s = createConsoleStore();
    s.getState().setDataSource(ds);
    s.getState().setCrews([{ id: "c1", authority_id: "x", name: "Crew A", shift_minutes: 480, repairs_per_shift: 12 }]);
    s.getState().upsertPothole(base);
    s.getState().toggleSelected("a");
    await s.getState().planRoute();
    expect(ds.planRoute).toHaveBeenCalledWith(expect.objectContaining({ crew_id: "c1", mode: "manual", pothole_ids: ["a"], service_min_per_stop: 20 }));
    expect(s.getState().planState).toBe("planned");
    expect(s.getState().plan?.route_plan_id).toBe("r1");
  });

  it("planRoute failure stores one sentence and returns to idle", async () => {
    const ds = fakeDs({ planRoute: vi.fn(async () => { throw new Error("OSRM 429"); }) });
    const s = createConsoleStore();
    s.getState().setDataSource(ds);
    s.getState().setCrews([{ id: "c1", authority_id: "x", name: "Crew A", shift_minutes: 480, repairs_per_shift: 12 }]);
    await s.getState().planRoute();
    expect(s.getState().planState).toBe("error");
    expect(s.getState().planError).toBe("Route service unavailable. The queue is unaffected; try again.");
  });

  it("pushVehiclePosition keeps a trail of at most 5", () => {
    const s = createConsoleStore();
    s.getState().setVehicles([{ id: "v", label: "Bus 24", fleet_type: "bus", position: { vehicle_id: "v", lng: 0, lat: 0, recorded_at: "t0", speed_mps: null, heading_deg: null }, trail: [] }]);
    for (let i = 1; i <= 7; i++) s.getState().pushVehiclePosition({ vehicle_id: "v", lng: i, lat: 0, recorded_at: "t" + i, speed_mps: null, heading_deg: null });
    const v = s.getState().vehicles["v"];
    expect(v.position.lng).toBe(7);
    expect(v.trail).toHaveLength(5);
    expect(v.trail[4].lng).toBe(7);
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run src/lib/console/store.test.ts`
Expected: FAIL, `./store` not found.

- [ ] **Step 3: Create `src/lib/console/store.ts`**

```ts
import { create } from "zustand";
import type {
  ConsoleDataSource, Crew, Detection, PlanRouteRequest, PlanRouteResponse, Pothole, Vehicle, VehiclePosition,
} from "@/lib/data/types";
import { FILTER_CYCLE, isSelectable, type Filter } from "./derive";

export type LinkSource = "row" | "map" | "keys";
export type Mode = "manual" | "count" | "time";
export const DISMISS_UNDO_MS = 10_000;
const TRAIL_LEN = 5;

export interface PlannerConfig {
  crewId: string | null;
  mode: Mode;
  maxStops: number;
  timeBudgetMin: number;
  serviceMinPerStop: number;
  area: GeoJSON.Polygon | null;
  planDate: string; // YYYY-MM-DD
}

export interface ConsoleState {
  potholes: Record<string, Pothole>;
  vehicles: Record<string, Vehicle>;
  crews: Crew[];
  kmToday: number;
  detections: Record<string, Detection[]>;
  loadState: "loading" | "ready" | "error";
  loadError?: string;

  linkedId: string | null;
  linkSource: LinkSource | null;
  pinnedId: string | null;
  selected: string[];
  filter: Filter;
  density: "comfortable" | "compact";

  planner: PlannerConfig;
  plannerOpen: boolean;
  planState: "idle" | "planning" | "planned" | "error";
  plan: PlanRouteResponse | null;
  planError?: string;
  dispatchState: "idle" | "sending" | "sent" | "error";
  dispatchError?: string;
  dispatchedTo: number;

  pendingDismiss: { id: string; previous: Pothole; expiresAt: number } | null;
}

export interface ConsoleActions {
  setDataSource(ds: ConsoleDataSource): void;
  setLoadState(s: ConsoleState["loadState"], error?: string): void;
  setAll(potholes: Pothole[]): void;
  upsertPothole(p: Pothole): void;
  removePothole(id: string): void;
  setVehicles(v: Vehicle[]): void;
  pushVehiclePosition(v: VehiclePosition): void;
  setCrews(c: Crew[]): void;
  setKmToday(km: number): void;
  loadDetections(id: string): Promise<void>;

  link(id: string, source: LinkSource): void;
  unlink(): void;
  pin(id: string): void;
  unpin(): void;
  toggleSelected(id: string): void;
  clearSelection(): void;
  setFilter(f: Filter): void;
  cycleFilter(): void;
  setDensity(d: ConsoleState["density"]): void;

  setPlanner(patch: Partial<PlannerConfig>): void;
  setPlannerOpen(open: boolean): void;
  setArea(area: GeoJSON.Polygon | null): void;
  planRoute(): Promise<void>;
  resetPlan(): void;
  dispatch(to: string[]): Promise<void>;

  dismiss(id: string): void;
  undoDismiss(): void;
}

export type ConsoleStore = ConsoleState & ConsoleActions;

function tomorrowISO(): string {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  return d.toISOString().slice(0, 10);
}

export const PLAN_ERROR = "Route service unavailable. The queue is unaffected; try again.";
export const DISPATCH_ERROR = "Email service unavailable. The plan is saved; try again.";

export function createConsoleStore() {
  let ds: ConsoleDataSource | null = null;
  let dismissTimer: ReturnType<typeof setTimeout> | null = null;

  return create<ConsoleStore>()((set, get) => {
    const commitDismiss = () => {
      const pending = get().pendingDismiss;
      if (dismissTimer) clearTimeout(dismissTimer);
      dismissTimer = null;
      if (!pending) return;
      set({ pendingDismiss: null });
      void ds?.dismiss(pending.id).catch(() => {
        // Restore on failure; the row comes back and the operator can retry.
        set((s) => ({ potholes: { ...s.potholes, [pending.id]: pending.previous } }));
      });
    };

    return {
      potholes: {}, vehicles: {}, crews: [], kmToday: 0, detections: {},
      loadState: "loading",
      linkedId: null, linkSource: null, pinnedId: null, selected: [], filter: "open", density: "comfortable",
      planner: { crewId: null, mode: "manual", maxStops: 12, timeBudgetMin: 480, serviceMinPerStop: 20, area: null, planDate: tomorrowISO() },
      plannerOpen: false,
      planState: "idle", plan: null, dispatchState: "idle", dispatchedTo: 0,
      pendingDismiss: null,

      setDataSource(d) { ds = d; },
      setLoadState(loadState, loadError) { set({ loadState, loadError }); },
      setAll(list) { set({ potholes: Object.fromEntries(list.map((p) => [p.id, p])) }); },
      upsertPothole(p) {
        set((s) => ({
          potholes: { ...s.potholes, [p.id]: p },
          selected: isSelectable(p) ? s.selected : s.selected.filter((id) => id !== p.id),
        }));
      },
      removePothole(id) {
        set((s) => {
          const potholes = { ...s.potholes };
          delete potholes[id];
          return {
            potholes,
            selected: s.selected.filter((x) => x !== id),
            linkedId: s.linkedId === id ? null : s.linkedId,
            pinnedId: s.pinnedId === id ? null : s.pinnedId,
          };
        });
      },
      setVehicles(list) { set({ vehicles: Object.fromEntries(list.map((v) => [v.id, v])) }); },
      pushVehiclePosition(pos) {
        set((s) => {
          const v = s.vehicles[pos.vehicle_id];
          if (!v) return {};
          const trail = [...v.trail, pos].slice(-TRAIL_LEN);
          return { vehicles: { ...s.vehicles, [v.id]: { ...v, position: pos, trail } } };
        });
      },
      setCrews(crews) {
        set((s) => ({
          crews,
          planner: s.planner.crewId ? s.planner : {
            ...s.planner, crewId: crews[0]?.id ?? null,
            maxStops: crews[0]?.repairs_per_shift ?? s.planner.maxStops,
            timeBudgetMin: crews[0]?.shift_minutes ?? s.planner.timeBudgetMin,
          },
        }));
      },
      setKmToday(kmToday) { set({ kmToday }); },
      async loadDetections(id) {
        if (!ds || get().detections[id]) return;
        try {
          const rows = await ds.detections(id);
          set((s) => ({ detections: { ...s.detections, [id]: rows } }));
        } catch {
          set((s) => ({ detections: { ...s.detections, [id]: [] } }));
        }
      },

      link(id, source) { set({ linkedId: id, linkSource: source }); },
      unlink() { if (!get().pinnedId) set({ linkedId: null, linkSource: null }); },
      pin(id) {
        set({ pinnedId: id, linkedId: id, linkSource: get().linkSource ?? "row" });
        void get().loadDetections(id);
      },
      unpin() { set({ pinnedId: null }); },
      toggleSelected(id) {
        const p = get().potholes[id];
        if (!p || !isSelectable(p)) return;
        set((s) => ({ selected: s.selected.includes(id) ? s.selected.filter((x) => x !== id) : [...s.selected, id] }));
      },
      clearSelection() { set({ selected: [] }); },
      setFilter(filter) { set({ filter }); },
      cycleFilter() {
        const i = FILTER_CYCLE.indexOf(get().filter);
        set({ filter: FILTER_CYCLE[(i + 1) % FILTER_CYCLE.length] });
      },
      setDensity(density) { set({ density }); },

      setPlanner(patch) { set((s) => ({ planner: { ...s.planner, ...patch } })); },
      setPlannerOpen(plannerOpen) { set({ plannerOpen }); },
      setArea(area) { set((s) => ({ planner: { ...s.planner, area } })); },
      async planRoute() {
        const { planner, selected } = get();
        if (!ds || !planner.crewId) return;
        const req: PlanRouteRequest = {
          crew_id: planner.crewId,
          plan_date: planner.planDate,
          mode: planner.mode,
          service_min_per_stop: planner.serviceMinPerStop,
          ...(planner.mode === "manual" ? { pothole_ids: selected } : {}),
          ...(planner.mode === "count" ? { max_stops: planner.maxStops } : {}),
          ...(planner.mode === "time" ? { time_budget_min: planner.timeBudgetMin } : {}),
          ...(planner.mode !== "manual" && planner.area ? { area: planner.area } : {}),
        };
        set({ planState: "planning", planError: undefined });
        try {
          const plan = await ds.planRoute(req);
          set({ planState: "planned", plan, plannerOpen: false, selected: [], dispatchState: "idle", dispatchedTo: 0 });
        } catch {
          set({ planState: "error", planError: PLAN_ERROR });
        }
      },
      resetPlan() { set({ planState: "idle", plan: null, planError: undefined, dispatchState: "idle", dispatchError: undefined, dispatchedTo: 0 }); },
      async dispatch(to) {
        const plan = get().plan;
        if (!ds || !plan) return;
        set({ dispatchState: "sending", dispatchError: undefined });
        try {
          await ds.dispatch({ route_plan_id: plan.route_plan_id, to });
          set({ dispatchState: "sent", dispatchedTo: to.length });
        } catch {
          set({ dispatchState: "error", dispatchError: DISPATCH_ERROR });
        }
      },

      dismiss(id) {
        const previous = get().potholes[id];
        if (!previous) return;
        commitDismiss();
        set((s) => ({
          potholes: { ...s.potholes, [id]: { ...previous, status: "false_positive" } },
          selected: s.selected.filter((x) => x !== id),
          pinnedId: s.pinnedId === id ? null : s.pinnedId,
          linkedId: s.linkedId === id ? null : s.linkedId,
          pendingDismiss: { id, previous, expiresAt: Date.now() + DISMISS_UNDO_MS },
        }));
        dismissTimer = setTimeout(commitDismiss, DISMISS_UNDO_MS);
      },
      undoDismiss() {
        const pending = get().pendingDismiss;
        if (!pending) return;
        if (dismissTimer) clearTimeout(dismissTimer);
        dismissTimer = null;
        set((s) => ({ potholes: { ...s.potholes, [pending.id]: pending.previous }, pendingDismiss: null }));
      },
    };
  });
}

export const useConsole = createConsoleStore();
```

`GeoJSON` types: `@types/geojson` is a transitive dependency of `maplibre-gl`; if `tsc` cannot find the global `GeoJSON` namespace, run `npm i -D @types/geojson` and add `import type { Polygon } from "geojson"` where used.

- [ ] **Step 4: Run tests and typecheck**

Run: `npx vitest run src/lib/console/store.test.ts && npm run typecheck`
Expected: all pass, tsc clean.

- [ ] **Step 5: Commit**

```bash
jj commit -m "Add the console zustand store with selection, planner and dismissal flows

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01T93AKP7HijHL2mbegXmMBQ"
```

---

### Task 6: Vehicle position tween

**Files:**
- Create: `src/lib/console/interpolate.ts`, `src/lib/console/interpolate.test.ts`

**Interfaces:**
- Produces:
  - `easeConsole(t: number): number` — cubic-bezier(.2,.6,.2,1) approximation
  - `interface Tween { from: [number, number]; to: [number, number]; start: number; duration: number }`
  - `createTween(from, to, now, duration = 1200): Tween`
  - `tweenAt(tw: Tween, now: number): [number, number]`
  - `retarget(tw: Tween, to, now): Tween` — starts a new tween from the current interpolated point

- [ ] **Step 1: Write failing tests `src/lib/console/interpolate.test.ts`**

```ts
import { describe, it, expect } from "vitest";
import { createTween, tweenAt, retarget, easeConsole } from "./interpolate";

describe("tween", () => {
  it("starts at from, ends at to after the duration", () => {
    const tw = createTween([0, 0], [10, 20], 1000, 1200);
    expect(tweenAt(tw, 1000)).toEqual([0, 0]);
    expect(tweenAt(tw, 2200)).toEqual([10, 20]);
    expect(tweenAt(tw, 5000)).toEqual([10, 20]);
  });
  it("is monotonic and eased in the middle", () => {
    const tw = createTween([0, 0], [10, 0], 0, 1000);
    const a = tweenAt(tw, 250)[0], b = tweenAt(tw, 500)[0], c = tweenAt(tw, 750)[0];
    expect(a).toBeGreaterThan(0);
    expect(b).toBeGreaterThan(a);
    expect(c).toBeGreaterThan(b);
    expect(c).toBeLessThan(10);
  });
  it("retarget restarts from the current interpolated point", () => {
    const tw = createTween([0, 0], [10, 0], 0, 1000);
    const mid = tweenAt(tw, 500);
    const next = retarget(tw, [0, 10], 500);
    expect(next.from).toEqual(mid);
    expect(next.start).toBe(500);
    expect(tweenAt(next, 500)).toEqual(mid);
    expect(tweenAt(next, 1700)).toEqual([0, 10]);
  });
  it("ease endpoints", () => {
    expect(easeConsole(0)).toBe(0);
    expect(easeConsole(1)).toBe(1);
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run src/lib/console/interpolate.test.ts`
Expected: FAIL, module not found.

- [ ] **Step 3: Create `src/lib/console/interpolate.ts`**

```ts
export type XY = [number, number];

/** cubic-bezier(.2,.6,.2,1) sampled by Newton iteration on the x-axis. */
export function easeConsole(t: number): number {
  if (t <= 0) return 0;
  if (t >= 1) return 1;
  const [x1, y1, x2, y2] = [0.2, 0.6, 0.2, 1];
  const bx = (u: number) => 3 * (1 - u) ** 2 * u * x1 + 3 * (1 - u) * u ** 2 * x2 + u ** 3;
  const by = (u: number) => 3 * (1 - u) ** 2 * u * y1 + 3 * (1 - u) * u ** 2 * y2 + u ** 3;
  let u = t;
  for (let i = 0; i < 8; i++) {
    const dx = (bx(u + 1e-6) - bx(u - 1e-6)) / 2e-6;
    if (dx === 0) break;
    u -= (bx(u) - t) / dx;
    u = Math.min(1, Math.max(0, u));
  }
  return by(u);
}

export interface Tween { from: XY; to: XY; start: number; duration: number }

export const createTween = (from: XY, to: XY, now: number, duration = 1200): Tween => ({ from, to, start: now, duration });

export function tweenAt(tw: Tween, now: number): XY {
  const raw = (now - tw.start) / tw.duration;
  if (raw <= 0) return tw.from;
  if (raw >= 1) return tw.to;
  const k = easeConsole(raw);
  return [tw.from[0] + (tw.to[0] - tw.from[0]) * k, tw.from[1] + (tw.to[1] - tw.from[1]) * k];
}

export const retarget = (tw: Tween, to: XY, now: number): Tween => createTween(tweenAt(tw, now), to, now, tw.duration);
```

- [ ] **Step 4: Run tests**

Run: `npx vitest run src/lib/console/interpolate.test.ts`
Expected: all pass.

- [ ] **Step 5: Commit**

```bash
jj commit -m "Add vehicle position tween with the console easing curve

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01T93AKP7HijHL2mbegXmMBQ"
```

---

### Task 7: Synthetic data source

**Files:**
- Create: `src/lib/data/synthetic.ts`, `src/lib/data/synthetic.test.ts`

**Interfaces:**
- Consumes: `ConsoleDataSource`, `Pothole`, `Vehicle`, `VehiclePosition`, `Detection`, `potholeRef` (Task 2); `priority` (Task 3); `solve`, `buildMatrix` (Task 4).
- Produces: `createSyntheticSource(seed = 20260902): ConsoleDataSource`; `DEPOT: [number, number] = [-0.1246, 51.4994]`; `DEMO_AUTHORITY = "Demo Council"`; `mulberry32(seed): () => number`.

- [ ] **Step 1: Write failing tests `src/lib/data/synthetic.test.ts`**

```ts
import { describe, it, expect, vi } from "vitest";
import { createSyntheticSource, mulberry32 } from "./synthetic";

describe("synthetic source", () => {
  it("mulberry32 is deterministic", () => {
    const a = mulberry32(1), b = mulberry32(1);
    expect([a(), a(), a()]).toEqual([b(), b(), b()]);
  });
  it("load is deterministic for the seed and covers every status", async () => {
    const x = await createSyntheticSource(7).load();
    const y = await createSyntheticSource(7).load();
    expect(x.potholes.map((p) => p.id)).toEqual(y.potholes.map((p) => p.id));
    expect(x.potholes.length).toBeGreaterThanOrEqual(28);
    const statuses = new Set(x.potholes.map((p) => p.status));
    expect(statuses.has("suspected")).toBe(true);
    expect(statuses.has("confirmed")).toBe(true);
    expect(x.vehicles).toHaveLength(3);
    expect(x.crews[0].id).toBe("00000000-0000-0000-0000-000000000006");
    expect(x.kmToday).toBeCloseTo(148.6, 6);
  });
  it("confirmed needs two vehicles; suspected has one", async () => {
    const { potholes } = await createSyntheticSource().load();
    for (const p of potholes) {
      if (p.status === "suspected") expect(p.distinct_vehicles).toBe(1);
      if (p.status === "confirmed") expect(p.distinct_vehicles).toBeGreaterThanOrEqual(2);
    }
  });
  it("detections match detection_count and carry the pothole id", async () => {
    const ds = createSyntheticSource();
    const { potholes } = await ds.load();
    const p = potholes[0];
    const rows = await ds.detections(p.id);
    expect(rows).toHaveLength(p.detection_count);
    expect(rows.every((d) => d.pothole_id === p.id)).toBe(true);
  });
  it("planRoute marks chosen potholes scheduled with contiguous stop numbers", async () => {
    const ds = createSyntheticSource();
    const { potholes, crews } = await ds.load();
    const onPothole = vi.fn();
    ds.subscribe({ onPothole, onVehiclePosition: vi.fn() });
    const open = potholes.filter((p) => p.status === "confirmed").slice(0, 4);
    const res = await ds.planRoute({ crew_id: crews[0].id, plan_date: "2026-09-03", mode: "manual", pothole_ids: open.map((p) => p.id), service_min_per_stop: 20 });
    expect(res.stops.map((s) => s.stop_order)).toEqual([1, 2, 3, 4]);
    expect(res.path.coordinates.length).toBe(6); // depot + 4 stops + depot
    expect(res.baseline_km).toBeGreaterThanOrEqual(res.total_km);
    const scheduled = onPothole.mock.calls.map((c) => c[0]).filter((p) => p.status === "scheduled");
    expect(scheduled).toHaveLength(4);
  });
  it("count mode with an area only considers potholes inside it", async () => {
    const ds = createSyntheticSource();
    const { crews } = await ds.load();
    const tiny: GeoJSON.Polygon = { type: "Polygon", coordinates: [[[-0.1300, 51.4940], [-0.1200, 51.4940], [-0.1200, 51.4990], [-0.1300, 51.4990], [-0.1300, 51.4940]]] };
    const res = await ds.planRoute({ crew_id: crews[0].id, plan_date: "2026-09-03", mode: "count", max_stops: 50, area: tiny, service_min_per_stop: 20 });
    for (const s of res.stops) {
      expect(s.lng).toBeGreaterThanOrEqual(-0.13);
      expect(s.lng).toBeLessThanOrEqual(-0.12);
      expect(s.lat).toBeGreaterThanOrEqual(51.494);
      expect(s.lat).toBeLessThanOrEqual(51.499);
    }
  });
  it("subscribe emits vehicle positions on a timer and stops on unsubscribe", async () => {
    vi.useFakeTimers();
    const ds = createSyntheticSource();
    await ds.load();
    const onVehiclePosition = vi.fn();
    const off = ds.subscribe({ onPothole: vi.fn(), onVehiclePosition });
    vi.advanceTimersByTime(1200 * 3);
    expect(onVehiclePosition).toHaveBeenCalledTimes(9);
    off();
    vi.advanceTimersByTime(1200);
    expect(onVehiclePosition).toHaveBeenCalledTimes(9);
    vi.useRealTimers();
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run src/lib/data/synthetic.test.ts`
Expected: FAIL, module not found.

- [ ] **Step 3: Create `src/lib/data/synthetic.ts`**

```ts
import type {
  ConsoleDataSource, Crew, Detection, DispatchRequest, LoadResult, PlanRouteRequest, PlanRouteResponse,
  Pothole, PotholeUpdate, SubscribeHandlers, Vehicle, VehiclePosition,
} from "./types";
import { potholeRef } from "./types";
import { priority } from "@/lib/console/derive";
import { buildMatrix, type LngLat } from "@/lib/solver/haversine";
import { solve } from "@/lib/solver/heuristic";

export const DEPOT: LngLat = [-0.1246, 51.4994];
export const DEMO_AUTHORITY = "Demo Council";
const AUTHORITY_ID = "00000000-0000-0000-0000-000000000001";
const TICK_MS = 1200;
const KM_PER_TICK = 0.11;

export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Hand-placed on Westminster streets. Not snapped to the road network; close enough for a demo.
const SPOTS: { street: string; lng: number; lat: number }[] = [
  { street: "Victoria Street", lng: -0.1395, lat: 51.4972 }, { street: "Victoria Street", lng: -0.136, lat: 51.4978 },
  { street: "Victoria Street", lng: -0.133, lat: 51.4984 }, { street: "Victoria Street", lng: -0.1305, lat: 51.499 },
  { street: "Horseferry Road", lng: -0.1315, lat: 51.4948 }, { street: "Horseferry Road", lng: -0.129, lat: 51.4948 },
  { street: "Horseferry Road", lng: -0.1265, lat: 51.4945 }, { street: "Millbank", lng: -0.1243, lat: 51.495 },
  { street: "Millbank", lng: -0.1247, lat: 51.4962 }, { street: "Millbank", lng: -0.1252, lat: 51.4975 },
  { street: "Marsham Street", lng: -0.129, lat: 51.496 }, { street: "Marsham Street", lng: -0.1288, lat: 51.4975 },
  { street: "Great Peter Street", lng: -0.131, lat: 51.4968 }, { street: "Great Peter Street", lng: -0.128, lat: 51.497 },
  { street: "Vauxhall Bridge Road", lng: -0.1385, lat: 51.494 }, { street: "Vauxhall Bridge Road", lng: -0.136, lat: 51.4925 },
  { street: "Vauxhall Bridge Road", lng: -0.1335, lat: 51.491 }, { street: "Vauxhall Bridge Road", lng: -0.131, lat: 51.4897 },
  { street: "Whitehall", lng: -0.1265, lat: 51.503 }, { street: "Whitehall", lng: -0.1262, lat: 51.5045 },
  { street: "Whitehall", lng: -0.127, lat: 51.501 }, { street: "Birdcage Walk", lng: -0.134, lat: 51.501 },
  { street: "Birdcage Walk", lng: -0.131, lat: 51.5005 }, { street: "Birdcage Walk", lng: -0.137, lat: 51.5013 },
  { street: "Abingdon Street", lng: -0.1258, lat: 51.4985 }, { street: "Lambeth Bridge", lng: -0.1235, lat: 51.4945 },
  { street: "Regency Street", lng: -0.133, lat: 51.493 }, { street: "Rochester Row", lng: -0.1365, lat: 51.495 },
  { street: "Petty France", lng: -0.1345, lat: 51.4995 }, { street: "Tothill Street", lng: -0.1305, lat: 51.4998 },
];

const VEHICLES: { id: string; label: string; fleet_type: string; path: LngLat[] }[] = [
  { id: "00000000-0000-0000-0000-000000000002", label: "Phone A (bus 24)", fleet_type: "bus",
    path: [[-0.1395, 51.4972], [-0.136, 51.4978], [-0.133, 51.4984], [-0.1305, 51.499], [-0.1258, 51.4985], [-0.127, 51.501], [-0.1265, 51.503], [-0.1262, 51.5045]] },
  { id: "00000000-0000-0000-0000-000000000004", label: "Phone B (bin round N)", fleet_type: "refuse_truck",
    path: [[-0.1385, 51.494], [-0.136, 51.4925], [-0.1335, 51.491], [-0.131, 51.4897], [-0.1265, 51.4945], [-0.1243, 51.495], [-0.1247, 51.4962], [-0.1252, 51.4975]] },
  { id: "00000000-0000-0000-0000-000000000007", label: "Pool car 3", fleet_type: "pool_car",
    path: [[-0.137, 51.5013], [-0.134, 51.501], [-0.131, 51.5005], [-0.1305, 51.4998], [-0.1345, 51.4995]] },
];

const CREWS: Crew[] = [
  { id: "00000000-0000-0000-0000-000000000006", authority_id: AUTHORITY_ID, name: "Crew A", shift_minutes: 480, repairs_per_shift: 12 },
];

function uuidFrom(rng: () => number): string {
  const hex = () => Math.floor(rng() * 16).toString(16);
  const s = Array.from({ length: 32 }, hex).join("");
  return `${s.slice(0, 8)}-${s.slice(8, 12)}-4${s.slice(13, 16)}-a${s.slice(17, 20)}-${s.slice(20, 32)}`;
}

function inPolygon([x, y]: LngLat, poly: GeoJSON.Polygon): boolean {
  const ring = poly.coordinates[0];
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i], [xj, yj] = ring[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

export function createSyntheticSource(seed = 20260902): ConsoleDataSource {
  const rng = mulberry32(seed);
  const now = Date.now();
  const potholes = new Map<string, Pothole>();
  const detections = new Map<string, Detection[]>();
  const handlers = new Set<SubscribeHandlers>();
  let kmToday = 148.6;
  let planCounter = 0;

  SPOTS.forEach((spot) => {
    const id = uuidFrom(rng);
    const severity = Math.round((0.18 + rng() * 0.8) * 100) / 100;
    const vehicles = 1 + Math.floor(rng() * rng() * 6);
    const passes = vehicles * (2 + Math.floor(rng() * 9));
    const ageDays = rng() * 13 * 30;
    let status: Pothole["status"] = vehicles >= 2 ? "confirmed" : "suspected";
    const roll = rng();
    if (status === "confirmed" && roll > 0.82) status = "scheduled";
    else if (status === "confirmed" && roll < 0.08) status = "repaired";
    const first = new Date(now - ageDays * 86_400_000).toISOString();
    const last = new Date(now - rng() * 6 * 3_600_000).toISOString();
    const p: Pothole = {
      id, authority_id: AUTHORITY_ID, road_name: spot.street, street: spot.street, ref: potholeRef(id),
      stop_order: status === "scheduled" ? 1 + Math.floor(rng() * 8) : null,
      status, severity, detection_count: passes, distinct_vehicles: vehicles,
      first_detected_at: first, last_detected_at: last,
      repaired_at: status === "repaired" ? last : null, updated_at: last,
      lng: spot.lng + (rng() - 0.5) * 0.0002, lat: spot.lat + (rng() - 0.5) * 0.00012,
      photo_url: null, priority: 0,
    };
    p.priority = priority(p);
    potholes.set(id, p);
    const rows: Detection[] = Array.from({ length: passes }, (_, k) => ({
      id: uuidFrom(rng), pothole_id: id,
      vehicle_id: VEHICLES[k % vehicles % VEHICLES.length].id,
      vehicle_label: VEHICLES[k % vehicles % VEHICLES.length].label,
      recorded_at: new Date(new Date(first).getTime() + (k / passes) * (now - new Date(first).getTime())).toISOString(),
      severity: Math.max(0, Math.min(1, severity - rng() * 0.3)),
      speed_mps: 4 + rng() * 9, photo_url: null,
    }));
    detections.set(id, rows.sort((a, b) => b.recorded_at.localeCompare(a.recorded_at)));
  });

  const vehState = VEHICLES.map((v) => ({ ...v, i: 0, dir: 1 }));
  const vehicle = (v: (typeof vehState)[number]): Vehicle => {
    const [lng, lat] = v.path[v.i];
    const position: VehiclePosition = { vehicle_id: v.id, lng, lat, recorded_at: new Date().toISOString(), speed_mps: 7, heading_deg: null };
    return { id: v.id, label: v.label, fleet_type: v.fleet_type, position, trail: [position] };
  };

  const emit = (u: PotholeUpdate) => handlers.forEach((h) => h.onPothole(u));

  return {
    async load(): Promise<LoadResult> {
      return { potholes: [...potholes.values()], vehicles: vehState.map(vehicle), crews: CREWS, kmToday };
    },
    subscribe(h) {
      handlers.add(h);
      const timer = setInterval(() => {
        kmToday += KM_PER_TICK;
        for (const v of vehState) {
          v.i += v.dir;
          if (v.i >= v.path.length - 1) { v.i = v.path.length - 1; v.dir = -1; }
          else if (v.i <= 0) { v.i = 0; v.dir = 1; }
          h.onVehiclePosition(vehicle(v).position);
        }
      }, TICK_MS);
      return () => { clearInterval(timer); handlers.delete(h); };
    },
    async detections(id) { return detections.get(id) ?? []; },
    async dismiss(id) {
      const p = potholes.get(id);
      if (p) potholes.set(id, { ...p, status: "false_positive" });
    },
    async planRoute(req: PlanRouteRequest): Promise<PlanRouteResponse> {
      const open = [...potholes.values()].filter((p) => p.status === "suspected" || p.status === "confirmed");
      let cands = req.mode === "manual" ? open.filter((p) => req.pothole_ids?.includes(p.id)) : open;
      if (req.mode !== "manual" && req.area) cands = cands.filter((p) => inPolygon([p.lng, p.lat], req.area!));
      const serviceMin = req.service_min_per_stop ?? 20;
      const m = buildMatrix([DEPOT, ...cands.map((p): LngLat => [p.lng, p.lat])], 25);
      const sol = solve(cands.map((p) => ({ id: p.id, priority: priority(p) })), m, {
        mode: req.mode, maxStops: req.max_stops, timeBudgetMin: req.time_budget_min, serviceMin,
      });
      const routeId = `synthetic-plan-${++planCounter}`;
      const start = new Date(`${req.plan_date}T08:00:00`);
      let elapsed = 0, prev = 0;
      const stops = sol.order.map((ci, k) => {
        const p = cands[ci];
        elapsed += m.durationMin[prev][ci + 1];
        prev = ci + 1;
        const eta = new Date(start.getTime() + elapsed * 60_000).toISOString();
        elapsed += serviceMin;
        const updated: Pothole = { ...p, status: "scheduled", stop_order: k + 1, updated_at: new Date().toISOString() };
        potholes.set(p.id, updated);
        emit(updated);
        return { work_order_id: `${routeId}-wo-${k + 1}`, pothole_id: p.id, stop_order: k + 1, eta, lng: p.lng, lat: p.lat, severity: p.severity, photo_url: p.photo_url };
      });
      const coords: [number, number][] = [DEPOT, ...stops.map((s): [number, number] => [s.lng, s.lat]), DEPOT];
      return {
        route_plan_id: routeId, stops,
        total_km: Math.round(sol.totalKm * 10) / 10, total_minutes: Math.round(sol.totalMin),
        baseline_km: Math.round(sol.baselineKm * 10) / 10,
        path: { type: "LineString", coordinates: coords },
      };
    },
    async dispatch(_req: DispatchRequest) { await new Promise((r) => setTimeout(r, 600)); },
  };
}
```

- [ ] **Step 4: Run tests and typecheck**

Run: `npx vitest run src/lib/data/synthetic.test.ts && npm run typecheck`
Expected: all pass. If the "count mode with an area" test returns zero stops, check `inPolygon` ring orientation handling (the algorithm is orientation-independent; check the coordinates are `[lng, lat]`). If the subscribe test counts fewer than 9 calls, the interval must fire once per 1200 ms with three vehicles each tick.

- [ ] **Step 5: Commit**

```bash
jj commit -m "Add the synthetic console data source with a client-side planner

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01T93AKP7HijHL2mbegXmMBQ"
```

---

### Task 8: Supabase data source and the env switch

**Files:**
- Create: `src/lib/data/supabase.ts`, `src/lib/data/index.ts`, `src/lib/data/supabase.test.ts`
- Modify: `.env.example` (add `NEXT_PUBLIC_DEMO_CREW_EMAIL=`)

**Interfaces:**
- Consumes: `supabase` client from `src/lib/supabase.ts`; row types from `src/lib/types.ts`; `toPothole`, `toVehicle` (Task 2).
- Produces: `createSupabaseSource(client = supabase): ConsoleDataSource`; `createDataSource(): ConsoleDataSource`; `isSupabaseConfigured(): boolean`; `startOfTodayISO(): string`.

- [ ] **Step 1: Write a failing test `src/lib/data/supabase.test.ts`** for the parts that can be tested without a network: the env switch and the pothole/vehicle mapping through `load`.

```ts
import { describe, it, expect, vi, afterEach } from "vitest";
import { isSupabaseConfigured, startOfTodayISO } from "./index";
import { createSupabaseSource } from "./supabase";

describe("env switch", () => {
  afterEach(() => vi.unstubAllEnvs());
  it("uses Supabase only when the URL is set", () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "");
    expect(isSupabaseConfigured()).toBe(false);
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://x.supabase.co");
    expect(isSupabaseConfigured()).toBe(true);
  });
  it("startOfTodayISO is midnight local", () => {
    expect(new Date(startOfTodayISO()).getHours()).toBe(0);
  });
});

describe("supabase source load", () => {
  it("reads the views and maps rows", async () => {
    const tables: Record<string, unknown[]> = {
      potholes_map: [{ id: "abcd0000-0000-0000-0000-000000000000", authority_id: "a", road_name: null, status: "confirmed", severity: 0.5, detection_count: 2, distinct_vehicles: 2, first_detected_at: "2026-08-01T00:00:00Z", last_detected_at: "2026-09-01T00:00:00Z", repaired_at: null, updated_at: "2026-09-01T00:00:00Z", lng: -0.12, lat: 51.49, photo_url: null, priority: 1 }],
      latest_vehicle_positions: [{ vehicle_id: "v", trip_id: "t", recorded_at: "2026-09-02T08:00:00Z", lng: -0.13, lat: 51.5, speed_mps: 5, heading_deg: 90, label: "Bus 24", fleet_type: "bus", route_ref: null }],
      crews: [{ id: "c", authority_id: "a", name: "Crew A", shift_minutes: 480, repairs_per_shift: 12 }],
      trips: [{ distance_m: 1500 }, { distance_m: 2500 }],
      work_orders: [{ pothole_id: "abcd0000-0000-0000-0000-000000000000", stop_order: 2 }],
    };
    const query = (rows: unknown[]) => {
      const q: Record<string, unknown> = {};
      const chain = () => q;
      Object.assign(q, { select: chain, in: chain, or: chain, gte: chain, order: chain, eq: chain,
        then: (res: (v: { data: unknown[]; error: null }) => unknown) => Promise.resolve({ data: rows, error: null }).then(res) });
      return q;
    };
    const client = { from: (t: string) => query(tables[t] ?? []) } as never;
    const res = await createSupabaseSource(client).load();
    expect(res.potholes[0]).toMatchObject({ ref: "BCH-ABCD", street: null, stop_order: 2 });
    expect(res.vehicles[0]).toMatchObject({ id: "v", label: "Bus 24" });
    expect(res.vehicles[0].position.lng).toBe(-0.13);
    expect(res.kmToday).toBe(4);
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run src/lib/data/supabase.test.ts`
Expected: FAIL, modules not found.

- [ ] **Step 3: Create `src/lib/data/supabase.ts`**

```ts
import type { SupabaseClient } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase";
import type { Crew, PotholeMapRow, VehiclePositionRow } from "@/lib/types";
import type { ConsoleDataSource, Detection, LoadResult, Vehicle } from "./types";
import { toPothole, toVehicle } from "./types";

export function startOfTodayISO(): string {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d.toISOString();
}

async function postJson<T>(url: string, body: unknown): Promise<T> {
  const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  if (!res.ok) {
    let msg = `${res.status}`;
    try { msg = ((await res.json()) as { error?: string }).error ?? msg; } catch { /* keep status */ }
    throw new Error(msg);
  }
  return (await res.json()) as T;
}

export function createSupabaseSource(client: SupabaseClient = supabase): ConsoleDataSource {
  const potholeRow = async (id: string): Promise<PotholeMapRow | null> => {
    const { data } = await client.from("potholes_map").select("*").eq("id", id);
    return (data?.[0] as PotholeMapRow | undefined) ?? null;
  };
  const stopOrders = async (): Promise<Map<string, number>> => {
    const { data } = await client.from("work_orders").select("pothole_id, stop_order").in("status", ["assigned", "in_progress"]);
    return new Map((data ?? []).map((w: { pothole_id: string; stop_order: number | null }) => [w.pothole_id, w.stop_order ?? 0]));
  };

  return {
    async load(): Promise<LoadResult> {
      const [ph, vp, cr, tr, so] = await Promise.all([
        client.from("potholes_map").select("*")
          .or(`status.in.(suspected,confirmed,scheduled),and(status.eq.repaired,repaired_at.gte.${startOfTodayISO()})`),
        client.from("latest_vehicle_positions").select("*"),
        client.from("crews").select("*"),
        client.from("trips").select("distance_m").gte("started_at", startOfTodayISO()),
        stopOrders(),
      ]);
      if (ph.error) throw new Error(ph.error.message);
      const potholes = ((ph.data ?? []) as PotholeMapRow[]).map((r) => toPothole(r, so.get(r.id) ?? null));
      const vehicles: Vehicle[] = ((vp.data ?? []) as VehiclePositionRow[]).map(toVehicle);
      const crews = (cr.data ?? []) as Crew[];
      const kmToday = ((tr.data ?? []) as { distance_m: number | null }[]).reduce((s, t) => s + (t.distance_m ?? 0), 0) / 1000;
      return { potholes, vehicles, crews, kmToday };
    },

    subscribe({ onPothole, onVehiclePosition }) {
      const channel = client.channel("map")
        .on("postgres_changes", { event: "*", schema: "public", table: "potholes" }, async (payload) => {
          if (payload.eventType === "DELETE") { onPothole({ id: (payload.old as { id: string }).id, deleted: true }); return; }
          const id = (payload.new as { id: string }).id;
          const [row, so] = await Promise.all([potholeRow(id), stopOrders()]);
          if (row) onPothole(toPothole(row, so.get(id) ?? null));
        })
        .on("postgres_changes", { event: "INSERT", schema: "public", table: "vehicle_positions" }, async (payload) => {
          const vid = (payload.new as { vehicle_id: string }).vehicle_id;
          const { data } = await client.from("latest_vehicle_positions").select("*").eq("vehicle_id", vid);
          const row = data?.[0] as VehiclePositionRow | undefined;
          if (row) onVehiclePosition(toVehicle(row).position);
        })
        .subscribe();
      return () => { void client.removeChannel(channel); };
    },

    async detections(potholeId): Promise<Detection[]> {
      const { data, error } = await client.from("detections")
        .select("id, pothole_id, vehicle_id, recorded_at, severity, speed_mps, photo_url, vehicle:vehicles(label)")
        .eq("pothole_id", potholeId).order("recorded_at", { ascending: false });
      if (error) throw new Error(error.message);
      return (data ?? []).map((d: Record<string, unknown>) => ({
        id: d.id as string, pothole_id: d.pothole_id as string, vehicle_id: d.vehicle_id as string,
        vehicle_label: ((d.vehicle as { label?: string } | null)?.label) ?? null,
        recorded_at: d.recorded_at as string, severity: d.severity as number,
        speed_mps: (d.speed_mps as number | null) ?? null, photo_url: (d.photo_url as string | null) ?? null,
      }));
    },

    async dismiss(potholeId) {
      const { error } = await client.from("potholes").update({ status: "false_positive" }).eq("id", potholeId);
      if (error) throw new Error(error.message);
    },

    planRoute: (req) => postJson("/api/plan-route", req),
    async dispatch(req) { await postJson("/api/dispatch", req); },
  };
}
```

- [ ] **Step 4: Create `src/lib/data/index.ts`**

```ts
import type { ConsoleDataSource } from "./types";
import { createSyntheticSource } from "./synthetic";

export { startOfTodayISO } from "./supabase";

export const isSupabaseConfigured = () => Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL);

/** Supabase when NEXT_PUBLIC_SUPABASE_URL is set, else the synthetic generator. */
export async function createDataSource(): Promise<ConsoleDataSource> {
  if (isSupabaseConfigured()) {
    const { createSupabaseSource } = await import("./supabase");
    return createSupabaseSource();
  }
  return createSyntheticSource();
}
```

The dynamic import keeps `src/lib/supabase.ts` (which throws on missing env at module load because of the `!` assertions) out of the synthetic path.

- [ ] **Step 5: Append to `.env.example`**

```
# Prefills the Dispatch email field on the console (optional).
NEXT_PUBLIC_DEMO_CREW_EMAIL=
```

- [ ] **Step 6: Run tests and typecheck**

Run: `npx vitest run src/lib/data && npm run typecheck`
Expected: pass. If tsc rejects the `.or(...)`/`.in(...)` chain typing on the mocked client, the mock is cast `as never`, so the only errors should be in the real code: fix by typing `data` casts, never by loosening the source.

- [ ] **Step 7: Commit**

```bash
jj commit -m "Add the Supabase console data source and the env-based data switch

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01T93AKP7HijHL2mbegXmMBQ"
```

---

### Task 9: Map style, console shell, header, basemap with graticule, key and scale

This task produces the first visible screen: header, an empty operations column frame, and the styled basemap centred on the depot.

**Files:**
- Create: `src/lib/map/tokens.ts`, `src/lib/map/style.ts`, `src/lib/map/style.test.ts`, `src/components/console/Console.tsx`, `src/components/console/ConsoleHeader.tsx`, `src/components/console/map/ConsoleMap.tsx`, `src/components/console/map/Graticule.tsx`, `src/components/console/map/MapKey.tsx`, `src/components/console/map/ScaleBar.tsx`
- Modify: `src/app/page.tsx`, `src/app/globals.css` (append MapLibre control restyle)

**Interfaces:**
- Consumes: `useConsole` (Task 5); `createDataSource` (Task 8); `DEPOT`, `DEMO_AUTHORITY` (Task 7); `km` (Task 2).
- Produces:
  - `interface MapTokens { bg: string; text: string; accent: string; accent800: string; neutral200: string }`; `readToken(name: string): string`; `readMapTokens(): MapTokens`
  - `buildMapStyle(t: MapTokens): StyleSpecification` (from `maplibre-gl`)
  - `<Console/>` default export; `<ConsoleMap/>` renders children inside the `<Map>` so later tasks add layers by composing inside it: `ConsoleMap` accepts `children?: ReactNode` and passes an `onMove` tick via a context `MapTickContext` (number that increments on every map move) for overlays that project coordinates.
  - `export const MapTickContext = createContext(0)`

- [ ] **Step 1: Write failing test `src/lib/map/style.test.ts`**

```ts
import { describe, it, expect } from "vitest";
import { buildMapStyle } from "./style";

const t = { bg: "#f2f2f3", text: "#1d1f20", accent: "#5980a6", accent800: "#2c455d", neutral200: "#e7e7ea" };

describe("buildMapStyle", () => {
  const s = buildMapStyle(t);
  it("uses OpenFreeMap tiles and glyphs", () => {
    expect((s.sources.openmaptiles as { url: string }).url).toBe("https://tiles.openfreemap.org/planet");
    expect(s.glyphs).toContain("tiles.openfreemap.org/fonts");
  });
  it("has exactly the five layers in order and no buildings or landuse", () => {
    expect(s.layers.map((l) => l.id)).toEqual(["background", "water", "road-minor", "road-major", "road-label-major"]);
  });
  it("paints ground and roads from tokens with the spec opacities", () => {
    const bg = s.layers[0] as { paint: { "background-color": string } };
    expect(bg.paint["background-color"]).toBe("#f2f2f3");
    const minor = s.layers[2] as { paint: Record<string, unknown> };
    expect(minor.paint["line-color"]).toBe("#1d1f20");
    expect(minor.paint["line-opacity"]).toBe(0.18);
    const major = s.layers[3] as { paint: Record<string, unknown> };
    expect(major.paint["line-opacity"]).toBe(0.28);
    expect(major.paint["line-width"]).toBe(2);
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run src/lib/map`
Expected: FAIL, module not found.

- [ ] **Step 3: Create `src/lib/map/tokens.ts`**

```ts
export interface MapTokens { bg: string; text: string; accent: string; accent800: string; neutral200: string }

/** Read a CSS custom property from :root. Only hex tokens are safe for MapLibre (no color-mix). */
export function readToken(name: string): string {
  if (typeof window === "undefined") return "";
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

export function readMapTokens(): MapTokens {
  return {
    bg: readToken("--color-bg") || "#f2f2f3",
    text: readToken("--color-text") || "#1d1f20",
    accent: readToken("--color-accent") || "#5980a6",
    accent800: readToken("--color-accent-800") || "#2c455d",
    neutral200: readToken("--color-neutral-200") || "#e7e7ea",
  };
}
```

- [ ] **Step 4: Create `src/lib/map/style.ts`**

```ts
import type { StyleSpecification } from "maplibre-gl";
import type { MapTokens } from "./tokens";

const MAJOR = ["motorway", "trunk", "primary"];
const NOT_ROAD = [...MAJOR, "rail", "transit", "path", "ferry", "aerialway", "track"];

/** DESIGN.md §5: a drawing, not a photograph. Ground, water, roads, major labels. Nothing else. */
export function buildMapStyle(t: MapTokens): StyleSpecification {
  return {
    version: 8,
    glyphs: "https://tiles.openfreemap.org/fonts/{fontstack}/{range}.pbf",
    sources: { openmaptiles: { type: "vector", url: "https://tiles.openfreemap.org/planet" } },
    layers: [
      { id: "background", type: "background", paint: { "background-color": t.bg } },
      { id: "water", type: "fill", source: "openmaptiles", "source-layer": "water", paint: { "fill-color": t.neutral200 } },
      {
        id: "road-minor", type: "line", source: "openmaptiles", "source-layer": "transportation",
        filter: ["all", ["==", ["geometry-type"], "LineString"], ["!", ["in", ["get", "class"], ["literal", NOT_ROAD]]]],
        paint: { "line-color": t.text, "line-opacity": 0.18, "line-width": 1 },
      },
      {
        id: "road-major", type: "line", source: "openmaptiles", "source-layer": "transportation",
        filter: ["all", ["==", ["geometry-type"], "LineString"], ["in", ["get", "class"], ["literal", MAJOR]]],
        paint: { "line-color": t.text, "line-opacity": 0.28, "line-width": 2 },
      },
      {
        id: "road-label-major", type: "symbol", source: "openmaptiles", "source-layer": "transportation_name", minzoom: 13,
        filter: ["in", ["get", "class"], ["literal", MAJOR]],
        layout: {
          "symbol-placement": "line", "text-field": ["get", "name"], "text-font": ["Noto Sans Regular"],
          "text-size": 10, "text-transform": "uppercase", "text-letter-spacing": 0.12,
        },
        paint: { "text-color": t.text, "text-opacity": 0.55, "text-halo-color": t.bg, "text-halo-width": 1 },
      },
    ],
  };
}
```

- [ ] **Step 5: Run tests**

Run: `npx vitest run src/lib/map`
Expected: pass.

- [ ] **Step 6: Create `src/components/console/map/Graticule.tsx`**

Screen-space grid via CSS gradients (cheaper than the spec's canvas, same picture): 1px ink-5% lines every 64px anchored to the container, tick labels every 256px along the top and left edges.

```tsx
"use client";
import { useEffect, useRef, useState } from "react";

const STEP = 64;
const LABEL_EVERY = 4;

export function Graticule() {
  const ref = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setSize({ w: e.contentRect.width, h: e.contentRect.height }));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const cols = Math.floor(size.w / (STEP * LABEL_EVERY));
  const rows = Math.floor(size.h / (STEP * LABEL_EVERY));

  return (
    <div
      ref={ref}
      aria-hidden
      className="absolute inset-0 pointer-events-none"
      style={{
        backgroundImage:
          "linear-gradient(to right, var(--ink-5) 1px, transparent 1px), linear-gradient(to bottom, var(--ink-5) 1px, transparent 1px)",
        backgroundSize: `${STEP}px ${STEP}px`,
      }}
    >
      {Array.from({ length: cols }, (_, i) => (
        <span key={"c" + i} className="absolute top-1 text-[10px] tabular text-ink-45" style={{ left: (i + 1) * STEP * LABEL_EVERY + 3 }}>
          {(i + 1) * LABEL_EVERY}
        </span>
      ))}
      {Array.from({ length: rows }, (_, i) => (
        <span key={"r" + i} className="absolute left-1 text-[10px] tabular text-ink-45" style={{ top: (i + 1) * STEP * LABEL_EVERY + 1 }}>
          {(i + 1) * LABEL_EVERY}
        </span>
      ))}
    </div>
  );
}
```

- [ ] **Step 7: Create `src/components/console/map/MapKey.tsx` and `ScaleBar.tsx`**

`MapKey.tsx`:

```tsx
export function MapKey() {
  const row = "flex items-center gap-3 text-[12px]";
  return (
    <div className="absolute z-[80] left-6 bottom-6 p-4 px-6 bg-bg border border-divider rounded-lg shadow-sm">
      <div className="panel-label mb-3">Key</div>
      <div className="grid gap-3">
        <div className={row}><i className="w-[15px] h-[15px] rounded-[4px] border-[1.5px] border-ink-38" /> Suspected — one vehicle</div>
        <div className={row}><i className="w-[17px] h-[17px] rounded-[5px] bg-accent" /> Confirmed — corroborated</div>
        <div className={row}><i className="w-[17px] h-[17px] rounded-[5px] bg-accent-800" /> Scheduled — on a route</div>
        <div className={row}><i className="w-[15px] h-[15px] rounded-[4px] border-[1.5px] border-neutral-300" /> Repaired — closed today</div>
      </div>
      <div className="mt-3 pt-3 border-t border-divider text-[12px] text-ink-55">Marker size shows severity</div>
    </div>
  );
}
```

`ScaleBar.tsx`:

```tsx
"use client";
import { ScaleControl } from "react-map-gl/maplibre";

export function ScaleBar() {
  return <ScaleControl position="bottom-right" maxWidth={80} unit="metric" />;
}
```

Append to `src/app/globals.css` (outside any `@layer`):

```css
/* MapLibre controls restyled to the tokens. */
.maplibregl-ctrl-scale {
  margin: 0 var(--space-6) var(--space-6) 0;
  padding: 2px var(--space-3) var(--space-2);
  border: 0; border-bottom: 2px solid var(--ink-45);
  background: var(--color-bg); box-shadow: var(--shadow-sm); border-radius: var(--radius-md);
  font: 11px/1.4 var(--font-body); color: var(--ink-58); font-variant-numeric: tabular-nums;
}
.maplibregl-ctrl-attrib { font: 10px/1.4 var(--font-body); background: color-mix(in srgb, var(--color-bg) 85%, transparent); }
.maplibregl-ctrl-attrib a { color: var(--ink-55); }
.maplibregl-map { font-family: var(--font-body); }
.maplibregl-marker { will-change: transform; }
```

- [ ] **Step 8: Create `src/components/console/map/ConsoleMap.tsx`**

```tsx
"use client";
import { createContext, useMemo, useState, type ReactNode } from "react";
import Map from "react-map-gl/maplibre";
import "maplibre-gl/dist/maplibre-gl.css";
import { buildMapStyle } from "@/lib/map/style";
import { readMapTokens } from "@/lib/map/tokens";
import { DEPOT } from "@/lib/data/synthetic";
import { Graticule } from "./Graticule";
import { MapKey } from "./MapKey";
import { ScaleBar } from "./ScaleBar";

/** Increments on every map move so overlays that project coordinates re-render. */
export const MapTickContext = createContext(0);

export function ConsoleMap({ children, dragPan = true, onMapMouseLeave }: {
  children?: ReactNode; dragPan?: boolean; onMapMouseLeave?: () => void;
}) {
  const style = useMemo(() => buildMapStyle(readMapTokens()), []);
  const [tick, setTick] = useState(0);
  const [tilesFailed, setTilesFailed] = useState(false);

  return (
    <section className="relative overflow-hidden border-r border-divider bg-neutral-200" onMouseLeave={onMapMouseLeave}>
      <Map
        initialViewState={{ longitude: DEPOT[0], latitude: DEPOT[1], zoom: 14.5 }}
        mapStyle={style}
        style={{ position: "absolute", inset: 0 }}
        dragPan={dragPan}
        dragRotate={false}
        pitchWithRotate={false}
        attributionControl={{ compact: true }}
        onMove={() => setTick((t) => t + 1)}
        onError={(e) => { if (/tile|source|glyph/i.test(String(e.error?.message))) setTilesFailed(true); }}
      >
        <MapTickContext.Provider value={tick}>
          {children}
          <ScaleBar />
        </MapTickContext.Provider>
      </Map>
      <Graticule />
      <MapKey />
      {tilesFailed && (
        <div className="absolute top-0 inset-x-0 z-[90] px-4 py-2 text-[12px] bg-bg border-b border-divider text-ink-72">
          Basemap unavailable. Pins are still placed by coordinate.
        </div>
      )}
    </section>
  );
}
```

The graticule sits above the map canvas but below markers only if markers have a higher z-index; `Graticule` has no z-index and markers in Task 10 set `z-index ≥ 20` on their Marker, which MapLibre renders in a container above the canvas. If the grid covers pins visually, add `z-[10]` to the Marker containers' parent via `.maplibregl-marker { z-index: 20 }` in the CSS block above.

- [ ] **Step 9: Create `src/components/console/ConsoleHeader.tsx`**

```tsx
"use client";
import { useConsole } from "@/lib/console/store";
import { DEMO_AUTHORITY } from "@/lib/data/synthetic";

const REPORTING_WINDOW_MS = 60_000;

export function ConsoleHeader() {
  const vehicles = useConsole((s) => s.vehicles);
  const kmToday = useConsole((s) => s.kmToday);
  const now = Date.now();
  const reporting = Object.values(vehicles).filter((v) => now - new Date(v.position.recorded_at).getTime() < REPORTING_WINDOW_MS).length;
  const authority = process.env.NEXT_PUBLIC_AUTHORITY_NAME || DEMO_AUTHORITY;
  const date = new Date().toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "long", year: "numeric" });

  return (
    <header className="flex items-center justify-between px-6 bg-neutral-100 border-b border-divider" style={{ height: "var(--console-header-h)" }}>
      <div className="flex items-center gap-4">
        <span className="block w-7 h-7 border-[1.5px] border-accent rounded-md" aria-hidden />
        <div className="leading-tight">
          <div className="font-bold text-[16px] tracking-[.04em] uppercase">Bachero</div>
          <div className="text-[12px] text-ink-58">{authority} — Highways Maintenance Directorate</div>
        </div>
      </div>
      <div className="flex items-center gap-4 text-[12px] text-ink-58">
        <span className="flex items-center gap-2 px-3 py-1 rounded-lg bg-accent-100 text-accent-800">
          <i className="live-dot" aria-hidden />
          {reporting > 0 ? `${reporting} vehicles reporting` : "Feed paused"}
        </span>
        <span className="tabular">{kmToday.toFixed(1)} km scanned today</span>
        <span className="px-3 py-1 border border-divider rounded-lg">{date}</span>
      </div>
    </header>
  );
}
```

- [ ] **Step 10: Create `src/components/console/Console.tsx`**

```tsx
"use client";
import dynamic from "next/dynamic";
import { useEffect } from "react";
import { useConsole } from "@/lib/console/store";
import { createDataSource } from "@/lib/data";
import { ConsoleHeader } from "./ConsoleHeader";

const ConsoleMap = dynamic(() => import("./map/ConsoleMap").then((m) => m.ConsoleMap), { ssr: false });

export default function Console() {
  const unlink = useConsole((s) => s.unlink);

  useEffect(() => {
    const st = useConsole.getState();
    let off = () => {};
    let cancelled = false;
    (async () => {
      const ds = await createDataSource();
      if (cancelled) return;
      st.setDataSource(ds);
      try {
        const res = await ds.load();
        if (cancelled) return;
        st.setAll(res.potholes);
        st.setVehicles(res.vehicles);
        st.setCrews(res.crews);
        st.setKmToday(res.kmToday);
        st.setLoadState("ready");
      } catch (e) {
        st.setLoadState("error", e instanceof Error ? e.message : "Unknown error");
      }
      off = ds.subscribe({
        onPothole: (u) => ("deleted" in u ? st.removePothole(u.id) : st.upsertPothole(u)),
        onVehiclePosition: (v) => { st.pushVehiclePosition(v); st.setKmToday(useConsole.getState().kmToday + 0.11 / 3); },
      });
    })();
    return () => { cancelled = true; off(); };
  }, []);

  return (
    <div className="h-screen grid overflow-hidden bg-bg text-text" style={{ gridTemplateRows: "var(--console-header-h) 1fr" }}>
      <ConsoleHeader />
      <main className="grid min-h-0" style={{ gridTemplateColumns: "1fr var(--console-column-w)" }}>
        <ConsoleMap onMapMouseLeave={unlink} />
        <aside className="grid min-h-0 bg-bg" style={{ gridTemplateRows: "auto auto auto minmax(0,1fr) auto auto auto" }}>
          <div className="p-4 border-b border-divider panel-label">Repair queue</div>
        </aside>
      </main>
    </div>
  );
}
```

The `kmToday` nudge on vehicle positions is a display convenience for synthetic mode (three vehicles per tick add 0.11 km per tick); in Supabase mode real trip distances arrive on the next `load`, which is acceptable for the demo.

- [ ] **Step 11: Replace `src/app/page.tsx`**

```tsx
import Console from "@/components/console/Console";

// Console — docs/superpowers/specs/2026-09-02-console-map-design.md.
export default function DashboardPage() {
  return <Console />;
}
```

- [ ] **Step 12: Run, typecheck, lint, and look at it**

Run: `npm run typecheck && npm run lint && npm run dev`
Open http://localhost:3000. Expected: header with "3 vehicles reporting" and a km counter, the light basemap of Westminster with hairline roads and no buildings, the graticule with edge ticks, the key bottom-left, the scale bar bottom-right, the empty column on the right with a "Repair queue" label. If the basemap is blank, check the browser console for tile or glyph errors; the style URL must be exactly `https://tiles.openfreemap.org/planet`.

- [ ] **Step 13: Commit**

```bash
jj commit -m "Add the console shell, header and styled MapLibre basemap

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01T93AKP7HijHL2mbegXmMBQ"
```

---

### Task 10: Pins, crosshair guides, vehicles and trails

**Files:**
- Create: `src/components/console/map/PotholePin.tsx`, `src/components/console/map/CrosshairGuides.tsx`, `src/components/console/map/VehicleMarker.tsx`, `src/components/console/map/TrailLayer.tsx`, `src/components/console/map/MapLayers.tsx`
- Modify: `src/components/console/Console.tsx` (render `<MapLayers/>` inside `<ConsoleMap>`)

**Interfaces:**
- Consumes: `useConsole`, `pinStyle`, `displayName`, `STATUS_LABEL`, `coord`, `createTween`, `tweenAt`, `retarget`, `MapTickContext`.
- Produces: `<MapLayers/>` which renders all pins, vehicles, trails and guides from the store. Later tasks add `AreaLayer` and `RouteLayer` to it.

- [ ] **Step 1: Create `PotholePin.tsx`**

```tsx
"use client";
import { Marker } from "react-map-gl/maplibre";
import { useConsole } from "@/lib/console/store";
import { pinStyle, displayName, STATUS_LABEL } from "@/lib/console/derive";
import type { Pothole } from "@/lib/data/types";

export function PotholePin({ p }: { p: Pothole }) {
  const linked = useConsole((s) => s.linkedId === p.id);
  const selected = useConsole((s) => s.selected.includes(p.id));
  const link = useConsole((s) => s.link);
  const pin = useConsole((s) => s.pin);
  const st = pinStyle(p, { linked, selected });
  if (st.hidden) return null;

  return (
    <Marker longitude={p.lng} latitude={p.lat} anchor="center" style={{ zIndex: st.z }}>
      <div
        role="button"
        tabIndex={-1}
        aria-label={`${displayName(p)}, ${STATUS_LABEL[p.status].toLowerCase()}`}
        className="p-[7px] cursor-pointer"
        onMouseEnter={() => link(p.id, "map")}
        onClick={(e) => { e.stopPropagation(); pin(p.id); }}
      >
        <div
          className="flex items-center justify-center rounded-[5px] border-[1.5px]"
          style={{
            width: st.size, height: st.size, background: st.fill, borderColor: st.stroke, boxShadow: st.glow, opacity: st.opacity,
            transition: "width var(--dur-state) var(--ease), height var(--dur-state) var(--ease), background var(--dur-state) var(--ease), border-color var(--dur-state) var(--ease), box-shadow var(--dur-tint) linear",
          }}
        >
          {st.stopLabel && <span className="font-heading text-[11px] text-bg">{st.stopLabel}</span>}
        </div>
      </div>
    </Marker>
  );
}
```

- [ ] **Step 2: Create `CrosshairGuides.tsx`**

```tsx
"use client";
import { useContext } from "react";
import { useMap } from "react-map-gl/maplibre";
import { useConsole } from "@/lib/console/store";
import { coord } from "@/lib/console/format";
import { MapTickContext } from "./ConsoleMap";

export function CrosshairGuides() {
  useContext(MapTickContext); // re-render on map move
  const { current: map } = useMap();
  const id = useConsole((s) => s.pinnedId ?? s.linkedId);
  const p = useConsole((s) => (id ? s.potholes[id] : undefined));
  if (!map || !p || p.status === "false_positive") return null;
  const pt = map.project([p.lng, p.lat]);
  const line = "absolute bg-[color-mix(in_srgb,var(--color-accent)_40%,transparent)] pointer-events-none";
  return (
    <>
      <div className={`${line} top-0 bottom-0 w-px`} style={{ left: pt.x }} />
      <div className={`${line} left-0 right-0 h-px`} style={{ top: pt.y }} />
      <div
        className="absolute top-[10px] px-[7px] py-[3px] rounded-md bg-bg shadow-sm text-[11px] tabular text-accent-800 pointer-events-none"
        style={{ left: pt.x, transform: "translateX(8px)" }}
      >
        {coord(p.lat, p.lng)}
      </div>
    </>
  );
}
```

If Tailwind rejects the arbitrary `color-mix` class, use `style={{ background: "color-mix(in srgb, var(--color-accent) 40%, transparent)" }}` on both lines instead.

- [ ] **Step 3: Create `VehicleMarker.tsx`**

```tsx
"use client";
import { useEffect, useRef, useState } from "react";
import { Marker } from "react-map-gl/maplibre";
import { createTween, retarget, tweenAt, type Tween, type XY } from "@/lib/console/interpolate";
import type { Vehicle } from "@/lib/data/types";

export function VehicleMarker({ v }: { v: Vehicle }) {
  const target: XY = [v.position.lng, v.position.lat];
  const tween = useRef<Tween>(createTween(target, target, performance.now(), 1200));
  const [pos, setPos] = useState<XY>(target);

  useEffect(() => {
    tween.current = retarget(tween.current, target, performance.now());
    let raf = 0;
    const step = () => {
      const now = performance.now();
      setPos(tweenAt(tween.current, now));
      if (now < tween.current.start + tween.current.duration) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [v.position.lng, v.position.lat]);

  return (
    <Marker longitude={pos[0]} latitude={pos[1]} anchor="center" style={{ zIndex: 40 }}>
      <div className="flex items-center gap-2">
        <div className="w-[11px] h-[11px] rounded-full bg-accent border-2 border-bg shadow-sm" />
        <div className="whitespace-nowrap px-[7px] py-[2px] rounded-md bg-bg shadow-sm text-[11px] text-accent-800">{v.label}</div>
      </div>
    </Marker>
  );
}
```

- [ ] **Step 4: Create `TrailLayer.tsx`**

```tsx
"use client";
import { useMemo } from "react";
import { Layer, Source } from "react-map-gl/maplibre";
import { useConsole } from "@/lib/console/store";
import { readToken } from "@/lib/map/tokens";

export function TrailLayer() {
  const vehicles = useConsole((s) => s.vehicles);
  const accent = useMemo(() => readToken("--color-accent") || "#5980a6", []);
  const data = useMemo<GeoJSON.FeatureCollection>(() => ({
    type: "FeatureCollection",
    features: Object.values(vehicles).flatMap((v) => {
      const older = v.trail.slice(0, -1).reverse(); // exclude the current point; nearest first
      return older.map((p, k) => ({
        type: "Feature" as const,
        properties: { opacity: Math.max(0.1, 0.28 - k * 0.045) },
        geometry: { type: "Point" as const, coordinates: [p.lng, p.lat] },
      }));
    }),
  }), [vehicles]);

  return (
    <Source id="trails" type="geojson" data={data}>
      <Layer id="trail-dots" type="circle" paint={{ "circle-radius": 2.5, "circle-color": accent, "circle-opacity": ["get", "opacity"] }} />
    </Source>
  );
}
```

- [ ] **Step 5: Create `MapLayers.tsx`**

```tsx
"use client";
import { useConsole } from "@/lib/console/store";
import { PotholePin } from "./PotholePin";
import { VehicleMarker } from "./VehicleMarker";
import { TrailLayer } from "./TrailLayer";
import { CrosshairGuides } from "./CrosshairGuides";

export function MapLayers() {
  const potholes = useConsole((s) => s.potholes);
  const vehicles = useConsole((s) => s.vehicles);
  return (
    <>
      <TrailLayer />
      {Object.values(potholes).map((p) => <PotholePin key={p.id} p={p} />)}
      {Object.values(vehicles).map((v) => <VehicleMarker key={v.id} v={v} />)}
      <CrosshairGuides />
    </>
  );
}
```

- [ ] **Step 6: Mount in `Console.tsx`**

Change the map line to:

```tsx
<ConsoleMap onMapMouseLeave={unlink}><MapLayers /></ConsoleMap>
```

and add `import { MapLayers } from "./map/MapLayers";`. `MapLayers` must be rendered inside `ConsoleMap`'s `<Map>` (it is, via `children`).

- [ ] **Step 7: Verify in the browser**

Run: `npm run typecheck && npm run lint && npm run dev`
Expected: ~30 pins on the streets, hollow for suspected, steel for confirmed, dark with a number for scheduled, faded for repaired. Hovering a pin grows it and draws crosshairs with the coordinate at the top. Three labelled vehicle dots move every 1.2 s with a smooth glide, leaving small fading dots behind. Clicking a pin does nothing visible yet beyond keeping the crosshairs when the pointer leaves (pinned).

- [ ] **Step 8: Commit**

```bash
jj commit -m "Add pothole pins, crosshair guides, vehicle markers and trails to the map

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01T93AKP7HijHL2mbegXmMBQ"
```

---

### Task 11: Operations column — stats, filters, queue, inspector, footer, keyboard

**Files:**
- Create: `src/lib/console/keyboard.ts`, `src/lib/console/keyboard.test.ts`, `src/components/console/column/StatCells.tsx`, `FilterChips.tsx`, `QueueList.tsx`, `QueueRow.tsx`, `Inspector.tsx`, `Footer.tsx`, `src/components/console/column/Column.tsx`
- Modify: `src/components/console/Console.tsx` (render `<Column/>`, attach the keyboard listener)

**Interfaces:**
- Consumes: store actions and selectors; `visibleRows`, `stats`, `rowStyle`, `severitySegments`, `evidenceLine`, `inspectorLines`, `displayName`, `FILTER_CYCLE`, `FILTER_LABELS`, `isSelectable`.
- Produces: `handleKey(e: { key: string; target: EventTarget | null; preventDefault(): void }, s: ConsoleStore, rows: Pothole[]): boolean` (true when handled); `<Column/>`; `useVisibleRows()` hook returning `visibleRows(Object.values(potholes), filter)` memoised.

- [ ] **Step 1: Write failing test `src/lib/console/keyboard.test.ts`**

```ts
import { describe, it, expect } from "vitest";
import { createConsoleStore } from "./store";
import { handleKey } from "./keyboard";
import type { Pothole } from "@/lib/data/types";

const mk = (id: string, status: Pothole["status"] = "confirmed"): Pothole => ({
  id, authority_id: "x", road_name: id, street: id, ref: "BCH-" + id, stop_order: null, status, severity: 0.5,
  detection_count: 2, distinct_vehicles: 2, first_detected_at: "2026-08-01T00:00:00Z", last_detected_at: "2026-09-01T00:00:00Z",
  repaired_at: null, updated_at: "2026-09-01T00:00:00Z", lng: 0, lat: 0, photo_url: null, priority: 1,
});
const ev = (key: string, tag = "DIV") => ({ key, target: { tagName: tag } as unknown as EventTarget, preventDefault() {} });

describe("handleKey", () => {
  it("arrows move the link through rows with source keys", () => {
    const s = createConsoleStore();
    const rows = [mk("a"), mk("b"), mk("c")];
    rows.forEach((p) => s.getState().upsertPothole(p));
    expect(handleKey(ev("ArrowDown"), s.getState(), rows)).toBe(true);
    expect(s.getState()).toMatchObject({ linkedId: "a", linkSource: "keys" });
    handleKey(ev("ArrowDown"), s.getState(), rows);
    handleKey(ev("ArrowDown"), s.getState(), rows);
    handleKey(ev("ArrowDown"), s.getState(), rows);
    expect(s.getState().linkedId).toBe("c");
    handleKey(ev("ArrowUp"), s.getState(), rows);
    expect(s.getState().linkedId).toBe("b");
  });
  it("Enter toggles the linked item; Esc unpins, then unlinks, then clears selection", () => {
    const s = createConsoleStore();
    const rows = [mk("a")];
    s.getState().upsertPothole(rows[0]);
    s.getState().link("a", "keys");
    handleKey(ev("Enter"), s.getState(), rows);
    expect(s.getState().selected).toEqual(["a"]);
    s.getState().pin("a");
    handleKey(ev("Escape"), s.getState(), rows);
    expect(s.getState().pinnedId).toBeNull();
    expect(s.getState().linkedId).toBe("a");
    handleKey(ev("Escape"), s.getState(), rows);
    expect(s.getState().linkedId).toBeNull();
    handleKey(ev("Escape"), s.getState(), rows);
    expect(s.getState().selected).toEqual([]);
  });
  it("F cycles the filter; keys in inputs are ignored", () => {
    const s = createConsoleStore();
    handleKey(ev("f"), s.getState(), []);
    expect(s.getState().filter).toBe("suspected");
    expect(handleKey(ev("f", "INPUT"), s.getState(), [])).toBe(false);
    expect(s.getState().filter).toBe("suspected");
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run src/lib/console/keyboard.test.ts`
Expected: FAIL, module not found.

- [ ] **Step 3: Create `src/lib/console/keyboard.ts`**

```ts
import type { Pothole } from "@/lib/data/types";
import type { ConsoleStore } from "./store";

const EDITABLE = new Set(["INPUT", "TEXTAREA", "SELECT"]);

export function handleKey(
  e: { key: string; target: EventTarget | null; preventDefault(): void }, s: ConsoleStore, rows: Pothole[],
): boolean {
  const tag = (e.target as { tagName?: string } | null)?.tagName;
  if (tag && EDITABLE.has(tag)) return false;

  if (e.key === "ArrowDown" || e.key === "ArrowUp") {
    if (!rows.length) return false;
    e.preventDefault();
    const i = rows.findIndex((p) => p.id === s.linkedId);
    const n = e.key === "ArrowDown" ? Math.min(rows.length - 1, i + 1) : Math.max(0, i < 0 ? 0 : i - 1);
    s.link(rows[n].id, "keys");
    return true;
  }
  if (e.key === "Enter") {
    if (!s.linkedId) return false;
    e.preventDefault();
    s.toggleSelected(s.linkedId);
    return true;
  }
  if (e.key === "Escape") {
    if (s.pinnedId) s.unpin();
    else if (s.linkedId) s.unlink();
    else s.clearSelection();
    return true;
  }
  if (e.key === "f" || e.key === "F") {
    s.cycleFilter();
    return true;
  }
  return false;
}
```

- [ ] **Step 4: Run tests**

Run: `npx vitest run src/lib/console/keyboard.test.ts`
Expected: pass.

- [ ] **Step 5: Create the column components**

`StatCells.tsx`:

```tsx
"use client";
import { useConsole } from "@/lib/console/store";
import { stats } from "@/lib/console/derive";

export function StatCells() {
  const potholes = useConsole((s) => s.potholes);
  const loading = useConsole((s) => s.loadState === "loading");
  const st = stats(Object.values(potholes));
  const cells = [
    { value: st.confirmedOpen, label: "Confirmed and open" },
    { value: st.suspected, label: "Awaiting a second pass" },
    { value: st.scheduled, label: "Scheduled today" },
  ];
  return (
    <div className="grid grid-cols-3 border-b border-divider">
      {cells.map((c) => (
        <div key={c.label} className="p-4 border-r border-divider last:border-r-0">
          {loading
            ? <div className="h-8 w-10 border border-divider" aria-hidden />
            : <div className="font-heading text-[32px] leading-none tabular">{c.value}</div>}
          <div className="mt-2 text-[12px] leading-tight text-ink-58">{c.label}</div>
        </div>
      ))}
    </div>
  );
}
```

`FilterChips.tsx`:

```tsx
"use client";
import { useConsole } from "@/lib/console/store";
import { FILTER_CYCLE, FILTER_LABELS } from "@/lib/console/derive";

export function FilterChips() {
  const filter = useConsole((s) => s.filter);
  const setFilter = useConsole((s) => s.setFilter);
  return (
    <div className="flex gap-2 p-4 border-b border-divider">
      {FILTER_CYCLE.map((f) => (
        <button key={f} type="button" className="chip" aria-pressed={filter === f} onClick={() => setFilter(f)}>
          {FILTER_LABELS[f]}
        </button>
      ))}
    </div>
  );
}
```

`QueueRow.tsx`:

```tsx
"use client";
import { useConsole } from "@/lib/console/store";
import { rowStyle, severitySegments, evidenceLine, displayName, priority } from "@/lib/console/derive";
import type { Pothole } from "@/lib/data/types";

export function QueueRow({ p, height }: { p: Pothole; height: number }) {
  const linked = useConsole((s) => s.linkedId === p.id);
  const selected = useConsole((s) => s.selected.includes(p.id));
  const link = useConsole((s) => s.link);
  const pin = useConsole((s) => s.pin);
  const st = rowStyle(p, { linked, selected });
  const segs = severitySegments(p.severity);
  return (
    <div
      data-row-id={p.id}
      role="option"
      aria-selected={selected}
      className="flex items-center gap-3 px-4 border-b border-ink-7 cursor-pointer"
      style={{ height, boxShadow: `inset 3px 0 0 ${st.mark}`, background: st.bg, transition: "background var(--dur-tint) linear" }}
      onMouseEnter={() => link(p.id, "row")}
      onClick={() => pin(p.id)}
    >
      <div className="flex-1 min-w-0">
        <div className="flex items-baseline gap-2">
          <span className="text-[15px] font-medium whitespace-nowrap overflow-hidden text-ellipsis">{displayName(p)}</span>
          <span className="text-[11px] text-ink-45 tabular">{p.ref}</span>
        </div>
        <div className="mt-[2px] text-[12px] text-ink-58 tabular">{evidenceLine(p)}</div>
      </div>
      <div className="flex gap-[2px] items-center" aria-label={`Severity ${p.severity.toFixed(2)}`}>
        {segs.map((on, i) => <i key={i} className="block w-[9px] h-[5px] rounded-[2px]" style={{ background: on ? st.mark : "var(--ink-12)" }} />)}
      </div>
      <div className="w-[42px] text-right font-heading text-[18px] tabular" style={{ color: st.priColor }}>{priority(p).toFixed(1)}</div>
    </div>
  );
}
```

`QueueList.tsx`:

```tsx
"use client";
import { useEffect, useMemo, useRef } from "react";
import { useConsole } from "@/lib/console/store";
import { visibleRows, FILTER_LABELS } from "@/lib/console/derive";
import { QueueRow } from "./QueueRow";

export function useVisibleRows() {
  const potholes = useConsole((s) => s.potholes);
  const filter = useConsole((s) => s.filter);
  return useMemo(() => visibleRows(Object.values(potholes), filter), [potholes, filter]);
}

export function QueueList() {
  const rows = useVisibleRows();
  const total = useConsole((s) => Object.values(s.potholes).filter((p) => p.status !== "false_positive").length);
  const filter = useConsole((s) => s.filter);
  const linkedId = useConsole((s) => s.linkedId);
  const linkSource = useConsole((s) => s.linkSource);
  const density = useConsole((s) => s.density);
  const loadState = useConsole((s) => s.loadState);
  const loadError = useConsole((s) => s.loadError);
  const listRef = useRef<HTMLDivElement>(null);
  const height = density === "compact" ? 46 : 58;

  // Scroll the linked row into view when the link came from the map or keyboard, by
  // adjusting the container's scrollTop only (never the page).
  useEffect(() => {
    if (!linkedId || linkSource === "row" || !listRef.current) return;
    const i = rows.findIndex((p) => p.id === linkedId);
    if (i < 0) return;
    const el = listRef.current;
    const top = i * height;
    if (top < el.scrollTop || top + height > el.scrollTop + el.clientHeight) {
      el.scrollTop = Math.max(0, top - el.clientHeight / 2 + height / 2);
    }
  }, [linkedId, linkSource, rows, height]);

  return (
    <>
      <div className="flex items-center justify-between px-4 py-3 border-b border-divider text-[12px] text-ink-58">
        <span className="font-semibold text-text">Repair queue</span>
        <span className="tabular">{rows.length} of {total} · sorted by priority</span>
      </div>
      <div ref={listRef} role="listbox" aria-label="Repair queue" className="overflow-y-auto min-h-0">
        {loadState === "loading" && [0, 1, 2, 3, 4].map((i) => <div key={i} className="mx-4 my-3 border border-divider" style={{ height: height - 24 }} aria-hidden />)}
        {loadState === "error" && (
          <div className="p-4 text-[13px] text-ink-72">
            Could not load the queue. {loadError}
            <div className="mt-3"><button type="button" className="btn btn-secondary" onClick={() => location.reload()}>Retry</button></div>
          </div>
        )}
        {loadState === "ready" && rows.length === 0 && <div className="p-4 text-[13px] text-ink-55">No {FILTER_LABELS[filter].toLowerCase()} potholes.</div>}
        {loadState === "ready" && rows.map((p) => <QueueRow key={p.id} p={p} height={height} />)}
      </div>
    </>
  );
}
```

`Inspector.tsx`:

```tsx
"use client";
import { useConsole } from "@/lib/console/store";
import { inspectorLines } from "@/lib/console/derive";

export function Inspector() {
  const id = useConsole((s) => s.linkedId);
  const p = useConsole((s) => (id ? s.potholes[id] : undefined));
  const selected = useConsole((s) => (id ? s.selected.includes(id) : false));
  const l = p ? inspectorLines(p) : null;
  return (
    <div className="px-4 py-3 border-t border-divider bg-ink-3" style={{ minHeight: "var(--console-inspector-min-h)" }}>
      <div className="panel-label">Evidence</div>
      {p && l ? (
        <div className="mt-2">
          <div className="flex items-baseline justify-between gap-3">
            <span className="font-heading text-[20px] leading-tight">{l.title}</span>
            <span className="tag tag-outline">{l.status}</span>
          </div>
          <div className="mt-1 text-[13px] leading-snug text-ink-72 tabular">{l.line1}</div>
          <div className="text-[13px] leading-snug text-ink-72 tabular">{l.line2}</div>
          <div className="mt-1 text-[12px] leading-snug text-ink-55">
            {selected ? "In tomorrow’s route. Enter removes it." : p.status === "suspected" ? "One vehicle only. A second pass by another vehicle confirms it." : "Click for details. Enter adds it to tomorrow’s route."}
          </div>
        </div>
      ) : (
        <div className="mt-3 text-[13px] leading-relaxed text-ink-55 max-w-[34ch]">
          Point at a queue row or a marker to link the two. Arrow keys move the link, Enter adds it to tomorrow’s route.
        </div>
      )}
    </div>
  );
}
```

`Footer.tsx`:

```tsx
"use client";
import { useConsole } from "@/lib/console/store";

export function Footer() {
  const selected = useConsole((s) => s.selected);
  const crews = useConsole((s) => s.crews);
  const planner = useConsole((s) => s.planner);
  const plannerOpen = useConsole((s) => s.plannerOpen);
  const planState = useConsole((s) => s.planState);
  const setPlannerOpen = useConsole((s) => s.setPlannerOpen);
  const planRoute = useConsole((s) => s.planRoute);
  const n = selected.length;
  const mins = n * planner.serviceMinPerStop + Math.round(n * 6.5);
  const crew = crews.find((c) => c.id === planner.crewId);
  const canPlan = planner.mode !== "manual" || n > 0;
  const label = planState === "planning" ? "Planning…" : "Plan route";

  return (
    <div className="flex items-center justify-between gap-4 px-4 border-t border-divider" style={{ height: "var(--console-footer-h)" }}>
      <div className="text-[12px] leading-snug text-ink-58 tabular">
        <div className="text-[13px] font-semibold text-text">{n ? `${n} selected for tomorrow` : "Nothing selected"}</div>
        <div>{n ? `~${mins} min including travel · crew ${crew?.name ?? "—"}` : "Click a row or a marker to build a route"}</div>
      </div>
      <button
        type="button"
        className="btn btn-primary btn-pill font-body text-[13px] font-semibold px-[18px] py-[11px] whitespace-nowrap"
        disabled={!canPlan || planState === "planning"}
        onClick={() => (plannerOpen ? void planRoute() : setPlannerOpen(true))}
      >
        {label}
      </button>
    </div>
  );
}
```

`Column.tsx`:

```tsx
"use client";
import { StatCells } from "./StatCells";
import { FilterChips } from "./FilterChips";
import { QueueList } from "./QueueList";
import { Inspector } from "./Inspector";
import { Footer } from "./Footer";

export function Column() {
  return (
    <aside className="grid min-h-0 bg-bg" style={{ gridTemplateRows: "auto auto auto minmax(0,1fr) auto auto auto auto" }}>
      <StatCells />
      <FilterChips />
      <QueueList />
      <Inspector />
      <Footer />
    </aside>
  );
}
```

`QueueList` renders two grid children (its header and its scroll box), which is why the template has one more `auto` than the number of components; Task 12 and 13 insert further rows before `Footer`.

- [ ] **Step 6: Wire into `Console.tsx`**

Replace the placeholder `<aside>…</aside>` with `<Column />` (import from `./column/Column`) and add the keyboard listener:

```tsx
const rows = useVisibleRows(); // import from "./column/QueueList"
useEffect(() => {
  const onKey = (e: KeyboardEvent) => { handleKey(e, useConsole.getState(), rows); };
  window.addEventListener("keydown", onKey);
  return () => window.removeEventListener("keydown", onKey);
}, [rows]);
```

with `import { handleKey } from "@/lib/console/keyboard";`.

- [ ] **Step 7: Verify in the browser**

Run: `npm run typecheck && npm run lint && npm run dev`
Expected: three stat numbers; chips filter the list and the "N of M" line updates; rows show marker, street, ref, evidence line, four-segment bar, priority; hovering a row grows its pin and draws crosshairs; hovering a pin tints its row and scrolls it into view; arrow keys walk the list; Enter turns the row accent-100 and adds a glow to the pin; the footer counts the selection; F cycles chips; Esc clears.

- [ ] **Step 8: Commit**

```bash
jj commit -m "Add the operations column: stats, filters, queue, inspector, footer, keyboard

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01T93AKP7HijHL2mbegXmMBQ"
```

---

### Task 12: Detail panel and dismissal undo

**Files:**
- Create: `src/components/console/column/DetailPanel.tsx`, `src/components/console/column/UndoToast.tsx`
- Modify: `src/components/console/column/Column.tsx`

**Interfaces:**
- Consumes: store `pinnedId`, `detections`, `pendingDismiss`, `pin/unpin/toggleSelected/dismiss/undoDismiss`; `inspectorLines`, `displayName`, `isSelectable`; `hhmm`; `DISMISS_UNDO_MS`.
- Produces: `<DetailPanel/>` (renders in place of `<Inspector/>` when pinned), `<UndoToast/>`.

- [ ] **Step 1: Create `DetailPanel.tsx`**

```tsx
"use client";
import { useConsole } from "@/lib/console/store";
import { inspectorLines, isSelectable } from "@/lib/console/derive";
import { hhmm } from "@/lib/console/format";

const MAX_ROWS = 8;

export function DetailPanel({ id }: { id: string }) {
  const p = useConsole((s) => s.potholes[id]);
  const rows = useConsole((s) => s.detections[id]);
  const selected = useConsole((s) => s.selected.includes(id));
  const unpin = useConsole((s) => s.unpin);
  const toggle = useConsole((s) => s.toggleSelected);
  const dismiss = useConsole((s) => s.dismiss);
  if (!p) return null;
  const l = inspectorLines(p);
  const shown = rows?.slice(0, MAX_ROWS) ?? [];
  const more = (rows?.length ?? 0) - shown.length;

  return (
    <div className="px-4 py-3 border-t border-divider bg-ink-3 overflow-y-auto" style={{ minHeight: "var(--console-inspector-min-h)", maxHeight: "40vh" }}>
      <div className="flex items-center justify-between">
        <div className="panel-label">Evidence</div>
        <button type="button" className="btn btn-ghost btn-icon" aria-label="Close details" onClick={unpin}>×</button>
      </div>
      <div className="flex items-baseline justify-between gap-3 mt-1">
        <span className="font-heading text-[20px] leading-tight">{l.title}</span>
        <span className="tag tag-outline">{l.status}</span>
      </div>
      <div className="mt-1 text-[13px] leading-snug text-ink-72 tabular">{l.line1}</div>
      <div className="text-[13px] leading-snug text-ink-72 tabular">{l.line2}</div>

      {p.photo_url
        ? <img src={p.photo_url} alt={`Latest photo of ${l.title}`} className="mt-3 w-full aspect-[4/3] object-cover border border-divider" />
        : <div className="mt-3 w-full aspect-[4/3] border border-divider flex items-center justify-center text-[12px] text-ink-45">No photo</div>}

      <table className="table mt-3 text-[12px]">
        <thead><tr><th>Time</th><th>Vehicle</th><th>Severity</th><th>Speed</th></tr></thead>
        <tbody>
          {rows === undefined && <tr><td colSpan={4}><div className="h-4 border border-divider" aria-hidden /></td></tr>}
          {rows && rows.length === 0 && <tr><td colSpan={4} className="text-ink-55">No detections recorded.</td></tr>}
          {shown.map((d) => (
            <tr key={d.id}>
              <td className="tabular">{hhmm(d.recorded_at)}</td>
              <td>{d.vehicle_label ?? d.vehicle_id.slice(0, 8)}</td>
              <td className="tabular">{d.severity.toFixed(2)}</td>
              <td className="tabular">{d.speed_mps == null ? "—" : `${(d.speed_mps * 3.6).toFixed(0)} km/h`}</td>
            </tr>
          ))}
          {more > 0 && <tr><td colSpan={4} className="text-ink-55">and {more} more</td></tr>}
        </tbody>
      </table>

      <div className="flex gap-2 mt-3">
        {isSelectable(p) && (
          <button type="button" className="btn btn-secondary" onClick={() => toggle(id)}>{selected ? "Remove from route" : "Add to route"}</button>
        )}
        {p.status !== "repaired" && (
          <button type="button" className="btn btn-ghost" onClick={() => dismiss(id)}>Dismiss as false positive</button>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Create `UndoToast.tsx`**

```tsx
"use client";
import { useEffect, useState } from "react";
import { useConsole, DISMISS_UNDO_MS } from "@/lib/console/store";
import { displayName } from "@/lib/console/derive";

export function UndoToast() {
  const pending = useConsole((s) => s.pendingDismiss);
  const undo = useConsole((s) => s.undoDismiss);
  const [remaining, setRemaining] = useState(1);

  useEffect(() => {
    if (!pending) return;
    const t = setInterval(() => setRemaining(Math.max(0, (pending.expiresAt - Date.now()) / DISMISS_UNDO_MS)), 100);
    return () => clearInterval(t);
  }, [pending]);

  if (!pending) return null;
  return (
    <div className="relative flex items-center justify-between gap-3 px-4 py-2 border-t border-divider text-[12px] text-ink-72" role="status">
      <span>Dismissed {displayName(pending.previous)} as false positive.</span>
      <button type="button" className="btn btn-ghost" onClick={undo}>Undo</button>
      <i className="absolute left-0 bottom-0 h-[2px] bg-accent" style={{ width: `${remaining * 100}%`, transition: "width 100ms linear" }} aria-hidden />
    </div>
  );
}
```

- [ ] **Step 3: Mount both in `Column.tsx`**

```tsx
const pinnedId = useConsole((s) => s.pinnedId);
…
<QueueList />
{pinnedId ? <DetailPanel id={pinnedId} /> : <Inspector />}
<UndoToast />
<Footer />
```

with imports for `useConsole`, `DetailPanel`, `UndoToast`. Grid template becomes `"auto auto auto minmax(0,1fr) auto auto auto"` (stats, chips, queue header, queue, inspector-or-detail, toast, footer).

- [ ] **Step 4: Verify in the browser**

Expected: clicking a row or pin swaps the inspector for the detail panel with photo placeholder, detections table, and the two buttons; × or Esc closes it; "Add to route" toggles selection; "Dismiss as false positive" removes the pin and row, shows the toast with a shrinking bar; Undo within 10 s restores it; after 10 s the toast disappears.

- [ ] **Step 5: Commit**

```bash
jj commit -m "Add the pothole detail panel and dismissal undo toast

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01T93AKP7HijHL2mbegXmMBQ"
```

---

### Task 13: Planner and area rectangle

**Files:**
- Create: `src/components/console/column/Planner.tsx`, `src/components/console/map/AreaLayer.tsx`, `src/components/console/map/useAreaDrag.ts`, `src/lib/console/area.ts`, `src/lib/console/area.test.ts`
- Modify: `src/components/console/column/Column.tsx`, `src/components/console/map/ConsoleMap.tsx`, `src/components/console/map/MapLayers.tsx`, `src/components/console/Console.tsx`

**Interfaces:**
- Consumes: store `planner`, `plannerOpen`, `planState`, `planError`, `crews`, `setPlanner`, `setPlannerOpen`, `setArea`; `MapTickContext`; `useMap`.
- Produces:
  - `rectPolygon(a: [number, number], b: [number, number]): GeoJSON.Polygon` (closed ring, 5 points) and `countInArea(potholes: Pothole[], area: GeoJSON.Polygon | null): number` in `lib/console/area.ts`
  - `useAreaDrag(): { drawing: boolean; handlers: { onMouseDown; onMouseMove; onMouseUp } }` for the map
  - `ConsoleMap` gains props `onMouseDown/onMouseMove/onMouseUp` forwarded to `<Map>` and a `cursor` prop.

- [ ] **Step 1: Write failing test `src/lib/console/area.test.ts`**

```ts
import { describe, it, expect } from "vitest";
import { rectPolygon, countInArea, pointInPolygon } from "./area";
import type { Pothole } from "@/lib/data/types";

describe("area", () => {
  it("rectPolygon closes the ring regardless of drag direction", () => {
    const poly = rectPolygon([-0.13, 51.5], [-0.12, 51.49]);
    expect(poly.coordinates[0]).toHaveLength(5);
    expect(poly.coordinates[0][0]).toEqual(poly.coordinates[0][4]);
    expect(poly.coordinates[0][0]).toEqual([-0.13, 51.49]);
    expect(poly.coordinates[0][2]).toEqual([-0.12, 51.5]);
  });
  it("counts open potholes inside", () => {
    const mk = (lng: number, lat: number, status: Pothole["status"] = "confirmed") => ({ lng, lat, status } as Pothole);
    const poly = rectPolygon([-0.13, 51.5], [-0.12, 51.49]);
    expect(pointInPolygon([-0.125, 51.495], poly)).toBe(true);
    expect(pointInPolygon([-0.14, 51.495], poly)).toBe(false);
    expect(countInArea([mk(-0.125, 51.495), mk(-0.14, 51.495), mk(-0.125, 51.495, "repaired")], poly)).toBe(1);
    expect(countInArea([mk(-0.125, 51.495)], null)).toBe(0);
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run src/lib/console/area.test.ts`
Expected: FAIL, module not found.

- [ ] **Step 3: Create `src/lib/console/area.ts`**

```ts
import type { Pothole } from "@/lib/data/types";

export function rectPolygon(a: [number, number], b: [number, number]): GeoJSON.Polygon {
  const [x1, x2] = [Math.min(a[0], b[0]), Math.max(a[0], b[0])];
  const [y1, y2] = [Math.min(a[1], b[1]), Math.max(a[1], b[1])];
  return { type: "Polygon", coordinates: [[[x1, y1], [x2, y1], [x2, y2], [x1, y2], [x1, y1]]] };
}

export function pointInPolygon([x, y]: [number, number], poly: GeoJSON.Polygon): boolean {
  const ring = poly.coordinates[0];
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i], [xj, yj] = ring[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

/** Open, unassigned potholes inside the area (the solver's candidates). */
export function countInArea(potholes: Pothole[], area: GeoJSON.Polygon | null): number {
  if (!area) return 0;
  return potholes.filter((p) => (p.status === "suspected" || p.status === "confirmed") && pointInPolygon([p.lng, p.lat], area)).length;
}
```

Then replace the private `inPolygon` in `src/lib/data/synthetic.ts` with `import { pointInPolygon } from "@/lib/console/area"` so the geometry lives once.

- [ ] **Step 4: Run tests**

Run: `npx vitest run src/lib/console/area.test.ts src/lib/data/synthetic.test.ts`
Expected: pass.

- [ ] **Step 5: Create `src/components/console/map/useAreaDrag.ts`**

```ts
"use client";
import { useCallback, useRef, useState } from "react";
import type { MapLayerMouseEvent } from "react-map-gl/maplibre";
import { useConsole } from "@/lib/console/store";
import { rectPolygon } from "@/lib/console/area";

/** Shift + drag draws a rectangle; the polygon lands in planner.area on mouseup. Esc cancels. */
export function useAreaDrag() {
  const setArea = useConsole((s) => s.setArea);
  const start = useRef<[number, number] | null>(null);
  const [drawing, setDrawing] = useState(false);
  const [draft, setDraft] = useState<GeoJSON.Polygon | null>(null);

  const onMouseDown = useCallback((e: MapLayerMouseEvent) => {
    if (!e.originalEvent.shiftKey) return;
    e.preventDefault();
    start.current = [e.lngLat.lng, e.lngLat.lat];
    setDrawing(true);
    setDraft(null);
    const onKey = (k: KeyboardEvent) => { if (k.key === "Escape") { start.current = null; setDrawing(false); setDraft(null); } };
    window.addEventListener("keydown", onKey, { once: true });
  }, []);

  const onMouseMove = useCallback((e: MapLayerMouseEvent) => {
    if (!start.current) return;
    setDraft(rectPolygon(start.current, [e.lngLat.lng, e.lngLat.lat]));
  }, []);

  const onMouseUp = useCallback((e: MapLayerMouseEvent) => {
    if (!start.current) return;
    const poly = rectPolygon(start.current, [e.lngLat.lng, e.lngLat.lat]);
    start.current = null;
    setDrawing(false);
    setDraft(null);
    setArea(poly);
    useConsole.getState().setPlannerOpen(true);
    if (useConsole.getState().planner.mode === "manual") useConsole.getState().setPlanner({ mode: "count" });
  }, [setArea]);

  return { drawing, draft, handlers: { onMouseDown, onMouseMove, onMouseUp } };
}
```

- [ ] **Step 6: Create `src/components/console/map/AreaLayer.tsx`**

```tsx
"use client";
import { useMemo } from "react";
import { Layer, Source } from "react-map-gl/maplibre";
import { useConsole } from "@/lib/console/store";
import { readToken } from "@/lib/map/tokens";

export function AreaLayer({ draft }: { draft: GeoJSON.Polygon | null }) {
  const area = useConsole((s) => s.planner.area);
  const accent = useMemo(() => readToken("--color-accent") || "#5980a6", []);
  const poly = draft ?? area;
  const data = useMemo<GeoJSON.FeatureCollection>(() => ({
    type: "FeatureCollection",
    features: poly ? [{ type: "Feature", properties: {}, geometry: poly }] : [],
  }), [poly]);
  return (
    <Source id="area" type="geojson" data={data}>
      <Layer id="area-fill" type="fill" paint={{ "fill-color": accent, "fill-opacity": 0.08 }} />
      <Layer id="area-line" type="line" paint={{ "line-color": accent, "line-width": 1 }} />
    </Source>
  );
}
```

- [ ] **Step 7: Thread the drag through `ConsoleMap` and `MapLayers`**

In `ConsoleMap.tsx` add props and forward them:

```tsx
export function ConsoleMap({ children, dragPan = true, cursor, onMapMouseLeave, mouseHandlers }: {
  children?: ReactNode; dragPan?: boolean; cursor?: string; onMapMouseLeave?: () => void;
  mouseHandlers?: { onMouseDown?: (e: MapLayerMouseEvent) => void; onMouseMove?: (e: MapLayerMouseEvent) => void; onMouseUp?: (e: MapLayerMouseEvent) => void };
}) {
  …
  <Map … dragPan={dragPan} cursor={cursor} {...mouseHandlers}>
```

with `import type { MapLayerMouseEvent } from "react-map-gl/maplibre";`.

In `Console.tsx`:

```tsx
const { drawing, draft, handlers } = useAreaDrag();
…
<ConsoleMap onMapMouseLeave={unlink} dragPan={!drawing} cursor={drawing ? "crosshair" : undefined} mouseHandlers={handlers}>
  <MapLayers draft={draft} />
</ConsoleMap>
```

In `MapLayers.tsx` accept `{ draft }: { draft: GeoJSON.Polygon | null }` and render `<AreaLayer draft={draft} />` first (below trails).

- [ ] **Step 8: Create `src/components/console/column/Planner.tsx`**

```tsx
"use client";
import { useConsole, type Mode } from "@/lib/console/store";
import { countInArea } from "@/lib/console/area";

const MODES: { key: Mode; label: string }[] = [
  { key: "manual", label: "Pick these" }, { key: "count", label: "Best N" }, { key: "time", label: "Time budget" },
];

export function Planner() {
  const planner = useConsole((s) => s.planner);
  const open = useConsole((s) => s.plannerOpen);
  const crews = useConsole((s) => s.crews);
  const planState = useConsole((s) => s.planState);
  const planError = useConsole((s) => s.planError);
  const potholes = useConsole((s) => s.potholes);
  const setPlanner = useConsole((s) => s.setPlanner);
  const setOpen = useConsole((s) => s.setPlannerOpen);
  const setArea = useConsole((s) => s.setArea);
  const crew = crews.find((c) => c.id === planner.crewId);
  const inArea = countInArea(Object.values(potholes), planner.area);
  if (planState === "planned") return null;

  if (!open) {
    return (
      <button type="button" className="w-full text-left px-4 py-3 border-t border-divider text-[12px] text-ink-58 hover:bg-ink-3" onClick={() => setOpen(true)}>
        Planning for {crew?.name ?? "—"} · {MODES.find((m) => m.key === planner.mode)?.label}{planner.area ? ` · area (${inArea})` : ""}
      </button>
    );
  }

  return (
    <div className="px-4 py-3 border-t border-divider grid gap-3">
      <div className="flex items-center justify-between">
        <div className="panel-label">Plan for {planner.planDate}</div>
        <button type="button" className="btn btn-ghost btn-icon" aria-label="Collapse planner" onClick={() => setOpen(false)}>–</button>
      </div>
      <label className="field"><span className="block text-[12px] mb-1 text-ink-72">Crew</span>
        <select className="input" value={planner.crewId ?? ""} onChange={(e) => {
          const c = crews.find((x) => x.id === e.target.value);
          setPlanner({ crewId: e.target.value, maxStops: c?.repairs_per_shift ?? planner.maxStops, timeBudgetMin: c?.shift_minutes ?? planner.timeBudgetMin });
        }}>
          {crews.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
      </label>
      <div className="flex gap-2" role="radiogroup" aria-label="Planning mode">
        {MODES.map((m) => (
          <button key={m.key} type="button" className="chip" aria-pressed={planner.mode === m.key} onClick={() => setPlanner({ mode: m.key })}>{m.label}</button>
        ))}
      </div>
      <div className="grid grid-cols-2 gap-3">
        {planner.mode === "count" && (
          <label className="field"><span className="block text-[12px] mb-1 text-ink-72">Stops</span>
            <input className="input tabular" type="number" min={1} max={50} value={planner.maxStops} onChange={(e) => setPlanner({ maxStops: Number(e.target.value) })} />
          </label>
        )}
        {planner.mode === "time" && (
          <label className="field"><span className="block text-[12px] mb-1 text-ink-72">Minutes</span>
            <input className="input tabular" type="number" min={30} step={30} value={planner.timeBudgetMin} onChange={(e) => setPlanner({ timeBudgetMin: Number(e.target.value) })} />
          </label>
        )}
        <label className="field"><span className="block text-[12px] mb-1 text-ink-72">Minutes per stop</span>
          <input className="input tabular" type="number" min={5} step={5} value={planner.serviceMinPerStop} onChange={(e) => setPlanner({ serviceMinPerStop: Number(e.target.value) })} />
        </label>
      </div>
      {planner.mode !== "manual" && (
        <div className="flex items-center justify-between text-[12px] text-ink-58">
          <span>{planner.area ? `Area drawn · ${inArea} in area` : "No area · Shift-drag on the map to draw one"}</span>
          {planner.area && <button type="button" className="btn btn-ghost" onClick={() => setArea(null)}>Clear</button>}
        </div>
      )}
      {planState === "error" && <div className="text-[12px] text-ink-72" role="alert">{planError}</div>}
    </div>
  );
}
```

- [ ] **Step 9: Mount in `Column.tsx`** between the inspector/detail row and `UndoToast`; grid template becomes `"auto auto auto minmax(0,1fr) auto auto auto auto"`.

- [ ] **Step 10: Verify in the browser**

Expected: the footer's Plan route opens the planner line into the form; modes switch fields; Shift-drag on the map draws a tinted rectangle that persists, switches mode to Best N if it was Pick these, and the status line counts potholes inside; Clear removes it; Esc mid-drag cancels. Plan route with Pick these and a selection calls the synthetic planner (the result renders in Task 14; for now the planner collapses and rows turn scheduled with stop numbers on their pins).

- [ ] **Step 11: Commit**

```bash
jj commit -m "Add the route planner form and shift-drag area rectangle

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01T93AKP7HijHL2mbegXmMBQ"
```

---

### Task 14: Route drawing, route summary and dispatch

**Files:**
- Create: `src/components/console/map/RouteLayer.tsx`, `src/components/console/column/RouteSummary.tsx`
- Modify: `src/components/console/map/MapLayers.tsx`, `src/components/console/column/Column.tsx`, `src/components/console/column/Footer.tsx`

**Interfaces:**
- Consumes: store `plan`, `planState`, `dispatchState`, `dispatchError`, `dispatchedTo`, `dispatch`, `resetPlan`; `km`, `minutes`, `pct`, `hhmm`; `DEPOT`.
- Produces: `<RouteLayer/>`, `<RouteSummary/>`.

- [ ] **Step 1: Create `RouteLayer.tsx`**

```tsx
"use client";
import { useMemo } from "react";
import { Layer, Marker, Source } from "react-map-gl/maplibre";
import { useConsole } from "@/lib/console/store";
import { readToken } from "@/lib/map/tokens";
import { DEPOT } from "@/lib/data/synthetic";

export function RouteLayer() {
  const plan = useConsole((s) => s.plan);
  const accent = useMemo(() => readToken("--color-accent") || "#5980a6", []);
  const data = useMemo<GeoJSON.FeatureCollection>(() => ({
    type: "FeatureCollection",
    features: plan ? [{ type: "Feature", properties: {}, geometry: plan.path }] : [],
  }), [plan]);
  if (!plan) return null;
  return (
    <>
      <Source id="route" type="geojson" data={data}>
        <Layer id="route-line" type="line" layout={{ "line-cap": "round", "line-join": "round" }} paint={{ "line-color": accent, "line-width": 2 }} />
      </Source>
      <Marker longitude={DEPOT[0]} latitude={DEPOT[1]} anchor="center" style={{ zIndex: 30 }}>
        <div className="w-3 h-3 border-[1.5px] border-accent-800 bg-bg rounded-[3px]" aria-label="Depot" />
      </Marker>
      {plan.stops.map((s) => (
        <Marker key={s.work_order_id} longitude={s.lng} latitude={s.lat} anchor="center" style={{ zIndex: 45 }}>
          <div className="w-4 h-4 rounded-[4px] bg-accent-800 flex items-center justify-center font-heading text-[10px] text-bg pointer-events-none">{s.stop_order}</div>
        </Marker>
      ))}
    </>
  );
}
```

Add `<RouteLayer />` to `MapLayers` after the pins and before `CrosshairGuides`.

- [ ] **Step 2: Create `RouteSummary.tsx`**

```tsx
"use client";
import { useState } from "react";
import { useConsole } from "@/lib/console/store";
import { km, minutes, pct, hhmm } from "@/lib/console/format";
import { displayName } from "@/lib/console/derive";

export function RouteSummary() {
  const plan = useConsole((s) => s.plan);
  const crews = useConsole((s) => s.crews);
  const crewId = useConsole((s) => s.planner.crewId);
  const potholes = useConsole((s) => s.potholes);
  const dispatchState = useConsole((s) => s.dispatchState);
  const dispatchError = useConsole((s) => s.dispatchError);
  const dispatchedTo = useConsole((s) => s.dispatchedTo);
  const dispatch = useConsole((s) => s.dispatch);
  const resetPlan = useConsole((s) => s.resetPlan);
  const [to, setTo] = useState(process.env.NEXT_PUBLIC_DEMO_CREW_EMAIL ?? "");
  if (!plan) return null;
  const crew = crews.find((c) => c.id === crewId);
  const saved = plan.baseline_km > 0 ? 1 - plan.total_km / plan.baseline_km : 0;
  const addresses = to.split(",").map((s) => s.trim()).filter(Boolean);

  return (
    <div className="px-4 py-3 border-t border-divider grid gap-3">
      <div className="panel-label">Route for {crew?.name ?? "crew"}</div>
      <div className="flex items-baseline gap-3">
        <span className="font-heading text-[24px] leading-none tabular">{km(plan.total_km)}</span>
        <span className="text-[13px] text-ink-72 tabular">{minutes(plan.total_minutes)}</span>
      </div>
      <div className="text-[12px] text-ink-58 tabular">{pct(Math.max(0, saved))} shorter than visiting by priority ({km(plan.baseline_km)})</div>
      <ol className="grid gap-1 text-[12px] max-h-[22vh] overflow-y-auto">
        {plan.stops.map((s) => (
          <li key={s.work_order_id} className="flex items-center gap-2 tabular">
            <span className="w-4 h-4 rounded-[4px] bg-accent-800 text-bg font-heading text-[10px] flex items-center justify-center">{s.stop_order}</span>
            <span className="flex-1 truncate">{potholes[s.pothole_id] ? displayName(potholes[s.pothole_id]) : s.pothole_id.slice(0, 8)}</span>
            <span className="text-ink-58">eta {hhmm(s.eta)}</span>
          </li>
        ))}
      </ol>
      <label className="field"><span className="block text-[12px] mb-1 text-ink-72">Crew email</span>
        <input className="input" type="text" placeholder="crew@council.gov.uk, second@council.gov.uk" value={to} onChange={(e) => setTo(e.target.value)} />
      </label>
      {dispatchState === "sent" && (
        <div className="text-[12px] text-ink-72" role="status">
          Sent to {dispatchedTo} {dispatchedTo === 1 ? "address" : "addresses"}. Crew page: <a href={`/route/${plan.route_plan_id}`} target="_blank" rel="noreferrer">/route/{plan.route_plan_id.slice(0, 8)}…</a>
        </div>
      )}
      {dispatchState === "error" && <div className="text-[12px] text-ink-72" role="alert">{dispatchError}</div>}
      <div className="flex gap-2 justify-end">
        <button type="button" className="btn btn-ghost" onClick={resetPlan} title="Plan stays saved for this crew">Discard plan</button>
        <button type="button" className="btn btn-primary btn-pill" disabled={addresses.length === 0 || dispatchState === "sending"} onClick={() => void dispatch(addresses)}>
          {dispatchState === "sending" ? "Sending…" : "Dispatch to crew"}
        </button>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Mount and adjust the footer**

In `Column.tsx`, render `<RouteSummary />` in the planner's slot when `planState === "planned"` (the planner already returns null then), keeping the grid template from Task 13:

```tsx
const planned = useConsole((s) => s.planState === "planned");
…
{planned ? <RouteSummary /> : <Planner />}
```

In `Footer.tsx`, when `planState === "planned"` render the left text as `"Route planned · {n} stops"` and hide the primary button (the summary owns the actions):

```tsx
const plan = useConsole((s) => s.plan);
…
{planState === "planned" ? (
  <div className="text-[13px] font-semibold text-text">Route planned · {plan?.stops.length ?? 0} stops</div>
) : ( /* existing left block */ )}
{planState !== "planned" && ( /* existing button */ )}
```

- [ ] **Step 4: Verify in the browser**

Expected: Plan route in any mode draws a steel line from the depot through numbered dark squares back to the depot; the planned potholes' pins turn dark with matching numbers; the summary shows km, minutes and the % saved with the stop list and ETAs; Dispatch to crew with an address shows "Sending…" then "Sent to 1 address" with a crew page link; Discard plan clears the line and summary.

- [ ] **Step 5: Commit**

```bash
jj commit -m "Draw planned routes and add the route summary with dispatch

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01T93AKP7HijHL2mbegXmMBQ"
```

---

### Task 15: Fit-to-data, Supabase smoke check, docs, final verification

**Files:**
- Modify: `src/components/console/map/ConsoleMap.tsx` (fit bounds once in Supabase mode), root `CLAUDE.md`, `README.md`

- [ ] **Step 1: Fit the map to data once in Supabase mode**

In `ConsoleMap.tsx` add a `MapRef` and an effect: when `isSupabaseConfigured()` and the store's `loadState` becomes `ready` with at least one open pothole, call `fitBounds` once over the potholes plus `DEPOT` with `padding: 40, maxZoom: 15, duration: 0`.

```tsx
const mapRef = useRef<MapRef>(null);
const loadState = useConsole((s) => s.loadState);
const fitted = useRef(false);
useEffect(() => {
  if (fitted.current || loadState !== "ready" || !isSupabaseConfigured() || !mapRef.current) return;
  const pts = Object.values(useConsole.getState().potholes).filter((p) => p.status !== "false_positive").map((p) => [p.lng, p.lat] as [number, number]);
  if (!pts.length) return;
  pts.push(DEPOT);
  const lngs = pts.map((p) => p[0]), lats = pts.map((p) => p[1]);
  mapRef.current.fitBounds([[Math.min(...lngs), Math.min(...lats)], [Math.max(...lngs), Math.max(...lats)]], { padding: 40, maxZoom: 15, duration: 0 });
  fitted.current = true;
}, [loadState]);
```

with `ref={mapRef}` on `<Map>`, `import type { MapRef } from "react-map-gl/maplibre"`, `import { isSupabaseConfigured } from "@/lib/data"`, and `import { useConsole } from "@/lib/console/store"`.

- [ ] **Step 2: Supabase smoke check (only if a project is linked)**

If `dashboard/.env.local` exists with a real URL, run `npm run dev`, confirm the queue loads from `potholes_map`, then in the Supabase SQL editor insert one detection for the seeded Phone A and watch a pin appear without a reload:

```sql
insert into detections (device_id, vehicle_id, recorded_at, location, accel_peak_z, severity)
values ('00000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-000000000002', now(),
        'SRID=4326;POINT(-0.1290 51.4960)', 4.1, 0.55);
```

Then the same with Phone B (`…0005`, `…0004`) at the same point and watch the pin fill (suspected → confirmed). If no project is linked, skip this step and say so in the task report.

- [ ] **Step 3: Update root `CLAUDE.md`**

Under "Where things go", add:

```
- Console screen (map + operations column): `dashboard/src/components/console/` with pure logic in `dashboard/src/lib/console/` (store, derivations, keyboard, tween), the shared solver heuristic in `dashboard/src/lib/solver/`, and the data layer in `dashboard/src/lib/data/` (synthetic by default; Supabase when `NEXT_PUBLIC_SUPABASE_URL` is set). Spec: `docs/superpowers/specs/2026-09-02-console-map-design.md`.
- The `/api/plan-route` handler should call `solve()` from `dashboard/src/lib/solver/heuristic.ts` with the OSRM matrix (depot at index 0); the synthetic data source already does this with a haversine matrix.
```

Under "Commands", add `npm test` and `npm run typecheck` lines.

- [ ] **Step 4: Update `README.md`** "Dashboard" step: mention that with no `.env.local` the console runs on synthetic data, and `npm test`.

- [ ] **Step 5: Full verification**

Run: `npm test && npm run typecheck && npm run lint && npm run build`
Expected: all tests pass, tsc clean, eslint clean, build lists `/`, `/api/dispatch`, `/api/plan-route`, `/route/[id]`. Then `npm run dev` and walk the demo script beats 1, 4, 5, 6 from `docs/ARCHITECTURE.md` §7 on synthetic data: live dots and km ticking; detail panel; dismiss with undo; best 6 in an area with the km saved line.

- [ ] **Step 6: Commit and push**

```bash
jj commit -m "Fit the map to live data, document the console, verify the build

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01T93AKP7HijHL2mbegXmMBQ"
jj bookmark set console-map -r @-
jj git push --bookmark console-map
```

---

## Self-review notes

Spec coverage: §1 decisions (Tasks 1, 7–9), §2 file layout (all tasks; `Column.tsx` and `MapLayers.tsx`/`useAreaDrag.ts`/`area.ts` are additions the spec's tree implied), §3 map (Tasks 9, 10, 13, 14, 15), §4 store (Task 5), §5 data layer (Tasks 2, 7, 8), §6 heuristic (Task 4), §7 column and interaction (Tasks 11, 12), §8 planner (Tasks 13, 14), §9 header (Task 9), §10 states (Tasks 9, 11, 12, 13), §11 tests (Tasks 2–8, 11, 13), §12 out of scope respected.

Deviations from the spec, all deliberate: the graticule is CSS gradients rather than canvas (same picture, less code); the authority name comes from `NEXT_PUBLIC_AUTHORITY_NAME` or "Demo Council" rather than a lookup of the crew's authority, since `crews` carries only the id; the "km scanned" counter is nudged client-side per vehicle tick in both modes for a live feel.
