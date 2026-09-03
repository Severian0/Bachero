// What the route is and how far through it the crew is. The progress rule is
// decorative on its own, so the same fact is always printed beside it in words.

import type { RouteDetail } from "@/lib/types";
import { MetricRow, PanelLabel, ProgressRule } from "@/components/ui/console";
import { progressOf, savingFraction } from "@/lib/crew/derive";
import { dateLabel, isoDate, kilometres, percent } from "@/lib/crew/format";

export function RouteHeader({ route }: { route: RouteDetail }) {
  const progress = progressOf(route.stops);
  const saving = savingFraction(route);
  return (
    <>
      <section className="panel panel-pad">
        <PanelLabel>Route</PanelLabel>
        <div className="mt-2 flex items-baseline justify-between gap-3">
          <h1 className="m-0 text-[20px] leading-[1.15]">{route.crew.name}</h1>
          <span className="text-[12px] text-ink-58 tabular">
            {dateLabel(route.planDate, isoDate(new Date()))}
          </span>
        </div>

        <div className="mt-3">
          <ProgressRule fraction={progress.fraction} />
          <p className="m-0 mt-2 text-[13px] leading-[1.4] text-ink-72 tabular">
            {progress.label}
            {progress.escalated > 0 &&
              `, ${progress.escalated} escalated to the council`}
            {progress.outstanding > 0 && ` · ${progress.outstanding} to go`}
          </p>
        </div>
      </section>

      <div className="hairline" />
      <MetricRow
        metrics={[
          { value: String(route.stopCount), label: "Stops on this route" },
          {
            value: route.totalKm == null ? "—" : route.totalKm.toFixed(1),
            unit: "km",
            label: "Planned driving",
          },
          {
            value:
              route.totalMinutes == null
                ? "—"
                : String(Math.round(route.totalMinutes)),
            unit: "min",
            label: "Planned shift",
          },
        ]}
      />

      {saving !== null && (
        <>
          <div className="hairline" />
          <p className="panel-pad m-0 text-[12px] leading-[1.4] text-ink-58 tabular">
            {percent(saving)} shorter than visiting the same stops in priority
            order — {kilometres(route.baselineKm)} unoptimised.
          </p>
        </>
      )}
    </>
  );
}
