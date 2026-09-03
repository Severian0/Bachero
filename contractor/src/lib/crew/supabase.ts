// The Supabase data source. Same interface as the fixture; the screens cannot
// tell them apart.
//
// Three rules from CLAUDE.md are load-bearing here:
//
//   1. Never select a geography column. `potholes_map`, `route_plans_map` and
//      `crews` all carry one (`location`, `path`, `depot`), and `select('*')`
//      would hand the browser hex WKB. Every query below names its columns.
//   2. Longitude first, except in the Google Maps links and the coordinate
//      strings a person reads.
//   3. Pothole status is the trigger's business. This app writes `work_orders`
//      and nothing else; `sync_pothole_status` does the rest.

import type {
  BacklogGroups,
  CompletionPatch,
  Crew,
  CrewDetail,
  CrewStats,
  PotholeMapRow,
  RouteDetail,
  RouteStatus,
  RouteSummary,
  Stop,
  WorkOrderStatus,
} from "@/lib/types";
import { getSupabase } from "@/lib/supabase";
import type { CrewDataSource } from "./source";
import { groupBacklog, refOf, sortStops, streetOf } from "./derive";
import { isoDate, minutesBetween } from "./format";

// Explicit column lists — see rule 1 above.
const POTHOLE = [
  "id",
  "authority_id",
  "road_name",
  "status",
  "severity",
  "detection_count",
  "distinct_vehicles",
  "first_detected_at",
  "last_detected_at",
  "repaired_at",
  "updated_at",
  "lng",
  "lat",
  "photo_url",
  "priority",
].join(",");

const CREW = "id,authority_id,name,shift_minutes,repairs_per_shift";

const PLAN = "id,crew_id,plan_date,status,total_km,total_minutes,baseline_km";

const WORK_ORDER =
  "id,pothole_id,crew_id,route_plan_id,stop_order,status,eta,started_at,completed_at,before_photo_url,after_photo_url,notes";

const OUTSTANDING: WorkOrderStatus[] = ["open", "assigned", "in_progress"];

const BUCKET = "detections";

// ─── Row shapes as they come back from the embeds ────────────────────────────

interface WorkOrderRow {
  id: string;
  pothole_id: string;
  crew_id: string | null;
  route_plan_id: string | null;
  stop_order: number | null;
  status: WorkOrderStatus;
  eta: string | null;
  started_at: string | null;
  completed_at: string | null;
  before_photo_url: string | null;
  after_photo_url: string | null;
  notes: string | null;
  pothole?: PotholeMapRow | null;
  route_plan?: { id: string; plan_date: string } | null;
  crew?: { id: string; name: string } | null;
}

interface PlanRow {
  id: string;
  crew_id: string;
  plan_date: string;
  status: RouteStatus;
  total_km: number | null;
  total_minutes: number | null;
  baseline_km: number | null;
  crew?: Crew | null;
  work_orders?: { id: string; status: WorkOrderStatus }[] | null;
}

// ─── Mapping ─────────────────────────────────────────────────────────────────

function toStop(
  row: WorkOrderRow,
  context: { planDate?: string | null; crewName?: string | null } = {},
): Stop | null {
  const pothole = row.pothole ?? null;
  // A work order whose pothole is gone is not something a crew can drive to.
  if (pothole == null) return null;
  return {
    id: row.id,
    potholeId: row.pothole_id,
    routePlanId: row.route_plan_id,
    crewId: row.crew_id,
    crewName: context.crewName ?? row.crew?.name ?? null,
    planDate: context.planDate ?? row.route_plan?.plan_date ?? null,
    stopOrder: row.stop_order,
    status: row.status,
    eta: row.eta,
    startedAt: row.started_at,
    completedAt: row.completed_at,
    beforePhotoUrl: row.before_photo_url ?? pothole.photo_url,
    afterPhotoUrl: row.after_photo_url,
    notes: row.notes,
    pothole,
    ref: refOf(row.pothole_id),
    street: streetOf(pothole),
  };
}

function toSummary(row: PlanRow): RouteSummary | null {
  if (row.crew == null) return null;
  const orders = row.work_orders ?? [];
  return {
    id: row.id,
    crew: row.crew,
    planDate: row.plan_date,
    status: row.status,
    totalKm: row.total_km,
    totalMinutes: row.total_minutes,
    baselineKm: row.baseline_km,
    stopCount: orders.length,
    doneCount: orders.filter((o) => o.status === "done").length,
    escalatedCount: orders.filter((o) => o.status === "cancelled").length,
  };
}

function fail(message: string, error: { message: string } | null): never {
  throw new Error(error == null ? message : `${message} ${error.message}`);
}

function daysAgo(days: number): string {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - Math.abs(days));
  return isoDate(d);
}

