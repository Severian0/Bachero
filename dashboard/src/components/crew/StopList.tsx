"use client";

import type { CrewStop } from "@/lib/crew/plan";
import type { WorkOrderStatus } from "@/lib/types";
import { hhmm } from "@/lib/console/format";

/** Every stop in driving order. Done ones are struck through, the current one is bold. */
export function StopList({
  stops,
  statuses,
  currentId,
}: {
  stops: CrewStop[];
  statuses: Record<string, WorkOrderStatus>;
  currentId: string | null;
}) {
  return (
    <ol style={{ margin: 0, padding: 0, listStyle: "none", display: "grid" }}>
      {stops.map((s, i) => {
        const done = statuses[s.work_order_id] === "done";
        const label = s.road_name ?? `${s.lat.toFixed(4)}, ${s.lng.toFixed(4)}`;
        return (
          <li
            key={s.work_order_id}
            style={{
              display: "flex", alignItems: "center", gap: "var(--s3)",
              padding: "var(--s2) 0",
              borderBottom: i === stops.length - 1 ? "none" : "1px solid var(--rule-soft)",
              opacity: done ? 0.55 : 1,
            }}
          >
            <span
              className="data"
              style={{
                width: 22, height: 22, flexShrink: 0, display: "grid", placeItems: "center",
                borderRadius: "var(--r-sm)", background: "var(--committed)",
                color: "var(--rail-ink)", fontSize: 11, fontWeight: 700,
              }}
            >
              {s.stop_order}
            </span>
            <span
              style={{
                flex: 1, minWidth: 0, fontSize: "var(--t-small)",
                fontWeight: s.work_order_id === currentId ? 600 : 400,
                textDecoration: done ? "line-through" : "none",
              }}
            >
              {label}
            </span>
            {s.eta && (
              <span className="data secondary" style={{ fontSize: 11 }}>
                eta {hhmm(s.eta)}
              </span>
            )}
          </li>
        );
      })}
    </ol>
  );
}
