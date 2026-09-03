// The one interface every screen reads through.
//
// Two implementations: `fixture.ts` (seeded, in-browser, no backend) and
// `supabase.ts` (the real database). `index.ts` picks by env. The screens cannot
// tell them apart, which is the point — the solver and dispatch endpoints are
// still 501 stubs, so without a fixture there is nothing to build against.
//
// The shape mirrors `ConsoleDataSource` in the console spec §5 deliberately: if
// the two apps ever merge, these are the same idea at two ends of the loop.

import type {
  BacklogGroups,
  CompletionPatch,
  Crew,
  CrewDetail,
  RouteDetail,
  RouteSummary,
  Stop,
} from "@/lib/types";

export interface CrewDataSource {
  /** Every crew's route for today. The portal's entry point. */
  today(): Promise<RouteSummary[]>;

  /** Outstanding work, split overdue / today / upcoming. */
  backlog(): Promise<BacklogGroups>;

  /** Routes with at least one settled stop, newest first, within `days`. */
  history(days: number): Promise<RouteSummary[]>;

  crews(): Promise<Crew[]>;

  crew(id: string): Promise<CrewDetail | null>;

  /** One route with its stops in `stop_order`. Null when the id is unknown. */
  route(id: string): Promise<RouteDetail | null>;

  /**
   * Push changes to this route's work orders — a second crew member's phone, or
   * the council replanning. Returns its own unsubscribe.
   */
  subscribe(routeId: string, onChange: (stop: Stop) => void): () => void;

  /** Arrived: `in_progress` + `started_at`. */
  start(workOrderId: string): Promise<void>;

  /** Done: `done` + `completed_at`, and whatever evidence was captured. */
  complete(workOrderId: string, patch: CompletionPatch): Promise<void>;

  /**
   * Cannot repair: `cancelled` + a required note. The pothole returns to the
   * council's queue — but only once the `cancelled` branch in
   * `contractor/migrations/20260903000000_cancel_returns_pothole.sql` has been
   * applied. Without it the pothole is stranded; see that file's header.
   */
  escalate(workOrderId: string, notes: string): Promise<void>;

  /** Record a note without changing status. */
  note(workOrderId: string, notes: string): Promise<void>;

  /**
   * Store the after-photo, record it on the work order, and return its URL.
   * Deliberately does NOT change status: closing a stop is "Mark stop done",
   * and a photo taken on an escalated stop must not quietly reopen and close it.
   */
  uploadAfterPhoto(workOrderId: string, image: Blob): Promise<string>;
}
