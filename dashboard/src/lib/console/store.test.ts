// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createConsoleStore, DISMISS_UNDO_MS, DISPATCH_ERROR, EMPTY_PLAN_ERROR, PLAN_ERROR } from "./store";
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
    planRoute: vi.fn(async () => ({ route_plan_id: "r1", stops: [{ work_order_id: "w1", pothole_id: "a", stop_order: 1, eta: "2026-09-03T08:20:00.000Z", lng: -0.12, lat: 51.49, severity: 0.5, photo_url: null }], total_km: 1, total_minutes: 2, baseline_km: 3, path: { type: "LineString" as const, coordinates: [] } })),
    dispatch: vi.fn(async () => ({ sent: true, crewPage: "/route/r1" })),
    ...over,
  };
}

describe("console store", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("link, pin, unpin, unlink", () => {
    const s = createConsoleStore();
    s.getState().upsertPothole(base);
    s.getState().link("a");
    expect(s.getState().linkedId).toBe("a");
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
    await vi.advanceTimersByTimeAsync(0);
    expect(ds.dismiss).toHaveBeenCalledWith("a");
    expect(s.getState().pendingDismiss?.id).toBe("b");
  });

  it("cycleFilter follows chip order and wraps", () => {
    const s = createConsoleStore();
    expect(s.getState().filter).toBe("all");
    s.getState().cycleFilter();
    expect(s.getState().filter).toBe("confirmed");
    s.getState().setFilter("scheduled");
    s.getState().cycleFilter();
    expect(s.getState().filter).toBe("all");
  });

  it("the dispatch sheet is closed until it is asked for", () => {
    const s = createConsoleStore();
    expect(s.getState().sheetOpen).toBe(false);
    s.getState().setSheetOpen(true);
    expect(s.getState().sheetOpen).toBe(true);
    s.getState().setSheetOpen(false);
    expect(s.getState().sheetOpen).toBe(false);
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

  it("planRoute records the crew the route was computed for, and later crew changes do not rewrite it", async () => {
    const ds = fakeDs();
    const s = createConsoleStore();
    s.getState().setDataSource(ds);
    s.getState().setCrews([
      { id: "A", authority_id: "x", name: "Crew A", shift_minutes: 480, repairs_per_shift: 12 },
      { id: "B", authority_id: "x", name: "Crew B", shift_minutes: 420, repairs_per_shift: 8 },
    ]);
    s.getState().upsertPothole(base);
    s.getState().toggleSelected("a");
    await s.getState().planRoute();
    expect(s.getState().planCrewId).toBe("A");
    // The operator picks a different crew afterwards; the plan on screen was
    // still computed for A, so the confirmation must keep saying A.
    s.getState().setPlanner({ crewId: "B" });
    expect(s.getState().planner.crewId).toBe("B");
    expect(s.getState().planCrewId).toBe("A");
    s.getState().resetPlan();
    expect(s.getState().planCrewId).toBeNull();
  });

  it("a plan with no stops is an error, and leaves the selection to be adjusted", async () => {
    const ds = fakeDs({
      planRoute: vi.fn(async () => ({ route_plan_id: "r1", stops: [], total_km: 0, total_minutes: 0, baseline_km: 0, path: { type: "LineString" as const, coordinates: [] } })),
    });
    const s = createConsoleStore();
    s.getState().setDataSource(ds);
    s.getState().setCrews([{ id: "c1", authority_id: "x", name: "Crew A", shift_minutes: 480, repairs_per_shift: 12 }]);
    s.getState().upsertPothole(base);
    s.getState().toggleSelected("a");
    await s.getState().planRoute();
    expect(s.getState().planState).toBe("error");
    expect(s.getState().planError).toBe(EMPTY_PLAN_ERROR);
    expect(s.getState().plan).toBeNull();
    expect(s.getState().selected).toEqual(["a"]);
  });

  it("a re-plan that yields no stops clears the standing plan the map is drawing", async () => {
    const stop = { work_order_id: "w1", pothole_id: "a", stop_order: 1, eta: "2026-09-03T08:20:00.000Z", lng: -0.12, lat: 51.49, severity: 0.5, photo_url: null };
    const path = { type: "LineString" as const, coordinates: [] };
    const planRoute = vi.fn(async () => ({ route_plan_id: "r1", stops: [stop], total_km: 1, total_minutes: 2, baseline_km: 3, path }));
    const ds = fakeDs({ planRoute });
    const s = createConsoleStore();
    s.getState().setDataSource(ds);
    s.getState().setCrews([{ id: "c1", authority_id: "x", name: "Crew A", shift_minutes: 480, repairs_per_shift: 12 }]);
    s.getState().upsertPothole(base);
    s.getState().toggleSelected("a");
    await s.getState().planRoute();
    expect(s.getState().planState).toBe("planned");
    expect(s.getState().plan?.stops).toHaveLength(1);

    // Removing the only stop re-plans over nothing. The route line and its
    // numbered stops are drawn from `plan`, so the failure has to take it away.
    planRoute.mockImplementation(async () => ({ route_plan_id: "r2", stops: [], total_km: 0, total_minutes: 0, baseline_km: 0, path }));
    s.getState().toggleSelected("a");
    await s.getState().planRoute();
    expect(s.getState().planState).toBe("error");
    expect(s.getState().planError).toBe(EMPTY_PLAN_ERROR);
    expect(s.getState().plan).toBeNull();
    expect(s.getState().planCrewId).toBeNull();
    expect(s.getState().selected).toEqual(["a"]);
  });

  it("planRoute failure prefers the server's own sentence, and falls back when there is none", async () => {
    const s = createConsoleStore();
    s.getState().setCrews([{ id: "c1", authority_id: "x", name: "Crew A", shift_minutes: 480, repairs_per_shift: 12 }]);

    // /api/plan-route answers one plain sentence; it is more use than the fallback.
    s.getState().setDataSource(fakeDs({ planRoute: vi.fn(async () => { throw new Error("That crew was not found."); }) }));
    await s.getState().planRoute();
    expect(s.getState().planState).toBe("error");
    expect(s.getState().planError).toBe("That crew was not found.");

    // A throw with nothing to say (the synthetic source never throws at all).
    s.getState().setDataSource(fakeDs({ planRoute: vi.fn(async () => { throw new Error(""); }) }));
    await s.getState().planRoute();
    expect(s.getState().planError).toBe(PLAN_ERROR);
  });

  it("dispatch keeps the result, so the confirmation can say whether an email went out", async () => {
    const s = createConsoleStore();
    s.getState().setCrews([{ id: "c1", authority_id: "x", name: "Crew A", shift_minutes: 480, repairs_per_shift: 12 }]);
    s.getState().setDataSource(fakeDs({
      dispatch: vi.fn(async () => ({ sent: false, crewPage: "http://localhost:3000/route/r1" })),
    }));
    s.getState().upsertPothole(base);
    s.getState().toggleSelected("a");
    await s.getState().planRoute();
    await s.getState().dispatch(["crew@example.com"]);

    // The plan is published either way, so the state is still "sent"; what the
    // sheet reads to choose its wording is the result.
    expect(s.getState().dispatchState).toBe("sent");
    expect(s.getState().dispatchedTo).toBe(1);
    expect(s.getState().dispatchResult).toEqual({ sent: false, crewPage: "http://localhost:3000/route/r1" });

    s.getState().resetPlan();
    expect(s.getState().dispatchResult).toBeNull();
    expect(s.getState().dispatchState).toBe("idle");
  });

  it("dispatch failure prefers the server's own sentence, and falls back when there is none", async () => {
    const s = createConsoleStore();
    s.getState().setCrews([{ id: "c1", authority_id: "x", name: "Crew A", shift_minutes: 480, repairs_per_shift: 12 }]);
    s.getState().setDataSource(fakeDs({
      dispatch: vi.fn(async () => { throw new Error("That route plan was not found."); }),
    }));
    s.getState().upsertPothole(base);
    s.getState().toggleSelected("a");
    await s.getState().planRoute();
    await s.getState().dispatch(["crew@example.com"]);
    expect(s.getState().dispatchState).toBe("error");
    expect(s.getState().dispatchError).toBe("That route plan was not found.");
    expect(s.getState().dispatchResult).toBeNull();

    s.getState().setDataSource(fakeDs({ dispatch: vi.fn(async () => { throw new Error(""); }) }));
    await s.getState().dispatch(["crew@example.com"]);
    expect(s.getState().dispatchError).toBe(DISPATCH_ERROR);
  });

  it("upsertVehicle keeps a trail of at most 5", () => {
    const s = createConsoleStore();
    s.getState().setVehicles([{ id: "v", label: "Bus 24", fleet_type: "bus", position: { vehicle_id: "v", lng: 0, lat: 0, recorded_at: "t0", speed_mps: null, heading_deg: null }, trail: [] }]);
    for (let i = 1; i <= 7; i++) {
      const position = { vehicle_id: "v", lng: i, lat: 0, recorded_at: "t" + i, speed_mps: null, heading_deg: null };
      s.getState().upsertVehicle({ id: "v", label: "Bus 24", fleet_type: "bus", position, trail: [position] });
    }
    const v = s.getState().vehicles["v"];
    expect(v.position.lng).toBe(7);
    expect(v.trail).toHaveLength(5);
    expect(v.trail[4].lng).toBe(7);
  });

  it("upsertVehicle inserts a vehicle absent from the initial load", () => {
    const s = createConsoleStore();
    expect(s.getState().vehicles["new"]).toBeUndefined();
    const position = { vehicle_id: "new", lng: 1, lat: 2, recorded_at: "t0", speed_mps: null, heading_deg: null };
    s.getState().upsertVehicle({ id: "new", label: "Phone C", fleet_type: "pool_car", position, trail: [position] });
    expect(s.getState().vehicles["new"]).toMatchObject({ label: "Phone C", fleet_type: "pool_car", position });
  });

  it("upsertPothole invalidates the detections cache and reloads it for the pinned pothole", async () => {
    const rows = [{ id: "d1", pothole_id: "a", vehicle_id: "v", vehicle_label: "Bus", recorded_at: "2026-09-01T00:00:00Z", severity: 0.4, speed_mps: 5, photo_url: null }];
    const detections = vi.fn(async () => rows);
    const ds = fakeDs({ detections });
    const s = createConsoleStore();
    s.getState().setDataSource(ds);
    s.getState().upsertPothole(base);
    s.getState().pin("a");
    await vi.runAllTimersAsync();
    expect(detections).toHaveBeenCalledTimes(1);
    expect(s.getState().detections["a"]).toEqual(rows);

    s.getState().upsertPothole(p({ severity: 0.9 }));
    await vi.runAllTimersAsync();
    expect(detections).toHaveBeenCalledTimes(2);
    expect(s.getState().detections["a"]).toEqual(rows);
  });
});
