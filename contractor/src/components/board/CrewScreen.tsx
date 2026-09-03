"use client";

// One crew: what it has done, and every route it has been given.
//
// The numbers are deliberately plain — stops closed, stops handed back, minutes
// on site. A contractor is paid against these and a council audits them, so none
// of them is a score and none is presented as one.

import { useCallback, useMemo } from "react";
import type { CrewDetail } from "@/lib/types";
import { AppHeader } from "@/components/frame/AppHeader";
import { RouteCard } from "./RouteCard";
import {
  ErrorNotice,
  MetricRow,
  Panel,
  PlaceholderBox,
} from "@/components/ui/console";
import { createCrewDataSource } from "@/lib/crew";
import { kilometres, minutes, plural } from "@/lib/crew/format";
import { useLoad } from "@/lib/crew/useLoad";

export function CrewScreen({ crewId }: { crewId: string }) {
  const source = useMemo(() => createCrewDataSource(), []);
  const load = useCallback(() => source.crew(crewId), [source, crewId]);
  const crew = useLoad<CrewDetail | null>(load);
  const back = { href: "/", label: "Back to today" };

  if (crew.state === "loading") {
    return (
      <>
        <AppHeader subtitle="Loading the crew" back={back} />
        <main className="measure flex-1">
          <Panel label="Crew">
            <PlaceholderBox>Loading the crew.</PlaceholderBox>
          </Panel>
        </main>
      </>
    );
  }

  if (crew.state === "error" || crew.data == null) {
    return (
      <>
        <AppHeader subtitle="Crew unavailable" back={back} />
        <main className="measure flex-1">
          <Panel label="Crew">
            <ErrorNotice
              message={
                crew.error != null
                  ? `Could not load the crew. ${crew.error}`
                  : "No crew with that reference."
              }
              onRetry={crew.reload}
            />
          </Panel>
        </main>
      </>
    );
  }

  const { crew: detail, routes, stats } = crew.data;

  return (
    <>
      <AppHeader subtitle={detail.name} back={back} />
      <main className="measure flex-1">
        <section className="panel panel-pad">
          <h1 className="m-0 text-[20px] leading-[1.15]">{detail.name}</h1>
          <p className="m-0 mt-1 text-[13px] leading-[1.4] text-ink-72 tabular">
            {minutes(detail.shift_minutes)} shift ·{" "}
            {plural(detail.repairs_per_shift, "repair")} planned per shift
          </p>
        </section>

        <div className="hairline" />
        <MetricRow
          metrics={[
            { value: String(stats.stopsDone), label: "Stops repaired" },
            { value: String(stats.stopsEscalated), label: "Handed back" },
            {
              value:
                stats.averageMinutesPerStop == null
                  ? "—"
                  : String(Math.round(stats.averageMinutesPerStop)),
              label: "Average minutes on site",
            },
          ]}
        />
        <div className="hairline" />
        <p className="panel-pad m-0 text-[12px] leading-[1.4] text-ink-58 tabular">
          {plural(stats.routes, "route")} · {kilometres(stats.kilometres)} planned
          driving across them.
        </p>

        <div className="panel-pad pb-2">
          <span className="text-[13px] font-semibold">Routes</span>
        </div>
        {routes.length === 0 ? (
          <div className="panel-pad">
            <PlaceholderBox>
              This crew has not been given a route yet.
            </PlaceholderBox>
          </div>
        ) : (
          <div>
            {routes.map((route) => (
              <RouteCard key={route.id} route={route} showDate />
            ))}
          </div>
        )}
      </main>
    </>
  );
}
