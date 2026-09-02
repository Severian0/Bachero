"use client";
import { useMemo } from "react";
import { Layer, Marker, Source } from "react-map-gl/maplibre";
import { useConsole } from "@/lib/console/store";
import { readToken } from "@/lib/map/tokens";
import { DEPOT } from "@/lib/data/synthetic";

export function RouteLayer() {
  const plan = useConsole((s) => s.plan);
  const accent = useMemo(() => readToken("--color-accent") || "#5980a6", []);
  const data = useMemo<GeoJSON.FeatureCollection>(() => ({
    type: "FeatureCollection",
    features: plan ? [{ type: "Feature", properties: {}, geometry: plan.path }] : [],
  }), [plan]);
  if (!plan) return null;
  return (
    <>
      <Source id="route" type="geojson" data={data}>
        <Layer id="route-line" type="line" layout={{ "line-cap": "round", "line-join": "round" }} paint={{ "line-color": accent, "line-width": 2 }} />
      </Source>
      <Marker longitude={DEPOT[0]} latitude={DEPOT[1]} anchor="center" style={{ zIndex: 30 }}>
        <div className="w-3 h-3 border-[1.5px] border-accent-800 bg-bg rounded-sm" aria-label="Depot" />
      </Marker>
      {plan.stops.map((s) => (
        <Marker key={s.work_order_id} longitude={s.lng} latitude={s.lat} anchor="center" style={{ zIndex: 45 }}>
          <div className="w-4 h-4 rounded-sm bg-accent-800 flex items-center justify-center font-heading text-[10px] text-bg pointer-events-none">{s.stop_order}</div>
        </Marker>
      ))}
    </>
  );
}
