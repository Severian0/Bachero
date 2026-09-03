"use client";

// Today. Every crew's route, with progress, and the totals across them.
//
// The empty state is the one that matters: until the council's solver and
// dispatch endpoints exist, "no routes dispatched" is the honest answer, and it
// says where a route comes from rather than leaving a blank panel.

import { useCallback, useMemo } from "react";
import type { RouteSummary } from "@/lib/types";
import { AppFrame } from "@/components/frame/AppFrame";
import { RouteCard } from "./RouteCard";
import {
  ErrorNotice,
  MetricRow,
  Panel,
  PlaceholderBox,
} from "@/components/ui/console";
import { createCrewDataSource } from "@/lib/crew";
import { progressOfSummary } from "@/lib/crew/derive";
import { isoDate, longDate } from "@/lib/crew/format";
import { useLoad } from "@/lib/crew/useLoad";

export function TodayScreen() {
  const source = useMemo(() => createCrewDataSource(), []);
  const load = useCallback(() => source.today(), [source]);
  const routes = useLoad<RouteSummary[]>(load);

  const totals = (routes.data ?? []).reduce(
    (acc, route) => {
      const p = progressOfSummary(route);
      return {
        stops: acc.stops + p.total,
        done: acc.done + p.done,
        km: acc.km + (route.totalKm ?? 0),
      };
    },
    { stops: 0, done: 0, km: 0 },
  );

  return (
    <AppFrame subtitle={longDate(isoDate(new Date()))}>
      {routes.state === "ready" && (routes.data ?? []).length > 0 && (
        <>
          <MetricRow
            metrics={[
              { value: String(totals.done), label: "Stops repaired today" },
              {
                value: String(totals.stops - totals.done),
                label: "Stops still outstanding",
              },
              {
                value: totals.km.toFixed(1),
                unit: "km",
                label: "Planned driving",
              },
            ]}
          />
          <div className="hairline" />
        </>
      )}

      <div className="panel-pad pb-2">
        <div className="flex items-center justify-between gap-3">
          <span className="text-[13px] font-semibold">Routes today</span>
          <span className="text-[12px] text-ink-58 tabular">
            {routes.data?.length ?? 0} dispatched
          </span>
        </div>
      </div>

      {routes.state === "loading" && (
        <div className="panel-pad">
          <PlaceholderBox>Loading today&rsquo;s routes.</PlaceholderBox>
        </div>
      )}

      {routes.state === "error" && (
        <div className="panel-pad">
          <ErrorNotice
            message={`Could not load today's routes. ${routes.error ?? ""} Work already recorded is unaffected.`}
            onRetry={routes.reload}
          />
        </div>
      )}

      {routes.state === "ready" &&
        ((routes.data ?? []).length === 0 ? (
          <div className="panel-pad">
            <PlaceholderBox>
              No routes dispatched for today. A route appears here when the
              council plans one and dispatches it to a crew.
            </PlaceholderBox>
          </div>
        ) : (
          <div>
            {(routes.data ?? []).map((route) => (
              <RouteCard key={route.id} route={route} />
            ))}
          </div>
        ))}

      <Panel label="Crews">
        <CrewLinks />
      </Panel>
    </AppFrame>
  );
}

/** Every crew, whether or not it has a route today — the way to per-crew stats. */
function CrewLinks() {
  const source = useMemo(() => createCrewDataSource(), []);
  const load = useCallback(() => source.crews(), [source]);
  const crews = useLoad(load);

  if (crews.state !== "ready" || (crews.data ?? []).length === 0) {
    return (
      <PlaceholderBox>
        {crews.state === "error" ? "Could not load crews." : "Loading crews."}
      </PlaceholderBox>
    );
  }

  return (
    <div className="flex flex-wrap gap-2">
      {(crews.data ?? []).map((crew) => (
        <a key={crew.id} href={`/crew/${crew.id}`} className="tab">
          {crew.name}
        </a>
      ))}
    </div>
  );
}
