"use client";
import { Marker } from "react-map-gl/maplibre";

/**
 * Where a crew's day starts and ends.
 *
 * The same 12px surface square with a rail border that the route layer draws
 * at its start, so a depot reads the same whether or not a route is planned.
 * It is neither proposed nor committed, so it carries neither blue nor green;
 * `draft` is the one exception, on the settings map, where the square being
 * placed is a proposal in the literal sense.
 */
export function DepotMarker({
  lng, lat, name, draft, zIndex = 25,
}: { lng: number; lat: number; name: string; draft?: boolean; zIndex?: number }) {
  return (
    <Marker longitude={lng} latitude={lat} anchor="center" style={{ zIndex }}>
      <div style={{ display: "flex", alignItems: "center", gap: 6, pointerEvents: "none" }}>
        <span
          aria-hidden
          style={{
            width: 12, height: 12, flexShrink: 0,
            background: "var(--surface)",
            border: `1.5px solid ${draft ? "var(--action)" : "var(--rail)"}`,
            boxShadow: draft ? "0 0 0 3px color-mix(in srgb, var(--action) 35%, transparent), var(--shadow-1)" : "var(--shadow-1)",
          }}
        />
        <span
          className="data"
          style={{
            whiteSpace: "nowrap", padding: "2px 5px", borderRadius: "var(--r-sm)",
            background: draft ? "var(--action)" : "var(--rail)", color: "var(--rail-ink)", fontSize: 10,
          }}
        >
          {name}
        </span>
      </div>
    </Marker>
  );
}
