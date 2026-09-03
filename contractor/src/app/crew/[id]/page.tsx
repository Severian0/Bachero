// One crew's routes and performance. `params` is a Promise in Next 16.

import { CrewScreen } from "@/components/board/CrewScreen";

export default async function CrewPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <CrewScreen crewId={id} />;
}
