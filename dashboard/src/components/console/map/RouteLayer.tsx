"use client";
import { useEffect, useMemo } from "react";
import { Layer, Marker, Source, useMap } from "react-map-gl/maplibre";
import { useConsole } from "@/lib/console/store";
import { MAP_FALLBACK, readToken } from "@/lib/map/tokens";
import { buildArrowImage } from "@/lib/map/arrow";
import { DEPOT } from "@/lib/data/synthetic";

export function RouteLayer() {
  const plan = useConsole((s) => s.plan);
  const action = useMemo(() => readToken("--action", MAP_FALLBACK.action), []);
  const { current: map } = useMap();
  // Register the arrow bitmap through MapLibre's own missing-image hook rather
  // than a readiness flag: the symbol layer can mount before any effect runs,
  // and this fires exactly when the layer first asks for the image.
  useEffect(() => {
    const m = map?.getMap();
    if (!m) return;
    const supply = (e: { id: string }) => {
      if (e.id === "route-arrow-action" && !m.hasImage(e.id)) {
        m.addImage(e.id, buildArrowImage(action));
      }
    };
    m.on("styleimagemissing", supply);
    if (!m.hasImage("route-arrow-action")) m.addImage("route-arrow-action", buildArrowImage(action));
    return () => { m.off("styleimagemissing", supply); };
  }, [map, action]);
  const data = useMemo<GeoJSON.FeatureCollection>(() => ({
    type: "FeatureCollection",
    features: plan ? [{ type: "Feature", properties: {}, geometry: plan.path }] : [],
  }), [plan]);
  if (!plan) return null;
  return (
    <>
      <Source id="route" type="geojson" data={data}>
        <Layer id="route-line" type="line" layout={{ "line-cap": "round", "line-join": "round" }} paint={{ "line-color": action, "line-width": 2 }} />
        {(
          <Layer
            id="route-arrows"
            type="symbol"
            layout={{
              "symbol-placement": "line",
              "symbol-spacing": 80,
              "icon-image": "route-arrow-action",
              "icon-size": 0.5,
              "icon-rotation-alignment": "map",
              "icon-allow-overlap": true,
              "icon-ignore-placement": true,
            }}
          />
        )}
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
