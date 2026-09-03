"use client";

import { useEffect, useMemo, useState } from "react";

import { Marker } from "react-map-gl/maplibre";
import { buildTrack } from "@/lib/crew/along";
import { usePlayback } from "./usePlayback";
import type { CrewPlan } from "@/lib/crew/plan";
import type { WorkOrderStatus } from "@/lib/types";
import { km, minutes } from "@/lib/console/format";
import { StopList } from "./StopList";
import { DriveMap } from "./DriveMap";
import { StopCard } from "./StopCard";

/**
 * The driver's screen. Mobile-first: header, map (Task 3), then a bottom
 * sheet with the current stop and the full list. Holds the page's only
 * client state; children take props and render.
 */
export default function CrewRoute({ plan }: { plan: CrewPlan }) {
  const [statuses, setStatuses] = useState<Record<string, WorkOrderStatus>>(() =>
    Object.fromEntries(plan.stops.map((s) => [s.work_order_id, s.status])),
  );
  const setStatus = (workOrderId: string, status: WorkOrderStatus) =>
    setStatuses((prev) => ({ ...prev, [workOrderId]: status }));
  const current = plan.stops.find((s) => statuses[s.work_order_id] !== "done") ?? null;

  const track = useMemo(() => buildTrack(plan.path, plan.steps), [plan.path, plan.steps]);
  const playback = usePlayback(track, plan.total_minutes ?? 0);
  const reducedMotion =
    typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  // Reduced motion: no moving marker; instead a highlight steps through the
  // stop list, one stop per second, using the same play/pause state.
  const [steppedIndex, setSteppedIndex] = useState<number | null>(null);
  useEffect(() => {
    // Past the last stop the run is over, so nothing further is scheduled.
    // Finishing is derived from the index rather than written back as state,
    // because setting state inside an effect body cascades renders.
    if (!reducedMotion || steppedIndex === null || steppedIndex >= plan.stops.length) return;
    const timer = setTimeout(() => setSteppedIndex((i) => (i === null ? null : i + 1)), 1000);
    return () => clearTimeout(timer);
  }, [reducedMotion, steppedIndex, plan.stops.length]);

  const stepping = steppedIndex !== null && steppedIndex < plan.stops.length;
  const previewActive = reducedMotion ? stepping : playback.km > 0;
  const togglePreview = () => {
    if (reducedMotion) {
      setSteppedIndex(stepping ? null : 0);
      return;
    }
    if (playback.playing) playback.pause();
    else playback.play();
  };

  const nextUndone = plan.stops.find((s) => statuses[s.work_order_id] !== "done");
  const fallbackLine = nextUndone
    ? `Next stop: ${nextUndone.road_name ?? `${nextUndone.lat.toFixed(4)}, ${nextUndone.lng.toFixed(4)}`}`
    : "All stops done";

  const totals = [
    `${plan.stops.length} ${plan.stops.length === 1 ? "stop" : "stops"}`,
    ...(plan.total_km === null ? [] : [km(plan.total_km)]),
    ...(plan.total_minutes === null ? [] : [minutes(plan.total_minutes)]),
  ].join(", ");

  return (
    <main style={{ height: "100dvh", display: "grid", gridTemplateRows: "auto 1fr auto", background: "var(--canvas)" }}>
      <header style={{ padding: "var(--s3) var(--s4)", background: "var(--surface)", borderBottom: "1px solid var(--rule)" }}>
        <h1 style={{ fontSize: "var(--t-title)", margin: 0, letterSpacing: "-0.015em" }}>{plan.crew_name}</h1>
        <p className="secondary" style={{ margin: 0, fontSize: "var(--t-small)" }}>
          <span className="data">{plan.plan_date}</span> · {totals}
        </p>
        <button
          type="button"
          className="btn btn-secondary btn-sm"
          style={{ marginTop: "var(--s2)" }}
          onClick={togglePreview}
        >
          {reducedMotion
            ? stepping ? "Stop preview" : "Preview drive"
            : playback.playing ? "Pause preview" : playback.km > 0 ? "Replay preview" : "Preview drive"}
        </button>
      </header>
      <DriveMap
        plan={plan}
        overlay={
          !reducedMotion && previewActive ? (
            <div
              style={{
                position: "absolute", top: "var(--s3)", left: "50%", transform: "translateX(-50%)",
                zIndex: 60, padding: "var(--s2) var(--s4)", maxWidth: "90%",
                background: "var(--surface)", border: "1px solid var(--rule)",
                borderRadius: "var(--r-md)", boxShadow: "var(--shadow-2)", textAlign: "center",
              }}
            >
              <p className="data" style={{ margin: 0, fontSize: "var(--t-small)", fontWeight: 600 }}>
                about {Math.ceil(playback.minutesLeft)} min left
              </p>
              <p style={{ margin: 0, fontSize: "var(--t-small)" }}>
                {playback.step?.instruction ?? fallbackLine}
              </p>
            </div>
          ) : undefined
        }
      >
        {!reducedMotion && previewActive && (
          <Marker longitude={playback.position[0]} latitude={playback.position[1]} anchor="center" style={{ zIndex: 60 }}>
            <div
              aria-label="Preview vehicle"
              style={{
                width: 14, height: 14, borderRadius: "var(--r-full)",
                background: "var(--committed)", border: "2px solid var(--surface)",
                boxShadow: "var(--shadow-1)",
              }}
            />
          </Marker>
        )}
      </DriveMap>
      <section
        style={{
          background: "var(--surface)", borderTop: "1px solid var(--rule)",
          padding: "var(--s3) var(--s4)", maxHeight: "45dvh", overflowY: "auto",
          display: "grid", gap: "var(--s3)", alignContent: "start",
        }}
      >
        {current ? (
          <StopCard
            key={current.work_order_id}
            stop={current}
            status={statuses[current.work_order_id]}
            onStatus={setStatus}
          />
        ) : (
          <p style={{ margin: 0, fontSize: "var(--t-small)", fontWeight: 600 }}>
            All stops are done. Head back to {plan.end.label === "Depot" ? "the depot" : plan.end.label}.
          </p>
        )}
        <StopList
          stops={plan.stops}
          statuses={statuses}
          currentId={reducedMotion && stepping ? plan.stops[steppedIndex]?.work_order_id ?? null : current?.work_order_id ?? null}
        />
      </section>
    </main>
  );
}
