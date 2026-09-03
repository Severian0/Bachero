// The crew page is not in this app. It is the contractor portal's job screen
// (`contractor/src/app/route/[id]/page.tsx`, port 3001 in development).
//
// This route stays as a redirect rather than being deleted, because `/route/{id}`
// on the dashboard is the link in any bookmark or older dispatch email a crew
// already has. Removing it would 404 exactly the people the loop depends on.
//
// New emails should link straight to the contractor portal — `crewRouteUrl` in
// `src/lib/links.ts` is the one place that builds it.

import { redirect } from "next/navigation";
import { crewRouteUrl } from "@/lib/links";

export default async function CrewRoutePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  redirect(crewRouteUrl(id));
}
