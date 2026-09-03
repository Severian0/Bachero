"use client";

// One stop: where it is, what the evidence says, and the five things a crew can
// do to it — arrive, note, photograph, close, or hand back.
//
// The evidence panel is the reason this screen exists. A crew that can see three
// vehicles corroborated the hole over eleven passes is being told why it is
// standing there, and the council gets a defensible record either way.

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import type { RouteDetail, Stop } from "@/lib/types";
import { AppHeader } from "@/components/frame/AppHeader";
import { ActionBar } from "@/components/frame/ActionBar";
import { EscalateDialog } from "./EscalateDialog";
import { NoteField } from "./NoteField";
import { PhotoCapture } from "./PhotoCapture";
import {
  ErrorNotice,
  Panel,
  PlaceholderBox,
  PrimaryButton,
  SeverityBar,
  StatusTag,
} from "@/components/ui/console";
import { createCrewDataSource } from "@/lib/crew";
import { createOutbox, isOffline, type NewJob } from "@/lib/crew/outbox";
import { evidenceLine, sortStops, statusWord, stopMark } from "@/lib/crew/derive";
import { coordinate, hhmm, minutesBetween, severity } from "@/lib/crew/format";
import { directionsTo } from "@/lib/crew/gmaps";
import { useLoad } from "@/lib/crew/useLoad";

