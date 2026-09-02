"use client";

import { useEffect, useRef } from "react";
import { MOCK_KM_SCANNED } from "@/lib/fixtures";
import { evidenceLine, severityFill, STATUS_VISUAL } from "@/lib/visual";
import type { FilterKey, Pothole } from "@/lib/model";

const FILTERS: { key: FilterKey; label: string }[] = [
  { key: "all", label: "All" },
  { key: "confirmed", label: "Confirmed" },
  { key: "suspected", label: "Suspected" },
  { key: "scheduled", label: "Scheduled" },
];

export default function OperationsColumn({
  rows,
  counts,
  filter,
  onFilter,
  linkedId,
  routeIds,
  onLink,
  onOpen,
  routeKm,
  routeMinutes,
  onPlanRoute,
  onClearRoute,
}: {
  rows: Pothole[];
  counts: Record<FilterKey, number>;
  filter: FilterKey;
  onFilter: (f: FilterKey) => void;
  linkedId: string | null;
  routeIds: Set<string>;
  onLink: (id: string | null) => void;
  onOpen: (id: string) => void;
  routeKm: number;
  routeMinutes: number;
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

  return (
    <div style={{ display: "grid", gridTemplateRows: "auto auto auto minmax(0,1fr) auto", minHeight: 0, background: "var(--surface)" }}>
      {/* Measurements, each attached to the thing it measures. */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", borderBottom: "1px solid var(--rule-soft)" }}>
        <Metric value={String(counts.confirmed)} label="Confirmed, awaiting a route" tone="action" />
        <Metric value={String(counts.suspected)} label="Suspected, one vehicle" />
        <Metric value={MOCK_KM_SCANNED.toFixed(0)} unit="km" label="Network scanned today" last />
      </div>

      {/* Filter chips. These filter the map as well as the list. */}
      <div role="group" aria-label="Filter the repair queue" style={{ display: "flex", gap: 6, padding: "var(--s3) var(--s4)", borderBottom: "1px solid var(--rule-soft)" }}>
        {FILTERS.map(({ key, label }) => {
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
              {label}
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
        {rows.length === 0 ? (
          <p className="secondary" style={{ padding: "var(--s5) var(--s4)", margin: 0, fontSize: "var(--t-small)" }}>
            Nothing matches this filter. Choose All to see the whole queue.
          </p>
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
            {routeIds.size === 0
              ? "No repairs on the route"
              : `${routeIds.size} ${routeIds.size === 1 ? "repair" : "repairs"} on the route`}
          </p>
          <p className="secondary" style={{ margin: 0, fontSize: "var(--t-small)" }}>
            {routeIds.size === 0 ? (
              "Open a record to add it."
            ) : (
              <>
                <span className="data">{routeKm.toFixed(1)} km</span>, about{" "}
                <span className="data">{routeMinutes} min</span>.{" "}
                <button type="button" onClick={onClearRoute} style={{ border: 0, background: "none", padding: 0, color: "var(--action)", fontWeight: 600, cursor: "pointer", textDecoration: "underline", textUnderlineOffset: 3 }}>
                  Clear
                </button>
              </>
            )}
          </p>
        </div>
        <button type="button" className="btn btn-primary" disabled={routeIds.size === 0} onClick={onPlanRoute}>
          Plan route
        </button>
      </div>
    </div>
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
              {pothole.street}
            </span>
            <span className="data secondary" style={{ fontSize: 11, flexShrink: 0 }}>
              {pothole.ref}
            </span>
          </span>
          <span className="secondary" style={{ display: "block", marginTop: 1, fontSize: "var(--t-small)", lineHeight: 1.35 }}>
            {v.label}. {evidenceLine(pothole)}
          </span>
        </span>

        <span aria-label={`Severity ${pothole.severity} of 4`} style={{ display: "flex", gap: 2, flexShrink: 0 }}>
          {[1, 2, 3, 4].map((s) => (
            <i key={s} style={{ display: "block", width: 8, height: 16, borderRadius: 1, background: severityFill(pothole.severity, s <= pothole.severity) }} />
          ))}
        </span>

        <span className="data" style={{ width: 26, textAlign: "right", fontSize: "var(--t-body)", fontWeight: 600, flexShrink: 0 }}>
          {pothole.priority}
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
