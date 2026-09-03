"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useMap } from "react-map-gl/maplibre";
import { ConsoleMap, type MapStatus } from "./console/map/ConsoleMap";
import { MapLayers } from "./console/map/MapLayers";
import { useConsole } from "@/lib/console/store";
import { STATUS_VISUAL } from "@/lib/console/visual";
import { DEPOT } from "@/lib/data/synthetic";
import type { PotholeStatus } from "@/lib/types";

/**
 * The evidence, on the road network.
 *
 * The map holds no data of its own: every pin, vehicle and route line is read
 * from the console store, so the map and the queue beside it can never
 * disagree about what the fleet has seen. This file is only the composition —
 * the basemap, the layers over it, and the chrome around them.
 */
export default function PotholeMap() {
  const unlink = useConsole((s) => s.unlink);
  const [status, setStatus] = useState<MapStatus>("loading");

  // A tile failure is not a data failure, and the operator should not assume
  // the console is down, so `failed` is sticky and `ready` never overrides it.
  const onStatus = useCallback((s: MapStatus) => {
    setStatus((prev) => (prev === "failed" ? prev : s));
  }, []);

  return (
    <ConsoleMap
      onMapMouseLeave={unlink}
      onStatus={onStatus}
      overlay={
        <>
          <div style={{ position: "absolute", left: "var(--s4)", bottom: "var(--s4)", zIndex: 50, display: "grid", gap: "var(--s2)", justifyItems: "start" }}>
            <PlanNearestButton />
            <Legend />
          </div>
          {status !== "ready" && <MapStatusPanel status={status} />}
        </>
      }
    >
      <MapLayers />
      <PanToOpenRecord />
      <MapControls />
    </ConsoleMap>
  );
}

/**
 * Bring the opened record into view rather than leaving the operator to hunt
 * for a pin that is off screen. Once per record, so the camera does not fight
 * a pan the operator has just made.
 */
function PanToOpenRecord() {
  const { current: map } = useMap();
  const pinnedId = useConsole((s) => s.pinnedId);
  const potholes = useConsole((s) => s.potholes);
  const panned = useRef<string | null>(null);

  useEffect(() => {
    if (!map || !pinnedId) {
      panned.current = pinnedId;
      return;
    }
    if (panned.current === pinnedId) return;
    const p = potholes[pinnedId];
    if (!p) return;
    panned.current = pinnedId;
    map.panTo([p.lng, p.lat]);
  }, [map, pinnedId, potholes]);

  return null;
}

function MapControls() {
  const { current: map } = useMap();

  // Everything the fleet has found, plus the depot the crew starts from:
  // the whole night's work in one frame.
  const fitNetwork = () => {
    if (!map) return;
    const pts: [number, number][] = Object.values(useConsole.getState().potholes)
      .filter((p) => p.status !== "false_positive")
      .map((p) => [p.lng, p.lat]);
    pts.push(DEPOT);
    const lngs = pts.map((p) => p[0]);
    const lats = pts.map((p) => p[1]);
    map.fitBounds(
      [[Math.min(...lngs), Math.min(...lats)], [Math.max(...lngs), Math.max(...lats)]],
      { padding: 40, maxZoom: 15 },
    );
  };

  return (
    <div
      style={{
        position: "absolute", top: "var(--s4)", right: "var(--s4)", zIndex: 50,
        display: "grid", gap: "var(--s2)", justifyItems: "end",
      }}
    >
      <div
        style={{
          display: "grid", background: "var(--surface)", border: "1px solid var(--rule)",
          borderRadius: "var(--r-md)", boxShadow: "var(--shadow-1)", overflow: "hidden",
        }}
      >
        <IconButton label="Zoom in" onClick={() => map?.zoomIn()}>
          <path d="M8 3.5v9M3.5 8h9" />
        </IconButton>
        <span style={{ height: 1, background: "var(--rule-soft)" }} />
        <IconButton label="Zoom out" onClick={() => map?.zoomOut()}>
          <path d="M3.5 8h9" />
        </IconButton>
      </div>
      <button type="button" className="btn btn-secondary btn-sm" onClick={fitNetwork} style={{ boxShadow: "var(--shadow-1)" }}>
        Fit network
      </button>
    </div>
  );
}

function IconButton({
  label,
  onClick,
  children,
}: {
  label: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      onClick={onClick}
      style={{
        width: 34,
        height: 34,
        display: "grid",
        placeItems: "center",
        border: 0,
        background: "var(--surface)",
        cursor: "pointer",
      }}
    >
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="var(--ink)" strokeWidth="1.6" strokeLinecap="round" aria-hidden>
        {children}
      </svg>
    </button>
  );
}

