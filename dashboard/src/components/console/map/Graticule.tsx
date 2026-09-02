"use client";
import { useEffect, useRef, useState } from "react";

const STEP = 64;
const LABEL_EVERY = 4;

/**
 * A survey grid over the basemap: hairlines every 64px, numbered every fourth
 * line. It gives the map a sense of scale between the scale bar and the pins,
 * and it is the reason the screen reads as an instrument rather than a
 * consumer map.
 */
export function Graticule() {
  const ref = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setSize({ w: e.contentRect.width, h: e.contentRect.height }));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const cols = Math.floor(size.w / (STEP * LABEL_EVERY));
  const rows = Math.floor(size.h / (STEP * LABEL_EVERY));
  const rule = "color-mix(in srgb, var(--rule-soft) 60%, transparent)";
  const tick = {
    position: "absolute" as const,
    fontSize: "var(--t-micro)",
    color: "var(--ink-3)",
  };

  return (
    <div
      ref={ref}
      aria-hidden
      style={{
        position: "absolute", inset: 0, pointerEvents: "none",
        backgroundImage: `linear-gradient(to right, ${rule} 1px, transparent 1px), linear-gradient(to bottom, ${rule} 1px, transparent 1px)`,
        backgroundSize: `${STEP}px ${STEP}px`,
      }}
    >
      {Array.from({ length: cols }, (_, i) => (
        <span key={"c" + i} className="data" style={{ ...tick, top: 4, left: (i + 1) * STEP * LABEL_EVERY + 3 }}>
          {(i + 1) * LABEL_EVERY}
        </span>
      ))}
      {Array.from({ length: rows }, (_, i) => (
        <span key={"r" + i} className="data" style={{ ...tick, left: 4, top: (i + 1) * STEP * LABEL_EVERY + 1 }}>
          {(i + 1) * LABEL_EVERY}
        </span>
      ))}
    </div>
  );
}
