"use client";
import { useContext } from "react";
import { useMap } from "react-map-gl/maplibre";
import { useConsole } from "@/lib/console/store";
import { coord } from "@/lib/console/format";
import { MapTickContext } from "./ConsoleMap";

export function CrosshairGuides() {
  useContext(MapTickContext); // re-render on map move
  const { current: map } = useMap();
  const id = useConsole((s) => s.pinnedId ?? s.linkedId);
  const p = useConsole((s) => (id ? s.potholes[id] : undefined));
  if (!map || !p || p.status === "false_positive") return null;
  const pt = map.project([p.lng, p.lat]);
  const line = "absolute pointer-events-none";
  const lineStyle = { background: "color-mix(in srgb, var(--color-accent) 40%, transparent)" };
  return (
    <>
      <div className={`${line} top-0 bottom-0 w-px`} style={{ left: pt.x, ...lineStyle }} />
      <div className={`${line} left-0 right-0 h-px`} style={{ top: pt.y, ...lineStyle }} />
      <div
        className="absolute top-[10px] px-[7px] py-[3px] rounded-md bg-bg shadow-sm text-[11px] tabular text-accent-800 pointer-events-none"
        style={{ left: pt.x, transform: "translateX(8px)" }}
      >
        {coord(p.lat, p.lng)}
      </div>
    </>
  );
}