// ─── The source ──────────────────────────────────────────────────────────────

export function createSupabaseSource(): CrewDataSource {
  const summariesBetween = async (from: string, to: string) => {
    const { data, error } = await getSupabase()
      .from("route_plans_map")
      .select(`${PLAN},crew:crews(${CREW}),work_orders(id,status)`)
      .gte("plan_date", from)
      .lte("plan_date", to);
    if (error) fail("Could not load routes.", error);
    return ((data ?? []) as unknown as PlanRow[])
      .map(toSummary)
      .filter((r): r is RouteSummary => r !== null);
  };

  return {
    async today() {
      const today = isoDate(new Date());
      return summariesBetween(today, today);
    },

    async backlog(): Promise<BacklogGroups> {
      const { data, error } = await getSupabase()
        .from("work_orders")
        .select(
          `${WORK_ORDER},pothole:potholes_map(${POTHOLE}),route_plan:route_plans(id,plan_date),crew:crews(id,name)`,
        )
        .in("status", OUTSTANDING);
      if (error) fail("Could not load the backlog.", error);
      const stops = ((data ?? []) as unknown as WorkOrderRow[])
        .map((row) => toStop(row))
        .filter((s): s is Stop => s !== null);
      return groupBacklog(stops, isoDate(new Date()));
    },

    async history(days: number) {
      const routes = await summariesBetween(daysAgo(days), isoDate(new Date()));
      return routes
        .filter((r) => r.doneCount + r.escalatedCount > 0)
        .sort((a, b) => b.planDate.localeCompare(a.planDate));
    },

    async crews() {
      const { data, error } = await getSupabase().from("crews").select(CREW);
      if (error) fail("Could not load crews.", error);
      return (data ?? []) as unknown as Crew[];
    },

    async crew(id: string): Promise<CrewDetail | null> {
      const [{ data: crewRows, error: crewError }, routes] = await Promise.all([
        getSupabase().from("crews").select(CREW).eq("id", id).limit(1),
        summariesBetween(daysAgo(90), daysAgo(-30)),
      ]);
      if (crewError) fail("Could not load the crew.", crewError);
      const crew = ((crewRows ?? []) as unknown as Crew[])[0];
      if (crew == null) return null;

      const mine = routes
        .filter((r) => r.crew.id === id)
        .sort((a, b) => b.planDate.localeCompare(a.planDate));

      // Durations need started_at/completed_at, which the summary embed omits.
      const { data: orders } = await getSupabase()
        .from("work_orders")
        .select("id,status,started_at,completed_at")
        .eq("crew_id", id);
      const rows = (orders ?? []) as unknown as {
        status: WorkOrderStatus;
        started_at: string | null;
        completed_at: string | null;
      }[];
      const durations = rows
        .map((r) => minutesBetween(r.started_at, r.completed_at))
        .filter((m): m is number => m != null && m > 0);

      const stats: CrewStats = {
        routes: mine.length,
        stopsDone: rows.filter((r) => r.status === "done").length,
        stopsEscalated: rows.filter((r) => r.status === "cancelled").length,
        kilometres: mine.reduce((sum, r) => sum + (r.totalKm ?? 0), 0),
        averageMinutesPerStop:
          durations.length === 0
            ? null
            : durations.reduce((a, b) => a + b, 0) / durations.length,
      };
      return { crew, routes: mine, stats };
    },

    async route(id: string): Promise<RouteDetail | null> {
      // One nested read (ARCHITECTURE.md §6). Embedding through a view is the
      // only shape here that can fail at runtime, so `loadRouteFlat` repeats the
      // work as three plain queries if it does.
      const { data, error } = await getSupabase()
        .from("route_plans_map")
        .select(
          `${PLAN},crew:crews(${CREW}),work_orders(${WORK_ORDER},pothole:potholes_map(${POTHOLE}))`,
        )
        .eq("id", id)
        .limit(1);

      if (error) return loadRouteFlat(id);

      const row = ((data ?? []) as unknown as PlanRow[])[0];
      if (row == null) return null;
      const summary = toSummary({
        ...row,
        work_orders: (row.work_orders ?? []) as { id: string; status: WorkOrderStatus }[],
      });
      if (summary == null) return null;

      const stops = (
        (row as unknown as { work_orders?: WorkOrderRow[] }).work_orders ?? []
      )
        .map((w) =>
          toStop(w, { planDate: row.plan_date, crewName: row.crew?.name ?? null }),
        )
        .filter((s): s is Stop => s !== null);

      // Sorted here rather than in the query: ordering an embedded resource is
      // the one PostgREST shape worth not depending on, and this is free.
      return { ...summary, stops: sortStops(stops) };
    },

    subscribe(routeId, onChange) {
      const client = getSupabase();
      const channel = client
        .channel(`route:${routeId}`)
        .on(
          "postgres_changes",
          {
            event: "*",
            schema: "public",
            table: "work_orders",
            filter: `route_plan_id=eq.${routeId}`,
          },
          async (payload: { new?: { id?: string } }) => {
            const id = payload.new?.id;
            if (id == null) return;
            // The payload carries the base row without its pothole, so re-read.
            const { data } = await getSupabase()
              .from("work_orders")
              .select(`${WORK_ORDER},pothole:potholes_map(${POTHOLE})`)
              .eq("id", id)
              .limit(1);
            const row = ((data ?? []) as unknown as WorkOrderRow[])[0];
            const stop = row == null ? null : toStop(row);
            if (stop != null) onChange(stop);
          },
        )
        .subscribe();
      return () => {
        void client.removeChannel(channel);
      };
    },

    async start(workOrderId) {
      const { error } = await getSupabase()
        .from("work_orders")
        .update({ status: "in_progress", started_at: new Date().toISOString() })
        .eq("id", workOrderId);
      if (error) fail("Could not record the arrival.", error);
    },

    async complete(workOrderId, patch: CompletionPatch) {
      const { error } = await getSupabase()
        .from("work_orders")
        .update({
          status: "done",
          completed_at: new Date().toISOString(),
          ...(patch.afterPhotoUrl != null
            ? { after_photo_url: patch.afterPhotoUrl }
            : {}),
          ...(patch.notes != null ? { notes: patch.notes } : {}),
        })
        .eq("id", workOrderId);
      if (error) fail("Could not mark the stop done.", error);
    },

    async escalate(workOrderId, notes) {
      const { error } = await getSupabase()
        .from("work_orders")
        .update({
          status: "cancelled",
          completed_at: new Date().toISOString(),
          notes,
        })
        .eq("id", workOrderId);
      if (error) fail("Could not escalate the stop.", error);
    },

    async note(workOrderId, notes) {
      const { error } = await getSupabase()
        .from("work_orders")
        .update({ notes })
        .eq("id", workOrderId);
      if (error) fail("Could not save the note.", error);
    },

    async uploadAfterPhoto(workOrderId, image) {
      // The path ARCHITECTURE.md §6 specifies. The bucket policy grants insert
      // but not update, so a re-take would 409 and `upsert` cannot help — fall
      // back to a timestamped path rather than losing the photo.
      const primary = `after_${workOrderId}.jpg`;
      let path = primary;
      let { error } = await getSupabase().storage
        .from(BUCKET)
        .upload(path, image, { contentType: "image/jpeg" });

      if (error != null) {
        path = `after_${workOrderId}_${Date.now()}.jpg`;
        ({ error } = await getSupabase().storage
          .from(BUCKET)
          .upload(path, image, { contentType: "image/jpeg" }));
      }
      if (error != null) fail("Could not upload the photo.", error);

      const url = getSupabase().storage.from(BUCKET).getPublicUrl(path).data
        .publicUrl;

      // Recorded, but the status is left alone — see the interface note.
      const { error: saveError } = await getSupabase()
        .from("work_orders")
        .update({ after_photo_url: url })
        .eq("id", workOrderId);
      if (saveError) fail("The photo uploaded but was not recorded.", saveError);

      return url;
    },
  };
}

