"use client";

// A crew works in a van, and a van goes through tunnels and multi-storey car
// parks. When a stop is closed with no signal, the choice is between losing the
// record and holding it until the signal returns; the sensor app already made
// that choice with `lib/data/upload_queue.dart`, and this is the same idea on
// the web, with the same backoff.
//
// Deliberately narrow. It is NOT a general write-behind cache:
//
//   * Every mutation is still tried immediately and awaited, so the normal case
//     gives the crew immediate, truthful feedback.
//   * Only a failure that looks like lost connectivity is queued. A rejected
//     write — a bad id, a policy refusal — is reported, not retried forever.
//   * Jobs are idempotent by construction: each sets a status and a timestamp on
//     one work order, so replaying one is harmless.
//
// A crash loses the queue. Same deliberate limit as the sensor app.

import type { CompletionPatch } from "@/lib/types";
import type { CrewDataSource } from "./source";

const STORAGE_KEY = "bachero.contractor.outbox.v1";

/** Seconds by attempt count — the sensor's `uploadRetrySeconds`. */
const BACKOFF_SECONDS = [2, 5, 15, 30, 60];

export type Job =
  | { id: string; kind: "start"; workOrderId: string; attempts: number }
  | {
      id: string;
      kind: "complete";
      workOrderId: string;
      patch: CompletionPatch;
      attempts: number;
    }
  | {
      id: string;
      kind: "escalate";
      workOrderId: string;
      notes: string;
      attempts: number;
    }
  | { id: string; kind: "note"; workOrderId: string; notes: string; attempts: number };

export type NewJob =
  | { kind: "start"; workOrderId: string }
  | { kind: "complete"; workOrderId: string; patch: CompletionPatch }
  | { kind: "escalate"; workOrderId: string; notes: string }
  | { kind: "note"; workOrderId: string; notes: string };

/**
 * Is this failure a lost connection rather than a refusal?
 *
 * `fetch` rejects with a TypeError when it cannot reach the host, and both data
 * sources wrap PostgREST's own message. Anything that came back *from* the
 * server is a real answer and must not be retried behind the crew's back.
 */
export function isOffline(cause: unknown): boolean {
  if (typeof navigator !== "undefined" && navigator.onLine === false) return true;
  const text = cause instanceof Error ? `${cause.name}: ${cause.message}` : String(cause);
  return /TypeError|Failed to fetch|NetworkError|network|ECONNREFUSED|ETIMEDOUT/i.test(
    text,
  );
}

function read(): Job[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    return raw == null ? [] : (JSON.parse(raw) as Job[]);
  } catch {
    return [];
  }
}

function write(jobs: Job[]): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(jobs));
  } catch {
    // Nothing useful to do: the work is already applied on screen.
  }
}

async function run(job: Job, source: CrewDataSource): Promise<void> {
  switch (job.kind) {
    case "start":
      return source.start(job.workOrderId);
    case "complete":
      return source.complete(job.workOrderId, job.patch);
    case "escalate":
      return source.escalate(job.workOrderId, job.notes);
    case "note":
      return source.note(job.workOrderId, job.notes);
  }
}

export interface Outbox {
  /** Hold a job for later. Returns how many are now waiting. */
  hold(job: NewJob): number;
  pending(): number;
  /** Try everything held, oldest first. Stops at the first failure. */
  flush(): Promise<number>;
  subscribe(onChange: (pending: number) => void): () => void;
  /** Start listening for the connection returning. Returns a teardown. */
  watch(): () => void;
}

export function createOutbox(source: CrewDataSource): Outbox {
  const listeners = new Set<(pending: number) => void>();
  let timer: ReturnType<typeof setTimeout> | null = null;

  const announce = () => {
    const n = read().length;
    for (const listener of listeners) listener(n);
  };

  const schedule = (attempts: number) => {
    if (timer !== null) clearTimeout(timer);
    const seconds =
      BACKOFF_SECONDS[Math.min(attempts, BACKOFF_SECONDS.length - 1)];
    timer = setTimeout(() => {
      timer = null;
      void flush();
    }, seconds * 1000);
  };

  async function flush(): Promise<number> {
    const jobs = read();

    // Strictly in order — a stop's "arrived" must not land after its "done" —
    // and always taking the head, because the queue is shortened as it drains.
    while (jobs.length > 0) {
      const job = jobs[0];
      try {
        await run(job, source);
      } catch (cause) {
        if (isOffline(cause)) {
          // Still no signal. Keep the job, and everything behind it, in order.
          job.attempts += 1;
          write(jobs);
          announce();
          schedule(job.attempts);
          return jobs.length;
        }
        // A refusal, not a dropped connection. Retrying cannot fix it, and
        // holding it forever would make the count lie about what is pending.
      }
      jobs.shift();
      write(jobs);
    }
    announce();
    return 0;
  }

  return {
    hold(job: NewJob) {
      const jobs = read();
      jobs.push({
        ...job,
        id: `${Date.now()}-${jobs.length}`,
        attempts: 0,
      } as Job);
      write(jobs);
      announce();
      schedule(0);
      return jobs.length;
    },

    pending: () => read().length,

    flush,

    subscribe(onChange) {
      listeners.add(onChange);
      onChange(read().length);
      return () => {
        listeners.delete(onChange);
      };
    },

    watch() {
      if (typeof window === "undefined") return () => {};
      const onOnline = () => void flush();
      window.addEventListener("online", onOnline);
      if (read().length > 0) schedule(0);
      return () => {
        window.removeEventListener("online", onOnline);
        if (timer !== null) clearTimeout(timer);
      };
    },
  };
}
