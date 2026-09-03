"use client";

// The console's queue row, on a phone: a 3px left marker carrying the state, the
// street, one line of context, and the severity bar. 58px, so it is a comfortable
// tap target in gloves.
//
// The list is for getting to the hole; the evidence that justifies the visit is
// on the stop screen. Putting passes and vehicle counts here as well would make
// the row unreadable at arm's length on a windscreen cradle.

import Link from "next/link";
import type { CSSProperties } from "react";
import type { Stop } from "@/lib/types";
import { SeverityBar, StopBadge } from "@/components/ui/console";
import { statusWord, stopMark } from "@/lib/crew/derive";
import { hhmm } from "@/lib/crew/format";

/** Status word plus the time that goes with it. Never the word alone. */
export function stopContext(stop: Stop): string {
  const word = statusWord(stop.status);
  switch (stop.status) {
    case "done":
      return stop.completedAt == null
        ? word
        : `${word} · ${hhmm(new Date(stop.completedAt))}`;
    case "cancelled":
      return stop.completedAt == null
        ? word
        : `${word} · ${hhmm(new Date(stop.completedAt))}`;
    case "in_progress":
      return stop.startedAt == null
        ? word
        : `${word} · since ${hhmm(new Date(stop.startedAt))}`;
    default:
      return stop.eta == null ? word : `${word} · due ${hhmm(new Date(stop.eta))}`;
  }
}

export function StopRow({ stop, href }: { stop: Stop; href: string }) {
  const mark = stopMark(stop.status);
  return (
    <Link
      href={href}
      className="stop-row"
      style={{ "--mark": mark, color: "var(--color-text)" } as CSSProperties}
      data-done={stop.status === "done" ? "true" : undefined}
    >
      <StopBadge order={stop.stopOrder} status={stop.status} />
      <span className="min-w-0 flex-1">
        <span className="stop-primary block">
          {stop.street}{" "}
          <span className="text-[11px] tracking-[0.04em] text-ink-45 tabular">
            {stop.ref}
          </span>
        </span>
        <span className="stop-secondary block">{stopContext(stop)}</span>
      </span>
      <SeverityBar severity={stop.pothole.severity} mark={mark} />
    </Link>
  );
}
