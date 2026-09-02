"use client";
import { useConsole } from "@/lib/console/store";
import { countInArea } from "@/lib/console/area";

export function Footer() {
  const selected = useConsole((s) => s.selected);
  const potholes = useConsole((s) => s.potholes);
  const crews = useConsole((s) => s.crews);
  const planner = useConsole((s) => s.planner);
  const plannerOpen = useConsole((s) => s.plannerOpen);
  const planState = useConsole((s) => s.planState);
  const plan = useConsole((s) => s.plan);
  const setPlannerOpen = useConsole((s) => s.setPlannerOpen);
  const planRoute = useConsole((s) => s.planRoute);
  const n = selected.length;
  const mins = n * planner.serviceMinPerStop + Math.round(n * 6.5);
  const crew = crews.find((c) => c.id === planner.crewId);
  const openCount = Object.values(potholes).filter((p) => p.status === "suspected" || p.status === "confirmed").length;
  const candidates = planner.mode === "manual" ? n : planner.area ? countInArea(Object.values(potholes), planner.area) : openCount;
  const canPlan = candidates > 0;
  const label = planState === "planning" ? "Planning…" : "Plan route";

  return (
    <div className="flex items-center justify-between gap-4 px-4 border-t border-divider" style={{ height: "var(--console-footer-h)" }}>
      {planState === "planned" ? (
        <div className="text-[13px] font-semibold text-text">Route planned · {plan?.stops.length ?? 0} stops</div>
      ) : (
        <div className="text-[12px] leading-snug text-ink-58 tabular">
          <div className="text-[13px] font-semibold text-text">{n ? `${n} selected for tomorrow` : "Nothing selected"}</div>
          <div>{n ? `~${mins} min including travel · crew ${crew?.name ?? "—"}` : "Click a row or a marker to build a route"}</div>
        </div>
      )}
      {planState !== "planned" && (
        <button
          type="button"
          className="btn btn-primary btn-pill font-body text-[13px] font-semibold px-[18px] py-[11px] whitespace-nowrap"
          disabled={!canPlan || planState === "planning"}
          onClick={() => (plannerOpen ? void planRoute() : setPlannerOpen(true))}
        >
          {label}
        </button>
      )}
    </div>
  );
}
