"use client";

import { useMemo, useRef, useState, type ReactNode } from "react";
import Map, { Layer, Marker, Source } from "react-map-gl/maplibre";
import type { MapRef } from "react-map-gl/maplibre";
import { setWorkerUrl } from "maplibre-gl";

// Same worker trick as ConsoleMap: MapLibre derives its worker URL from
// import.meta.url, which the bundler does not provide. scripts/copy-maplibre-worker.mjs
// puts the worker in public/ (the predev script), so npm run dev is required.
if (typeof window !== "undefined") setWorkerUrl("/maplibre/maplibre-gl-worker.mjs");
import "maplibre-gl/dist/maplibre-gl.css";

import { buildMapStyle } from "@/lib/map/style";
import { MAP_FALLBACK, readMapTokens, readToken } from "@/lib/map/tokens";
import { buildArrowImage } from "@/lib/map/arrow";
import type { CrewPlan } from "@/lib/crew/plan";

/**
 * The driver's map: route line in --committed (a published plan is committed
 * work), numbered stops, start and end markers. `children` render inside the
 * map (markers, sources); `overlay` renders over it (banners, buttons).
 */
export function DriveMap({
  plan,
  children,
  overlay,
  onUserPan,
}: {
  plan: CrewPlan;
  children?: ReactNode;
  overlay?: ReactNode;
  onUserPan?: () => void;
}) {
  const style = useMemo(() => buildMapStyle(readMapTokens()), []);
  const committed = useMemo(() => readToken("--committed", MAP_FALLBACK.committed), []);
  const mapRef = useRef<MapRef>(null);
  const [arrowReady, setArrowReady] = useState(false);

  const data = useMemo<GeoJSON.FeatureCollection>(
    () => ({
      type: "FeatureCollection",
      features: [
        { type: "Feature", properties: {}, geometry: { type: "LineString", coordinates: plan.path } },
      ],
    }),
    [plan.path],
  );

  const fitRoute = () => {
    const pts: [number, number][] = [
      ...plan.path,
      [plan.start.lng, plan.start.lat],
      [plan.end.lng, plan.end.lat],
    ];
    const lngs = pts.map((p) => p[0]);
    const lats = pts.map((p) => p[1]);
    mapRef.current?.fitBounds(
      [[Math.min(...lngs), Math.min(...lats)], [Math.max(...lngs), Math.max(...lats)]],
      { padding: 48, duration: 0 },
    );
  };

  const anchorSquare = (label: string) => (
    <div
      aria-label={label}
      style={{
        width: 12, height: 12, borderRadius: "var(--r-sm)",
        border: "1.5px solid var(--rail)", background: "var(--surface)",
      }}
    />
  );

  return (
    <section style={{ position: "relative", minHeight: 0 }}>
      <Map
        ref={mapRef}
        initialViewState={{ longitude: plan.start.lng, latitude: plan.start.lat, zoom: 12 }}
        mapStyle={style}
        style={{ position: "absolute", inset: 0 }}
        dragRotate={false}
        pitchWithRotate={false}
        attributionControl={{ compact: true }}
        onLoad={() => {
          const m = mapRef.current?.getMap();
          if (m && !m.hasImage("route-arrow-committed")) {
            m.addImage("route-arrow-committed", buildArrowImage(committed));
          }
          setArrowReady(true);
          fitRoute();
        }}
        onDragStart={onUserPan}
      >
        <Source id="crew-route" type="geojson" data={data}>
          <Layer
            id="crew-route-line"
            type="line"
            layout={{ "line-cap": "round", "line-join": "round" }}
            paint={{ "line-color": committed, "line-width": 3 }}
          />
          {arrowReady && (
            <Layer
              id="crew-route-arrows"
              type="symbol"
              layout={{
                "symbol-placement": "line",
                "symbol-spacing": 80,
                "icon-image": "route-arrow-committed",
                "icon-size": 0.5,
                "icon-rotation-alignment": "map",
                "icon-allow-overlap": true,
                "icon-ignore-placement": true,
              }}
            />
          )}
        </Source>
        <Marker longitude={plan.start.lng} latitude={plan.start.lat} anchor="center" style={{ zIndex: 30 }}>
          {anchorSquare(plan.start.label)}
        </Marker>
        <Marker longitude={plan.end.lng} latitude={plan.end.lat} anchor="center" style={{ zIndex: 30 }}>
          {anchorSquare(plan.end.label)}
        </Marker>
        {plan.stops.map((s) => (
          <Marker key={s.work_order_id} longitude={s.lng} latitude={s.lat} anchor="center" style={{ zIndex: 45 }}>
            <div
              className="data"
              style={{
                width: 18, height: 18, borderRadius: "var(--r-sm)", background: "var(--committed)",
                color: "var(--rail-ink)", display: "grid", placeItems: "center",
                fontSize: 11, fontWeight: 700, pointerEvents: "none",
              }}
            >
              {s.stop_order}
            </div>
          </Marker>
        ))}
        {children}
      </Map>
      {overlay}
    </section>
  );
}
