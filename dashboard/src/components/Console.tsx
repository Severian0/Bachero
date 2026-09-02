"use client";

import { useCallback, useEffect, useMemo } from "react";
import Header from "./Header";
import PotholeMap from "./PotholeMap";
import OperationsColumn from "./OperationsColumn";
import RecordPanel from "./RecordPanel";
import DispatchSheet from "./DispatchSheet";
import { planRoute } from "@/lib/route";
import { toRecord } from "@/lib/model";
import type { FilterKey } from "@/lib/model";
import { useConsole } from "@/lib/console/store";
import { handleKey } from "@/lib/console/keyboard";
import { displayName, stats, visibleRows } from "@/lib/console/derive";
import { createDataSource, isSupabaseConfigured } from "@/lib/data";

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
  const filter = useConsole((s) => s.filter);
  const linkedId = useConsole((s) => s.linkedId);
  const pinnedId = useConsole((s) => s.pinnedId);
  const selected = useConsole((s) => s.selected);
  const sheetOpen = useConsole((s) => s.sheetOpen);
  const drawing = useConsole((s) => s.drawing);
  const pendingDismiss = useConsole((s) => s.pendingDismiss);
  const loadState = useConsole((s) => s.loadState);

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

  // The store's `open` grouping has no chip of its own in this column; it is
  // the whole queue minus what has been closed, which reads as All.
  const filterKey: FilterKey = filter === "open" ? "all" : filter;

  const all = useMemo(() => Object.values(potholes), [potholes]);
  const queue = useMemo(() => visibleRows(all, filter), [all, filter]);
  const rows = useMemo(() => queue.map(toRecord), [queue]);

  const counts = useMemo<Record<FilterKey, number>>(() => {
    const s = stats(all);
    return {
      all: all.filter((p) => p.status !== "false_positive").length,
      confirmed: s.confirmedOpen,
      suspected: s.suspected,
      scheduled: s.scheduled,
    };
  }, [all]);

  const routeIds = useMemo(() => new Set(selected), [selected]);

  const opened = useMemo(() => {
    const p = pinnedId ? potholes[pinnedId] : undefined;
    return p && p.status !== "false_positive" ? toRecord(p) : null;
  }, [pinnedId, potholes]);

  const route = useMemo(
    () => planRoute(selected.map((id) => potholes[id]).filter((p) => p != null).map(toRecord)),
    [selected, potholes],
  );

  const linkFromRow = useCallback((id: string | null) => (id ? link(id, "row") : unlink()), [link, unlink]);

  // Dispatch is not yet wired to the work-order service, so sending closes the
  // sheet and drops the proposed plan. The store's own dispatch replaces this.
  const onDispatched = useCallback(() => {
    setSheetOpen(false);
    resetPlan();
  }, [setSheetOpen, resetPlan]);

  // Keyboard is first class. The linked row and the linked pin are the same
  // idea as focus, so the arrow keys move both at once. The sheet is modal and
  // runs its own keys, and a shift-drag on the map owns Escape, so the screen
  // stands down while either is in progress.
  useEffect(() => {
    if (sheetOpen || drawing) return;
    const onKey = (e: KeyboardEvent) => { handleKey(e, useConsole.getState(), queue); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [queue, sheetOpen, drawing]);

  // The live data source: Supabase where it is configured, the synthetic fleet
  // otherwise. Mounted once, and the subscription is torn down with the screen.
  useEffect(() => {
    const st = useConsole.getState();
    let off = () => {};
    let cancelled = false;
    (async () => {
      const ds = await createDataSource();
      if (cancelled) return;
      st.setDataSource(ds);
      try {
        const res = await ds.load();
        if (cancelled) return;
        st.setAll(res.potholes);
        st.setVehicles(res.vehicles);
        st.setCrews(res.crews);
        st.setKmToday(res.kmToday);
        st.setLoadState("ready");
      } catch (e) {
        st.setLoadState("error", e instanceof Error ? e.message : "Unknown error");
      }
      if (cancelled) return;
      off = ds.subscribe({
        onPothole: (u) => ("deleted" in u ? st.removePothole(u.id) : st.upsertPothole(u)),
        onVehicle: (v) => st.upsertVehicle(v),
        onKmToday: (km) => st.setKmToday(km),
      });
    })();
    return () => { cancelled = true; off(); };
  }, []);

  return (
    <div style={{ height: "100dvh", display: "grid", gridTemplateRows: "56px minmax(0,1fr)", background: "var(--canvas)", overflow: "hidden" }}>
      <Header live={isSupabaseConfigured() && loadState === "ready"} />

      <main style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) 396px", minHeight: 0 }}>
        <PotholeMap />

        <aside style={{ display: "grid", minHeight: 0, borderLeft: "1px solid var(--rule)", background: "var(--surface)" }}>
          {opened ? (
            <RecordPanel
              pothole={opened}
              onRoute={routeIds.has(opened.id)}
              onBack={unpin}
              onToggleRoute={() => toggleSelected(opened.id)}
              onDismiss={() => dismiss(opened.id)}
            />
          ) : (
            <OperationsColumn
              rows={rows}
              counts={counts}
              filter={filterKey}
              onFilter={setFilter}
              linkedId={linkedId}
              routeIds={routeIds}
              onLink={linkFromRow}
              onOpen={pin}
              routeKm={route.km}
              routeMinutes={route.minutes}
              onPlanRoute={() => setSheetOpen(true)}
              onClearRoute={clearSelection}
            />
          )}
        </aside>
      </main>

      {sheetOpen && (
        <DispatchSheet
          stops={route.stops}
          km={route.km}
          minutes={route.minutes}
          onRemove={toggleSelected}
          onClose={() => setSheetOpen(false)}
          onSent={onDispatched}
        />
      )}

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
        </div>
      )}
    </div>
  );
}
