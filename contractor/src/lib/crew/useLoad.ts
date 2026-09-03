"use client";

// One loading pattern for six screens.
//
// Three states and nothing else: loading shows a hairline placeholder with the
// panel label still legible, error states what failed and offers Retry, ready
// renders. No skeleton shimmer, no spinner (DESIGN.md §7).
//
// `load` must be stable — wrap it in `useCallback` at the call site. That is what
// decides when a reload happens, and making it explicit keeps this hook free of
// the dependency-array guesswork that produces double fetches.

import { useEffect, useState } from "react";

export type LoadState = "loading" | "ready" | "error";

export interface Loaded<T> {
  state: LoadState;
  data: T | null;
  error: string | null;
  reload: () => void;
  /** Update in place — for a Realtime event, which must not flash a placeholder. */
  set: (next: T) => void;
}

interface Outcome<T> {
  /** Which request this result belongs to. A newer request supersedes it. */
  request: () => Promise<T>;
  attempt: number;
  data: T | null;
  error: string | null;
}

const message = (cause: unknown): string =>
  cause instanceof Error ? cause.message : String(cause);

export function useLoad<T>(load: () => Promise<T>): Loaded<T> {
  const [attempt, setAttempt] = useState(0);
  const [outcome, setOutcome] = useState<Outcome<T> | null>(null);

  useEffect(() => {
    let live = true;
    load().then(
      (data) => {
        if (live) setOutcome({ request: load, attempt, data, error: null });
      },
      (cause: unknown) => {
        if (live) {
          setOutcome({ request: load, attempt, data: null, error: message(cause) });
        }
      },
    );
    return () => {
      live = false;
    };
  }, [load, attempt]);

  // Loading is derived, not stored: an outcome from a superseded request simply
  // does not match, so no state has to be reset when the deps change.
  const settled =
    outcome !== null && outcome.request === load && outcome.attempt === attempt;

  return {
    state: !settled ? "loading" : outcome.error !== null ? "error" : "ready",
    data: settled ? outcome.data : null,
    error: settled ? outcome.error : null,
    reload: () => setAttempt((a) => a + 1),
    set: (next: T) =>
      setOutcome({ request: load, attempt, data: next, error: null }),
  };
}
