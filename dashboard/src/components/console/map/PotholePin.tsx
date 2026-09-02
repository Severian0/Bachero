"use client";
import { Marker } from "react-map-gl/maplibre";
import { useConsole } from "@/lib/console/store";
import { displayName, matchesFilter, severityGrade } from "@/lib/console/derive";
import { pinSize, STATUS_VISUAL } from "@/lib/console/visual";
import type { Pothole } from "@/lib/data/types";

/**
 * One detection site on the map.
 *
 * A square, because a circle reads as a dot on a map and a dot reads as
 * decoration. Size is severity and nothing else; fill is status and nothing
 * else. It is a real button, so the whole map is reachable from the keyboard
 * and focus links the row beside it exactly as hover does.
 */
export function PotholePin({ p }: { p: Pothole }) {
  const linked = useConsole((s) => s.linkedId === p.id);
  const open = useConsole((s) => s.pinnedId === p.id);
  const onRoute = useConsole((s) => s.selected.includes(p.id));
  const filter = useConsole((s) => s.filter);
  const link = useConsole((s) => s.link);
  const unlink = useConsole((s) => s.unlink);
  const pin = useConsole((s) => s.pin);

  if (p.status === "false_positive") return null;

  const v = STATUS_VISUAL[p.status];
  const grade = severityGrade(p.severity);
  // Records outside the filter stay on the map, stepped back rather than
  // removed, so the operator keeps their bearings.
  const dim = !matchesFilter(p, filter);

  return (
    <Marker longitude={p.lng} latitude={p.lat} anchor="center" style={{ zIndex: open ? 60 : linked ? 50 : onRoute ? 40 : 30 }}>
      <button
        type="button"
        aria-label={`${displayName(p)}, ${p.ref}. ${v.label}, severity ${grade} of 4. Open record.`}
        onMouseEnter={() => link(p.id)}
        onMouseLeave={() => unlink()}
        onFocus={() => link(p.id)}
        onBlur={() => unlink()}
        onClick={(e) => { e.stopPropagation(); pin(p.id); }}
        style={{
          width: 44, height: 44, margin: -22, display: "grid", placeItems: "center",
          border: 0, background: "transparent", padding: 0, cursor: "pointer",
          opacity: dim ? 0.28 : 1,
        }}
      >
        <span
          style={{
            display: "grid", placeItems: "center",
            width: pinSize(grade), height: pinSize(grade),
            borderRadius: "var(--r-sm)",
            background: v.fill,
            border: `1.5px solid ${v.stroke}`,
            opacity: v.opacity,
            boxShadow: onRoute
              ? "0 0 0 3px var(--committed), var(--shadow-1)"
              : open || linked
                ? "0 0 0 3px color-mix(in srgb, var(--action) 35%, transparent), var(--shadow-1)"
                : "var(--shadow-1)",
            transform: open ? "scale(1.35)" : linked ? "scale(1.22)" : "none",
            transition: "transform 200ms var(--ease), box-shadow 120ms linear",
          }}
        >
          {p.stop_order != null && (
            <span className="data" style={{ fontSize: 10, fontWeight: 700, lineHeight: 1, color: "var(--rail-ink)" }}>
              {p.stop_order}
            </span>
          )}
        </span>
      </button>
    </Marker>
  );
}
