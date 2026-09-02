import Console from "@/components/Console";
import { loadConsoleData } from "@/lib/potholes";

export default async function Page() {
  const data = await loadConsoleData();
  return <Console data={data} />;
}
