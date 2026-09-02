"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import type { MapLayerMouseEvent } from "react-map-gl/maplibre";
import { useConsole } from "@/lib/console/store";
import { rectPolygon } from "@/lib/console/area";

/**
 * Shift + drag draws a rectangle; the polygon lands in planner.area on mouseup.
 * Esc cancels.
 *
 * `drawing` lives in the store rather than here, because the screen's own
 * keyboard listener has to stand down while a drag is in progress: Escape
 * belongs to the drag, not to the record panel behind it.
 */
export function useAreaDrag() {
  const setArea = useConsole((s) => s.setArea);
  const drawing = useConsole((s) => s.drawing);
  const setDrawing = useConsole((s) => s.setDrawing);
  const start = useRef<[number, number] | null>(null);
  const onKeyRef = useRef<((k: KeyboardEvent) => void) | null>(null);
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
  }, [setDrawing]);

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
    // An area is a statement about where, so the planner stops asking which.
    // The column reports the switch in its bottom bar; nothing opens on release.
    if (useConsole.getState().planner.mode === "manual") useConsole.getState().setPlanner({ mode: "count" });
  }, [setArea, setDrawing]);

  useEffect(() => {
    return () => { if (onKeyRef.current) window.removeEventListener("keydown", onKeyRef.current); };
  }, []);

  return { drawing, draft, handlers: { onMouseDown, onMouseMove, onMouseUp } };
}
