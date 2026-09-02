"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Header from "./Header";
import PotholeMap from "./PotholeMap";
import OperationsColumn, { type PlannedRoute } from "./OperationsColumn";
import RecordPanel from "./RecordPanel";
import DispatchSheet from "./DispatchSheet";
import { DISMISS_UNDO_MS, useConsole } from "@/lib/console/store";
import { handleKey } from "@/lib/console/keyboard";
import {
  displayName, estimateMinutes, planCandidates, stats, visibleRows, type ChipFilter,
} from "@/lib/console/derive";
import { countInArea } from "@/lib/console/area";
import { createDataSource, isSupabaseConfigured } from "@/lib/data";
import type { ConsoleDataSource } from "@/lib/data/types";

/**
 * The console. One screen: the fleet's evidence on the left, the repair queue
 * and the record under inspection on the right, and the one interruption in
 * the product — committing a crew's day — over the top of both.
 *
 * The screen holds no state of its own. Everything on it is read from the
 * console store, which owns the live data source, so the map and the column
 * can never disagree about what has been seen.
 */
export default function Console() {
  const potholes = useConsole((s) => s.potholes);
  const detections = useConsole((s) => s.detections);
  const crews = useConsole((s) => s.crews);
  const vehicles = useConsole((s) => s.vehicles);
  const kmToday = useConsole((s) => s.kmToday);
  const filter = useConsole((s) => s.filter);
  const linkedId = useConsole((s) => s.linkedId);
  const pinnedId = useConsole((s) => s.pinnedId);
  const selected = useConsole((s) => s.selected);
  const sheetOpen = useConsole((s) => s.sheetOpen);
  const drawing = useConsole((s) => s.drawing);
  const planner = useConsole((s) => s.planner);
  const planState = useConsole((s) => s.planState);
  const plan = useConsole((s) => s.plan);
  const pendingDismiss = useConsole((s) => s.pendingDismiss);
  const loadState = useConsole((s) => s.loadState);
  const loadError = useConsole((s) => s.loadError);

  const link = useConsole((s) => s.link);
  const unlink = useConsole((s) => s.unlink);
  const pin = useConsole((s) => s.pin);
  const unpin = useConsole((s) => s.unpin);
  const toggleSelected = useConsole((s) => s.toggleSelected);
  const clearSelection = useConsole((s) => s.clearSelection);
  const setFilter = useConsole((s) => s.setFilter);
  const setSheetOpen = useConsole((s) => s.setSheetOpen);
  const dismiss = useConsole((s) => s.dismiss);
  const undoDismiss = useConsole((s) => s.undoDismiss);
  const resetPlan = useConsole((s) => s.resetPlan);
  const setArea = useConsole((s) => s.setArea);

  const all = useMemo(() => Object.values(potholes), [potholes]);
  const rows = useMemo(() => visibleRows(all, filter), [all, filter]);

  const counts = useMemo<Record<ChipFilter, number>>(() => {
    const s = stats(all);
    return {
      all: all.filter((p) => p.status !== "false_positive").length,
      confirmed: s.confirmedOpen,
      suspected: s.suspected,
      scheduled: s.scheduled,
    };
  }, [all]);

  const routeIds = useMemo(() => new Set(selected), [selected]);

  // The header's "reporting" count needs a clock, but not a precise one: a
  // vehicle either has phoned in within the last minute or it hasn't, and a
  // 5 s tick is close enough to that boundary. Reading it from state rather
  // than calling Date.now() during render keeps the render itself pure.
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 5_000);
    return () => clearInterval(id);
  }, []);
  const reporting = useMemo(() => {
    const cutoff = now - 60_000;
    return Object.values(vehicles).filter(
      (v) => new Date(v.position.recorded_at).getTime() >= cutoff,
    ).length;
  }, [vehicles, now]);

  const opened = useMemo(() => {
    const p = pinnedId ? potholes[pinnedId] : undefined;
    return p && p.status !== "false_positive" ? p : null;
  }, [pinnedId, potholes]);

  // The bottom bar states what is committed and what it would cost: the
  // console's own estimate while the operator is still choosing, the routing
  // service's own figures once a route has come back.
  const planned = useMemo<PlannedRoute | null>(
    () => (planState === "planned" && plan
      ? { stops: plan.stops.length, km: plan.total_km, minutes: plan.total_minutes }
      : null),
    [planState, plan],
  );
  const candidates = useMemo(
    () => planCandidates(all, { mode: planner.mode, area: planner.area, selectedCount: selected.length }, plan),
    [all, planner.mode, planner.area, selected.length, plan],
  );
  const crewName = crews.find((c) => c.id === planner.crewId)?.name ?? "—";
  // How many open potholes a drawn area holds, so the column can say what the
  // rectangle did rather than leaving the mode switch to be discovered later.
  const areaCount = useMemo(
    () => (planner.area ? countInArea(all, planner.area) : null),
    [all, planner.area],
  );

  const linkFromRow = useCallback((id: string | null) => (id ? link(id) : unlink()), [link, unlink]);

  // Clear puts the bottom bar back to nothing committed: the selection, the
  // standing plan and the drawn area all go, because all three feed it.
  const clearRoute = useCallback(() => {
    clearSelection();
    setArea(null);
    if (planState === "planned") resetPlan();
  }, [clearSelection, setArea, planState, resetPlan]);

  // Keyboard is first class. The linked row and the linked pin are the same
  // idea as focus, so the arrow keys move both at once. The sheet is modal and
  // runs its own keys, and a shift-drag on the map owns Escape, so the screen
  // stands down while either is in progress.
  useEffect(() => {
    if (sheetOpen || drawing) return;
    const onKey = (e: KeyboardEvent) => { handleKey(e, useConsole.getState(), rows); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [rows, sheetOpen, drawing]);

  // A failed load has to be recoverable without a page reload, so the load
  // sequence is held here rather than inlined in the effect, and the column
  // gets a way to run it again against the same source.
  const reloadRef = useRef<(() => void) | null>(null);
  const retry = useCallback(() => reloadRef.current?.(), []);

  // The live data source: Supabase where it is configured, the synthetic fleet
  // otherwise. Mounted once, and the subscription is torn down with the screen.
  useEffect(() => {
    const st = useConsole.getState();
    let off = () => {};
    let cancelled = false;
    const loadAll = async (ds: ConsoleDataSource) => {
      st.setLoadState("loading");
      try {
        const res = await ds.load();
        if (cancelled) return;
        st.setAll(res.potholes);
        st.setVehicles(res.vehicles);
        st.setCrews(res.crews);
        st.setKmToday(res.kmToday);
        st.setLoadState("ready");
      } catch (e) {
        if (cancelled) return;
        st.setLoadState("error", e instanceof Error ? e.message : "Unknown error");
      }
    };
    (async () => {
      const ds = await createDataSource();
      if (cancelled) return;
      st.setDataSource(ds);
      reloadRef.current = () => void loadAll(ds);
      await loadAll(ds);
      if (cancelled) return;
      off = ds.subscribe({
        onPothole: (u) => ("deleted" in u ? st.removePothole(u.id) : st.upsertPothole(u)),
        onVehicle: (v) => st.upsertVehicle(v),
        onKmToday: (km) => st.setKmToday(km),
      });
    })();
    return () => { cancelled = true; off(); reloadRef.current = null; };
  }, []);

  return (
    <div style={{ height: "100dvh", display: "grid", gridTemplateRows: "56px minmax(0,1fr)", background: "var(--canvas)", overflow: "hidden" }}>
      <Header
        live={isSupabaseConfigured() && loadState === "ready"}
        kmToday={kmToday}
        reporting={reporting}
        loading={loadState === "loading"}
      />

      <main style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) 396px", minHeight: 0 }}>
        <PotholeMap />

        <aside style={{ display: "grid", minHeight: 0, borderLeft: "1px solid var(--rule)", background: "var(--surface)" }}>
          {opened ? (
            <RecordPanel
              pothole={opened}
              detections={detections[opened.id]}
              onRoute={routeIds.has(opened.id)}
              onBack={unpin}
              onToggleRoute={() => toggleSelected(opened.id)}
              onDismiss={() => dismiss(opened.id)}
            />
          ) : (
            <OperationsColumn
              rows={rows}
              counts={counts}
              filter={filter}
              onFilter={setFilter}
              linkedId={linkedId}
              routeIds={routeIds}
              onLink={linkFromRow}
              onOpen={pin}
              kmToday={kmToday}
              estimatedMinutes={estimateMinutes(selected.length, planner.serviceMinPerStop)}
              crewName={crewName}
              areaCount={areaCount}
              loadState={loadState}
              loadError={loadError}
              onRetry={retry}
              canPlan={candidates > 0 || planState === "planned"}
              planning={planState === "planning"}
              planned={planned}
              onPlanRoute={() => setSheetOpen(true)}
              onClearRoute={clearRoute}
            />
          )}
        </aside>
      </main>

      {sheetOpen && <DispatchSheet />}

      {pendingDismiss && (
        <div
          role="status"
          style={{
            position: "fixed",
            left: "var(--s5)",
            bottom: "var(--s5)",
            zIndex: 150,
            display: "flex",
            alignItems: "center",
            gap: "var(--s4)",
            padding: "var(--s2) var(--s2) var(--s2) var(--s4)",
            background: "var(--rail)",
            color: "var(--rail-ink)",
            borderRadius: "var(--r-md)",
            boxShadow: "var(--shadow-2)",
            animation: "bch-rise 180ms var(--ease) both",
            overflow: "hidden",
          }}
        >
          <p style={{ margin: 0, fontSize: "var(--t-small)" }}>
            {displayName(pendingDismiss.previous)} dismissed as a false positive.
          </p>
          <button
            type="button"
            onClick={undoDismiss}
            style={{
              border: "1px solid var(--rail-rule)",
              background: "var(--rail-2)",
              color: "var(--rail-ink)",
              height: 30,
              padding: "0 var(--s3)",
              borderRadius: "var(--r-md)",
              fontSize: "var(--t-small)",
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            Undo
          </button>
          <UndoBar key={pendingDismiss.id} expiresAt={pendingDismiss.expiresAt} />
        </div>
      )}
    </div>
  );
}

const remainingFor = (expiresAt: number) => Math.max(0, (expiresAt - Date.now()) / DISMISS_UNDO_MS);

/**
 * How long is left to undo, drawn honestly rather than left to a silent timer.
 *
 * Keyed by dismissal id at the call site so a new dismissal replacing an
 * in-flight one remounts this bar: its initial width is then computed fresh
 * (lazy useState initialiser, not a setState inside the effect) instead of
 * holding the previous countdown's value until the next tick.
 */
function UndoBar({ expiresAt }: { expiresAt: number }) {
  const [remaining, setRemaining] = useState(() => remainingFor(expiresAt));
  useEffect(() => {
    const t = setInterval(() => setRemaining(remainingFor(expiresAt)), 100);
    return () => clearInterval(t);
  }, [expiresAt]);
  return (
    <i
      aria-hidden
      style={{
        position: "absolute",
        left: 0,
        bottom: 0,
        height: 2,
        width: `${remaining * 100}%`,
        background: "var(--rail-ink-2)",
        transition: "width 100ms linear",
      }}
    />
  );
}
