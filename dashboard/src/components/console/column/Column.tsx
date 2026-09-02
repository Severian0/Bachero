"use client";
import { useConsole } from "@/lib/console/store";
import { StatCells } from "./StatCells";
import { FilterChips } from "./FilterChips";
import { QueueList } from "./QueueList";
import { Inspector } from "./Inspector";
import { DetailPanel } from "./DetailPanel";
import { Planner } from "./Planner";
import { UndoToast } from "./UndoToast";
import { Footer } from "./Footer";

export function Column() {
  const pinnedId = useConsole((s) => s.pinnedId);
  return (
    // 8 tracks: stats, chips, then QueueList's own header + list (2 children), the
    // inspector-or-detail slot, Planner (0 or 1 children — the spare `auto` track
    // collapses when it renders null), UndoToast (same), and the footer.
    <aside className="grid min-h-0 bg-bg" style={{ gridTemplateRows: "auto auto auto minmax(0,1fr) auto auto auto auto" }}>
      <StatCells />
      <FilterChips />
      <QueueList />
      {pinnedId ? <DetailPanel id={pinnedId} /> : <Inspector />}
      <Planner />
      <UndoToast />
      <Footer />
    </aside>
  );
}