export function StopScreen({
  routeId,
  workOrderId,
}: {
  routeId: string;
  workOrderId: string;
}) {
  const source = useMemo(() => createCrewDataSource(), []);
  const load = useCallback(() => source.route(routeId), [source, routeId]);
  const route = useLoad<RouteDetail | null>(load);
  const outbox = useMemo(() => createOutbox(source), [source]);
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  const [held, setHeld] = useState(false);

  // Anything held from an earlier tunnel goes out as soon as the signal returns.
  useEffect(() => outbox.watch(), [outbox]);

  const back = { href: `/route/${routeId}`, label: "Back to the route" };
  const stop = route.data?.stops.find((s) => s.id === workOrderId) ?? null;

  /**
   * Apply a mutation, then patch the one stop in place.
   *
   * `retry` is the same change expressed as an outbox job. When it is given and
   * the failure is a lost connection rather than a refusal, the change is held
   * and the screen keeps the new state: a crew in a tunnel has done the work,
   * and telling them it did not happen would be false.
   */
  async function act(
    change: () => Promise<void>,
    patch: (previous: Stop) => Stop,
    retry?: NewJob,
  ) {
    if (route.data == null || stop == null) return;
    setBusy(true);
    setFailure(null);
    const apply = () => {
      if (route.data == null) return;
      route.set({
        ...route.data,
        stops: sortStops(
          route.data.stops.map((s) => (s.id === workOrderId ? patch(s) : s)),
        ),
      });
    };
    try {
      await change();
      apply();
      setHeld(false);
    } catch (cause) {
      if (retry !== undefined && isOffline(cause)) {
        outbox.hold(retry);
        apply();
        setHeld(true);
      } else {
        setFailure(
          cause instanceof Error
            ? `${cause.message} Nothing was recorded; try again.`
            : "The change was not saved. Nothing was recorded; try again.",
        );
      }
    } finally {
      setBusy(false);
    }
  }

  if (route.state === "loading") {
    return (
      <>
        <AppHeader subtitle="Loading the stop" back={back} />
        <main className="measure flex-1">
          <Panel label="Stop">
            <PlaceholderBox>Loading the stop.</PlaceholderBox>
          </Panel>
        </main>
      </>
    );
  }

  if (route.state === "error" || route.data == null || stop == null) {
    return (
      <>
        <AppHeader subtitle="Stop unavailable" back={back} />
        <main className="measure flex-1">
          <Panel label="Stop">
            <ErrorNotice
              message={
                route.error != null
                  ? `Could not load the stop. ${route.error} Work already recorded is unaffected.`
                  : "No stop with that reference on this route."
              }
              onRetry={route.reload}
            />
          </Panel>
        </main>
      </>
    );
  }

  const data = route.data;
  const index = data.stops.findIndex((s) => s.id === workOrderId) + 1;
  const outstanding = stop.status !== "done" && stop.status !== "cancelled";
  const worked = minutesBetween(stop.startedAt, stop.completedAt);
  const p = stop.pothole;

  return (
    <>
      <AppHeader
        subtitle={`Stop ${index} of ${data.stops.length} · ${data.crew.name}`}
        back={back}
      />

      <main className="measure flex-1">
        {/* ─── Where ─────────────────────────────────────────────────────── */}
        <section className="panel panel-pad">
          <div className="flex items-baseline justify-between gap-3">
            <h1 className="m-0 text-[20px] leading-[1.15]">{stop.street}</h1>
            <StatusTag
              status={stop.status}
              muted={stop.status === "done" || stop.status === "cancelled"}
            />
          </div>
          <p className="m-0 mt-1 text-[13px] leading-[1.4] text-ink-72 tabular">
            {stop.ref} · {coordinate(p.lat, p.lng)}
          </p>
          <p className="m-0 mt-1 text-[12px] leading-[1.35] text-ink-55 tabular">
            {stop.status === "done" && stop.completedAt != null
              ? `Closed at ${hhmm(new Date(stop.completedAt))}${
                  worked != null ? ` · ${Math.round(worked)} min on site` : ""
                }`
              : stop.status === "cancelled" && stop.completedAt != null
                ? `Escalated at ${hhmm(new Date(stop.completedAt))}`
                : stop.status === "in_progress" && stop.startedAt != null
                  ? `On site since ${hhmm(new Date(stop.startedAt))}`
                  : stop.eta != null
                    ? `Planned arrival ${hhmm(new Date(stop.eta))}`
                    : "No planned arrival"}
          </p>
          <div className="mt-3">
            <a
              className="btn btn-secondary"
              style={{ width: "100%" }}
              href={directionsTo({ lat: p.lat, lng: p.lng })}
              target="_blank"
              rel="noreferrer"
            >
              Navigate to this stop
            </a>
          </div>
        </section>

        {/* ─── Why ───────────────────────────────────────────────────────── */}
        <Panel label="Evidence">
          <div className="flex items-center gap-3">
            <SeverityBar
              severity={p.severity}
              mark={stopMark(stop.status)}
            />
            <span className="text-[13px] text-ink-72 tabular">
              Severity {severity(p.severity)}
            </span>
          </div>
          <p className="m-0 mt-2 text-[13px] leading-[1.45] text-ink-72 tabular">
            {evidenceLine(stop)}
          </p>
          <p className="m-0 text-[13px] leading-[1.45] text-ink-72 tabular">
            Priority {p.priority.toFixed(1)} · last pass{" "}
            {hhmm(new Date(p.last_detected_at))}
          </p>
          <p className="m-0 mt-1 text-[12px] leading-[1.35] text-ink-55">
            {p.distinct_vehicles >= 2
              ? "Corroborated by more than one vehicle before it was scheduled."
              : "One vehicle only. Treat the location as approximate."}
          </p>

          {stop.beforePhotoUrl != null && (
            <figure className="m-0 mt-3">
              <div className="photo-frame">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={stop.beforePhotoUrl}
                  alt="The road surface as the detecting vehicle photographed it"
                />
              </div>
              <figcaption className="mt-1 text-[11px] text-ink-55">
                Before, from the detecting vehicle
              </figcaption>
            </figure>
          )}
        </Panel>

        {/* ─── Record ────────────────────────────────────────────────────── */}
        <Panel label="Record">
          <div className="grid gap-4">
            {/* Not offered on an escalated stop: no repair was made, so there
                is nothing to photograph, and attaching one would muddy the
                record the council reads. */}
            {stop.status !== "cancelled" && (
              <>
                <PhotoCapture
                  url={stop.afterPhotoUrl}
                  disabled={busy}
                  onCaptured={async (image) => {
                    let url: string | null = null;
                    await act(
                      async () => {
                        url = await source.uploadAfterPhoto(stop.id, image);
                      },
                      (previous) => ({ ...previous, afterPhotoUrl: url }),
                    );
                  }}
                />
                <div className="hairline" />
              </>
            )}
            {/* Keyed on the stored note: a Realtime update from another phone
                replaces the field rather than fighting the draft in it. */}
            <NoteField
              key={stop.notes ?? ""}
              value={stop.notes}
              disabled={busy}
              onSave={async (notes) => {
                await act(
                  () => source.note(stop.id, notes),
                  (previous) => ({ ...previous, notes }),
                  { kind: "note", workOrderId: stop.id, notes },
                );
              }}
            />
            {outstanding && (
              <>
                <div className="hairline" />
                <EscalateDialog
                  onEscalate={async (notes) => {
                    await act(
                      () => source.escalate(stop.id, notes),
                      (previous) => ({
                        ...previous,
                        status: "cancelled",
                        notes,
                        completedAt: new Date().toISOString(),
                      }),
                      { kind: "escalate", workOrderId: stop.id, notes },
                    );
                  }}
                />
              </>
            )}
          </div>
        </Panel>

        {held && failure == null && (
          <div className="panel-pad">
            <p className="m-0 text-[13px] leading-[1.45] text-ink-72">
              No signal. The change is held on this phone and will be sent when
              the connection returns; there is nothing more to do here.
            </p>
          </div>
        )}

        {failure != null && (
          <div className="panel-pad">
            <p className="m-0 text-[13px] leading-[1.45] text-ink-72">{failure}</p>
          </div>
        )}
      </main>

      <StopAction
        stop={stop}
        routeId={routeId}
        busy={busy}
        onArrive={() =>
          act(
            () => source.start(stop.id),
            (previous) => ({
              ...previous,
              status: "in_progress",
              startedAt: new Date().toISOString(),
            }),
            { kind: "start", workOrderId: stop.id },
          )
        }
        onDone={() =>
          act(
            () => source.complete(stop.id, {}),
            (previous) => ({
              ...previous,
              status: "done",
              completedAt: new Date().toISOString(),
            }),
            { kind: "complete", workOrderId: stop.id, patch: {} },
          )
        }
      />
    </>
  );
}

