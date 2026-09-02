import { create } from "zustand";
import type {
  ConsoleDataSource, Crew, Detection, PlanRouteRequest, PlanRouteResponse, Pothole, Vehicle,
} from "@/lib/data/types";
import { FILTER_CYCLE, isSelectable, type ChipFilter, type Filter } from "./derive";

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
  /** The dispatch sheet, the one thing on this screen that interrupts. */
  sheetOpen: boolean;
  /**
   * Shift-drag on the map is drawing a plan area. The screen's own keys stand
   * down while it is true, because Escape belongs to the drag.
   */
  drawing: boolean;

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
  upsertVehicle(v: Vehicle): void;
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
  setSheetOpen(open: boolean): void;
  setDrawing(drawing: boolean): void;

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
      linkedId: null, linkSource: null, pinnedId: null, selected: [], filter: "all", density: "comfortable",
      sheetOpen: false, drawing: false,
      planner: { crewId: null, mode: "manual", maxStops: 12, timeBudgetMin: 480, serviceMinPerStop: 20, area: null, planDate: tomorrowISO() },
      plannerOpen: false,
      planState: "idle", plan: null, dispatchState: "idle", dispatchedTo: 0,
      pendingDismiss: null,

      setDataSource(d) { ds = d; },
      setLoadState(loadState, loadError) { set({ loadState, loadError }); },
      setAll(list) { set({ potholes: Object.fromEntries(list.map((p) => [p.id, p])) }); },
      upsertPothole(p) {
        set((s) => {
          const detections = { ...s.detections };
          delete detections[p.id];
          return {
            potholes: { ...s.potholes, [p.id]: p },
            selected: isSelectable(p) ? s.selected : s.selected.filter((id) => id !== p.id),
            detections,
          };
        });
        if (p.id === get().pinnedId) void get().loadDetections(p.id);
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
      upsertVehicle(v) {
        set((s) => {
          const existing = s.vehicles[v.id];
          if (!existing) return { vehicles: { ...s.vehicles, [v.id]: v } };
          const trail = [...existing.trail, v.position].slice(-TRAIL_LEN);
          return { vehicles: { ...s.vehicles, [v.id]: { ...existing, position: v.position, trail } } };
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
        const i = FILTER_CYCLE.indexOf(get().filter as ChipFilter);
        set({ filter: FILTER_CYCLE[(i + 1) % FILTER_CYCLE.length] });
      },
      setDensity(density) { set({ density }); },
      setSheetOpen(sheetOpen) { set({ sheetOpen }); },
      setDrawing(drawing) { set({ drawing }); },

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
        // Selection is intentionally not restored here: dismiss() already dropped the id
        // from `selected`, and undo only reverses the status change, not the deselection.
        set((s) => ({ potholes: { ...s.potholes, [pending.id]: pending.previous }, pendingDismiss: null }));
      },
    };
  });
}

export const useConsole = createConsoleStore();
