// A route in a list. Same anatomy as a stop row — a 3px marker carrying state,
// a primary line, a line of context — one size up, because a supervisor is
// scanning routes rather than driving to them.

import Link from "next/link";
import type { CSSProperties } from "react";
import type { RouteSummary } from "@/lib/types";
import { ProgressRule } from "@/components/ui/console";
import { progressOfSummary } from "@/lib/crew/derive";
import { dateLabel, isoDate, kilometres, minutes } from "@/lib/crew/format";

export function RouteCard({
  route,
  showDate = false,
}: {
  route: RouteSummary;
  showDate?: boolean;
}) {
  const progress = progressOfSummary(route);
  const complete = progress.outstanding === 0 && progress.total > 0;
  const mark = complete
    ? "var(--color-neutral-300)"
    : progress.done + progress.escalated > 0
      ? "var(--color-accent)"
      : "var(--color-neutral-400)";

  return (
    <Link
      href={`/route/${route.id}`}
      className="stop-row"
      style={
        {
          "--mark": mark,
          color: "var(--color-text)",
          alignItems: "stretch",
          padding: "var(--space-3) var(--space-4)",
        } as CSSProperties
      }
      data-done={complete ? "true" : undefined}
    >
      <span className="grid flex-1 gap-2">
        <span className="flex items-baseline justify-between gap-3">
          <span className="stop-primary">{route.crew.name}</span>
          <span className="flex-none text-[11px] text-ink-45 tabular">
            {showDate
              ? dateLabel(route.planDate, isoDate(new Date()))
              : `${kilometres(route.totalKm)} · ${minutes(route.totalMinutes)}`}
          </span>
        </span>

        <ProgressRule fraction={progress.fraction} />

        <span className="stop-secondary">
          {progress.label}
          {progress.escalated > 0 && ` · ${progress.escalated} escalated`}
          {progress.outstanding > 0 && ` · ${progress.outstanding} to go`}
        </span>
      </span>
    </Link>
  );
}
