import { serverClient } from "@/lib/server/supabase";
import { crewPlanFromRow, type CrewPlan } from "@/lib/crew/plan";
import type { RoutePlanMapRow } from "@/lib/types";
import CrewRoute from "@/components/crew/CrewRoute";

// Crew page - docs/ARCHITECTURE.md section 6. Login-free, mobile-first. Reads the
// route_plans_map view (never a raw geography column; crews.depot arrives as
// WKB in the embed and is simply not read) and hands plain data to the shell.
export default async function CrewRoutePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  let plan: CrewPlan | null = null;
  try {
    const db = serverClient();
    const { data } = await db
      .from("route_plans_map")
      .select("*, crew:crews(*), work_orders(*, pothole:potholes_map(*))")
      .eq("id", id)
      .order("stop_order", { referencedTable: "work_orders", ascending: true });
    const row = (data ?? [])[0] as RoutePlanMapRow | undefined;
    plan = row ? crewPlanFromRow(row) : null;
  } catch {
    // A malformed id, missing Supabase config or a dead network all land on
    // the same honest answer: this link does not open a route.
    plan = null;
  }
  if (!plan) {
    return (
      <main style={{ padding: "var(--s5)", maxWidth: "42ch" }}>
        <h1 style={{ fontSize: "var(--t-title)", margin: 0 }}>Route not found</h1>
        <p className="secondary" style={{ margin: "var(--s2) 0 0", fontSize: "var(--t-small)", lineHeight: 1.5 }}>
          This route could not be loaded. Check the link in the dispatch email.
        </p>
      </main>
    );
  }
  return <CrewRoute plan={plan} />;
}
