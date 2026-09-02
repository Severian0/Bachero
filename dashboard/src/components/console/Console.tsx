"use client";
import dynamic from "next/dynamic";
import { useEffect } from "react";
import { useConsole } from "@/lib/console/store";
import { createDataSource } from "@/lib/data";
import { handleKey } from "@/lib/console/keyboard";
import { ConsoleHeader } from "./ConsoleHeader";
import { MapLayers } from "./map/MapLayers";
import { useAreaDrag } from "./map/useAreaDrag";
import { Column } from "./column/Column";
import { useVisibleRows } from "./column/QueueList";

const ConsoleMap = dynamic(() => import("./map/ConsoleMap").then((m) => m.ConsoleMap), { ssr: false });

export default function Console() {
  const unlink = useConsole((s) => s.unlink);
  const rows = useVisibleRows();
  const { drawing, draft, handlers } = useAreaDrag();

  useEffect(() => {
    if (drawing) return;
    const onKey = (e: KeyboardEvent) => { handleKey(e, useConsole.getState(), rows); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [rows, drawing]);

  useEffect(() => {
    const st = useConsole.getState();
    let off = () => {};
    let cancelled = false;
    (async () => {
      const ds = await createDataSource();
      if (cancelled) return;
      st.setDataSource(ds);
      try {
        const res = await ds.load();
        if (cancelled) return;
        st.setAll(res.potholes);
        st.setVehicles(res.vehicles);
        st.setCrews(res.crews);
        st.setKmToday(res.kmToday);
        st.setLoadState("ready");
      } catch (e) {
        st.setLoadState("error", e instanceof Error ? e.message : "Unknown error");
      }
      if (cancelled) return;
      off = ds.subscribe({
        onPothole: (u) => ("deleted" in u ? st.removePothole(u.id) : st.upsertPothole(u)),
        onVehicle: (v) => st.upsertVehicle(v),
        onKmToday: (km) => st.setKmToday(km),
      });
    })();
    return () => { cancelled = true; off(); };
  }, []);

  return (
    <div className="h-screen grid overflow-hidden bg-bg text-text" style={{ gridTemplateRows: "var(--console-header-h) 1fr" }}>
      <ConsoleHeader />
      <main className="grid min-h-0" style={{ gridTemplateColumns: "1fr var(--console-column-w)" }}>
        <ConsoleMap onMapMouseLeave={unlink} dragPan={!drawing} cursor={drawing ? "crosshair" : undefined} mouseHandlers={handlers}>
          <MapLayers draft={draft} />
        </ConsoleMap>
        <Column />
      </main>
    </div>
  );
}
