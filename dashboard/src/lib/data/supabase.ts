import type { SupabaseClient } from "@supabase/supabase-js";
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

// Note: `client` has no default here (unlike the brief's literal signature) because a
// default value referencing the real `supabase` binding would force a static top-level
// `import { supabase } from "@/lib/supabase"`, which throws at *module load* time when
// NEXT_PUBLIC_SUPABASE_URL is unset (see src/lib/supabase.ts) — breaking any bare import
// of this module, including the test file's own top-level import. createDataSource() in
// ./index.ts resolves and passes the real client explicitly, only when configured.
export function createSupabaseSource(client: SupabaseClient): ConsoleDataSource {
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
      if (vp.error) throw new Error(vp.error.message);
      if (cr.error) throw new Error(cr.error.message);
      const potholes = ((ph.data ?? []) as PotholeMapRow[]).map((r) => toPothole(r, so.get(r.id) ?? null));
      const vehicles: Vehicle[] = ((vp.data ?? []) as VehiclePositionRow[]).map(toVehicle);
      const crews = (cr.data ?? []) as Crew[];
      // Trips are informational (the km-today tile); a failed query falls back to 0 rather
      // than failing the whole load.
      const kmToday = tr.error ? 0 :
        ((tr.data ?? []) as { distance_m: number | null }[]).reduce((s, t) => s + (t.distance_m ?? 0), 0) / 1000;
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
