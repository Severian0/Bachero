"use client";
import { createContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import Map from "react-map-gl/maplibre";
import type { MapLayerMouseEvent, MapRef } from "react-map-gl/maplibre";
import "maplibre-gl/dist/maplibre-gl.css";
import { buildMapStyle } from "@/lib/map/style";
import { readMapTokens } from "@/lib/map/tokens";
import { isSupabaseConfigured } from "@/lib/data";
import { DEPOT } from "@/lib/data/synthetic";
import { useConsole } from "@/lib/console/store";
import { Graticule } from "./Graticule";
import { ScaleBar } from "./ScaleBar";

/** Increments on every map move so overlays that project coordinates re-render. */
export const MapTickContext = createContext(0);

/** What the map can tell the operator about itself. */
export type MapStatus = "loading" | "ready" | "failed";

export function ConsoleMap({
  children, overlay, dragPan = true, cursor, onMapMouseLeave, mouseHandlers, onStatus,
}: {
  /** Rendered inside the map, so `useMap`, `Marker` and `Source` all work. */
  children?: ReactNode;
  /** Rendered over the map but outside it: chrome that needs no map context. */
  overlay?: ReactNode;
  dragPan?: boolean;
  cursor?: string;
  onMapMouseLeave?: () => void;
  mouseHandlers?: { onMouseDown?: (e: MapLayerMouseEvent) => void; onMouseMove?: (e: MapLayerMouseEvent) => void; onMouseUp?: (e: MapLayerMouseEvent) => void };
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
    mapRef.current.fitBounds([[Math.min(...lngs), Math.min(...lats)], [Math.max(...lngs), Math.max(...lats)]], { padding: 40, maxZoom: 15, duration: 0 });
    fitted.current = true;
  }, [loadState]);

  return (
    <section
      style={{ position: "relative", minWidth: 0, overflow: "hidden", background: "var(--canvas)", borderRight: "1px solid var(--rule)" }}
      onMouseLeave={onMapMouseLeave}
    >
      <Map
        ref={mapRef}
        initialViewState={{ longitude: DEPOT[0], latitude: DEPOT[1], zoom: 14.5 }}
        mapStyle={style}
        style={{ position: "absolute", inset: 0 }}
        dragPan={dragPan}
        cursor={cursor}
        dragRotate={false}
        pitchWithRotate={false}
        attributionControl={{ compact: true }}
        onMove={() => setTick((t) => t + 1)}
        onLoad={() => onStatus?.("ready")}
        onError={(e) => { if (/tile|source|glyph/i.test(String(e.error?.message))) onStatus?.("failed"); }}
        {...mouseHandlers}
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
