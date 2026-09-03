"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { OPERATOR } from "@/lib/console/branding";
import { displayName, planCandidates, severityGrade } from "@/lib/console/derive";
import { hhmm, km, minutes, parseAddresses, pct, plural } from "@/lib/console/format";
import { firstLegKm } from "@/lib/console/nearest";
import { useConsole, type Mode } from "@/lib/console/store";
import { SEVERITY_WORD, STATUS_VISUAL } from "@/lib/console/visual";
import { potholeRef, type Pothole } from "@/lib/data/types";

const MODES: { key: Mode; label: string }[] = [
  { key: "manual", label: "Pick these" },
  { key: "count", label: "Best N" },
  { key: "time", label: "Time budget" },
];

/** Empty or invalid input commits the fallback instead of coercing to 0. */
const num = (v: string, fallback: number) => {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : fallback;
};

/**
 * Committing a crew's day is the accountable act in this product, so it is
 * the one place that interrupts. The sheet states who is going, how the route
 * was chosen, what it costs, and anything on it that the console itself has
 * called unconfirmed, before it will send.
 *
 * It holds no facts of its own: the planner settings, the plan and the
 * dispatch all live in the console store, so what the sheet shows and what the
 * map draws can never disagree. Its only local state is the email field.
 */
export default function DispatchSheet() {
  const potholes = useConsole((s) => s.potholes);
  const crews = useConsole((s) => s.crews);
  const selected = useConsole((s) => s.selected);
  const planner = useConsole((s) => s.planner);
  const planState = useConsole((s) => s.planState);
  const plan = useConsole((s) => s.plan);
  const planCrewId = useConsole((s) => s.planCrewId);
  const planError = useConsole((s) => s.planError);
  const dispatchState = useConsole((s) => s.dispatchState);
  const dispatchError = useConsole((s) => s.dispatchError);
  const dispatchedTo = useConsole((s) => s.dispatchedTo);
  const dispatchResult = useConsole((s) => s.dispatchResult);

  const setPlanner = useConsole((s) => s.setPlanner);
  const startAnchor = useConsole((s) => s.planner.start);
  const endAnchor = useConsole((s) => s.planner.end);
  const setStartAnchor = useConsole((s) => s.setStartAnchor);
  const setEndAnchor = useConsole((s) => s.setEndAnchor);
  const setSheetOpen = useConsole((s) => s.setSheetOpen);
  const setPreviewDrive = useConsole((s) => s.setPreviewDrive);
  const toggleSelected = useConsole((s) => s.toggleSelected);
  const clearSelection = useConsole((s) => s.clearSelection);
  const planRoute = useConsole((s) => s.planRoute);
  const resetPlan = useConsole((s) => s.resetPlan);
  const dispatch = useConsole((s) => s.dispatch);

  const [to, setTo] = useState(process.env.NEXT_PUBLIC_DEMO_CREW_EMAIL ?? "");
  const closeRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  const close = () => setSheetOpen(false);

  useEffect(() => {
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        setSheetOpen(false);
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
  }, [setSheetOpen]);

  const all = Object.values(potholes);
  // Two different crews, deliberately: the one being chosen, and the one the
  // standing route was solved for. Only the second may appear on a plan.
  const planCrew = crews.find((c) => c.id === planCrewId);
  const candidates = planCandidates(all, {
    mode: planner.mode, selectedCount: selected.length,
  }, plan);
  // Anchor choices are limited to work that is actually still open.
  const anchorable = all
    .filter((x) => x.status === "suspected" || x.status === "confirmed")
    .sort((a, b) => b.priority - a.priority);

  const planned = planState === "planned" && plan ? plan : null;
  const sent = dispatchState === "sent" && planned;
  // The plan is published either way; `emailed` is the narrower claim, and it
  // is false whenever the email service is not configured.
  const emailed = dispatchResult?.sent ?? false;
  const crewPage = dispatchResult?.crewPage ?? (planned ? `/route/${planned.route_plan_id}` : "");

  // Before a route comes back the sheet lists what the operator picked, and
  // only in the mode where those picks are the input; after it, the order the
  // solver actually chose. Everything below reads one list.
  const rows: { key: string; pothole: Pothole | undefined; order: number; eta?: string }[] = planned
    ? planned.stops.map((s) => ({
        key: s.work_order_id, pothole: potholes[s.pothole_id], order: s.stop_order, eta: s.eta,
      }))
    : planner.mode === "manual"
      ? selected.map((id, i) => ({ key: id, pothole: potholes[id], order: i + 1 }))
      : [];
  const unconfirmed = rows
    .map((r) => r.pothole)
    .filter((p): p is Pothole => p != null && p.status === "suspected");

  /**
   * Taking a stop off a planned route means planning again without it: the
   * plan is the solver's answer, not a list to edit. Only offered in manual
   * mode, where the operator's own picks are the input. `planRoute` clears the
   * selection when it succeeds, so the remaining stops are re-selected first.
   */
  function removeStop(id: string) {
    if (!planned) {
      toggleSelected(id);
      return;
    }
    clearSelection();
    for (const s of planned.stops) {
      if (s.pothole_id !== id && s.work_order_id !== id) toggleSelected(s.pothole_id);
    }
    void planRoute();
  }

  const addresses = parseAddresses(to);
  const saved = planned && planned.baseline_km > 0 ? 1 - planned.total_km / planned.baseline_km : 0;

  return (
    <div
      role="presentation"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) close();
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
              {sent ? (emailed ? "Route dispatched" : "Plan published") : "Dispatch route to a crew"}
            </h2>
            <p className="secondary" style={{ margin: "2px 0 0", fontSize: "var(--t-small)" }}>
              {sent
                ? `${emailed ? "Sent" : "Published"} by ${OPERATOR.name}, ${OPERATOR.role}`
                : planned
                  ? `${planned.stops.length} ${planned.stops.length === 1 ? "stop" : "stops"} in the order a crew would drive them`
                  : `Plan for ${planner.planDate}`}
            </p>
          </div>
          <button ref={closeRef} type="button" className="btn btn-quiet btn-sm" onClick={close} aria-label="Close">
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden>
              <path d="M3.5 3.5l7 7M10.5 3.5l-7 7" />
            </svg>
          </button>
        </div>

        <div style={{ overflowY: "auto", padding: "var(--s4) var(--s5)", display: "grid", gap: "var(--s4)", alignContent: "start" }}>
          {sent ? (
            <>
              <dl style={{ margin: 0, display: "grid", gap: "var(--s2)" }}>
                <Line label="Work order" value={planned.route_plan_id} />
                <Line label="Crew" value={planCrew?.name ?? "—"} />
                <Line label="Stops" value={`${planned.stops.length}, ${km(planned.total_km)}, ${minutes(planned.total_minutes)}`} />
                {emailed && <Line label="Sent to" value={plural(dispatchedTo, "address", "addresses")} />}
              </dl>
              <p style={{ margin: 0, fontSize: "var(--t-small)", lineHeight: 1.5, padding: "var(--s3)", background: "var(--committed-soft)", borderRadius: "var(--r-md)", border: "1px solid var(--committed-edge)" }}>
                {emailed ? (
                  <>
                    A work order with the route, the coordinates and the detector frames has been emailed to {planCrew?.name ?? "the crew"}.
                    The stops now show as scheduled on the map.
                  </>
                ) : (
                  <>
                    No email was sent because the email service is not configured. Open the crew page link below or add
                    RESEND_API_KEY and dispatch again. The stops now show as scheduled on the map.
                  </>
                )}
              </p>
              <p style={{ margin: 0, fontSize: "var(--t-small)" }}>
                Crew page:{" "}
                <a className="data" href={crewPage} target="_blank" rel="noreferrer" style={{ color: "var(--action)" }}>
                  /route/{planned.route_plan_id.slice(0, 8)}…
                </a>
              </p>
            </>
          ) : (
            <>
              {planned ? (
                /* The route was solved for one crew. Reassigning it would mean
                   planning again, so the crew is stated, not offered. */
                <p style={{ margin: 0, fontSize: "var(--t-small)" }}>
                  <span className="secondary">Crew:</span>{" "}
                  <span style={{ fontWeight: 600 }}>{planCrew?.name ?? "—"}</span>
                </p>
              ) : (
                <fieldset style={{ border: 0, margin: 0, padding: 0 }}>
                  <legend className="micro secondary" style={{ marginBottom: "var(--s2)" }}>
                    Send to
                  </legend>
                  <div style={{ display: "grid", gap: 6 }}>
                    {crews.map((c) => (
                      <label
                        key={c.id}
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: "var(--s3)",
                          padding: "var(--s2) var(--s3)",
                          border: `1px solid ${planner.crewId === c.id ? "var(--action)" : "var(--rule)"}`,
                          background: planner.crewId === c.id ? "var(--action-soft)" : "var(--surface)",
                          borderRadius: "var(--r-md)",
                          cursor: "pointer",
                        }}
                      >
                        <input
                          type="radio"
                          name="crew"
                          value={c.id}
                          checked={planner.crewId === c.id}
                          onChange={() => setPlanner({
                            crewId: c.id,
                            maxStops: c.repairs_per_shift ?? planner.maxStops,
                            timeBudgetMin: c.shift_minutes ?? planner.timeBudgetMin,
                          })}
                          style={{ accentColor: "var(--action)", width: 16, height: 16 }}
                        />
                        <span style={{ flex: 1, fontSize: "var(--t-small)", fontWeight: 600 }}>{c.name}</span>
                      </label>
                    ))}
                  </div>
                </fieldset>
              )}

              {!planned && (
                <div style={{ display: "grid", gap: "var(--s3)" }}>
                  <div style={{ display: "grid", gap: "var(--s1)" }}>
                    <span className="micro secondary">Start</span>
                    <div role="group" aria-label="Start" style={{ display: "flex", gap: 6 }}>
                      <Dial
                        label="Depot"
                        on={startAnchor.kind === "depot"}
                        onClick={() => setStartAnchor({ kind: "depot" })}
                      />
                      <Dial
                        label="Pothole"
                        on={startAnchor.kind === "pothole"}
                        disabled={anchorable.length === 0}
                        onClick={() => setStartAnchor({ kind: "pothole", id: anchorable[0].id })}
                      />
                    </div>
                    {startAnchor.kind === "pothole" && (
                      <select
                        style={INPUT}
                        aria-label="Start pothole"
                        value={startAnchor.id}
                        onChange={(e) => setStartAnchor({ kind: "pothole", id: e.target.value })}
                      >
                        {anchorable.map((x) => (
                          <option key={x.id} value={x.id}>
                            {potholeRef(x.id)} - {displayName(x)}
                          </option>
                        ))}
                      </select>
                    )}
                  </div>

                  <div style={{ display: "grid", gap: "var(--s1)" }}>
                    <span className="micro secondary">End</span>
                    <div role="group" aria-label="End" style={{ display: "flex", gap: 6 }}>
                      <Dial
                        label="Same as start"
                        on={endAnchor.kind === "same"}
                        onClick={() => setEndAnchor({ kind: "same" })}
                      />
                      <Dial
                        label="Pothole"
                        on={endAnchor.kind === "pothole"}
                        disabled={anchorable.length === 0}
                        onClick={() => setEndAnchor({ kind: "pothole", id: anchorable[0].id })}
                      />
                    </div>
                    {endAnchor.kind === "pothole" && (
                      <select
                        style={INPUT}
                        aria-label="End pothole"
                        value={endAnchor.id}
                        onChange={(e) => setEndAnchor({ kind: "pothole", id: e.target.value })}
                      >
                        {anchorable.map((x) => (
                          <option key={x.id} value={x.id}>
                            {potholeRef(x.id)} - {displayName(x)}
                          </option>
                        ))}
                      </select>
                    )}
                  </div>

                  <div role="group" aria-label="Planning mode" style={{ display: "flex", gap: 6 }}>
                    {MODES.map((m) => {
                      const on = planner.mode === m.key;
                      return (
                        <button
                          key={m.key}
                          type="button"
                          aria-pressed={on}
                          onClick={() => setPlanner({ mode: m.key })}
                          style={{
                            flex: 1,
                            height: 30,
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            fontSize: "var(--t-small)",
                            fontWeight: 600,
                            cursor: "pointer",
                            borderRadius: "var(--r-md)",
                            border: `1px solid ${on ? "var(--action)" : "var(--rule)"}`,
                            background: on ? "var(--action)" : "var(--surface)",
                            color: on ? "var(--action-ink)" : "var(--ink)",
                            transition: "background 120ms linear, border-color 120ms linear",
                          }}
                        >
                          {m.label}
                        </button>
                      );
                    })}
                  </div>

                  <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0,1fr))", gap: "var(--s3)" }}>
                    {planner.mode === "count" && (
                      <Field label="Stops">
                        <input
                          key={`stops-${planner.crewId ?? "none"}`}
                          className="data"
                          style={INPUT}
                          type="number"
                          min={1}
                          max={50}
                          defaultValue={planner.maxStops}
                          onBlur={(e) => setPlanner({ maxStops: num(e.target.value, planner.maxStops) })}
                        />
                      </Field>
                    )}
                    {planner.mode === "time" && (
                      <Field label="Minutes">
                        <input
                          key={`minutes-${planner.crewId ?? "none"}`}
                          className="data"
                          style={INPUT}
                          type="number"
                          min={30}
                          step={30}
                          defaultValue={planner.timeBudgetMin}
                          onBlur={(e) => setPlanner({ timeBudgetMin: num(e.target.value, planner.timeBudgetMin) })}
                        />
                      </Field>
                    )}
                    <Field label="Minutes per stop">
                      <input
                        key={`service-${planner.crewId ?? "none"}`}
                        className="data"
                        style={INPUT}
                        type="number"
                        min={5}
                        step={5}
                        defaultValue={planner.serviceMinPerStop}
                        onBlur={(e) => setPlanner({ serviceMinPerStop: num(e.target.value, planner.serviceMinPerStop) })}
                      />
                    </Field>
                  </div>

                </div>
              )}

              {planned && (
                <div>
                  <div style={{ display: "flex", alignItems: "baseline", gap: "var(--s3)" }}>
                    <span className="data" style={{ fontSize: "var(--t-metric)", fontWeight: 600, lineHeight: 1 }}>
                      {km(planned.total_km)}
                    </span>
                    <span className="data secondary" style={{ fontSize: "var(--t-small)" }}>
                      {minutes(planned.total_minutes)}
                    </span>
                    <button
                      type="button"
                      className="btn btn-secondary btn-sm"
                      style={{ marginLeft: "auto" }}
                      onClick={() => {
                        setPreviewDrive(true);
                        setSheetOpen(false);
                      }}
                    >
                      Preview drive
                    </button>
                  </div>
                  <p className="secondary" style={{ margin: "var(--s1) 0 0", fontSize: "var(--t-small)" }}>
                    <span className="data">{pct(Math.max(0, saved))}</span> shorter than visiting by priority (
                    <span className="data">{km(planned.baseline_km)}</span>)
                  </p>
                  {firstLegKm(planned) > 1 && (
                    <p className="secondary" style={{ margin: "var(--s1) 0 0", fontSize: "var(--t-small)" }}>
                      First stop {km(firstLegKm(planned))} from {planned.start.label}.
                    </p>
                  )}
                </div>
              )}

              {rows.length > 0 && (
                <ol style={{ margin: 0, padding: 0, listStyle: "none", display: "grid", border: "1px solid var(--rule-soft)", borderRadius: "var(--r-md)", overflow: "hidden" }}>
                  {rows.map((r, i) => (
                    <li
                      key={r.key}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: "var(--s3)",
                        padding: "var(--s2) var(--s3)",
                        borderBottom: i === rows.length - 1 ? "none" : "1px solid var(--rule-soft)",
                      }}
                    >
                      <span className="data" style={{ width: 22, height: 22, flexShrink: 0, display: "grid", placeItems: "center", borderRadius: "var(--r-sm)", background: "var(--action)", color: "var(--action-ink)", fontSize: 11, fontWeight: 700 }}>
                        {r.order}
                      </span>
                      <span style={{ flex: 1, minWidth: 0 }}>
                        <span style={{ display: "block", fontSize: "var(--t-small)", fontWeight: 600 }}>
                          {r.pothole ? displayName(r.pothole) : "Record not loaded"}
                        </span>
                        {r.pothole && (
                          <span className="secondary" style={{ display: "block", fontSize: 11 }}>
                            <span className="data">{r.pothole.ref}</span>, {SEVERITY_WORD[severityGrade(r.pothole.severity)].toLowerCase()}, {STATUS_VISUAL[r.pothole.status].label.toLowerCase()}
                          </span>
                        )}
                      </span>
                      {r.eta && (
                        <span className="data secondary" style={{ fontSize: 11 }}>
                          eta {hhmm(r.eta)}
                        </span>
                      )}
                      {(!planned || planner.mode === "manual") && (
                        <button type="button" className="btn btn-quiet btn-sm" onClick={() => removeStop(r.pothole?.id ?? r.key)}>
                          Remove
                        </button>
                      )}
                    </li>
                  ))}
                </ol>
              )}

              {unconfirmed.length > 0 && (
                <p style={{ margin: 0, fontSize: "var(--t-small)", lineHeight: 1.5, padding: "var(--s3)", background: "var(--action-soft)", border: "1px solid var(--action-edge)", borderRadius: "var(--r-md)" }}>
                  <strong style={{ fontWeight: 600 }}>
                    {unconfirmed.length} {unconfirmed.length === 1 ? "stop is" : "stops are"} suspected only.
                  </strong>{" "}
                  {unconfirmed.map(displayName).join(", ")} {unconfirmed.length === 1 ? "has" : "have"} been seen by
                  one vehicle and not corroborated. Sending a crew to an unconfirmed defect is your decision to record.
                </p>
              )}

              {planned && (
                <Field label="Crew email">
                  <input
                    style={INPUT}
                    type="text"
                    placeholder="crew@council.gov.uk, second@council.gov.uk"
                    value={to}
                    onChange={(e) => setTo(e.target.value)}
                  />
                </Field>
              )}

              {planState === "error" && (
                <p role="alert" className="secondary" style={{ margin: 0, fontSize: "var(--t-small)" }}>
                  {planError}
                </p>
              )}
              {dispatchState === "error" && (
                <p role="alert" className="secondary" style={{ margin: 0, fontSize: "var(--t-small)" }}>
                  {dispatchError}
                </p>
              )}
            </>
          )}
        </div>

        <div style={{ display: "flex", justifyContent: "flex-end", gap: "var(--s2)", padding: "var(--s3) var(--s5)", borderTop: "1px solid var(--rule-soft)", background: "var(--canvas)" }}>
          {sent ? (
            <button type="button" className="btn btn-primary" onClick={close}>
              Back to the queue
            </button>
          ) : planned ? (
            <>
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => {
                  resetPlan();
                  close();
                }}
              >
                Discard plan
              </button>
              <button
                type="button"
                className="btn btn-commit"
                disabled={addresses.length === 0 || dispatchState === "sending"}
                onClick={() => void dispatch(addresses)}
              >
                {dispatchState === "sending" ? "Sending…" : "Dispatch to crew"}
              </button>
            </>
          ) : (
            <>
              <button type="button" className="btn btn-secondary" onClick={close}>
                Cancel
              </button>
              <button
                type="button"
                className="btn btn-primary"
                disabled={candidates === 0 || !planner.crewId || planState === "planning"}
                onClick={() => void planRoute()}
              >
                {planState === "planning" ? "Planning…" : "Plan route"}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

const INPUT: React.CSSProperties = {
  width: "100%",
  height: 38,
  padding: "0 var(--s3)",
  fontSize: "var(--t-small)",
  color: "var(--ink)",
  background: "var(--surface)",
  border: "1px solid var(--rule)",
  borderRadius: "var(--r-md)",
};

/** One segmented choice, styled as the planning-mode buttons above it. */
function Dial(
  { label, on, disabled, onClick }: { label: string; on: boolean; disabled?: boolean; onClick: () => void },
) {
  return (
    <button
      type="button"
      aria-pressed={on}
      disabled={disabled}
      onClick={onClick}
      style={{
        flex: 1,
        height: 30,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontSize: "var(--t-small)",
        fontWeight: 600,
        cursor: disabled ? "not-allowed" : "pointer",
        opacity: disabled ? 0.5 : 1,
        borderRadius: "var(--r-md)",
        border: `1px solid ${on ? "var(--action)" : "var(--rule)"}`,
        background: on ? "var(--action)" : "var(--surface)",
        color: on ? "var(--action-ink)" : "var(--ink)",
        transition: "background 120ms linear, border-color 120ms linear",
      }}
    >
      {label}
    </button>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label style={{ display: "block", minWidth: 0 }}>
      <span className="micro secondary" style={{ display: "block", marginBottom: "var(--s1)" }}>
        {label}
      </span>
      {children}
    </label>
  );
}

function Line({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: "var(--s3)" }}>
      <dt className="secondary" style={{ fontSize: "var(--t-small)" }}>
        {label}
      </dt>
      <dd className="data" style={{ margin: 0, fontSize: "var(--t-small)", fontWeight: 600, wordBreak: "break-all", textAlign: "right" }}>
        {value}
      </dd>
    </div>
  );
}
