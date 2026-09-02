"use client";
import dynamic from "next/dynamic";
import { useEffect } from "react";
import { useConsole } from "@/lib/console/store";
import { createDataSource } from "@/lib/data";
import { ConsoleHeader } from "./ConsoleHeader";

const ConsoleMap = dynamic(() => import("./map/ConsoleMap").then((m) => m.ConsoleMap), { ssr: false });

export default function Console() {
  const unlink = useConsole((s) => s.unlink);

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
      off = ds.subscribe({
        onPothole: (u) => ("deleted" in u ? st.removePothole(u.id) : st.upsertPothole(u)),
        onVehiclePosition: (v) => { st.pushVehiclePosition(v); st.setKmToday(useConsole.getState().kmToday + 0.11 / 3); },
      });
    })();
    return () => { cancelled = true; off(); };
  }, []);

  return (
    <div className="h-screen grid overflow-hidden bg-bg text-text" style={{ gridTemplateRows: "var(--console-header-h) 1fr" }}>
      <ConsoleHeader />
      <main className="grid min-h-0" style={{ gridTemplateColumns: "1fr var(--console-column-w)" }}>
        <ConsoleMap onMapMouseLeave={unlink} />
        <aside className="grid min-h-0 bg-bg" style={{ gridTemplateRows: "auto auto auto minmax(0,1fr) auto auto auto" }}>
          <div className="p-4 border-b border-divider panel-label">Repair queue</div>
        </aside>
      </main>
    </div>
  );
}
