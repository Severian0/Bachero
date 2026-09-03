"use client";
import { useEffect, useRef, useState } from "react";
import { Marker } from "react-map-gl/maplibre";
import { createTween, retarget, tweenAt, type Tween, type XY } from "@/lib/console/interpolate";
import type { Vehicle } from "@/lib/data/types";

/**
 * A vehicle, glided between reported positions over 1200 ms. Positions arrive
 * every few seconds; a dot that jumps between them reads as a bug rather than
 * as a van driving down a road.
 */
export function VehicleMarker({ v }: { v: Vehicle }) {
  const { lng, lat } = v.position;
  const tween = useRef<Tween | null>(null);
  const [pos, setPos] = useState<XY>([lng, lat]);

  useEffect(() => {
    const target: XY = [lng, lat];
    const now = performance.now();
    tween.current = tween.current ? retarget(tween.current, target, now) : createTween(target, target, now, 1200);
    let raf = 0;
    const step = () => {
      const t = tween.current;
      if (!t) return;
      const at = performance.now();
      setPos(tweenAt(t, at));
      if (at < t.start + t.duration) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [lng, lat]);

  return (
    <Marker longitude={pos[0]} latitude={pos[1]} anchor="center" style={{ zIndex: 35 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
        <span style={{ width: 10, height: 10, borderRadius: "var(--r-full)", background: "var(--rail)", border: "2px solid var(--surface)", boxShadow: "var(--shadow-1)" }} />
        <span
          className="data"
          style={{
            whiteSpace: "nowrap", padding: "2px 5px", borderRadius: "var(--r-sm)",
            background: "var(--rail)", color: "var(--rail-ink)", fontSize: 10,
          }}
        >
          {v.label}
        </span>
      </div>
    </Marker>
  );
}
