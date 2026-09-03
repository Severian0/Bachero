"use client";

// What has been closed. Fourteen days, newest first — long enough to cover a
// fortnightly bin round, short enough that a phone renders it in one list.

import { useCallback, useMemo } from "react";
import type { RouteSummary } from "@/lib/types";
import { AppFrame } from "@/components/frame/AppFrame";
import { RouteCard } from "./RouteCard";
import {
  ErrorNotice,
  MetricRow,
  PlaceholderBox,
} from "@/components/ui/console";
import { createCrewDataSource } from "@/lib/crew";
import { plural } from "@/lib/crew/format";
import { useLoad } from "@/lib/crew/useLoad";

const DAYS = 14;

export function HistoryScreen() {
  const source = useMemo(() => createCrewDataSource(), []);
  const load = useCallback(() => source.history(DAYS), [source]);
  const routes = useLoad<RouteSummary[]>(load);
  const data = routes.data ?? [];

  const totals = data.reduce(
    (acc, route) => ({
      done: acc.done + route.doneCount,
      escalated: acc.escalated + route.escalatedCount,
      km: acc.km + (route.totalKm ?? 0),
    }),
    { done: 0, escalated: 0, km: 0 },
  );

  return (
    <AppFrame subtitle={`Last ${DAYS} days`}>
      {routes.state === "loading" && (
        <div className="panel-pad">
          <PlaceholderBox>Loading completed routes.</PlaceholderBox>
        </div>
      )}

      {routes.state === "error" && (
        <div className="panel-pad">
          <ErrorNotice
            message={`Could not load the history. ${routes.error ?? ""} Work already recorded is unaffected.`}
            onRetry={routes.reload}
          />
        </div>
      )}

      {routes.state === "ready" && (
        <>
          <MetricRow
            metrics={[
              { value: String(totals.done), label: `Repairs in ${DAYS} days` },
              { value: String(totals.escalated), label: "Handed back" },
              { value: totals.km.toFixed(1), unit: "km", label: "Driven" },
            ]}
          />

          <div className="panel-pad pb-2">
            <div className="flex items-center justify-between gap-3">
              <span className="text-[13px] font-semibold">Routes worked</span>
              <span className="text-[12px] text-ink-58 tabular">
                {plural(data.length, "route")}
              </span>
            </div>
          </div>

          {data.length === 0 ? (
            <div className="panel-pad">
              <PlaceholderBox>
                No routes worked in the last {DAYS} days.
              </PlaceholderBox>
            </div>
          ) : (
            <div>
              {data.map((route) => (
                <RouteCard key={route.id} route={route} showDate />
              ))}
            </div>
          )}
        </>
      )}
    </AppFrame>
  );
}
