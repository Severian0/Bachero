"use client";
import { useConsole } from "@/lib/console/store";
import { stats } from "@/lib/console/derive";

export function StatCells() {
  const potholes = useConsole((s) => s.potholes);
  const loading = useConsole((s) => s.loadState === "loading");
  const st = stats(Object.values(potholes));
  const cells = [
    { value: st.confirmedOpen, label: "Confirmed and open" },
    { value: st.suspected, label: "Awaiting a second pass" },
    { value: st.scheduled, label: "Scheduled today" },
  ];
  return (
    <div className="grid grid-cols-3 border-b border-divider">
      {cells.map((c) => (
        <div key={c.label} className="p-4 border-r border-divider last:border-r-0">
          {loading
            ? <div className="h-8 w-10 border border-divider" aria-hidden />
            : <div className="font-heading text-[32px] leading-none tabular">{c.value}</div>}
          <div className="mt-2 text-[12px] leading-tight text-ink-58">{c.label}</div>
        </div>
      ))}
    </div>
  );
}
