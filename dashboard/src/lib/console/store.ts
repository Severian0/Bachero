import { create } from "zustand";
import type {
  ConsoleDataSource, Crew, Detection, DispatchResult, PlanRouteRequest, PlanRouteResponse,
  Pothole, Vehicle,
} from "@/lib/data/types";
import { nearestOpenPothole } from "./nearest";
import { DEPOT } from "@/lib/data/synthetic";
import { FILTER_CYCLE, isSelectable, type Filter } from "./derive";

export type Mode = "manual" | "count" | "time";
export const DISMISS_UNDO_MS = 10_000;
const TRAIL_LEN = 5;

/** Where a planned route begins. The depot is the crew's own, read server-side. */
export type AnchorChoice = { kind: "depot" } | { kind: "pothole"; id: string };
/** Where it ends. "same" is a closed loop back to the start. */
export type EndChoice = { kind: "same" } | { kind: "pothole"; id: string };

export interface PlannerConfig {
  crewId: string | null;
  mode: Mode;
  maxStops: number;
  timeBudgetMin: number;
  serviceMinPerStop: number;
  planDate: string; // YYYY-MM-DD
  start: AnchorChoice;
  end: EndChoice;
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
  pinnedId: string | null;
  selected: string[];
  filter: Filter;
  /** The dispatch sheet, the one thing on this screen that interrupts. */
  sheetOpen: boolean;

  planner: PlannerConfig;
  planState: "idle" | "planning" | "planned" | "error";
  /** The proposed route is playing on the map (Preview drive). */
  previewDrive: boolean;
  plan: PlanRouteResponse | null;
  /**
   * The crew the standing plan was actually computed for. Held apart from
   * `planner.crewId`, which the operator can still change after a route comes
   * back: the confirmation has to name the crew the route was solved for, not
   * whichever radio is currently ticked.
   */
  planCrewId: string | null;
  planError?: string;
  dispatchState: "idle" | "sending" | "sent" | "error";
  dispatchError?: string;
  dispatchedTo: number;
  /**
   * What the dispatch actually did. `sent: false` means the plan is published
   * but no email went out, which the confirmation has to say rather than
   * claiming a crew has been emailed.
   */
  dispatchResult: DispatchResult | null;

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

  link(id: string): void;
  unlink(): void;
  pin(id: string): void;
  unpin(): void;
  toggleSelected(id: string): void;
  clearSelection(): void;
  setFilter(f: Filter): void;
  cycleFilter(): void;
  setSheetOpen(open: boolean): void;
  setPreviewDrive(on: boolean): void;

  setPlanner(patch: Partial<PlannerConfig>): void;
  setStartAnchor(choice: AnchorChoice): void;
  setEndAnchor(choice: EndChoice): void;
  planRoute(): Promise<void>;
  /** The one-click demo path: depot loop to the worst nearby open defect. */
  planNearest(): Promise<void>;
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

export const PLAN_ERROR = "Route service unavailable. Check the connection and try again.";
/**
 * A plan that came back with no stops. Said as a failure rather than shown as an
 * empty route, because a zero-stop plan on screen beside pins the operator has
 * already committed is the one disagreement this store exists to prevent.
 */
export const EMPTY_PLAN_ERROR =
  "No route could be planned for those stops. The queue is unaffected; adjust the selection and try again.";
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
      linkedId: null, pinnedId: null, selected: [], filter: "all",
      sheetOpen: false,
      planner: {
        crewId: null, mode: "manual", maxStops: 12, timeBudgetMin: 480, serviceMinPerStop: 20,
        planDate: tomorrowISO(),
        start: { kind: "depot" },
        end: { kind: "same" },
      },
      planState: "idle", plan: null, planCrewId: null, dispatchState: "idle", dispatchedTo: 0,
      previewDrive: false,
      dispatchResult: null,
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

      link(id) { set({ linkedId: id }); },
      unlink() { if (!get().pinnedId) set({ linkedId: null }); },
      pin(id) {
        set({ pinnedId: id, linkedId: id });
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
      setSheetOpen(sheetOpen) { set({ sheetOpen }); },
      setPreviewDrive(previewDrive) { set({ previewDrive }); },

      setPlanner(patch) { set((s) => ({ planner: { ...s.planner, ...patch } })); },
      setStartAnchor(start) { set((s) => ({ planner: { ...s.planner, start } })); },
      setEndAnchor(end) { set((s) => ({ planner: { ...s.planner, end } })); },
      async planNearest() {
        const { crews, planner, potholes } = get();
        const crewId = planner.crewId ?? crews[0]?.id ?? null;
        // DEPOT matches the seeded crews.depot; the server anchors the real
        // route at the true depot either way.
        const nearest = nearestOpenPothole(Object.values(potholes), DEPOT);
        if (!ds || !crewId || !nearest) return;
        set((s) => ({
          planner: { ...s.planner, crewId, mode: "manual" },
          selected: [nearest.id],
          sheetOpen: true,
        }));
        await get().planRoute();
      },
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
          ...(planner.start.kind === "pothole" ? { start_pothole_id: planner.start.id } : {}),
          // An end equal to the start is a loop, and the server normalises it away
          // anyway; dropping it here keeps the request minimal and honest.
          ...(planner.end.kind === "pothole" &&
          !(planner.start.kind === "pothole" && planner.start.id === planner.end.id)
            ? { end_pothole_id: planner.end.id }
            : {}),
        };
        set({ planState: "planning", planError: undefined, previewDrive: false });
        try {
          const plan = await ds.planRoute(req);
          // An empty plan is a failure, not a route. Any previous plan has to go
          // with it: the map draws whatever `plan` holds, so leaving the old one
          // standing would keep a route line and its numbered stops on screen for
          // a route that no longer exists. The selection is left alone so the
          // operator can adjust it rather than rebuild it.
          if (plan.stops.length === 0) {
            set({ planState: "error", planError: EMPTY_PLAN_ERROR, plan: null, planCrewId: null });
            return;
          }
          set({
            planState: "planned", plan, planCrewId: req.crew_id, selected: [],
            dispatchState: "idle", dispatchedTo: 0,
          });
        } catch (e) {
          // The endpoint answers with one plain sentence of its own ("That crew
          // was not found.", "No open potholes match that request."), which is
          // more use than the generic fallback. postJson rethrows it as the
          // Error message, so prefer it whenever there is one.
          set({ planState: "error", planError: e instanceof Error && e.message ? e.message : PLAN_ERROR });
        }
      },
      resetPlan() { set({ planState: "idle", plan: null, planCrewId: null, planError: undefined, dispatchState: "idle", dispatchError: undefined, dispatchedTo: 0, dispatchResult: null, previewDrive: false }); },
      async dispatch(to) {
        const plan = get().plan;
        if (!ds || !plan) return;
        set({ dispatchState: "sending", dispatchError: undefined, previewDrive: false });
        try {
          const result = await ds.dispatch({ route_plan_id: plan.route_plan_id, to });
          // Publishing the plan is the state change that matters, and it
          // happened either way; whether an email went with it is what
          // `dispatchResult` carries to the confirmation.
          set({ dispatchState: "sent", dispatchedTo: to.length, dispatchResult: result });
        } catch (e) {
          set({ dispatchState: "error", dispatchError: e instanceof Error && e.message ? e.message : DISPATCH_ERROR });
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
