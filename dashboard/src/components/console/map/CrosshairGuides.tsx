"use client";
import { useContext } from "react";
import { useMap } from "react-map-gl/maplibre";
import { useConsole } from "@/lib/console/store";
import { coord } from "@/lib/console/format";
import { MapTickContext } from "./ConsoleMap";

/**
 * How you find one pin among two hundred, and where the coordinate the
 * operator quotes down the phone is printed.
 */
export function CrosshairGuides() {
  useContext(MapTickContext); // re-render on map move
  const { current: map } = useMap();
  const id = useConsole((s) => s.pinnedId ?? s.linkedId);
  const p = useConsole((s) => (id ? s.potholes[id] : undefined));
  if (!map || !p || p.status === "false_positive") return null;
  const pt = map.project([p.lng, p.lat]);
  const line = {
    position: "absolute" as const,
    pointerEvents: "none" as const,
    background: "color-mix(in srgb, var(--action) 45%, transparent)",
  };
  return (
    <>
      <div style={{ ...line, top: 0, bottom: 0, width: 1, left: pt.x }} />
      <div style={{ ...line, left: 0, right: 0, height: 1, top: pt.y }} />
      <div
        className="data"
        style={{
          position: "absolute", top: 12, left: pt.x, transform: "translateX(8px)",
          padding: "3px 7px", borderRadius: "var(--r-sm)",
          background: "var(--rail)", color: "var(--rail-ink)",
          fontSize: "var(--t-micro)", whiteSpace: "nowrap", pointerEvents: "none",
        }}
      >
        {coord(p.lat, p.lng)}
      </div>
    </>
  );
}
