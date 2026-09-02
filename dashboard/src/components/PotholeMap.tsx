"use client";

import { useEffect, useMemo, useState } from "react";
import { useMapEngine, type MapStatus } from "@/lib/useMapEngine";
import { LONDON_BOUNDS } from "@/lib/fixtures";
import { pinSize, STATUS_VISUAL } from "@/lib/visual";
import type { Pothole, Vehicle } from "@/lib/model";

export default function PotholeMap({
  potholes,
  inFilter,
  vehicles,
  linkedId,
  openId,
  routeIds,
  onLink,
  onOpen,
}: {
  potholes: Pothole[];
  /** Ids matching the active filter. Others stay on the map, stepped back. */
  inFilter: Set<string>;
  vehicles: Vehicle[];
  linkedId: string | null;
  openId: string | null;
  routeIds: Set<string>;
  onLink: (id: string | null) => void;
  onOpen: (id: string) => void;
}) {
  const { setContainer, status, version, project, panTo, fitBounds, zoomBy } = useMapEngine();

  // Projection reads the live camera, so it runs in an effect and its result
  // is held in state. Rendering straight from the camera would read a moving
  // value during render.
  const [screen, setScreen] = useState<Record<string, { x: number; y: number }>>({});
  const points = useMemo(
    () => [
      ...potholes.map((p) => ({ id: p.id, lat: p.lat, lng: p.lng })),
      ...vehicles.map((v) => ({ id: v.id, lat: v.lat, lng: v.lng })),
    ],
    [potholes, vehicles],
  );

  useEffect(() => {
    // One projection per animation frame, so a drag re-projects at the same
    // rate the basemap itself repaints instead of once per camera event.
    const id = requestAnimationFrame(() => {
      const next: Record<string, { x: number; y: number }> = {};
      for (const pt of points) {
        const at = project(pt.lat, pt.lng);
        if (at) next[pt.id] = at;
      }
      setScreen(next);
    });
    return () => cancelAnimationFrame(id);
  }, [points, version, project]);

  // Bring the opened record into view rather than leaving the operator to
  // hunt for a pin that is off screen.
  useEffect(() => {
    if (!openId) return;
    const p = potholes.find((x) => x.id === openId);
    if (p) panTo(p.lat, p.lng);
  }, [openId, potholes, panTo]);

  const linked = potholes.find((p) => p.id === linkedId) ?? null;
  const linkedAt = linked ? (screen[linked.id] ?? null) : null;

  return (
    <section
      style={{
        position: "relative",
        minWidth: 0,
        background: "var(--canvas)",
        borderRight: "1px solid var(--rule)",
      }}
    >
      <div ref={setContainer} style={{ position: "absolute", inset: 0 }} />

      {/* Crosshair for the linked record. This is how you find one pin among
          two hundred, and it prints the coordinate the operator quotes. */}
      {linkedAt && linked && (
        <div style={{ position: "absolute", inset: 0, pointerEvents: "none", zIndex: 20 }}>
          <div style={{ position: "absolute", top: 0, bottom: 0, left: linkedAt.x, width: 1, background: "var(--action)", opacity: 0.45 }} />
          <div style={{ position: "absolute", left: 0, right: 0, top: linkedAt.y, height: 1, background: "var(--action)", opacity: 0.45 }} />
          <div
            className="data"
            style={{
              position: "absolute",
              top: 12,
              left: linkedAt.x,
              transform: "translateX(8px)",
              padding: "3px 7px",
              borderRadius: "var(--r-sm)",
              background: "var(--rail)",
              color: "var(--rail-ink)",
              fontSize: 11,
              whiteSpace: "nowrap",
            }}
          >
            {linked.lat.toFixed(4)}, {linked.lng.toFixed(4)}
          </div>
        </div>
      )}

      {/* Pins. Squares, sized honestly by severity, above everything the
          basemap draws. */}
      <div style={{ position: "absolute", inset: 0, pointerEvents: "none", zIndex: 30 }}>
        {potholes.map((p) => {
          const at = screen[p.id];
          if (!at) return null;
          const v = STATUS_VISUAL[p.status];
          const isLinked = p.id === linkedId;
          const isOpen = p.id === openId;
          const onRoute = routeIds.has(p.id);
          const dim = !inFilter.has(p.id);
          const size = pinSize(p.severity);

          return (
            <button
              key={p.id}
              type="button"
              aria-label={`${p.street}, ${p.ref}. ${v.label}, severity ${p.severity} of 4. Open record.`}
              onMouseEnter={() => onLink(p.id)}
              onMouseLeave={() => onLink(null)}
              onFocus={() => onLink(p.id)}
              onBlur={() => onLink(null)}
              onClick={() => onOpen(p.id)}
              style={{
                position: "absolute",
                left: at.x,
                top: at.y,
                width: 44,
                height: 44,
                marginLeft: -22,
                marginTop: -22,
                display: "grid",
                placeItems: "center",
                border: 0,
                background: "transparent",
                padding: 0,
                cursor: "pointer",
                pointerEvents: "auto",
                zIndex: isOpen ? 60 : isLinked ? 50 : onRoute ? 40 : 30,
                opacity: dim ? 0.28 : 1,
                transition: "opacity 160ms linear",
              }}
            >
              <span
                style={{
                  display: "grid",
                  placeItems: "center",
                  width: size,
                  height: size,
                  borderRadius: 3,
                  background: v.fill,
                  border: `1.5px solid ${v.stroke}`,
                  boxShadow: onRoute
                    ? "0 0 0 3px var(--committed), 0 1px 3px rgb(11 12 12 / .35)"
                    : isOpen || isLinked
                      ? "0 0 0 3px rgb(29 112 184 / .35), 0 1px 3px rgb(11 12 12 / .3)"
                      : "0 1px 2px rgb(11 12 12 / .28)",
                  opacity: v.opacity,
                  transform: isOpen ? "scale(1.35)" : isLinked ? "scale(1.22)" : "none",
                  transition: "transform 200ms var(--ease), box-shadow 120ms linear",
                }}
              >
                {p.stopOrder !== null && (
                  <span className="data" style={{ fontSize: 10, fontWeight: 700, color: "#fff", lineHeight: 1 }}>
                    {p.stopOrder}
                  </span>
                )}
              </span>
            </button>
          );
        })}

        {/* Fleet. Interpolated, because a jumping dot reads as a bug. */}
        {vehicles.map((veh) => {
          const at = screen[veh.id];
          if (!at) return null;
          return (
            <div
              key={veh.id}
              style={{
                position: "absolute",
                left: at.x,
                top: at.y,
                transform: "translate(-50%, -50%)",
                display: "flex",
                alignItems: "center",
                gap: 6,
                zIndex: 35,
              }}
            >
              <span style={{ width: 10, height: 10, borderRadius: "50%", background: "var(--rail)", border: "2px solid #fff", boxShadow: "var(--shadow-1)" }} />
              <span
                className="data"
                style={{
                  fontSize: 10,
                  padding: "2px 5px",
                  borderRadius: "var(--r-sm)",
                  background: "var(--rail)",
                  color: "var(--rail-ink)",
                  whiteSpace: "nowrap",
                }}
              >
                {veh.label}
              </span>
            </div>
          );
        })}
      </div>

      <MapControls
        onZoomIn={() => zoomBy(1)}
        onZoomOut={() => zoomBy(-1)}
        onFit={() => fitBounds(LONDON_BOUNDS)}
      />
      <Legend />

      {status !== "ready" && <MapStatusPanel status={status} />}
    </section>
  );
}

