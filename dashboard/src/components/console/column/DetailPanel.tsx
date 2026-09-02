"use client";
import { useConsole } from "@/lib/console/store";
import { inspectorLines, isSelectable } from "@/lib/console/derive";
import { hhmm } from "@/lib/console/format";

const MAX_ROWS = 8;

export function DetailPanel({ id }: { id: string }) {
  const p = useConsole((s) => s.potholes[id]);
  const rows = useConsole((s) => s.detections[id]);
  const selected = useConsole((s) => s.selected.includes(id));
  const unpin = useConsole((s) => s.unpin);
  const toggle = useConsole((s) => s.toggleSelected);
  const dismiss = useConsole((s) => s.dismiss);
  if (!p) return null;
  const l = inspectorLines(p);
  const shown = rows?.slice(0, MAX_ROWS) ?? [];
  const more = (rows?.length ?? 0) - shown.length;

  return (
    <div className="px-4 py-3 border-t border-divider bg-ink-3 overflow-y-auto" style={{ minHeight: "var(--console-inspector-min-h)", maxHeight: "40vh" }}>
      <div className="flex items-center justify-between">
        <div className="panel-label">Evidence</div>
        <button type="button" className="btn btn-ghost btn-icon" aria-label="Close details" onClick={unpin}>×</button>
      </div>
      <div className="flex items-baseline justify-between gap-3 mt-1">
        <span className="font-heading text-[20px] leading-tight">{l.title}</span>
        <span className="tag tag-outline">{l.status}</span>
      </div>
      <div className="mt-1 text-[13px] leading-snug text-ink-72 tabular">{l.line1}</div>
      <div className="text-[13px] leading-snug text-ink-72 tabular">{l.line2}</div>

      {p.photo_url
        // eslint-disable-next-line @next/next/no-img-element
        ? <img src={p.photo_url} alt={`Latest photo of ${l.title}`} className="mt-3 w-full aspect-[4/3] object-cover border border-divider" />
        : <div className="mt-3 w-full aspect-[4/3] border border-divider flex items-center justify-center text-[12px] text-ink-45">No photo</div>}

      <table className="table mt-3 text-[12px]">
        <thead><tr><th>Time</th><th>Vehicle</th><th>Severity</th><th>Speed</th></tr></thead>
        <tbody>
          {rows === undefined && <tr><td colSpan={4}><div className="h-4 border border-divider" aria-hidden /></td></tr>}
          {rows && rows.length === 0 && <tr><td colSpan={4} className="text-ink-55">No detections recorded.</td></tr>}
          {shown.map((d) => (
            <tr key={d.id}>
              <td className="tabular">{hhmm(d.recorded_at)}</td>
              <td>{d.vehicle_label ?? d.vehicle_id.slice(0, 8)}</td>
              <td className="tabular">{d.severity.toFixed(2)}</td>
              <td className="tabular">{d.speed_mps == null ? "—" : `${(d.speed_mps * 3.6).toFixed(0)} km/h`}</td>
            </tr>
          ))}
          {more > 0 && <tr><td colSpan={4} className="text-ink-55">and {more} more</td></tr>}
        </tbody>
      </table>

      <div className="flex gap-2 mt-3">
        {isSelectable(p) && (
          <button type="button" className="btn btn-secondary" onClick={() => toggle(id)}>{selected ? "Remove from route" : "Add to route"}</button>
        )}
        {p.status !== "repaired" && (
          <button type="button" className="btn btn-ghost" onClick={() => dismiss(id)}>Dismiss as false positive</button>
        )}
      </div>
    </div>
  );
}
