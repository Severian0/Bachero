"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Header from "./Header";
import PotholeMap from "./PotholeMap";
import OperationsColumn from "./OperationsColumn";
import RecordPanel from "./RecordPanel";
import DispatchSheet from "./DispatchSheet";
import { planRoute } from "@/lib/route";
import type { ConsoleData } from "@/lib/potholes";
import type { FilterKey, Pothole } from "@/lib/model";

const FILTER_ORDER: FilterKey[] = ["all", "confirmed", "suspected", "scheduled"];

export default function Console({ data }: { data: ConsoleData }) {
  const [potholes, setPotholes] = useState<Pothole[]>(data.potholes);
  const [filter, setFilter] = useState<FilterKey>("all");
  const [linkedId, setLinkedId] = useState<string | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const [routeIds, setRouteIds] = useState<Set<string>>(new Set());
  const [dispatching, setDispatching] = useState(false);
  const [undo, setUndo] = useState<Pothole | null>(null);

  const visible = useMemo(
    () => potholes.filter((p) => p.status !== "false_positive"),
    [potholes],
  );

  const counts = useMemo(() => {
    const c: Record<FilterKey, number> = { all: visible.length, suspected: 0, confirmed: 0, scheduled: 0 };
    for (const p of visible) {
      if (p.status === "suspected") c.suspected += 1;
      if (p.status === "confirmed") c.confirmed += 1;
      if (p.status === "scheduled") c.scheduled += 1;
    }
    return c;
  }, [visible]);

  const rows = useMemo(() => {
    const filtered = filter === "all" ? visible : visible.filter((p) => p.status === filter);
    return [...filtered].sort((a, b) => a.priority - b.priority);
  }, [visible, filter]);

  // The map and the list are one instrument, so they answer to the same
  // filter. Records outside it stay on the map, stepped back rather than
  // removed, so the operator keeps their bearings.
  const inFilter = useMemo(() => new Set(rows.map((r) => r.id)), [rows]);

  const opened = openId ? (visible.find((p) => p.id === openId) ?? null) : null;
  const route = useMemo(
    () => planRoute(visible.filter((p) => routeIds.has(p.id))),
    [visible, routeIds],
  );

  const toggleRoute = useCallback((id: string) => {
    setRouteIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const dismiss = useCallback((id: string) => {
    setPotholes((prev) => {
      const target = prev.find((p) => p.id === id);
      if (target) setUndo(target);
      return prev.map((p) => (p.id === id ? { ...p, status: "false_positive" as const } : p));
    });
    setRouteIds((prev) => {
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
    setOpenId(null);
  }, []);

  const restore = useCallback(() => {
    setUndo((u) => {
      if (u) setPotholes((prev) => prev.map((p) => (p.id === u.id ? u : p)));
      return null;
    });
  }, []);

  // Dismissal is always undoable, and the offer expires rather than lingering.
  useEffect(() => {
    if (!undo) return;
    const id = window.setTimeout(() => setUndo(null), 10_000);
    return () => window.clearTimeout(id);
  }, [undo]);

  const onDispatched = useCallback(
    () => {
      setPotholes((prev) => {
        const order = new Map(route.stops.map((s, i) => [s.id, i + 1]));
        const highest = prev.reduce((n, p) => Math.max(n, p.stopOrder ?? 0), 0);
        return prev.map((p) =>
          order.has(p.id)
            ? { ...p, status: "scheduled" as const, stopOrder: highest + order.get(p.id)! }
            : p,
        );
      });
      setRouteIds(new Set());
    },
    [route.stops],
  );

  // Keyboard is first class. The linked row and the linked pin are the same
  // idea as focus, so the arrow keys move both at once.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (dispatching) return;
      const el = e.target as HTMLElement | null;
      if (el && /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName)) return;

      if (e.key === "ArrowDown" || e.key === "ArrowUp") {
        e.preventDefault();
        if (rows.length === 0) return;
        const i = rows.findIndex((r) => r.id === linkedId);
        const step = e.key === "ArrowDown" ? 1 : -1;
        const next = i === -1 ? (step === 1 ? 0 : rows.length - 1) : i + step;
        setLinkedId(rows[Math.min(rows.length - 1, Math.max(0, next))].id);
      } else if (e.key === "Enter" && linkedId && !opened) {
        e.preventDefault();
        setOpenId(linkedId);
      } else if (e.key === "Escape") {
        if (opened) setOpenId(null);
        else setLinkedId(null);
      } else if (e.key === "f" || e.key === "F") {
        setFilter((f) => FILTER_ORDER[(FILTER_ORDER.indexOf(f) + 1) % FILTER_ORDER.length]);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [rows, linkedId, opened, dispatching]);

  return (
    <div style={{ height: "100dvh", display: "grid", gridTemplateRows: "56px minmax(0,1fr)", background: "var(--canvas)", overflow: "hidden" }}>
      <Header live={data.live} />

      <main style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) 396px", minHeight: 0 }}>
        <PotholeMap
          potholes={visible}
          inFilter={inFilter}
          vehicles={data.vehicles}
          linkedId={linkedId}
          openId={openId}
          routeIds={routeIds}
          onLink={setLinkedId}
          onOpen={setOpenId}
        />

        <aside style={{ display: "grid", minHeight: 0, borderLeft: "1px solid var(--rule)", background: "var(--surface)" }}>
          {opened ? (
            <RecordPanel
              pothole={opened}
              onRoute={routeIds.has(opened.id)}
              onBack={() => setOpenId(null)}
              onToggleRoute={() => toggleRoute(opened.id)}
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
              onLink={setLinkedId}
              onOpen={setOpenId}
              routeKm={route.km}
              routeMinutes={route.minutes}
              onPlanRoute={() => setDispatching(true)}
              onClearRoute={() => setRouteIds(new Set())}
            />
          )}
        </aside>
      </main>

      {dispatching && (
        <DispatchSheet
          stops={route.stops}
          km={route.km}
          minutes={route.minutes}
          onRemove={toggleRoute}
          onClose={() => setDispatching(false)}
          onSent={onDispatched}
        />
      )}

      {undo && (
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
            {undo.street} dismissed as a false positive.
          </p>
          <button
            type="button"
            onClick={restore}
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
