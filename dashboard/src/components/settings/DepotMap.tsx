"use client";
import { useMemo } from "react";
import Map from "react-map-gl/maplibre";
import { setWorkerUrl } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { buildMapStyle } from "@/lib/map/style";
import { readMapTokens } from "@/lib/map/tokens";
import { DEPOT } from "@/lib/data/synthetic";
import { DepotMarker } from "@/components/console/map/DepotMarker";
import type { Crew } from "@/lib/data/types";

// Same reason as ConsoleMap: the bundler cannot give MapLibre its worker URL.
if (typeof window !== "undefined") setWorkerUrl("/maplibre/maplibre-gl-worker.mjs");

/**
 * The settings map: every crew's depot, the one being placed, and a tap or
 * click anywhere to move it. Same basemap as the console, no data of its own.
 */
export function DepotMap({
  crews, draft, editingId, onPick,
}: {
  crews: Crew[];
  /** The depot in the form, once it has a position. */
  draft: { lng: number; lat: number; name: string } | null;
  editingId: string | null;
  onPick: (lng: number, lat: number) => void;
}) {
  const style = useMemo(() => buildMapStyle(readMapTokens()), []);
  const centre = crews[0] ? [crews[0].depot_lng, crews[0].depot_lat] : DEPOT;
  return (
    <Map
      initialViewState={{ longitude: centre[0], latitude: centre[1], zoom: 13.5 }}
      mapStyle={style}
      style={{ position: "absolute", inset: 0 }}
      dragRotate={false}
      pitchWithRotate={false}
      touchPitch={false}
      maxPitch={0}
      attributionControl={{ compact: true }}
      cursor="crosshair"
      onLoad={(e) => e.target.touchZoomRotate.disableRotation()}
      onClick={(e) => onPick(e.lngLat.lng, e.lngLat.lat)}
    >
      {crews.filter((c) => c.id !== editingId).map((c) => (
        <DepotMarker key={c.id} lng={c.depot_lng} lat={c.depot_lat} name={c.name} />
      ))}
      {draft && <DepotMarker lng={draft.lng} lat={draft.lat} name={draft.name || "New crew"} draft zIndex={40} />}
    </Map>
  );
}