/** Fallback for `route()` when embedding through the view is refused. */
async function loadRouteFlat(id: string): Promise<RouteDetail | null> {
  const { data: planRows, error: planError } = await getSupabase()
    .from("route_plans_map")
    .select(PLAN)
    .eq("id", id)
    .limit(1);
  if (planError) fail("Could not load the route.", planError);
  const plan = ((planRows ?? []) as unknown as PlanRow[])[0];
  if (plan == null) return null;

  const [{ data: crewRows }, { data: orderRows }] = await Promise.all([
    getSupabase().from("crews").select(CREW).eq("id", plan.crew_id).limit(1),
    getSupabase()
      .from("work_orders")
      .select(`${WORK_ORDER},pothole:potholes_map(${POTHOLE})`)
      .eq("route_plan_id", id),
  ]);

  const crew = ((crewRows ?? []) as unknown as Crew[])[0];
  if (crew == null) return null;
  const orders = (orderRows ?? []) as unknown as WorkOrderRow[];
  const summary = toSummary({ ...plan, crew, work_orders: orders });
  if (summary == null) return null;

  const stops = orders
    .map((w) => toStop(w, { planDate: plan.plan_date, crewName: crew.name }))
    .filter((s): s is Stop => s !== null);
  return { ...summary, stops: sortStops(stops) };
}
