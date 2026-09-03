import { createOsrmClient } from "@/lib/server/osrm";
import { PlanRouteError, planRoute, validatePlanRequest } from "@/lib/server/planRoute";
import { serverClient } from "@/lib/server/supabase";

const DEFAULT_OSRM_BASE_URL = "https://router.project-osrm.org";

// POST /api/plan-route — docs/ARCHITECTURE.md §5. All of the work is in
// src/lib/server/planRoute.ts; this only parses, injects I/O and maps errors.
export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "The request body must be valid JSON." }, { status: 400 });
  }

  const parsed = validatePlanRequest(body);
  if ("error" in parsed) {
    return Response.json({ error: parsed.error }, { status: 400 });
  }

  try {
    const plan = await planRoute(
      {
        db: serverClient(),
        osrm: createOsrmClient(process.env.OSRM_BASE_URL ?? DEFAULT_OSRM_BASE_URL),
      },
      parsed,
    );
    return Response.json(plan);
  } catch (error) {
    if (error instanceof PlanRouteError) {
      return Response.json({ error: error.message }, { status: error.status });
    }
    return Response.json({ error: "The database request failed." }, { status: 500 });
  }
}
