"use client";
import { useConsole } from "@/lib/console/store";
import { PotholePin } from "./PotholePin";
import { VehicleMarker } from "./VehicleMarker";
import { TrailLayer } from "./TrailLayer";
import { RouteLayer } from "./RouteLayer";
import { CrosshairGuides } from "./CrosshairGuides";

export function MapLayers() {
  const potholes = useConsole((s) => s.potholes);
  const vehicles = useConsole((s) => s.vehicles);
  return (
    <>
      <TrailLayer />
      {Object.values(potholes).map((p) => <PotholePin key={p.id} p={p} />)}
      {Object.values(vehicles).map((v) => <VehicleMarker key={v.id} v={v} />)}
      <RouteLayer />
      <CrosshairGuides />
    </>
  );
}
