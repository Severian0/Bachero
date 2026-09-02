"use client";
import { useConsole, type Mode } from "@/lib/console/store";
import { countInArea } from "@/lib/console/area";

const MODES: { key: Mode; label: string }[] = [
  { key: "manual", label: "Pick these" }, { key: "count", label: "Best N" }, { key: "time", label: "Time budget" },
];

/** Empty or invalid input commits the fallback instead of coercing to 0. */
const num = (v: string, fallback: number) => {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : fallback;
};

export function Planner() {
  const planner = useConsole((s) => s.planner);
  const open = useConsole((s) => s.plannerOpen);
  const crews = useConsole((s) => s.crews);
  const planState = useConsole((s) => s.planState);
  const planError = useConsole((s) => s.planError);
  const potholes = useConsole((s) => s.potholes);
  const setPlanner = useConsole((s) => s.setPlanner);
  const setOpen = useConsole((s) => s.setPlannerOpen);
  const setArea = useConsole((s) => s.setArea);
  const crew = crews.find((c) => c.id === planner.crewId);
  const inArea = countInArea(Object.values(potholes), planner.area);
  if (planState === "planned") return null;

  if (!open) {
    return (
      <button type="button" className="w-full text-left px-4 py-3 border-t border-divider text-[12px] text-ink-58 hover:bg-ink-3" onClick={() => setOpen(true)}>
        Planning for {crew?.name ?? "—"} · {MODES.find((m) => m.key === planner.mode)?.label}{planner.area ? ` · area (${inArea})` : ""}
      </button>
    );
  }

  return (
    <div className="px-4 py-3 border-t border-divider grid gap-3">
      <div className="flex items-center justify-between">
        <div className="panel-label">Plan for {planner.planDate}</div>
        <button type="button" className="btn btn-ghost btn-icon" aria-label="Collapse planner" onClick={() => setOpen(false)}>–</button>
      </div>
      <label className="field"><span className="block text-[12px] mb-1 text-ink-72">Crew</span>
        <select className="input" value={planner.crewId ?? ""} onChange={(e) => {
          const c = crews.find((x) => x.id === e.target.value);
          setPlanner({ crewId: e.target.value, maxStops: c?.repairs_per_shift ?? planner.maxStops, timeBudgetMin: c?.shift_minutes ?? planner.timeBudgetMin });
        }}>
          {crews.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
      </label>
      <div className="flex gap-2" role="radiogroup" aria-label="Planning mode">
        {MODES.map((m) => (
          <button key={m.key} type="button" className="chip" aria-pressed={planner.mode === m.key} onClick={() => setPlanner({ mode: m.key })}>{m.label}</button>
        ))}
      </div>
      <div className="grid grid-cols-2 gap-3">
        {planner.mode === "count" && (
          <label className="field"><span className="block text-[12px] mb-1 text-ink-72">Stops</span>
            <input key={`stops-${planner.crewId ?? "none"}`} className="input tabular" type="number" min={1} max={50} defaultValue={planner.maxStops} onBlur={(e) => setPlanner({ maxStops: num(e.target.value, planner.maxStops) })} />
          </label>
        )}
        {planner.mode === "time" && (
          <label className="field"><span className="block text-[12px] mb-1 text-ink-72">Minutes</span>
            <input key={`minutes-${planner.crewId ?? "none"}`} className="input tabular" type="number" min={30} step={30} defaultValue={planner.timeBudgetMin} onBlur={(e) => setPlanner({ timeBudgetMin: num(e.target.value, planner.timeBudgetMin) })} />
          </label>
        )}
        <label className="field"><span className="block text-[12px] mb-1 text-ink-72">Minutes per stop</span>
          <input className="input tabular" type="number" min={5} step={5} defaultValue={planner.serviceMinPerStop} onBlur={(e) => setPlanner({ serviceMinPerStop: num(e.target.value, planner.serviceMinPerStop) })} />
        </label>
      </div>
      {planner.mode !== "manual" && (
        <div className="flex items-center justify-between text-[12px] text-ink-58">
          <span>{planner.area ? `Area drawn · ${inArea} in area` : "No area · Shift-drag on the map to draw one"}</span>
          {planner.area && <button type="button" className="btn btn-ghost" onClick={() => setArea(null)}>Clear</button>}
        </div>
      )}
      {planState === "error" && <div className="text-[12px] text-ink-72" role="alert">{planError}</div>}
    </div>
  );
}
