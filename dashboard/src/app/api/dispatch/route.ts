import type { DispatchRequest } from "@/lib/types";

// POST /api/dispatch — docs/ARCHITECTURE.md §5.
// Loads route_plans_map (nested crew + work_orders + pothole), builds the email
// (stops in order, severity, before-photos, /route/{id} link, chunked GMaps links),
// sends via Resend, sets route_plans.status = 'published'.
export async function POST(request: Request) {
  const body = (await request.json()) as DispatchRequest;
  return Response.json(
    { error: "not implemented", received: body },
    { status: 501 },
  );
}
