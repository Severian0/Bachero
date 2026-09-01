// Crew page — docs/ARCHITECTURE.md §6. Login-free, mobile-first.
// Fetches route_plans_map?id=eq.{id}&select=*,crew:crews(*),work_orders(*,pothole:potholes_map(*))
// and PATCHes work_orders for "arrived" (in_progress) and "done".
export default async function CrewRoutePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return (
    <main className="p-4">
      <h1 className="text-xl font-semibold">Route {id}</h1>
      <p className="text-sm text-ink-55">Crew page — not implemented yet.</p>
    </main>
  );
}
