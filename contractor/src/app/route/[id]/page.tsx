// The job screen. `params` is a Promise in Next 16.

import { RouteScreen } from "@/components/route/RouteScreen";

export default async function RoutePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <RouteScreen routeId={id} />;
}
