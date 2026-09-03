"use client";

import { useState } from "react";

import type { CrewPlan } from "@/lib/crew/plan";
import type { WorkOrderStatus } from "@/lib/types";
import { km, minutes } from "@/lib/console/format";
import { StopList } from "./StopList";
import { DriveMap } from "./DriveMap";
import { StopCard } from "./StopCard";

/**
 * The driver's screen. Mobile-first: header, map (Task 3), then a bottom
 * sheet with the current stop and the full list. Holds the page's only
 * client state; children take props and render.
 */
export default function CrewRoute({ plan }: { plan: CrewPlan }) {
  const [statuses, setStatuses] = useState<Record<string, WorkOrderStatus>>(() =>
    Object.fromEntries(plan.stops.map((s) => [s.work_order_id, s.status])),
  );
  const setStatus = (workOrderId: string, status: WorkOrderStatus) =>
    setStatuses((prev) => ({ ...prev, [workOrderId]: status }));
  const current = plan.stops.find((s) => statuses[s.work_order_id] !== "done") ?? null;

  const totals = [
    `${plan.stops.length} ${plan.stops.length === 1 ? "stop" : "stops"}`,
    ...(plan.total_km === null ? [] : [km(plan.total_km)]),
    ...(plan.total_minutes === null ? [] : [minutes(plan.total_minutes)]),
  ].join(", ");

  return (
    <main style={{ height: "100dvh", display: "grid", gridTemplateRows: "auto 1fr auto", background: "var(--canvas)" }}>
      <header style={{ padding: "var(--s3) var(--s4)", background: "var(--surface)", borderBottom: "1px solid var(--rule)" }}>
        <h1 style={{ fontSize: "var(--t-title)", margin: 0, letterSpacing: "-0.015em" }}>{plan.crew_name}</h1>
        <p className="secondary" style={{ margin: 0, fontSize: "var(--t-small)" }}>
          <span className="data">{plan.plan_date}</span> · {totals}
        </p>
      </header>
      <DriveMap plan={plan} />
      <section
        style={{
          background: "var(--surface)", borderTop: "1px solid var(--rule)",
          padding: "var(--s3) var(--s4)", maxHeight: "45dvh", overflowY: "auto",
          display: "grid", gap: "var(--s3)", alignContent: "start",
        }}
      >
        {current ? (
          <StopCard
            key={current.work_order_id}
            stop={current}
            status={statuses[current.work_order_id]}
            onStatus={setStatus}
          />
        ) : (
          <p style={{ margin: 0, fontSize: "var(--t-small)", fontWeight: 600 }}>
            All stops are done. Head back to {plan.end.label === "Depot" ? "the depot" : plan.end.label}.
          </p>
        )}
        <StopList stops={plan.stops} statuses={statuses} currentId={current?.work_order_id ?? null} />
      </section>
    </main>
  );
}
