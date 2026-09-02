import type { Pothole } from "@/lib/data/types";
import type { ConsoleStore } from "./store";

const EDITABLE = new Set(["INPUT", "TEXTAREA", "SELECT"]);

export function handleKey(
  e: { key: string; target: EventTarget | null; preventDefault(): void }, s: ConsoleStore, rows: Pothole[],
): boolean {
  const tag = (e.target as { tagName?: string } | null)?.tagName;
  if (tag && EDITABLE.has(tag)) return false;

  if (e.key === "ArrowDown" || e.key === "ArrowUp") {
    if (!rows.length) return false;
    e.preventDefault();
    const i = rows.findIndex((p) => p.id === s.linkedId);
    const n = e.key === "ArrowDown" ? Math.min(rows.length - 1, i + 1) : Math.max(0, i < 0 ? 0 : i - 1);
    s.link(rows[n].id, "keys");
    return true;
  }
  if (e.key === "Enter") {
    if (!s.linkedId) return false;
    // Enter opens the record. Adding it to a route is a decision, and decisions
    // are made in the record, where the evidence for them is on screen.
    e.preventDefault();
    s.pin(s.linkedId);
    return true;
  }
  if (e.key === "Escape") {
    // One step back per press, outermost thing first.
    if (s.sheetOpen) s.setSheetOpen(false);
    else if (s.pinnedId) s.unpin();
    else if (s.linkedId) s.unlink();
    else s.clearSelection();
    return true;
  }
  if (e.key === "f" || e.key === "F") {
    s.cycleFilter();
    return true;
  }
  return false;
}
