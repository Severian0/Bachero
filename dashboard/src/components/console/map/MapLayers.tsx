"use client";
import { useConsole } from "@/lib/console/store";
import { PotholePin } from "./PotholePin";
import { VehicleMarker } from "./VehicleMarker";
import { TrailLayer } from "./TrailLayer";
import { AreaLayer } from "./AreaLayer";
import { RouteLayer } from "./RouteLayer";
import { CrosshairGuides } from "./CrosshairGuides";

export function MapLayers({ draft }: { draft: GeoJSON.Polygon | null }) {
  const potholes = useConsole((s) => s.potholes);
  const vehicles = useConsole((s) => s.vehicles);
  return (
    <>
      <AreaLayer draft={draft} />
      <TrailLayer />
      {Object.values(potholes).map((p) => <PotholePin key={p.id} p={p} />)}
      {Object.values(vehicles).map((v) => <VehicleMarker key={v.id} v={v} />)}
      <RouteLayer />
      <CrosshairGuides />
    </>
  );
}
