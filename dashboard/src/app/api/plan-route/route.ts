import type { PlanRouteRequest } from "@/lib/types";

// POST /api/plan-route — docs/ARCHITECTURE.md §5.
// 1. Candidates from `repair_queue`, filtered by pothole_ids or point-in-polygon on `area`.
// 2. OSRM /table with the crew depot at index 0 for the duration/distance matrix.
// 3. Greedy insertion on priority / marginal_minutes until the budget is spent, then 2-opt.
// 4. baseline_km = same stops in descending-priority order.
// 5. OSRM /route for the geometry.
// 6. Insert route_plans + work_orders (status 'assigned'); the trigger marks potholes 'scheduled'.
export async function POST(request: Request) {
  const body = (await request.json()) as PlanRouteRequest;
  return Response.json(
    { error: "not implemented", received: body },
    { status: 501 },
  );
}
