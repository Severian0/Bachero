"use client";
import { useEffect, useMemo, useRef } from "react";
import { useConsole } from "@/lib/console/store";
import { visibleRows, FILTER_LABELS } from "@/lib/console/derive";
import { QueueRow } from "./QueueRow";

export function useVisibleRows() {
  const potholes = useConsole((s) => s.potholes);
  const filter = useConsole((s) => s.filter);
  return useMemo(() => visibleRows(Object.values(potholes), filter), [potholes, filter]);
}

export function QueueList() {
  const rows = useVisibleRows();
  const total = useConsole((s) => Object.values(s.potholes).filter((p) => p.status !== "false_positive").length);
  const filter = useConsole((s) => s.filter);
  const linkedId = useConsole((s) => s.linkedId);
  const linkSource = useConsole((s) => s.linkSource);
  const density = useConsole((s) => s.density);
  const loadState = useConsole((s) => s.loadState);
  const loadError = useConsole((s) => s.loadError);
  const listRef = useRef<HTMLDivElement>(null);
  const height = density === "compact" ? 46 : 58;

  // Scroll the linked row into view when the link came from the map or keyboard, by
  // adjusting the container's scrollTop only (never the page).
  useEffect(() => {
    if (!linkedId || linkSource === "row" || !listRef.current) return;
    const i = rows.findIndex((p) => p.id === linkedId);
    if (i < 0) return;
    const el = listRef.current;
    const top = i * height;
    if (top < el.scrollTop || top + height > el.scrollTop + el.clientHeight) {
      el.scrollTop = Math.max(0, top - el.clientHeight / 2 + height / 2);
    }
  }, [linkedId, linkSource, rows, height]);

  return (
    <>
      <div className="flex items-center justify-between px-4 py-3 border-b border-divider text-[12px] text-ink-58">
        <span className="font-semibold text-text">Repair queue</span>
        <span className="tabular">{rows.length} of {total} · sorted by priority</span>
      </div>
      <div ref={listRef} role="listbox" aria-label="Repair queue" className="overflow-y-auto min-h-0">
        {loadState === "loading" && [0, 1, 2, 3, 4].map((i) => <div key={i} className="mx-4 my-3 border border-divider" style={{ height: height - 24 }} aria-hidden />)}
        {loadState === "error" && (
          <div className="p-4 text-[13px] text-ink-72">
            Could not load the queue. {loadError}
            <div className="mt-3"><button type="button" className="btn btn-secondary" onClick={() => location.reload()}>Retry</button></div>
          </div>
        )}
        {loadState === "ready" && rows.length === 0 && <div className="p-4 text-[13px] text-ink-55">No {FILTER_LABELS[filter].toLowerCase()} potholes.</div>}
        {loadState === "ready" && rows.map((p) => <QueueRow key={p.id} p={p} height={height} />)}
      </div>
    </>
  );
}
