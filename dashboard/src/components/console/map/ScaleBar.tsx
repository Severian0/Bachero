"use client";
import { ScaleControl } from "react-map-gl/maplibre";

export function ScaleBar() {
  return <ScaleControl position="bottom-right" maxWidth={80} unit="metric" />;
}
