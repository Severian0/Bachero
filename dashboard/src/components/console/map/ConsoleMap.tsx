"use client";
import { createContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import Map from "react-map-gl/maplibre";
import type { MapRef } from "react-map-gl/maplibre";
import { setWorkerUrl } from "maplibre-gl";

// MapLibre derives its worker URL from import.meta.url, which the bundler does
// not provide, so without this it spawns a worker from the page URL and the
// map never loads. scripts/copy-maplibre-worker.mjs puts the worker in public/.
if (typeof window !== "undefined") setWorkerUrl("/maplibre/maplibre-gl-worker.mjs");
import "maplibre-gl/dist/maplibre-gl.css";
import { buildMapStyle } from "@/lib/map/style";
import { readMapTokens } from "@/lib/map/tokens";
import { isSupabaseConfigured } from "@/lib/data";
import { DEPOT } from "@/lib/data/synthetic";
import { useConsole } from "@/lib/console/store";
import { Graticule } from "./Graticule";
import { ScaleBar } from "./ScaleBar";

/**
 * How to frame the whole network. On a phone the chrome at the top and the
 * bottom of the map is inside the frame, so the padding clears it and the
 * cluster is allowed one more zoom step so pins spread under a finger.
 */
export function fitOptions(): { padding: number | { top: number; right: number; bottom: number; left: number }; maxZoom: number } {
  const coarse = typeof window !== "undefined" && window.matchMedia("(pointer: coarse)").matches;
  return coarse
    ? { padding: { top: 56, right: 16, bottom: 56, left: 16 }, maxZoom: 16 }
    : { padding: 40, maxZoom: 15 };
}

/** Increments on every map move so overlays that project coordinates re-render. */
export const MapTickContext = createContext(0);

/** What the map can tell the operator about itself. */
export type MapStatus = "loading" | "ready" | "failed";

export function ConsoleMap({
  children, overlay, onMapMouseLeave, onMapClick, onStatus,
}: {
  /** Rendered inside the map, so `useMap`, `Marker` and `Source` all work. */
  children?: ReactNode;
  /** Rendered over the map but outside it: chrome that needs no map context. */
  overlay?: ReactNode;
  onMapMouseLeave?: () => void;
  /** A tap or click on the basemap itself, not on a marker. */
  onMapClick?: () => void;
  onStatus?: (s: MapStatus) => void;
}) {
  const style = useMemo(() => buildMapStyle(readMapTokens()), []);
  const [tick, setTick] = useState(0);
  const mapRef = useRef<MapRef>(null);
  const loadState = useConsole((s) => s.loadState);
  const fitted = useRef(false);
  useEffect(() => {
    if (fitted.current || loadState !== "ready" || !isSupabaseConfigured() || !mapRef.current) return;
    const pts = Object.values(useConsole.getState().potholes).filter((p) => p.status !== "false_positive").map((p) => [p.lng, p.lat] as [number, number]);
    if (!pts.length) return;
    pts.push(DEPOT);
    const lngs = pts.map((p) => p[0]), lats = pts.map((p) => p[1]);
    mapRef.current.fitBounds([[Math.min(...lngs), Math.min(...lats)], [Math.max(...lngs), Math.max(...lats)]], { ...fitOptions(), duration: 0 });
    fitted.current = true;
  }, [loadState]);

  return (
    <section
      className="console-map"
      // A finger leaving the map is not a mouse leaving it: nothing to unlink.
      onPointerLeave={(e) => { if (e.pointerType !== "touch") onMapMouseLeave?.(); }}
    >
      <Map
        ref={mapRef}
        initialViewState={{ longitude: DEPOT[0], latitude: DEPOT[1], zoom: 14.5 }}
        mapStyle={style}
        style={{ position: "absolute", inset: 0 }}
        dragRotate={false}
        pitchWithRotate={false}
        touchPitch={false}
        maxPitch={0}
        onClick={onMapClick}
        attributionControl={{ compact: true }}
        onMove={() => setTick((t) => t + 1)}
        onLoad={(e) => {
          // North stays up on a phone too: pinch zooms, it does not rotate.
          e.target.touchZoomRotate.disableRotation();
          onStatus?.("ready");
        }}
        onError={(e) => {
          // Any map error means the basemap will not finish loading, so say so
          // rather than leaving the loading cover up. The message goes to the
          // browser console for diagnosis (WebGL, tiles, glyphs, style).
          console.error("Basemap error:", e.error?.message ?? e);
          onStatus?.("failed");
        }}
      >
        <MapTickContext.Provider value={tick}>
          {children}
          <ScaleBar />
        </MapTickContext.Provider>
      </Map>
      <Graticule />
      {overlay}
    </section>
  );
}
