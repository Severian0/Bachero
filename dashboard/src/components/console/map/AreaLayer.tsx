"use client";
import { useMemo } from "react";
import { Layer, Source } from "react-map-gl/maplibre";
import { useConsole } from "@/lib/console/store";
import { readToken } from "@/lib/map/tokens";

export function AreaLayer({ draft }: { draft: GeoJSON.Polygon | null }) {
  const area = useConsole((s) => s.planner.area);
  const accent = useMemo(() => readToken("--color-accent") || "#5980a6", []);
  const poly = draft ?? area;
  const data = useMemo<GeoJSON.FeatureCollection>(() => ({
    type: "FeatureCollection",
    features: poly ? [{ type: "Feature", properties: {}, geometry: poly }] : [],
  }), [poly]);
  return (
    <Source id="area" type="geojson" data={data}>
      <Layer id="area-fill" type="fill" paint={{ "fill-color": accent, "fill-opacity": 0.08 }} />
      <Layer id="area-line" type="line" paint={{ "line-color": accent, "line-width": 1 }} />
    </Source>
  );
}