/** One click: a depot loop to the nearest open defect, planned and shown. */
/**
 * The one-click fast path: a depot loop to the nearest open defect.
 *
 * Deliberately not called "Plan route". It discards the operator's selection
 * and forces manual mode, while the column's "Plan route" opens the sheet and
 * keeps everything they set up. Two buttons with one name, one of them
 * destructive, is a trap. It is also disabled once a plan exists, so it cannot
 * quietly replace a route that is about to be dispatched.
 */
function PlanNearestButton() {
  const planNearest = useConsole((s) => s.planNearest);
  const planState = useConsole((s) => s.planState);
  const busy = planState === "planning";
  const hasPlan = planState === "planned";
  return (
    <button
      type="button"
      className="btn btn-primary"
      style={{ boxShadow: "var(--shadow-1)" }}
      disabled={busy || hasPlan}
      title={hasPlan ? "Discard the current route first" : "Plan a loop to the nearest open defect"}
      onClick={() => void planNearest()}
    >
      {busy ? "Planning" : "Plan nearest"}
    </button>
  );
}

const LEGEND: { status: PotholeStatus; note: string; size: number }[] = [
  { status: "suspected", note: "one vehicle", size: 14 },
  { status: "confirmed", note: "corroborated", size: 16 },
  { status: "scheduled", note: "on a crew route", size: 16 },
  { status: "repaired", note: "closed today", size: 14 },
];

function Legend() {
  return (
    <div
      style={{
        padding: "var(--s3) var(--s4)",
        background: "var(--surface)",
        border: "1px solid var(--rule)",
        borderRadius: "var(--r-md)",
        boxShadow: "var(--shadow-1)",
      }}
    >
      <h2 className="micro secondary" style={{ marginBottom: "var(--s2)" }}>
        Key
      </h2>
      <dl style={{ display: "grid", gap: 6, margin: 0 }}>
        {LEGEND.map((l) => {
          const v = STATUS_VISUAL[l.status];
          return (
            <div key={l.status} style={{ display: "flex", alignItems: "center", gap: "var(--s2)" }}>
              <span
                aria-hidden
                style={{
                  width: l.size,
                  height: l.size,
                  flexShrink: 0,
                  borderRadius: "var(--r-sm)",
                  background: v.fill,
                  border: `1.5px solid ${v.stroke}`,
                  opacity: v.opacity,
                }}
              />
              <dt style={{ fontSize: "var(--t-small)", fontWeight: 600 }}>{v.label}</dt>
              <dd className="secondary" style={{ margin: 0, fontSize: "var(--t-small)" }}>
                {l.note}
              </dd>
            </div>
          );
        })}
      </dl>
      <p className="secondary" style={{ margin: "var(--s2) 0 0", paddingTop: "var(--s2)", borderTop: "1px solid var(--rule-soft)", fontSize: "var(--t-small)" }}>
        Marker size shows severity
      </p>
    </div>
  );
}

/**
 * What the map says when it has nothing to draw.
 *
 * A failure names what failed and what it does not affect, because the queue
 * beside it is still fully usable and the operator should not assume the
 * console is down.
 */
function MapStatusPanel({ status }: { status: Exclude<MapStatus, "ready"> }) {
  const copy: Record<Exclude<MapStatus, "ready">, { title: string; body: string }> = {
    loading: {
      title: "Loading road network",
      body: "Detections appear as soon as the basemap is drawn.",
    },
    failed: {
      title: "Basemap unavailable",
      body: "Pins are still placed by coordinate; the repair queue is unaffected.",
    },
  };
  const { title, body } = copy[status];
  // While the basemap is loading there is nothing under this panel worth
  // seeing, so it covers. Once tiles have failed the pins are still placed
  // correctly, so the notice sits at the top and leaves them visible.
  const covering = status === "loading";

  return (
    <div
      role={covering ? undefined : "status"}
      style={{
        position: "absolute",
        inset: covering ? 0 : "var(--s4) auto auto 50%",
        transform: covering ? undefined : "translateX(-50%)",
        display: "grid",
        placeItems: "center",
        padding: covering ? "var(--s5)" : "var(--s3) var(--s5)",
        background: covering ? "var(--canvas)" : "var(--surface)",
        border: covering ? undefined : "1px solid var(--rule)",
        borderRadius: covering ? undefined : "var(--r-md)",
        boxShadow: covering ? undefined : "var(--shadow-2)",
        zIndex: 70,
        pointerEvents: "none",
      }}
    >
      <div style={{ maxWidth: "42ch", textAlign: "center" }}>
        <h2 className="micro secondary" style={{ marginBottom: "var(--s2)" }}>
          Road network
        </h2>
        <p style={{ margin: 0, fontSize: "var(--t-lead)", fontWeight: 600 }}>{title}</p>
        <p className="secondary" style={{ margin: "var(--s2) 0 0", fontSize: "var(--t-small)", lineHeight: 1.5 }}>
          {body}
        </p>
      </div>
    </div>
  );
}
