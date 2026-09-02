"use client";
import { Marker } from "react-map-gl/maplibre";
import { useConsole } from "@/lib/console/store";
import { pinStyle, displayName, STATUS_LABEL } from "@/lib/console/derive";
import type { Pothole } from "@/lib/data/types";

export function PotholePin({ p }: { p: Pothole }) {
  const linked = useConsole((s) => s.linkedId === p.id);
  const selected = useConsole((s) => s.selected.includes(p.id));
  const link = useConsole((s) => s.link);
  const pin = useConsole((s) => s.pin);
  const st = pinStyle(p, { linked, selected });
  if (st.hidden) return null;

  return (
    <Marker longitude={p.lng} latitude={p.lat} anchor="center" style={{ zIndex: st.z }}>
      <div
        role="button"
        tabIndex={-1}
        aria-label={`${displayName(p)}, ${STATUS_LABEL[p.status].toLowerCase()}`}
        className="p-[7px] cursor-pointer"
        onMouseEnter={() => link(p.id, "map")}
        onClick={(e) => { e.stopPropagation(); pin(p.id); }}
      >
        <div
          className="flex items-center justify-center rounded-sm border-[1.5px]"
          style={{
            width: st.size, height: st.size, background: st.fill, borderColor: st.stroke, boxShadow: st.glow, opacity: st.opacity,
            transition: "width var(--dur-state) var(--ease), height var(--dur-state) var(--ease), background var(--dur-state) var(--ease), border-color var(--dur-state) var(--ease), box-shadow var(--dur-tint) linear",
          }}
        >
          {st.stopLabel && <span className="font-heading text-[11px] text-bg">{st.stopLabel}</span>}
        </div>
      </div>
    </Marker>
  );
}
