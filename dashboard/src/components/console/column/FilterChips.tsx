"use client";
import { useConsole } from "@/lib/console/store";
import { FILTER_CYCLE, FILTER_LABELS } from "@/lib/console/derive";

export function FilterChips() {
  const filter = useConsole((s) => s.filter);
  const setFilter = useConsole((s) => s.setFilter);
  return (
    <div className="flex gap-2 p-4 border-b border-divider">
      {FILTER_CYCLE.map((f) => (
        <button key={f} type="button" className="chip" aria-pressed={filter === f} onClick={() => setFilter(f)}>
          {FILTER_LABELS[f]}
        </button>
      ))}
    </div>
  );
}
