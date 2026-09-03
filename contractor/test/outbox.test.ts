import { beforeEach, describe, expect, it, vi } from "vitest";
import { createOutbox, isOffline } from "@/lib/crew/outbox";
import type { CrewDataSource } from "@/lib/crew/source";

beforeEach(() => {
  window.localStorage.clear();
  vi.useRealTimers();
});

/** A source that records what it was asked to do, and can be made to fail. */
function stubSource() {
  const calls: string[] = [];
  let failWith: unknown = null;
  const attempt = async (label: string) => {
    calls.push(label);
    if (failWith !== null) throw failWith;
  };
  const source = {
    start: (id: string) => attempt(`start:${id}`),
    complete: (id: string) => attempt(`complete:${id}`),
    escalate: (id: string) => attempt(`escalate:${id}`),
    note: (id: string) => attempt(`note:${id}`),
  } as unknown as CrewDataSource;
  return {
    source,
    calls,
    fail: (cause: unknown) => {
      failWith = cause;
    },
    recover: () => {
      failWith = null;
    },
  };
}

describe("isOffline", () => {
  it("recognises a connection that never reached the server", () => {
    expect(isOffline(new TypeError("Failed to fetch"))).toBe(true);
    expect(isOffline(new Error("NetworkError when attempting to fetch"))).toBe(true);
  });

  it("does not treat an answer from the server as a lost connection", () => {
    // A refusal is a real answer. Retrying it forever would make the queue lie.
    expect(isOffline(new Error("Could not mark the stop done. row not found"))).toBe(
      false,
    );
    expect(isOffline(new Error("new row violates row-level security policy"))).toBe(
      false,
    );
  });
});

describe("the outbox", () => {
  it("counts what it is holding, and survives a reload", () => {
    const { source } = stubSource();
    const outbox = createOutbox(source);
    expect(outbox.hold({ kind: "start", workOrderId: "w1" })).toBe(1);
    expect(outbox.hold({ kind: "note", workOrderId: "w1", notes: "x" })).toBe(2);

    // A new instance is what a page refresh produces.
    expect(createOutbox(source).pending()).toBe(2);
  });

  it("sends held work in the order it happened", async () => {
    // "Arrived" landing after "done" would leave the wrong started_at.
    const stub = stubSource();
    const outbox = createOutbox(stub.source);
    outbox.hold({ kind: "start", workOrderId: "w1" });
    outbox.hold({ kind: "complete", workOrderId: "w1", patch: {} });

    expect(await outbox.flush()).toBe(0);
    expect(stub.calls).toEqual(["start:w1", "complete:w1"]);
    expect(outbox.pending()).toBe(0);
  });

  it("keeps holding while the connection is still down", async () => {
    const stub = stubSource();
    const outbox = createOutbox(stub.source);
    outbox.hold({ kind: "start", workOrderId: "w1" });
    stub.fail(new TypeError("Failed to fetch"));

    expect(await outbox.flush()).toBe(1);
    expect(outbox.pending()).toBe(1);

    stub.recover();
    expect(await outbox.flush()).toBe(0);
    expect(outbox.pending()).toBe(0);
  });

  it("drops a job the server refused, rather than retrying it forever", async () => {
    const stub = stubSource();
    const outbox = createOutbox(stub.source);
    outbox.hold({ kind: "start", workOrderId: "gone" });
    outbox.hold({ kind: "note", workOrderId: "w1", notes: "x" });
    stub.fail(new Error("Could not record the arrival. row not found"));

    await outbox.flush();
    // Both were attempted; neither is still pretending to be pending.
    expect(stub.calls).toEqual(["start:gone", "note:w1"]);
    expect(outbox.pending()).toBe(0);
  });

  it("tells a subscriber the count, immediately and on every change", () => {
    const { source } = stubSource();
    const outbox = createOutbox(source);
    const seen: number[] = [];
    const stop = outbox.subscribe((n) => seen.push(n));
    outbox.hold({ kind: "start", workOrderId: "w1" });
    stop();
    outbox.hold({ kind: "start", workOrderId: "w2" });

    expect(seen).toEqual([0, 1]);
  });

  it("has nothing to do when nothing is held", async () => {
    const stub = stubSource();
    expect(await createOutbox(stub.source).flush()).toBe(0);
    expect(stub.calls).toEqual([]);
  });
});
