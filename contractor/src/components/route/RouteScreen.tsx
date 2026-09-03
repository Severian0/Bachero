"use client";

// The job screen. The route, its stops in order, and one action: get to the next
// one. Everything a crew does to a stop happens on the stop screen.

import { useCallback, useEffect, useMemo } from "react";
import Link from "next/link";
import type { RouteDetail, Stop } from "@/lib/types";
import { AppHeader } from "@/components/frame/AppHeader";
import { ActionBar } from "@/components/frame/ActionBar";
import { RouteHeader } from "./RouteHeader";
import { StopRow } from "./StopRow";
import { ErrorNotice, Panel, PlaceholderBox } from "@/components/ui/console";
import { createCrewDataSource } from "@/lib/crew";
import { isOutstanding, nextStop, sortStops } from "@/lib/crew/derive";
import { useLoad } from "@/lib/crew/useLoad";

export function RouteScreen({ routeId }: { routeId: string }) {
  const source = useMemo(() => createCrewDataSource(), []);
  const load = useCallback(() => source.route(routeId), [source, routeId]);
  const route = useLoad<RouteDetail | null>(load);
  const { data, set } = route;

  // A second crew member's phone, or the council replanning. Patch the one stop
  // rather than reloading, so the list never flashes a placeholder mid-shift.
  useEffect(() => {
    if (data == null) return;
    return source.subscribe(routeId, (changed: Stop) => {
      set({
        ...data,
        stops: sortStops(
          data.stops.map((s) => (s.id === changed.id ? changed : s)),
        ),
        doneCount: data.stops.filter((s) =>
          s.id === changed.id ? changed.status === "done" : s.status === "done",
        ).length,
        escalatedCount: data.stops.filter((s) =>
          s.id === changed.id
            ? changed.status === "cancelled"
            : s.status === "cancelled",
        ).length,
      });
    });
  }, [source, routeId, data, set]);

  if (route.state === "loading") {
    return (
      <>
        <AppHeader subtitle="Loading the route" back={{ href: "/", label: "Back to today" }} />
        <main className="measure flex-1">
          <Panel label="Route">
            <PlaceholderBox>Loading the route.</PlaceholderBox>
          </Panel>
        </main>
      </>
    );
  }

  if (route.state === "error") {
    return (
      <>
        <AppHeader subtitle="Route unavailable" back={{ href: "/", label: "Back to today" }} />
        <main className="measure flex-1">
          <Panel label="Route">
            <ErrorNotice
              message={`Could not load the route. ${route.error ?? ""} Work already recorded is unaffected.`}
              onRetry={route.reload}
            />
          </Panel>
        </main>
      </>
    );
  }

  if (data == null) {
    return (
      <>
        <AppHeader subtitle="Route not found" back={{ href: "/", label: "Back to today" }} />
        <main className="measure flex-1">
          <Panel label="Route">
            <PlaceholderBox>
              No route with that reference. Check the link in the dispatch email,
              or pick a route from Today.
            </PlaceholderBox>
          </Panel>
        </main>
      </>
    );
  }

  const next = nextStop(data.stops);
  const outstanding = data.stops.filter(isOutstanding).length;

  return (
    <>
      <AppHeader
        subtitle={data.crew.name}
        back={{ href: "/", label: "Back to today" }}
      />

      <main className="measure flex-1">
        <RouteHeader route={data} />

        <div className="hairline" />
        <div className="panel-pad pb-2">
          <div className="flex items-center justify-between gap-3">
            <span className="text-[13px] font-semibold">Stops</span>
            <span className="text-[12px] text-ink-58 tabular">
              {data.stops.length} in route order
            </span>
          </div>
        </div>

        {data.stops.length === 0 ? (
          <div className="panel-pad">
            <PlaceholderBox>
              This route has no stops. The council dispatched it empty.
            </PlaceholderBox>
          </div>
        ) : (
          <div>
            {data.stops.map((stop) => (
              <StopRow
                key={stop.id}
                stop={stop}
                href={`/route/${data.id}/stop/${stop.id}`}
              />
            ))}
          </div>
        )}
      </main>

      {/* One action in the bar. Navigation is a full-width button on the stop
          screen; two buttons here leave a phone with no room for the sentence
          saying which stop is next. */}
      {next == null ? (
        <ActionBar
          title="Route complete"
          detail={`${data.doneCount} repaired, ${data.escalatedCount} escalated`}
        >
          <Link href="/" className="btn btn-secondary">
            Back to today
          </Link>
        </ActionBar>
      ) : (
        <ActionBar
          title={`Next: stop ${next.stopOrder ?? "—"}`}
          detail={`${next.street} · ${outstanding} outstanding`}
        >
          <Link
            href={`/route/${data.id}/stop/${next.id}`}
            className="btn btn-primary btn-pill"
            style={{ padding: "11px 18px", whiteSpace: "nowrap" }}
          >
            Open stop {next.stopOrder ?? ""}
          </Link>
        </ActionBar>
      )}
    </>
  );
}
