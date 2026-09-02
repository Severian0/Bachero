"use client";
import { useEffect, useRef, useState } from "react";

const STEP = 64;
const LABEL_EVERY = 4;

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

  return (
    <div
      ref={ref}
      aria-hidden
      className="absolute inset-0 pointer-events-none"
      style={{
        backgroundImage:
          "linear-gradient(to right, var(--ink-5) 1px, transparent 1px), linear-gradient(to bottom, var(--ink-5) 1px, transparent 1px)",
        backgroundSize: `${STEP}px ${STEP}px`,
      }}
    >
      {Array.from({ length: cols }, (_, i) => (
        <span key={"c" + i} className="absolute top-1 text-[10px] tabular text-ink-45" style={{ left: (i + 1) * STEP * LABEL_EVERY + 3 }}>
          {(i + 1) * LABEL_EVERY}
        </span>
      ))}
      {Array.from({ length: rows }, (_, i) => (
        <span key={"r" + i} className="absolute left-1 text-[10px] tabular text-ink-45" style={{ top: (i + 1) * STEP * LABEL_EVERY + 1 }}>
          {(i + 1) * LABEL_EVERY}
        </span>
      ))}
    </div>
  );
}
