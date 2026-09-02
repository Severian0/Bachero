"use client";

import { useCallback, useEffect, useState } from "react";
import { GOOGLE_MAP_STYLE, GOOGLE_MAPS_KEY } from "./mapStyle";
import { LONDON_CENTRE, LONDON_ZOOM } from "./fixtures";
import type { Bounds } from "./model";

export type MapStatus = "loading" | "ready" | "no-key" | "failed";

export interface MapEngine {
  /** Callback ref for the element the basemap renders into. */
  setContainer: (el: HTMLDivElement | null) => void;
  status: MapStatus;
  /** Changes on every camera move. Re-run projection when this changes. */
  version: number;
  /** Geographic point to container pixels, or null before the map is up. */
  project: (lat: number, lng: number) => { x: number; y: number } | null;
  panTo: (lat: number, lng: number) => void;
  fitBounds: (b: Bounds) => void;
  zoomBy: (delta: number) => void;
}

let loader: Promise<void> | null = null;

const SCRIPT_ID = "bch-google-maps";
const CALLBACK = "__bacheroMapsReady";

/**
 * Loads the Google Maps JS API once per document.
 *
 * The script tag firing `load` is not enough: the API resolves its libraries
 * afterwards, so `google.maps.Map` does not exist yet at that point. The
 * `callback` parameter is the API's own signal that the constructors are
 * ready, so that is what the promise waits on.
 */
function loadGoogle(): Promise<void> {
  if (loader) return loader;
  loader = new Promise<void>((resolve, reject) => {
    if (typeof window === "undefined") return reject(new Error("no window"));
    if (typeof window.google?.maps?.Map === "function") return resolve();

    const w = window as unknown as Record<string, unknown>;
    w[CALLBACK] = () => resolve();

    const existing = document.getElementById(SCRIPT_ID);
    if (existing) {
      existing.addEventListener("error", () => reject(new Error("Google Maps failed to load")));
      return;
    }

    const s = document.createElement("script");
    s.id = SCRIPT_ID;
    s.src =
      "https://maps.googleapis.com/maps/api/js" +
      `?key=${encodeURIComponent(GOOGLE_MAPS_KEY)}` +
      `&v=weekly&loading=async&callback=${CALLBACK}`;
    s.async = true;
    s.onerror = () => reject(new Error("Google Maps failed to load"));
    document.head.appendChild(s);
  });
  return loader;
}

/**
 * The camera.
 *
 * The console owns the pins and the interaction; Google owns the basemap and
 * the gestures. `project` is the whole seam between them: it turns a
 * coordinate into a pixel in the container, and the pin layer above draws
 * itself from that. `version` changes on every camera event, which is what
 * makes the pins track a pan.
 */
export function useMapEngine(): MapEngine {
  const [container, setContainer] = useState<HTMLDivElement | null>(null);
  const [map, setMap] = useState<google.maps.Map | null>(null);
  const [projection, setProjection] = useState<google.maps.MapCanvasProjection | null>(null);
  const [status, setStatus] = useState<MapStatus>(GOOGLE_MAPS_KEY ? "loading" : "no-key");
  const [version, bump] = useState(0);

  useEffect(() => {
    if (!container || !GOOGLE_MAPS_KEY) return;
    let disposed = false;

    loadGoogle()
      .then(() => {
        if (disposed) return;
        const created = new google.maps.Map(container, {
          center: LONDON_CENTRE,
          zoom: LONDON_ZOOM,
          styles: GOOGLE_MAP_STYLE,
          disableDefaultUI: true,
          gestureHandling: "greedy",
          clickableIcons: false,
          maxZoom: 19,
          minZoom: 9,
        });

        // An empty overlay, carried purely to borrow its projection.
        const overlay = new google.maps.OverlayView();
        overlay.onAdd = () => {};
        overlay.onRemove = () => {};
        overlay.draw = () => {
          const next = overlay.getProjection();
          setProjection((prev) => (prev === next ? prev : next));
          bump((v) => v + 1);
        };
        overlay.setMap(created);

        created.addListener("bounds_changed", () => bump((v) => v + 1));
        created.addListener("idle", () => bump((v) => v + 1));

        setMap(created);
        setStatus("ready");
      })
      .catch((err) => {
        if (disposed) return;
        console.error("[bachero] basemap failed", err);
        setStatus("failed");
      });

    return () => {
      disposed = true;
    };
  }, [container]);

  const project = useCallback(
    (lat: number, lng: number) => {
      if (!projection) return null;
      const p = projection.fromLatLngToContainerPixel(new google.maps.LatLng(lat, lng));
      return p ? { x: p.x, y: p.y } : null;
    },
    [projection],
  );

  const panTo = useCallback((lat: number, lng: number) => map?.panTo({ lat, lng }), [map]);

  const fitBounds = useCallback(
    (b: Bounds) =>
      map?.fitBounds(
        new google.maps.LatLngBounds({ lat: b.south, lng: b.west }, { lat: b.north, lng: b.east }),
        48,
      ),
    [map],
  );

  const zoomBy = useCallback(
    (delta: number) => {
      if (map) map.setZoom((map.getZoom() ?? LONDON_ZOOM) + delta);
    },
    [map],
  );

  return { setContainer, status, version, project, panTo, fitBounds, zoomBy };
}
