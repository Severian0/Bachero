"use client";

// Everything still owed, split by when it was due.
//
// Overdue is the group that earns this screen: a stop dated yesterday and never
// closed is invisible on Today and invisible on the council's map (the pothole
// still reads `scheduled`), so without this it is invisible everywhere.

import { useCallback, useMemo } from "react";
import type { BacklogGroups, Stop } from "@/lib/types";
import { AppFrame } from "@/components/frame/AppFrame";
import { StopLine } from "./StopLine";
import {
  ErrorNotice,
  MetricRow,
  PlaceholderBox,
} from "@/components/ui/console";
import { createCrewDataSource } from "@/lib/crew";
import { isoDate, longDate, plural } from "@/lib/crew/format";
import { useLoad } from "@/lib/crew/useLoad";

export function BacklogScreen() {
  const source = useMemo(() => createCrewDataSource(), []);
  const load = useCallback(() => source.backlog(), [source]);
  const backlog = useLoad<BacklogGroups>(load);
  const data = backlog.data;
  const total =
    data == null
      ? 0
      : data.overdue.length + data.today.length + data.upcoming.length;

  return (
    <AppFrame subtitle={`Outstanding work · ${longDate(isoDate(new Date()))}`}>
      {backlog.state === "loading" && (
        <div className="panel-pad">
          <PlaceholderBox>Loading the backlog.</PlaceholderBox>
        </div>
      )}

      {backlog.state === "error" && (
        <div className="panel-pad">
          <ErrorNotice
            message={`Could not load the backlog. ${backlog.error ?? ""} Work already recorded is unaffected.`}
            onRetry={backlog.reload}
          />
        </div>
      )}

      {backlog.state === "ready" && data != null && (
        <>
          <MetricRow
            metrics={[
              { value: String(data.overdue.length), label: "Overdue" },
              { value: String(data.today.length), label: "Due today" },
              { value: String(data.upcoming.length), label: "Dispatched ahead" },
            ]}
          />

          {total === 0 ? (
            <div className="panel-pad">
              <PlaceholderBox>
                No stops in the backlog. Every dispatched work order has been
                closed or handed back.
              </PlaceholderBox>
            </div>
          ) : (
            <>
              <Group
                label="Overdue"
                note="Dispatched before today and still open. The pothole is still marked scheduled on the council's map."
                stops={data.overdue}
              />
              <Group label="Due today" stops={data.today} />
              <Group label="Dispatched ahead" stops={data.upcoming} />
            </>
          )}
        </>
      )}
    </AppFrame>
  );
}

function Group({
  label,
  note,
  stops,
}: {
  label: string;
  note?: string;
  stops: readonly Stop[];
}) {
  if (stops.length === 0) return null;
  return (
    <>
      <div className="panel">
        <div className="panel-pad pb-2">
          <div className="flex items-center justify-between gap-3">
            <span className="text-[13px] font-semibold">{label}</span>
            <span className="text-[12px] text-ink-58 tabular">
              {plural(stops.length, "stop")} · highest priority first
            </span>
          </div>
          {note !== undefined && (
            <p className="m-0 mt-1 text-[12px] leading-[1.35] text-ink-55">
              {note}
            </p>
          )}
        </div>
      </div>
      <div>
        {stops.map((stop) => (
          <StopLine key={stop.id} stop={stop} />
        ))}
      </div>
    </>
  );
}
