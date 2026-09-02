"use client";
import { useEffect, useState } from "react";
import { useConsole } from "@/lib/console/store";
import { DEMO_AUTHORITY } from "@/lib/data/synthetic";

const REPORTING_WINDOW_MS = 60_000;
const NOW_TICK_MS = 5_000;

export function ConsoleHeader() {
  const vehicles = useConsole((s) => s.vehicles);
  const kmToday = useConsole((s) => s.kmToday);
  // Date.now()/new Date() are impure; read them once at mount via lazy state
  // initializers and refresh `now` on an interval so purity lint stays clean.
  const [now, setNow] = useState(() => Date.now());
  const [date] = useState(() => new Date().toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "long", year: "numeric" }));
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), NOW_TICK_MS);
    return () => clearInterval(id);
  }, []);
  const reporting = Object.values(vehicles).filter((v) => now - new Date(v.position.recorded_at).getTime() < REPORTING_WINDOW_MS).length;
  const authority = process.env.NEXT_PUBLIC_AUTHORITY_NAME || DEMO_AUTHORITY;

  return (
    <header className="flex items-center justify-between px-6 bg-neutral-100 border-b border-divider" style={{ height: "var(--console-header-h)" }}>
      <div className="flex items-center gap-4">
        <span className="block w-7 h-7 border-[1.5px] border-accent rounded-md" aria-hidden />
        <div className="leading-tight">
          <div className="font-bold text-[16px] tracking-[.04em] uppercase">Bachero</div>
          <div className="text-[12px] text-ink-58">{authority} — Highways Maintenance Directorate</div>
        </div>
      </div>
      <div className="flex items-center gap-4 text-[12px] text-ink-58">
        <span className="flex items-center gap-2 px-3 py-1 rounded-lg bg-accent-100 text-accent-800">
          <i className="live-dot" aria-hidden />
          {reporting > 0 ? `${reporting} vehicles reporting` : "Feed paused"}
        </span>
        <span className="tabular">{kmToday.toFixed(1)} km scanned today</span>
        <span className="px-3 py-1 border border-divider rounded-lg">{date}</span>
      </div>
    </header>
  );
}
