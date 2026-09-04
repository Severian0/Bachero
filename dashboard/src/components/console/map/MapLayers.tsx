"use client";
import { useConsole } from "@/lib/console/store";
import { PotholePin } from "./PotholePin";
import { VehicleMarker } from "./VehicleMarker";
import { TrailLayer } from "./TrailLayer";
import { RouteLayer } from "./RouteLayer";
import { PreviewDriveLayer } from "./PreviewDriveLayer";
import { CrosshairGuides } from "./CrosshairGuides";
import { DepotMarker } from "./DepotMarker";

export function MapLayers() {
  const potholes = useConsole((s) => s.potholes);
  const vehicles = useConsole((s) => s.vehicles);
  const crews = useConsole((s) => s.crews);
  return (
    <>
      <TrailLayer />
      {crews.map((c) => <DepotMarker key={c.id} lng={c.depot_lng} lat={c.depot_lat} name={`${c.name} depot`} />)}
      {Object.values(potholes).map((p) => <PotholePin key={p.id} p={p} />)}
      {Object.values(vehicles).map((v) => <VehicleMarker key={v.id} v={v} />)}
      <RouteLayer />
      <PreviewDriveLayer />
      <CrosshairGuides />
    </>
  );
}