/**
 * One action at a time. A crew that has not arrived cannot mark a repair done,
 * so the bar offers exactly the next honest step and states where it is up to.
 */
function StopAction({
  stop,
  routeId,
  busy,
  onArrive,
  onDone,
}: {
  stop: Stop;
  routeId: string;
  busy: boolean;
  onArrive: () => Promise<void>;
  onDone: () => Promise<void>;
}) {
  if (stop.status === "done" || stop.status === "cancelled") {
    return (
      <ActionBar
        title={statusWord(stop.status)}
        detail={
          stop.status === "done"
            ? "Recorded as repaired. The council's map is updated."
            : "Returned to the council for replanning."
        }
      >
        <Link href={`/route/${routeId}`} className="btn btn-secondary">
          Back to the route
        </Link>
      </ActionBar>
    );
  }

  if (stop.status === "in_progress") {
    return (
      <ActionBar
        title="On site"
        detail="Add a photo and a note first."
      >
        <PrimaryButton onClick={() => void onDone()} busy={busy}>
          Mark stop done
        </PrimaryButton>
      </ActionBar>
    );
  }

  return (
    <ActionBar title="Not started" detail="Tap when you reach the stop.">
      <PrimaryButton onClick={() => void onArrive()} busy={busy}>
        Mark arrived
      </PrimaryButton>
    </ActionBar>
  );
}
