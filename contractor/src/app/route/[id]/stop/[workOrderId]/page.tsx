// One stop on a route. `params` is a Promise in Next 16.

import { StopScreen } from "@/components/route/StopScreen";

export default async function StopPage({
  params,
}: {
  params: Promise<{ id: string; workOrderId: string }>;
}) {
  const { id, workOrderId } = await params;
  return <StopScreen routeId={id} workOrderId={workOrderId} />;
}
