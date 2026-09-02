/**
 * The basemap is the one place the design system has to leave CSS behind:
 * MapLibre paints in a WebGL canvas, so it cannot read a custom property and
 * cannot resolve `color-mix`. Every colour it needs is therefore read out of
 * `:root` once and handed over as a literal.
 *
 * This file is the only place in the app allowed to name a hex, and each one
 * is a copy of the token beside it in `globals.css`, kept for the server
 * render and for tests, where there is no document to read from.
 */
export const MAP_FALLBACK = {
  canvas: "#f3f2f1",
  ink: "#0b0c0c",
  action: "#1d70b8",
  committed: "#00703c",
  ruleSoft: "#e4e2e0",
} as const;

export interface MapTokens {
  /** Ground under everything. `--canvas`. */
  ground: string;
  /** Roads and their labels, at low opacity. `--ink`. */
  ink: string;
  /** Work proposed: the route line, the drawn area, the fleet trails. `--action`. */
  action: string;
  /** Work committed to a crew: the stop badges. `--committed`. */
  committed: string;
  /** Water, a hairline lighter than the ground. `--rule-soft`. */
  water: string;
}

/** Read a CSS custom property from `:root`, falling back off the browser. */
export function readToken(name: string, fallback: string): string {
  if (typeof window === "undefined") return fallback;
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || fallback;
}

export function readMapTokens(): MapTokens {
  return {
    ground: readToken("--canvas", MAP_FALLBACK.canvas),
    ink: readToken("--ink", MAP_FALLBACK.ink),
    action: readToken("--action", MAP_FALLBACK.action),
    committed: readToken("--committed", MAP_FALLBACK.committed),
    water: readToken("--rule-soft", MAP_FALLBACK.ruleSoft),
  };
}
