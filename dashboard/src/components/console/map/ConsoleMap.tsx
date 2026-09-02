"use client";
import { createContext, useMemo, useState, type ReactNode } from "react";
import Map from "react-map-gl/maplibre";
import type { MapLayerMouseEvent } from "react-map-gl/maplibre";
import "maplibre-gl/dist/maplibre-gl.css";
import { buildMapStyle } from "@/lib/map/style";
import { readMapTokens } from "@/lib/map/tokens";
import { DEPOT } from "@/lib/data/synthetic";
import { Graticule } from "./Graticule";
import { MapKey } from "./MapKey";
import { ScaleBar } from "./ScaleBar";

/** Increments on every map move so overlays that project coordinates re-render. */
export const MapTickContext = createContext(0);

export function ConsoleMap({ children, dragPan = true, cursor, onMapMouseLeave, mouseHandlers }: {
  children?: ReactNode; dragPan?: boolean; cursor?: string; onMapMouseLeave?: () => void;
  mouseHandlers?: { onMouseDown?: (e: MapLayerMouseEvent) => void; onMouseMove?: (e: MapLayerMouseEvent) => void; onMouseUp?: (e: MapLayerMouseEvent) => void };
}) {
  const style = useMemo(() => buildMapStyle(readMapTokens()), []);
  const [tick, setTick] = useState(0);
  const [tilesFailed, setTilesFailed] = useState(false);

  return (
    <section className="relative overflow-hidden border-r border-divider bg-neutral-200" onMouseLeave={onMapMouseLeave}>
      <Map
        initialViewState={{ longitude: DEPOT[0], latitude: DEPOT[1], zoom: 14.5 }}
        mapStyle={style}
        style={{ position: "absolute", inset: 0 }}
        dragPan={dragPan}
        cursor={cursor}
        dragRotate={false}
        pitchWithRotate={false}
        attributionControl={{ compact: true }}
        onMove={() => setTick((t) => t + 1)}
        onError={(e) => { if (/tile|source|glyph/i.test(String(e.error?.message))) setTilesFailed(true); }}
        {...mouseHandlers}
      >
        <MapTickContext.Provider value={tick}>
          {children}
          <ScaleBar />
        </MapTickContext.Provider>
      </Map>
      <Graticule />
      <MapKey />
      {tilesFailed && (
        <div className="absolute top-0 inset-x-0 z-[90] px-4 py-2 text-[12px] bg-bg border-b border-divider text-ink-72">
          Basemap unavailable. Pins are still placed by coordinate.
        </div>
      )}
    </section>
  );
}
