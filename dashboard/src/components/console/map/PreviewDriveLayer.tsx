"use client";

import { useEffect, useMemo } from "react";
import { Marker } from "react-map-gl/maplibre";
import { useConsole } from "@/lib/console/store";
import { buildTrack } from "@/lib/crew/along";
import { usePlayback } from "@/components/crew/usePlayback";
import type { RouteStep } from "@/lib/types";

/**
 * The console's mount of the crew playback (spec section 9): same hook, same
 * track, different store. Deliberately smaller than the crew page - marker,
 * countdown and instruction only; the dispatcher is reading a proposal, not
 * driving it.
 */
export function PreviewDriveLayer() {
  const plan = useConsole((s) => s.plan);
  const previewDrive = useConsole((s) => s.previewDrive);
  if (!plan || !previewDrive) return null;
  return (
    <PreviewDrive
      path={plan.path.coordinates}
      steps={plan.steps}
      totalMinutes={plan.total_minutes}
    />
  );
}

function PreviewDrive({
  path,
  steps,
  totalMinutes,
}: {
  path: [number, number][];
  steps: RouteStep[];
  totalMinutes: number;
}) {
  const setPreviewDrive = useConsole((s) => s.setPreviewDrive);
  const setSheetOpen = useConsole((s) => s.setSheetOpen);
  const track = useMemo(() => buildTrack(path, steps), [path, steps]);
  const playback = usePlayback(track, totalMinutes);
  const reducedMotion =
    typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  // Autoplay on mount: the layer only exists while previewDrive is true.
  const { play } = playback;
  useEffect(() => {
    if (!reducedMotion) play();
    // play is stable per mount; run once.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const stop = () => {
    setPreviewDrive(false);
    setSheetOpen(true);
  };

  return (
    <>
      {!reducedMotion && (
        <Marker longitude={playback.position[0]} latitude={playback.position[1]} anchor="center" style={{ zIndex: 60 }}>
          <div
            aria-label="Preview vehicle"
            style={{
              width: 14, height: 14, borderRadius: "var(--r-full)",
              background: "var(--action)", border: "2px solid var(--surface)",
              boxShadow: "var(--shadow-1)",
            }}
          />
        </Marker>
      )}
      <div
        style={{
          position: "absolute", top: "var(--s4)", left: "50%", transform: "translateX(-50%)",
          zIndex: 70, display: "flex", alignItems: "center", gap: "var(--s3)",
          padding: "var(--s2) var(--s4)", background: "var(--surface)",
          border: "1px solid var(--rule)", borderRadius: "var(--r-md)", boxShadow: "var(--shadow-2)",
        }}
      >
        <span className="data" style={{ fontSize: "var(--t-small)", fontWeight: 600 }}>
          about {Math.ceil(playback.minutesLeft)} min left
        </span>
        <span style={{ fontSize: "var(--t-small)" }}>
          {reducedMotion
            ? "Motion is reduced. The route and its stops are shown without animation."
            : playback.step?.instruction ?? "Following the route"}
        </span>
        <button type="button" className="btn btn-quiet btn-sm" onClick={stop}>
          Stop preview
        </button>
      </div>
    </>
  );
}
