"use client";
import { useState } from "react";
import { useConsole } from "@/lib/console/store";
import { km, minutes, pct, hhmm } from "@/lib/console/format";
import { displayName } from "@/lib/console/derive";

export function RouteSummary() {
  const plan = useConsole((s) => s.plan);
  const crews = useConsole((s) => s.crews);
  const crewId = useConsole((s) => s.planner.crewId);
  const potholes = useConsole((s) => s.potholes);
  const dispatchState = useConsole((s) => s.dispatchState);
  const dispatchError = useConsole((s) => s.dispatchError);
  const dispatchedTo = useConsole((s) => s.dispatchedTo);
  const dispatch = useConsole((s) => s.dispatch);
  const resetPlan = useConsole((s) => s.resetPlan);
  const [to, setTo] = useState(process.env.NEXT_PUBLIC_DEMO_CREW_EMAIL ?? "");
  if (!plan) return null;
  const crew = crews.find((c) => c.id === crewId);
  const saved = plan.baseline_km > 0 ? 1 - plan.total_km / plan.baseline_km : 0;
  const addresses = to.split(",").map((s) => s.trim()).filter(Boolean);

  return (
    <div className="px-4 py-3 border-t border-divider grid gap-3">
      <div className="panel-label">Route for {crew?.name ?? "crew"}</div>
      <div className="flex items-baseline gap-3">
        <span className="font-heading text-[24px] leading-none tabular">{km(plan.total_km)}</span>
        <span className="text-[13px] text-ink-72 tabular">{minutes(plan.total_minutes)}</span>
      </div>
      <div className="text-[12px] text-ink-58 tabular">{pct(Math.max(0, saved))} shorter than visiting by priority ({km(plan.baseline_km)})</div>
      <ol className="grid gap-1 text-[12px] max-h-[22vh] overflow-y-auto">
        {plan.stops.map((s) => (
          <li key={s.work_order_id} className="flex items-center gap-2 tabular">
            <span className="w-4 h-4 rounded-sm bg-accent-800 text-bg font-heading text-[10px] flex items-center justify-center">{s.stop_order}</span>
            <span className="flex-1 truncate">{potholes[s.pothole_id] ? displayName(potholes[s.pothole_id]) : s.pothole_id.slice(0, 8)}</span>
            <span className="text-ink-58">eta {hhmm(s.eta)}</span>
          </li>
        ))}
      </ol>
      <label className="field"><span className="block text-[12px] mb-1 text-ink-72">Crew email</span>
        <input className="input" type="text" placeholder="crew@council.gov.uk, second@council.gov.uk" value={to} onChange={(e) => setTo(e.target.value)} />
      </label>
      {dispatchState === "sent" && (
        <div className="text-[12px] text-ink-72" role="status">
          Sent to {dispatchedTo} {dispatchedTo === 1 ? "address" : "addresses"}. Crew page: <a href={`/route/${plan.route_plan_id}`} target="_blank" rel="noreferrer">/route/{plan.route_plan_id.slice(0, 8)}…</a>
        </div>
      )}
      {dispatchState === "error" && <div className="text-[12px] text-ink-72" role="alert">{dispatchError}</div>}
      <div className="flex gap-2 justify-end">
        <button type="button" className="btn btn-ghost" onClick={resetPlan} title="Plan stays saved for this crew">Discard plan</button>
        <button type="button" className="btn btn-primary btn-pill" disabled={addresses.length === 0 || dispatchState === "sending"} onClick={() => void dispatch(addresses)}>
          {dispatchState === "sending" ? "Sending…" : "Dispatch to crew"}
        </button>
      </div>
    </div>
  );
}
