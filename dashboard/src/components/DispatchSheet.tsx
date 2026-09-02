"use client";

import { useEffect, useRef, useState } from "react";
import { CREWS } from "@/lib/fixtures";
import { OPERATOR } from "@/lib/console/branding";
import { CREW_KM_PER_HOUR, MINUTES_ON_SITE } from "@/lib/route";
import { SEVERITY_WORD, STATUS_VISUAL } from "@/lib/visual";
import type { Crew, Pothole } from "@/lib/model";

/**
 * Committing a crew's day is the accountable act in this product, so it is
 * the one place that interrupts. The sheet states the order, the cost, the
 * assumptions behind the cost, and anything on the route that the console
 * itself has called unconfirmed, before it will send.
 */
export default function DispatchSheet({
  stops,
  km,
  minutes,
  onRemove,
  onClose,
  onSent,
}: {
  stops: Pothole[];
  km: number;
  minutes: number;
  onRemove: (id: string) => void;
  onClose: () => void;
  onSent: (crew: Crew, reference: string) => void;
}) {
  const [crewId, setCrewId] = useState(CREWS.find((c) => c.available)?.id ?? CREWS[0].id);
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState<{ crew: Crew; reference: string; at: string } | null>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  const unconfirmed = stops.filter((s) => s.status === "suspected");

  useEffect(() => {
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        onClose();
        return;
      }
      if (e.key !== "Tab" || !panelRef.current) return;
      const focusable = panelRef.current.querySelectorAll<HTMLElement>(
        'button:not(:disabled), input:not(:disabled), [href], [tabindex]:not([tabindex="-1"])',
      );
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [onClose]);

  function send() {
    const crew = CREWS.find((c) => c.id === crewId)!;
    setSending(true);
    window.setTimeout(() => {
      const d = new Date();
      const reference = `DR-${String(d.getHours()).padStart(2, "0")}${String(d.getMinutes()).padStart(2, "0")}-${stops.length}`;
      setSending(false);
      setSent({
        crew,
        reference,
        at: `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`,
      });
      onSent(crew, reference);
    }, 700);
  }

  return (
    <div
      role="presentation"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 200,
        display: "grid",
        placeItems: "center",
        padding: "var(--s5)",
        background: "rgb(11 12 12 / 0.55)",
      }}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="dispatch-title"
        style={{
          width: "min(560px, 100%)",
          maxHeight: "100%",
          display: "grid",
          gridTemplateRows: "auto minmax(0,1fr) auto",
          background: "var(--surface)",
          borderRadius: "var(--r-lg)",
          boxShadow: "var(--shadow-3)",
          animation: "bch-rise 200ms var(--ease) both",
          overflow: "hidden",
        }}
      >
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: "var(--s4)", padding: "var(--s4) var(--s5)", borderBottom: "1px solid var(--rule-soft)" }}>
          <div>
            <h2 id="dispatch-title" style={{ fontSize: "var(--t-title)", letterSpacing: "-0.015em" }}>
              {sent ? "Route dispatched" : "Dispatch route to a crew"}
            </h2>
            <p className="secondary" style={{ margin: "2px 0 0", fontSize: "var(--t-small)" }}>
              {sent
                ? `Sent by ${OPERATOR.name}, ${OPERATOR.role}`
                : `${stops.length} ${stops.length === 1 ? "stop" : "stops"} in the order a crew would drive them`}
            </p>
          </div>
          <button ref={closeRef} type="button" className="btn btn-quiet btn-sm" onClick={onClose} aria-label="Close">
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden>
              <path d="M3.5 3.5l7 7M10.5 3.5l-7 7" />
            </svg>
          </button>
        </div>

        <div style={{ overflowY: "auto", padding: "var(--s4) var(--s5)", display: "grid", gap: "var(--s4)", alignContent: "start" }}>
          {sent ? (
            <>
              <dl style={{ margin: 0, display: "grid", gap: "var(--s2)" }}>
                <Line label="Work order" value={sent.reference} />
                <Line label="Crew" value={`${sent.crew.name}, ${sent.crew.depot}`} />
                <Line label="Dispatched" value={`${sent.at} today`} />
                <Line label="Stops" value={`${stops.length}, ${km.toFixed(1)} km, about ${minutes} min`} />
              </dl>
              <p style={{ margin: 0, fontSize: "var(--t-small)", lineHeight: 1.5, padding: "var(--s3)", background: "var(--committed-soft)", borderRadius: "var(--r-md)", border: "1px solid var(--committed-edge)" }}>
                A work order with the route, the coordinates and the detector frames has been emailed to {sent.crew.depot}.
                The stops now show as scheduled on the map.
              </p>
            </>
          ) : (
            <>
              <ol style={{ margin: 0, padding: 0, listStyle: "none", display: "grid", border: "1px solid var(--rule-soft)", borderRadius: "var(--r-md)", overflow: "hidden" }}>
                {stops.map((s, i) => (
                  <li
                    key={s.id}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "var(--s3)",
                      padding: "var(--s2) var(--s3)",
                      borderBottom: i === stops.length - 1 ? "none" : "1px solid var(--rule-soft)",
                    }}
                  >
                    <span className="data" style={{ width: 22, height: 22, flexShrink: 0, display: "grid", placeItems: "center", borderRadius: "var(--r-sm)", background: "var(--committed)", color: "#fff", fontSize: 11, fontWeight: 700 }}>
                      {i + 1}
                    </span>
                    <span style={{ flex: 1, minWidth: 0 }}>
                      <span style={{ display: "block", fontSize: "var(--t-small)", fontWeight: 600 }}>{s.street}</span>
                      <span className="secondary" style={{ display: "block", fontSize: 11 }}>
                        <span className="data">{s.ref}</span>, {SEVERITY_WORD[s.severity].toLowerCase()}, {STATUS_VISUAL[s.status].label.toLowerCase()}
                      </span>
                    </span>
                    <button type="button" className="btn btn-quiet btn-sm" onClick={() => onRemove(s.id)}>
                      Remove
                    </button>
                  </li>
                ))}
              </ol>

              {unconfirmed.length > 0 && (
                <p style={{ margin: 0, fontSize: "var(--t-small)", lineHeight: 1.5, padding: "var(--s3)", background: "#fdf6e3", border: "1px solid #d4b95e", borderRadius: "var(--r-md)" }}>
                  <strong style={{ fontWeight: 600 }}>
                    {unconfirmed.length} {unconfirmed.length === 1 ? "stop is" : "stops are"} suspected only.
                  </strong>{" "}
                  {unconfirmed.map((s) => s.street).join(", ")} {unconfirmed.length === 1 ? "has" : "have"} been seen by
                  one vehicle and not corroborated. Sending a crew to an unconfirmed defect is your decision to record.
                </p>
              )}

              <fieldset style={{ border: 0, margin: 0, padding: 0 }}>
                <legend className="micro secondary" style={{ marginBottom: "var(--s2)" }}>
                  Send to
                </legend>
                <div style={{ display: "grid", gap: 6 }}>
                  {CREWS.map((c) => (
                    <label
                      key={c.id}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: "var(--s3)",
                        padding: "var(--s2) var(--s3)",
                        border: `1px solid ${crewId === c.id ? "var(--action)" : "var(--rule)"}`,
                        background: crewId === c.id ? "var(--action-soft)" : "var(--surface)",
                        borderRadius: "var(--r-md)",
                        cursor: c.available ? "pointer" : "not-allowed",
                        opacity: c.available ? 1 : 0.55,
                      }}
                    >
                      <input
                        type="radio"
                        name="crew"
                        value={c.id}
                        checked={crewId === c.id}
                        disabled={!c.available}
                        onChange={() => setCrewId(c.id)}
                        style={{ accentColor: "var(--action)", width: 16, height: 16 }}
                      />
                      <span style={{ flex: 1, fontSize: "var(--t-small)", fontWeight: 600 }}>{c.name}</span>
                      <span className="secondary" style={{ fontSize: "var(--t-small)" }}>
                        {c.available ? c.depot : "Not available today"}
                      </span>
                    </label>
                  ))}
                </div>
              </fieldset>

              <div>
                <h3 className="micro secondary" style={{ marginBottom: "var(--s2)" }}>
                  Estimate
                </h3>
                <p style={{ margin: 0, fontSize: "var(--t-small)", lineHeight: 1.5 }}>
                  <span className="data" style={{ fontWeight: 600 }}>{km.toFixed(1)} km</span> driving and{" "}
                  <span className="data" style={{ fontWeight: 600 }}>{minutes} min</span> in total.
                </p>
                <p className="secondary" style={{ margin: "2px 0 0", fontSize: "var(--t-small)", lineHeight: 1.5 }}>
                  Assumes {CREW_KM_PER_HOUR} km/h average across the network and {MINUTES_ON_SITE} minutes per repair.
                  Straight-line distance between stops, so the real drive will be longer.
                </p>
              </div>
            </>
          )}
        </div>

        <div style={{ display: "flex", justifyContent: "flex-end", gap: "var(--s2)", padding: "var(--s3) var(--s5)", borderTop: "1px solid var(--rule-soft)", background: "var(--canvas)" }}>
          {sent ? (
            <button type="button" className="btn btn-primary" onClick={onClose}>
              Back to the queue
            </button>
          ) : (
            <>
              <button type="button" className="btn btn-secondary" onClick={onClose}>
                Cancel
              </button>
              <button type="button" className="btn btn-commit" onClick={send} disabled={sending || stops.length === 0}>
                {sending ? "Sending" : `Send to ${CREWS.find((c) => c.id === crewId)?.name}`}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function Line({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: "var(--s3)" }}>
      <dt className="secondary" style={{ fontSize: "var(--t-small)" }}>
        {label}
      </dt>
      <dd className="data" style={{ margin: 0, fontSize: "var(--t-small)", fontWeight: 600 }}>
        {value}
      </dd>
    </div>
  );
}