function MapControls({
  onZoomIn,
  onZoomOut,
  onFit,
}: {
  onZoomIn: () => void;
  onZoomOut: () => void;
  onFit: () => void;
}) {
  return (
    <div
      style={{
        position: "absolute",
        top: "var(--s4)",
        right: "var(--s4)",
        zIndex: 50,
        display: "grid",
        gap: "var(--s2)",
        justifyItems: "end",
      }}
    >
      <div
        style={{
          display: "grid",
          background: "var(--surface)",
          border: "1px solid var(--rule)",
          borderRadius: "var(--r-md)",
          boxShadow: "var(--shadow-1)",
          overflow: "hidden",
        }}
      >
        <IconButton label="Zoom in" onClick={onZoomIn}>
          <path d="M8 3.5v9M3.5 8h9" />
        </IconButton>
        <span style={{ height: 1, background: "var(--rule-soft)" }} />
        <IconButton label="Zoom out" onClick={onZoomOut}>
          <path d="M3.5 8h9" />
        </IconButton>
      </div>
      <button type="button" className="btn btn-secondary btn-sm" onClick={onFit} style={{ boxShadow: "var(--shadow-1)" }}>
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

const LEGEND: { label: string; note: string; fill: string; stroke: string; size: number }[] = [
  { label: "Suspected", note: "one vehicle", fill: "var(--surface)", stroke: "var(--ink-2)", size: 14 },
  { label: "Confirmed", note: "corroborated", fill: "var(--action)", stroke: "var(--action)", size: 16 },
  { label: "Scheduled", note: "on a crew route", fill: "var(--committed)", stroke: "var(--committed)", size: 16 },
  { label: "Repaired", note: "closed today", fill: "var(--surface)", stroke: "var(--rule)", size: 14 },
];

function Legend() {
  return (
    <div
      style={{
        position: "absolute",
        left: "var(--s4)",
        bottom: "var(--s4)",
        zIndex: 50,
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
        {LEGEND.map((l) => (
          <div key={l.label} style={{ display: "flex", alignItems: "center", gap: "var(--s2)" }}>
            <span
              aria-hidden
              style={{
                width: l.size,
                height: l.size,
                flexShrink: 0,
                borderRadius: 3,
                background: l.fill,
                border: `1.5px solid ${l.stroke}`,
              }}
            />
            <dt style={{ fontSize: "var(--t-small)", fontWeight: 600 }}>{l.label}</dt>
            <dd className="secondary" style={{ margin: 0, fontSize: "var(--t-small)" }}>
              {l.note}
            </dd>
          </div>
        ))}
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
function MapStatusPanel({ status }: { status: MapStatus }) {
  const copy: Record<Exclude<MapStatus, "ready">, { title: string; body: string }> = {
    loading: {
      title: "Loading road network",
      body: "Detections appear as soon as the basemap is drawn.",
    },
    "no-key": {
      title: "Basemap not configured",
      body: "Set NEXT_PUBLIC_GOOGLE_MAPS_API_KEY in .env.local and reload. The repair queue is unaffected.",
    },
    failed: {
      title: "Basemap unavailable",
      body: "The Google Maps service did not respond. The repair queue is unaffected; reload to retry the map.",
    },
  };
  const { title, body } = copy[status as Exclude<MapStatus, "ready">];

  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
        display: "grid",
        placeItems: "center",
        padding: "var(--s5)",
        background: "var(--canvas)",
        zIndex: 70,
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
