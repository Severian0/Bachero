"use client";
import { useConsole } from "@/lib/console/store";
import { inspectorLines } from "@/lib/console/derive";

export function Inspector() {
  const id = useConsole((s) => s.linkedId);
  const p = useConsole((s) => (id ? s.potholes[id] : undefined));
  const selected = useConsole((s) => (id ? s.selected.includes(id) : false));
  const l = p ? inspectorLines(p) : null;
  return (
    <div className="px-4 py-3 border-t border-divider bg-ink-3" style={{ minHeight: "var(--console-inspector-min-h)" }}>
      <div className="panel-label">Evidence</div>
      {p && l ? (
        <div className="mt-2">
          <div className="flex items-baseline justify-between gap-3">
            <span className="font-heading text-[20px] leading-tight">{l.title}</span>
            <span className="tag tag-outline">{l.status}</span>
          </div>
          <div className="mt-1 text-[13px] leading-snug text-ink-72 tabular">{l.line1}</div>
          <div className="text-[13px] leading-snug text-ink-72 tabular">{l.line2}</div>
          <div className="mt-1 text-[12px] leading-snug text-ink-55">
            {selected ? "In tomorrow’s route. Enter removes it." : p.status === "suspected" ? "One vehicle only. A second pass by another vehicle confirms it." : "Click for details. Enter adds it to tomorrow’s route."}
          </div>
        </div>
      ) : (
        <div className="mt-3 text-[13px] leading-relaxed text-ink-55 max-w-[34ch]">
          Point at a queue row or a marker to link the two. Arrow keys move the link, Enter adds it to tomorrow’s route.
        </div>
      )}
    </div>
  );
}
