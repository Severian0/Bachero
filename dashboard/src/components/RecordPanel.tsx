"use client";

import DetectionFrame from "./DetectionFrame";
import { FIXTURE_DAY } from "@/lib/fixtures";
import { SEVERITY_WORD, severityFill, STATUS_VISUAL, whenOf } from "@/lib/visual";
import type { Pothole } from "@/lib/model";

/** Uncertainty is stated once, here, and never repeated as a warning. */
const UNCERTAINTY: Record<Pothole["status"], string> = {
  suspected:
    "One vehicle only. This is an observation, not a finding. A second vehicle must corroborate it before a crew is sent.",
  confirmed: "Corroborated by more than one vehicle. Ready to be added to a route.",
  scheduled: "Committed to a crew and carrying a stop order. Remove it from the route to change that.",
  repaired: "Closed. It drops out of the queue at the end of the day.",
  false_positive: "Dismissed as a false positive.",
};

export default function RecordPanel({
  pothole,
  onRoute,
  onBack,
  onToggleRoute,
  onDismiss,
}: {
  pothole: Pothole;
  onRoute: boolean;
  onBack: () => void;
  onToggleRoute: () => void;
  onDismiss: () => void;
}) {
  const v = STATUS_VISUAL[pothole.status];
  const canRoute = pothole.status === "confirmed" || pothole.status === "suspected";

  return (
    <div style={{ display: "grid", gridTemplateRows: "auto minmax(0,1fr) auto", minHeight: 0, background: "var(--surface)" }}>
      <div style={{ display: "flex", alignItems: "center", gap: "var(--s2)", padding: "var(--s2) var(--s3)", borderBottom: "1px solid var(--rule-soft)" }}>
        <button type="button" className="btn btn-quiet btn-sm" onClick={onBack}>
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <path d="M7.5 2.5 4 6l3.5 3.5" />
          </svg>
          Repair queue
        </button>
      </div>

      <div style={{ overflowY: "auto", padding: "var(--s4)", display: "grid", gap: "var(--s4)", alignContent: "start" }}>
        <div>
          <h2 style={{ fontSize: "var(--t-title)", letterSpacing: "-0.015em" }}>{pothole.street}</h2>
          {pothole.locality && (
            <p className="secondary" style={{ margin: "2px 0 0", fontSize: "var(--t-small)" }}>
              {pothole.locality}
            </p>
          )}
          <div style={{ display: "flex", alignItems: "center", gap: "var(--s2)", marginTop: "var(--s3)", flexWrap: "wrap" }}>
            <span className={v.tag}>{v.label}</span>
            <span className="data secondary" style={{ fontSize: "var(--t-small)" }}>
              {pothole.ref}
            </span>
          </div>
        </div>

        <DetectionFrame pothole={pothole} />

        <div>
          <h3 className="micro secondary" style={{ marginBottom: "var(--s2)" }}>
            Severity
          </h3>
          <div style={{ display: "flex", alignItems: "center", gap: "var(--s3)" }}>
            <span aria-hidden style={{ display: "flex", gap: 3 }}>
              {[1, 2, 3, 4].map((s) => (
                <i
                  key={s}
                  style={{
                    display: "block",
                    width: 26,
                    height: 6,
                    borderRadius: 1,
                    background: severityFill(pothole.severity, s <= pothole.severity),
                  }}
                />
              ))}
            </span>
            <span style={{ fontSize: "var(--t-small)", fontWeight: 600 }}>
              {SEVERITY_WORD[pothole.severity]}, grade {pothole.severity} of 4
            </span>
          </div>
        </div>

        <div>
          <h3 className="micro secondary" style={{ marginBottom: "var(--s2)" }}>
            Evidence
          </h3>
          <dl style={{ margin: 0, display: "grid", gap: 0, border: "1px solid var(--rule-soft)", borderRadius: "var(--r-md)", overflow: "hidden" }}>
            <Fact label="Vehicles reporting" value={String(pothole.vehicleCount)} />
            <Fact label="Passes over location" value={String(pothole.passCount)} />
            {pothole.confidence !== null && (
              <Fact label="Detector confidence" value={`${Math.round(pothole.confidence * 100)}%`} />
            )}
            <Fact label="First seen" value={whenOf(pothole.firstSeenIso, FIXTURE_DAY)} />
            <Fact label="Last seen" value={whenOf(pothole.lastSeenIso, FIXTURE_DAY)} />
            <Fact label="Coordinates" value={`${pothole.lat.toFixed(5)}, ${pothole.lng.toFixed(5)}`} />
            <Fact label="Queue priority" value={String(pothole.priority)} last />
          </dl>
          <p className="secondary" style={{ margin: "var(--s2) 0 0", fontSize: "var(--t-small)", lineHeight: 1.45 }}>
            {UNCERTAINTY[pothole.status]}
          </p>
        </div>
      </div>

      <div style={{ display: "grid", gap: "var(--s2)", padding: "var(--s3) var(--s4)", borderTop: "1px solid var(--rule)", background: "var(--canvas)" }}>
        {canRoute ? (
          <button
            type="button"
            className={onRoute ? "btn btn-secondary" : "btn btn-primary"}
            onClick={onToggleRoute}
            style={{ width: "100%" }}
          >
            {onRoute ? "Remove from route" : "Add to route"}
          </button>
        ) : (
          <p className="secondary" style={{ margin: 0, fontSize: "var(--t-small)" }}>
            {pothole.status === "scheduled"
              ? `On a crew route as stop ${pothole.stopOrder}.`
              : "Closed. No action available."}
          </p>
        )}
        <button type="button" className="btn btn-quiet btn-sm" onClick={onDismiss} style={{ width: "100%" }}>
          Dismiss as false positive
        </button>
      </div>
    </div>
  );
}

function Fact({ label, value, last }: { label: string; value: string; last?: boolean }) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "baseline",
        justifyContent: "space-between",
        gap: "var(--s3)",
        padding: "7px var(--s3)",
        borderBottom: last ? "none" : "1px solid var(--rule-soft)",
      }}
    >
      <dt className="secondary" style={{ fontSize: "var(--t-small)" }}>
        {label}
      </dt>
      <dd className="data" style={{ margin: 0, fontSize: "var(--t-small)", fontWeight: 500, textAlign: "right" }}>
        {value}
      </dd>
    </div>
  );
}
