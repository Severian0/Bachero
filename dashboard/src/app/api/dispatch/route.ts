import type { DispatchRequest } from "@/lib/types";
import { crewRouteUrl } from "@/lib/links";

// POST /api/dispatch — docs/ARCHITECTURE.md §5.
// Loads route_plans_map (nested crew + work_orders + pothole), builds the email
// (stops in order, severity, before-photos, /route/{id} link, chunked GMaps links),
// sends via Resend, sets route_plans.status = 'published'.
//
// Still a stub. When you build it, the crew link is `crewRouteUrl(route_plan_id)`
// from `src/lib/links.ts` — it points at the contractor portal
// (NEXT_PUBLIC_CONTRACTOR_URL), which is where the crew screens actually live.
// Do NOT build it from NEXT_PUBLIC_APP_URL: that is this dashboard, whose
// /route/{id} is only a redirect kept alive for old bookmarks.
export async function POST(request: Request) {
  const body = (await request.json()) as DispatchRequest;
  return Response.json(
    {
      error: "not implemented",
      received: body,
      // Returned so the link can be checked, and the console can show it, before
      // the email itself exists.
      crew_url: crewRouteUrl(body.route_plan_id),
    },
    { status: 501 },
  );
}
