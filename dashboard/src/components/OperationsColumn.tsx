"use client";

import { useEffect, useRef } from "react";
import {
  displayName, evidenceLine, priority, severityGrade, type ChipFilter,
  FILTER_CYCLE, FILTER_LABELS,
} from "@/lib/console/derive";
import { km as kmOf, minutes as minutesOf } from "@/lib/console/format";
import { severityFill, STATUS_VISUAL } from "@/lib/console/visual";
import type { Pothole } from "@/lib/data/types";

/** What the console has committed to a crew, once the solver has answered. */
export interface PlannedRoute {
  stops: number;
  km: number;
  minutes: number;
}

export default function OperationsColumn({
  rows,
  counts,
  filter,
  onFilter,
  linkedId,
  routeIds,
  onLink,
  onOpen,
  kmToday,
  estimatedMinutes,
  crewName,
  areaCount,
  loadState,
  loadError,
  onRetry,
  canPlan,
  planning,
  planned,
  onPlanRoute,
  onClearRoute,
}: {
  rows: Pothole[];
  counts: Record<ChipFilter, number>;
  filter: ChipFilter;
  onFilter: (f: ChipFilter) => void;
  linkedId: string | null;
  routeIds: Set<string>;
  onLink: (id: string | null) => void;
  onOpen: (id: string) => void;
  /** Network the fleet has covered today, from the live source. */
  kmToday: number;
  /** The console's own estimate for the current selection, before a plan. */
  estimatedMinutes: number;
  crewName: string;
  /** Open potholes inside the drawn plan area, or `null` when none is drawn. */
  areaCount: number | null;
  loadState: "loading" | "ready" | "error";
  loadError?: string;
  onRetry: () => void;
  canPlan: boolean;
  planning: boolean;
  planned: PlannedRoute | null;
  onPlanRoute: () => void;
  onClearRoute: () => void;
}) {
  const listRef = useRef<HTMLDivElement>(null);

  // Bring the linked row into view by moving the container's own scroll
  // offset, never by yanking the page.
  useEffect(() => {
    if (!linkedId || !listRef.current) return;
    listRef.current
      .querySelector<HTMLElement>(`[data-row="${linkedId}"]`)
      ?.scrollIntoView({ block: "nearest" });
  }, [linkedId]);

  const n = routeIds.size;

  return (
    <div style={{ display: "grid", gridTemplateRows: "auto auto auto minmax(0,1fr) auto", minHeight: 0, background: "var(--surface)" }}>
      {/* Measurements, each attached to the thing it measures. */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", borderBottom: "1px solid var(--rule-soft)" }}>
        <Metric value={String(counts.confirmed)} label="Confirmed, awaiting a route" tone="action" />
        <Metric value={String(counts.suspected)} label="Suspected, one vehicle" />
        <Metric value={kmToday.toFixed(0)} unit="km" label="Network scanned today" last />
      </div>

      {/* Filter chips. These filter the map as well as the list. */}
      <div role="group" aria-label="Filter the repair queue" style={{ display: "flex", gap: 6, padding: "var(--s3) var(--s4)", borderBottom: "1px solid var(--rule-soft)" }}>
        {FILTER_CYCLE.map((key) => {
          const on = filter === key;
          return (
            <button
              key={key}
              type="button"
              aria-pressed={on}
              onClick={() => onFilter(key)}
              style={{
                flex: 1,
                height: 30,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: 5,
                fontSize: "var(--t-small)",
                fontWeight: 600,
                cursor: "pointer",
                borderRadius: "var(--r-md)",
                border: `1px solid ${on ? "var(--action)" : "var(--rule)"}`,
                background: on ? "var(--action)" : "var(--surface)",
                color: on ? "var(--action-ink)" : "var(--ink)",
                transition: "background 120ms linear, border-color 120ms linear",
              }}
            >
              {FILTER_LABELS[key]}
              <span className="data" style={{ fontSize: 11, opacity: on ? 0.85 : 0.6 }}>
                {counts[key]}
              </span>
            </button>
          );
        })}
      </div>

      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", padding: "var(--s2) var(--s4)", borderBottom: "1px solid var(--rule-soft)", background: "var(--canvas)" }}>
        <h2 className="micro">Repair queue</h2>
        <p className="secondary" style={{ margin: 0, fontSize: "var(--t-small)" }}>
          {rows.length} shown, highest priority first
        </p>
      </div>

      <div ref={listRef} style={{ overflowY: "auto", minHeight: 0 }}>
        {loadState === "error" ? (
          <div style={{ display: "grid", gap: "var(--s3)", justifyItems: "start", padding: "var(--s5) var(--s4)" }}>
            <p className="secondary" style={{ margin: 0, fontSize: "var(--t-small)" }}>
              Could not load the queue. {loadError}
            </p>
            <button type="button" className="btn btn-secondary" onClick={onRetry}>
              Retry
            </button>
          </div>
        ) : rows.length === 0 ? (
          // An empty queue and a queue that has not arrived yet are different
          // facts. Only the first gets a sentence; the second holds the space.
          loadState === "ready" ? (
            <p className="secondary" style={{ padding: "var(--s5) var(--s4)", margin: 0, fontSize: "var(--t-small)" }}>
              Nothing matches this filter. Choose All to see the whole queue.
            </p>
          ) : (
            <div aria-hidden>
              {[0, 1, 2].map((i) => (
                <div key={i} style={{ height: 58, borderBottom: "1px solid var(--rule-soft)" }} />
              ))}
            </div>
          )
        ) : (
          <ul style={{ margin: 0, padding: 0, listStyle: "none" }}>
            {rows.map((r) => (
              <QueueRow
                key={r.id}
                pothole={r}
                linked={r.id === linkedId}
                onRoute={routeIds.has(r.id)}
                onLink={onLink}
                onOpen={onOpen}
              />
            ))}
          </ul>
        )}
      </div>

      {/* The route bar always states what is committed and what it costs. */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "var(--s3)", padding: "var(--s3) var(--s4)", borderTop: "1px solid var(--rule)", background: "var(--canvas)" }}>
        <div style={{ minWidth: 0 }}>
          <p style={{ margin: 0, fontSize: "var(--t-small)", fontWeight: 600 }}>
            {planned
              ? `Route planned · ${planned.stops} stops · ${kmOf(planned.km)} · ${minutesOf(planned.minutes)}`
              : n === 0
                ? "No repairs on the route"
                : `${n} selected for tomorrow`}
          </p>
          <p className="secondary" style={{ margin: 0, fontSize: "var(--t-small)" }}>
            {planned ? (
              <Clear onClearRoute={onClearRoute} />
            ) : areaCount !== null ? (
              // Drawing an area switches the planner to Best N. Say so here, or
              // the only evidence of the change is a rectangle on the map.
              <>
                Area drawn · <span className="data">{areaCount}</span> in area · Best N ·{" "}
                <Clear onClearRoute={onClearRoute} />
              </>
            ) : n === 0 ? (
              "Open a record to add it."
            ) : (
              <>
                <span className="data">~{estimatedMinutes} min</span> including travel · crew {crewName}.{" "}
                <Clear onClearRoute={onClearRoute} />
              </>
            )}
          </p>
        </div>
        <button type="button" className="btn btn-primary" disabled={!canPlan || planning} onClick={onPlanRoute}>
          {planning ? "Planning…" : planned ? "Open route" : "Plan route"}
        </button>
      </div>
    </div>
  );
}

