"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import type { MapLayerMouseEvent } from "react-map-gl/maplibre";
import { useConsole } from "@/lib/console/store";
import { rectPolygon } from "@/lib/console/area";

/** Shift + drag draws a rectangle; the polygon lands in planner.area on mouseup. Esc cancels. */
export function useAreaDrag() {
  const setArea = useConsole((s) => s.setArea);
  const start = useRef<[number, number] | null>(null);
  const onKeyRef = useRef<((k: KeyboardEvent) => void) | null>(null);
  const [drawing, setDrawing] = useState(false);
  const [draft, setDraft] = useState<GeoJSON.Polygon | null>(null);

  const onMouseDown = useCallback((e: MapLayerMouseEvent) => {
    if (!e.originalEvent.shiftKey) return;
    e.preventDefault();
    start.current = [e.lngLat.lng, e.lngLat.lat];
    setDrawing(true);
    setDraft(null);
    const onKey = (k: KeyboardEvent) => {
      if (k.key !== "Escape") return;
      window.removeEventListener("keydown", onKey);
      onKeyRef.current = null;
      start.current = null;
      setDrawing(false);
      setDraft(null);
    };
    onKeyRef.current = onKey;
    window.addEventListener("keydown", onKey);
  }, []);

  const onMouseMove = useCallback((e: MapLayerMouseEvent) => {
    if (!start.current) return;
    setDraft(rectPolygon(start.current, [e.lngLat.lng, e.lngLat.lat]));
  }, []);

  const onMouseUp = useCallback((e: MapLayerMouseEvent) => {
    if (!start.current) return;
    const poly = rectPolygon(start.current, [e.lngLat.lng, e.lngLat.lat]);
    start.current = null;
    if (onKeyRef.current) { window.removeEventListener("keydown", onKeyRef.current); onKeyRef.current = null; }
    setDrawing(false);
    setDraft(null);
    setArea(poly);
    useConsole.getState().setPlannerOpen(true);
    if (useConsole.getState().planner.mode === "manual") useConsole.getState().setPlanner({ mode: "count" });
  }, [setArea]);

  useEffect(() => {
    return () => { if (onKeyRef.current) window.removeEventListener("keydown", onKeyRef.current); };
  }, []);

  return { drawing, draft, handlers: { onMouseDown, onMouseMove, onMouseUp } };
}
