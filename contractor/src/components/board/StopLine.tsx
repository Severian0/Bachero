// A backlog entry. Unlike a route stop it is read out of route order, so it
// leads with where and how bad rather than with a stop number, and names the
// crew and the day it was due.

import Link from "next/link";
import type { CSSProperties } from "react";
import type { Stop } from "@/lib/types";
import { SeverityBar } from "@/components/ui/console";
import { statusWord, stopMark } from "@/lib/crew/derive";
import { dateLabel, isoDate } from "@/lib/crew/format";

export function StopLine({ stop }: { stop: Stop }) {
  const mark = stopMark(stop.status);
  const href =
    stop.routePlanId == null
      ? "/backlog"
      : `/route/${stop.routePlanId}/stop/${stop.id}`;

  return (
    <Link
      href={href}
      className="stop-row"
      style={{ "--mark": mark, color: "var(--color-text)" } as CSSProperties}
    >
      <span className="min-w-0 flex-1">
        <span className="stop-primary block">
          {stop.street}{" "}
          <span className="text-[11px] tracking-[0.04em] text-ink-45 tabular">
            {stop.ref}
          </span>
        </span>
        <span className="stop-secondary block">
          {statusWord(stop.status)}
          {stop.planDate != null &&
            ` · due ${dateLabel(stop.planDate, isoDate(new Date())).toLowerCase()}`}
          {stop.crewName != null && ` · ${stop.crewName.split(" — ")[0]}`}
        </span>
      </span>
      <SeverityBar severity={stop.pothole.severity} mark={mark} />
    </Link>
  );
}