function Clear({ onClearRoute }: { onClearRoute: () => void }) {
  return (
    <button
      type="button"
      onClick={onClearRoute}
      style={{ border: 0, background: "none", padding: 0, color: "var(--action)", fontWeight: 600, cursor: "pointer", textDecoration: "underline", textUnderlineOffset: 3 }}
    >
      Clear
    </button>
  );
}

function QueueRow({
  pothole,
  linked,
  onRoute,
  onLink,
  onOpen,
}: {
  pothole: Pothole;
  linked: boolean;
  onRoute: boolean;
  onLink: (id: string | null) => void;
  onOpen: (id: string) => void;
}) {
  const v = STATUS_VISUAL[pothole.status];
  const grade = severityGrade(pothole.severity);
  return (
    <li data-row={pothole.id}>
      <button
        type="button"
        onMouseEnter={() => onLink(pothole.id)}
        onMouseLeave={() => onLink(null)}
        onFocus={() => onLink(pothole.id)}
        onBlur={() => onLink(null)}
        onClick={() => onOpen(pothole.id)}
        style={{
          width: "100%",
          display: "flex",
          alignItems: "center",
          gap: "var(--s3)",
          minHeight: 58,
          padding: "var(--s2) var(--s4)",
          textAlign: "left",
          border: 0,
          borderBottom: "1px solid var(--rule-soft)",
          borderLeft: `3px solid ${onRoute ? "var(--committed)" : v.mark}`,
          background: onRoute ? "var(--committed-soft)" : linked ? "var(--canvas)" : "var(--surface)",
          opacity: pothole.status === "repaired" ? 0.62 : 1,
          cursor: "pointer",
          transition: "background 120ms linear",
        }}
      >
        <span style={{ flex: 1, minWidth: 0 }}>
          <span style={{ display: "flex", alignItems: "baseline", gap: "var(--s2)" }}>
            <span style={{ fontSize: "var(--t-body)", fontWeight: 600, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
              {displayName(pothole)}
            </span>
            <span className="data secondary" style={{ fontSize: 11, flexShrink: 0 }}>
              {pothole.ref}
            </span>
          </span>
          <span className="secondary" style={{ display: "block", marginTop: 1, fontSize: "var(--t-small)", lineHeight: 1.35 }}>
            {evidenceLine(pothole)}
          </span>
        </span>

        <span aria-label={`Severity ${grade} of 4`} style={{ display: "flex", gap: 2, flexShrink: 0 }}>
          {[1, 2, 3, 4].map((s) => (
            <i key={s} style={{ display: "block", width: 8, height: 16, borderRadius: 1, background: severityFill(grade, s <= grade) }} />
          ))}
        </span>

        <span className="data" style={{ width: 26, textAlign: "right", fontSize: "var(--t-body)", fontWeight: 600, flexShrink: 0 }}>
          {priority(pothole).toFixed(1)}
        </span>
      </button>
    </li>
  );
}

function Metric({
  value,
  unit,
  label,
  tone,
  last,
}: {
  value: string;
  unit?: string;
  label: string;
  tone?: "action";
  last?: boolean;
}) {
  return (
    <div style={{ padding: "var(--s3) var(--s4)", borderRight: last ? "none" : "1px solid var(--rule-soft)" }}>
      <p
        className="data"
        style={{
          margin: 0,
          fontSize: "var(--t-metric)",
          fontWeight: 600,
          lineHeight: 1.05,
          letterSpacing: "-0.03em",
          color: tone === "action" ? "var(--action)" : "var(--ink)",
        }}
      >
        {value}
        {unit && (
          <span className="secondary" style={{ fontSize: "var(--t-small)", fontWeight: 500, marginLeft: 3 }}>
            {unit}
          </span>
        )}
      </p>
      <p className="secondary" style={{ margin: "4px 0 0", fontSize: "var(--t-small)", lineHeight: 1.3 }}>
        {label}
      </p>
    </div>
  );
}
