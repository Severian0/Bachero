"use client";
import { useMemo } from "react";
import { Layer, Marker, Source } from "react-map-gl/maplibre";
import { useConsole } from "@/lib/console/store";
import { MAP_FALLBACK, readToken } from "@/lib/map/tokens";
import { DEPOT } from "@/lib/data/synthetic";

export function RouteLayer() {
  const plan = useConsole((s) => s.plan);
  const action = useMemo(() => readToken("--action", MAP_FALLBACK.action), []);
  const data = useMemo<GeoJSON.FeatureCollection>(() => ({
    type: "FeatureCollection",
    features: plan ? [{ type: "Feature", properties: {}, geometry: plan.path }] : [],
  }), [plan]);
  if (!plan) return null;
  return (
    <>
      <Source id="route" type="geojson" data={data}>
        <Layer id="route-line" type="line" layout={{ "line-cap": "round", "line-join": "round" }} paint={{ "line-color": action, "line-width": 2 }} />
      </Source>
      <Marker longitude={DEPOT[0]} latitude={DEPOT[1]} anchor="center" style={{ zIndex: 30 }}>
        <div
          aria-label="Depot"
          style={{ width: 12, height: 12, borderRadius: "var(--r-sm)", border: "1.5px solid var(--rail)", background: "var(--surface)" }}
        />
      </Marker>
      {plan.stops.map((s) => (
        <Marker key={s.work_order_id} longitude={s.lng} latitude={s.lat} anchor="center" style={{ zIndex: 45 }}>
          <div
            className="data"
            style={{
              width: 16, height: 16, borderRadius: "var(--r-sm)", background: "var(--committed)",
              display: "grid", placeItems: "center", fontSize: 10, fontWeight: 700, lineHeight: 1,
              color: "var(--rail-ink)", pointerEvents: "none",
            }}
          >
            {s.stop_order}
          </div>
        </Marker>
      ))}
    </>
  );
}
