"use client";
import { useConsole } from "@/lib/console/store";
import { rowStyle, severitySegments, evidenceLine, displayName, priority } from "@/lib/console/derive";
import type { Pothole } from "@/lib/data/types";

export function QueueRow({ p, height }: { p: Pothole; height: number }) {
  const linked = useConsole((s) => s.linkedId === p.id);
  const selected = useConsole((s) => s.selected.includes(p.id));
  const link = useConsole((s) => s.link);
  const pin = useConsole((s) => s.pin);
  const st = rowStyle(p, { linked, selected });
  const segs = severitySegments(p.severity);
  return (
    <div
      data-row-id={p.id}
      role="option"
      aria-selected={selected}
      className="flex items-center gap-3 px-4 border-b border-ink-7 cursor-pointer"
      style={{ height, boxShadow: `inset 3px 0 0 ${st.mark}`, background: st.bg, transition: "background var(--dur-tint) linear" }}
      onMouseEnter={() => link(p.id, "row")}
      onClick={() => pin(p.id)}
    >
      <div className="flex-1 min-w-0">
        <div className="flex items-baseline gap-2">
          <span className="text-[15px] font-medium whitespace-nowrap overflow-hidden text-ellipsis">{displayName(p)}</span>
          <span className="text-[11px] text-ink-45 tabular">{p.ref}</span>
        </div>
        <div className="mt-[2px] text-[12px] text-ink-58 tabular">{evidenceLine(p)}</div>
      </div>
      <div className="flex gap-[2px] items-center" aria-label={`Severity ${p.severity.toFixed(2)}`}>
        {segs.map((on, i) => <i key={i} className="block w-[9px] h-[5px] rounded-[2px]" style={{ background: on ? st.mark : "var(--ink-12)" }} />)}
      </div>
      <div className="w-[42px] text-right font-heading text-[18px] tabular" style={{ color: st.priColor }}>{priority(p).toFixed(1)}</div>
    </div>
  );
}
