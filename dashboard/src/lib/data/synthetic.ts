import type {
  ConsoleDataSource, Crew, Detection, DispatchResult, LoadResult, PlanRouteRequest,
  PlanRouteResponse, Pothole, PotholeUpdate, SubscribeHandlers, Vehicle, VehiclePosition,
} from "./types";
import { potholeRef } from "./types";
import { priority } from "@/lib/console/derive";
import { pointInPolygon } from "@/lib/console/area";
import { buildMatrix, type LngLat } from "@/lib/solver/haversine";
import { solve } from "@/lib/solver/heuristic";

export const DEPOT: LngLat = [-0.1246, 51.4994];
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

// Attribution pool for detections: the three moving VEHICLES plus three stationary
// entries so a pothole's evidence can name up to six distinct vehicles even though
// only three move on the map.
const DETECTION_FLEET: { id: string; label: string }[] = [
  { id: "00000000-0000-0000-0000-000000000002", label: "Phone A (bus 24)" },
  { id: "00000000-0000-0000-0000-000000000004", label: "Phone B (bin round N)" },
  { id: "00000000-0000-0000-0000-000000000007", label: "Pool car 3" },
  { id: "00000000-0000-0000-0000-000000000008", label: "Bus 11" },
  { id: "00000000-0000-0000-0000-000000000009", label: "Sweeper 2" },
  { id: "00000000-0000-0000-0000-00000000000a", label: "Gritter 1" },
];

/**
 * Module-level so a crew added on the settings page is still there when the
 * console mounts its own source: the synthetic fleet has no database to
 * remember it in, so the module is the database for the session.
 */
const crews: Crew[] = [
  { id: "00000000-0000-0000-0000-000000000006", authority_id: AUTHORITY_ID, name: "Crew A", shift_minutes: 480, repairs_per_shift: 12, depot_lng: DEPOT[0], depot_lat: DEPOT[1] },
];
let crewSeq = 0;

function uuidFrom(rng: () => number): string {
  const hex = () => Math.floor(rng() * 16).toString(16);
  const s = Array.from({ length: 32 }, hex).join("");
  return `${s.slice(0, 8)}-${s.slice(8, 12)}-4${s.slice(13, 16)}-a${s.slice(17, 20)}-${s.slice(20, 32)}`;
}

export function createSyntheticSource(seed = 20260902): ConsoleDataSource {
  const rng = mulberry32(seed);
  const now = Date.now();
  const potholes = new Map<string, Pothole>();
  const detections = new Map<string, Detection[]>();
  const handlers = new Set<SubscribeHandlers>();
  let kmToday = 148.6;
  let planCounter = 0;
  /**
   * What each pothole was before this source scheduled it. A re-plan that drops
   * a stop puts the pothole back to that status, so the queue and the map never
   * keep a stop order for a route that no longer contains it.
   */
  const scheduledFrom = new Map<string, Pothole["status"]>();

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
      vehicle_id: DETECTION_FLEET[k % vehicles].id,
      vehicle_label: DETECTION_FLEET[k % vehicles].label,
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
      return { potholes: [...potholes.values()], vehicles: vehState.map(vehicle), crews: [...crews], kmToday };
    },
    subscribe(h) {
      handlers.add(h);
      const timer = setInterval(() => {
        kmToday += KM_PER_TICK;
        for (const v of vehState) {
          v.i += v.dir;
          if (v.i >= v.path.length - 1) { v.i = v.path.length - 1; v.dir = -1; }
          else if (v.i <= 0) { v.i = 0; v.dir = 1; }
          h.onVehicle(vehicle(v));
        }
        h.onKmToday?.(kmToday);
      }, TICK_MS);
      return () => { clearInterval(timer); handlers.delete(h); };
    },
    async detections(id) { return detections.get(id) ?? []; },
    async dismiss(id) {
      const p = potholes.get(id);
      if (p) potholes.set(id, { ...p, status: "false_positive" });
    },
    async planRoute(req: PlanRouteRequest): Promise<PlanRouteResponse> {
      // Picking stops by hand takes the named potholes whatever their status,
      // because re-planning a route without one of its stops names potholes
      // this source has already marked scheduled. Best N and a time budget work
      // from the open queue, which is what "unassigned" means there.
      const named = new Set(req.pothole_ids ?? []);
      const all = [...potholes.values()].filter((p) => p.status !== "repaired" && p.status !== "false_positive");
      let cands = req.mode === "manual"
        ? all.filter((p) => named.has(p.id))
        : all.filter((p) => p.status === "suspected" || p.status === "confirmed");
      if (req.mode !== "manual" && req.area) cands = cands.filter((p) => pointInPolygon([p.lng, p.lat], req.area!));
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
        // A pothole the seed already had on someone's route reverts to confirmed
        // rather than to a scheduled state with no stop order behind it.
        if (!scheduledFrom.has(p.id)) scheduledFrom.set(p.id, p.status === "scheduled" ? "confirmed" : p.status);
        const updated: Pothole = { ...p, status: "scheduled", stop_order: k + 1, updated_at: new Date().toISOString() };
        potholes.set(p.id, updated);
        emit(updated);
        return { work_order_id: `${routeId}-wo-${k + 1}`, pothole_id: p.id, stop_order: k + 1, eta, lng: p.lng, lat: p.lat, severity: p.severity, photo_url: p.photo_url };
      });
      // Anything this source had scheduled that the new plan leaves out goes back
      // to the status it held before it was scheduled, with no stop order.
      const kept = new Set(stops.map((s) => s.pothole_id));
      for (const [id, before] of [...scheduledFrom]) {
        if (kept.has(id)) continue;
        scheduledFrom.delete(id);
        const p = potholes.get(id);
        if (!p || p.status !== "scheduled") continue;
        const restored: Pothole = { ...p, status: before, stop_order: null, updated_at: new Date().toISOString() };
        potholes.set(id, restored);
        emit(restored);
      }

      const coords: [number, number][] = [DEPOT, ...stops.map((s): [number, number] => [s.lng, s.lat]), DEPOT];
      return {
        route_plan_id: routeId, stops,
        total_km: Math.round(sol.totalKm * 10) / 10, total_minutes: Math.round(sol.totalMin),
        baseline_km: Math.round(sol.baselineKm * 10) / 10,
        path: { type: "LineString", coordinates: coords },
        steps: [],
        start: { lng: DEPOT[0], lat: DEPOT[1], label: "Depot" },
        end: { lng: DEPOT[0], lat: DEPOT[1], label: "Depot" },
      };
    },
    async saveCrew(input) {
      const { id, ...fields } = input;
      const i = id ? crews.findIndex((c) => c.id === id) : -1;
      if (id && i < 0) throw new Error("Crew not found.");
      const crew: Crew = i >= 0
        ? { ...crews[i], ...fields }
        : { id: `00000000-0000-0000-0000-0000000000c${(crewSeq++).toString(16)}`, authority_id: AUTHORITY_ID, ...fields };
      if (i >= 0) crews[i] = crew; else crews.push(crew);
      return crew;
    },
    async deleteCrew(id) {
      const i = crews.findIndex((c) => c.id === id);
      if (i < 0) throw new Error("Crew not found.");
      crews.splice(i, 1);
    },
    async dispatch(req): Promise<DispatchResult> {
      await new Promise((r) => setTimeout(r, 600));
      return { sent: true, crewPage: `/route/${req.route_plan_id}` };
    },
  };
}
