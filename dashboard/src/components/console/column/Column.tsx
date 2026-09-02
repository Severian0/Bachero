"use client";
import { StatCells } from "./StatCells";
import { FilterChips } from "./FilterChips";
import { QueueList } from "./QueueList";
import { Inspector } from "./Inspector";
import { Footer } from "./Footer";

export function Column() {
  return (
    <aside className="grid min-h-0 bg-bg" style={{ gridTemplateRows: "auto auto auto minmax(0,1fr) auto auto auto auto" }}>
      <StatCells />
      <FilterChips />
      <QueueList />
      <Inspector />
      <Footer />
    </aside>
  );
}
