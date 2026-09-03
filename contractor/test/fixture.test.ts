import { beforeEach, describe, expect, it } from "vitest";
import { createFixtureSource } from "@/lib/crew/fixture";
import { isoDate } from "@/lib/crew/format";

beforeEach(() => {
  window.localStorage.clear();
});

const today = () => isoDate(new Date());

describe("the generated base", () => {
  it("is the same every run, so a demo is repeatable", async () => {
    const a = await createFixtureSource().today();
    const b = await createFixtureSource().today();
    expect(a.map((r) => r.id)).toEqual(b.map((r) => r.id));
    expect(a.map((r) => r.stopCount)).toEqual(b.map((r) => r.stopCount));
  });

  it("dispatches two routes for today, from different crews", async () => {
    const routes = await createFixtureSource().today();
    expect(routes).toHaveLength(2);
    expect(routes.every((r) => r.planDate === today())).toBe(true);
    expect(new Set(routes.map((r) => r.crew.id)).size).toBe(2);
  });

  it("numbers stops from 1 with no gaps", async () => {
    const source = createFixtureSource();
    const [first] = await source.today();
    const route = await source.route(first.id);
    expect(route?.stops.map((s) => s.stopOrder)).toEqual(
      route?.stops.map((_, i) => i + 1),
    );
  });

  it("gives every stop a reference and somewhere to drive to", async () => {
    const source = createFixtureSource();
    const [first] = await source.today();
    const route = await source.route(first.id);
    for (const stop of route?.stops ?? []) {
      expect(stop.ref).toMatch(/^BCH-[0-9A-F]{4}$/);
      expect(stop.street.length).toBeGreaterThan(0);
      expect(Number.isFinite(stop.pothole.lat)).toBe(true);
      expect(Number.isFinite(stop.pothole.lng)).toBe(true);
    }
  });

  it("returns null for an unknown route rather than an empty one", async () => {
    expect(await createFixtureSource().route("nope")).toBeNull();
  });
});

describe("actions", () => {
  it("records an arrival, then a repair, and advances the route's progress", async () => {
    const source = createFixtureSource();
    const [summary] = await source.today();
    const before = await source.route(summary.id);
    const target = before!.stops.find((s) => s.status === "assigned")!;

    await source.start(target.id);
    let route = await source.route(summary.id);
    let stop = route!.stops.find((s) => s.id === target.id)!;
    expect(stop.status).toBe("in_progress");
    expect(stop.startedAt).not.toBeNull();

    await source.complete(target.id, { notes: "Filled, about 0.4 m²." });
    route = await source.route(summary.id);
    stop = route!.stops.find((s) => s.id === target.id)!;
    expect(stop.status).toBe("done");
    expect(stop.notes).toBe("Filled, about 0.4 m².");
    expect(route!.doneCount).toBe(before!.doneCount + 1);
  });

  it("marks the pothole repaired, the way the database trigger would", async () => {
    const source = createFixtureSource();
    const [summary] = await source.today();
    const target = (await source.route(summary.id))!.stops.find(
      (s) => s.status === "assigned",
    )!;
    await source.complete(target.id, {});
    const stop = (await source.route(summary.id))!.stops.find(
      (s) => s.id === target.id,
    )!;
    expect(stop.pothole.status).toBe("repaired");
  });

  it("returns an escalated stop's pothole to the council's queue", async () => {
    // Mirrors the cancelled branch in
    // supabase/migrations/20260903000000_cancel_returns_pothole.sql.
    const source = createFixtureSource();
    const [summary] = await source.today();
    const target = (await source.route(summary.id))!.stops.find(
      (s) => s.status === "assigned",
    )!;
    await source.escalate(target.id, "Needs a planing gang.");
    const stop = (await source.route(summary.id))!.stops.find(
      (s) => s.id === target.id,
    )!;
    expect(stop.status).toBe("cancelled");
    expect(stop.pothole.status).toBe("confirmed");
    expect(stop.notes).toBe("Needs a planing gang.");
  });

  it("takes a stop out of the backlog once it is closed", async () => {
    const source = createFixtureSource();
    const before = await source.backlog();
    const target = before.today[0];
    await source.complete(target.id, {});
    const after = await source.backlog();
    expect(after.today.map((s) => s.id)).not.toContain(target.id);
    expect(after.today.length).toBe(before.today.length - 1);
  });

  it("survives a reload, so a demo does not reset mid-shift", async () => {
    const first = createFixtureSource();
    const [summary] = await first.today();
    const target = (await first.route(summary.id))!.stops.find(
      (s) => s.status === "assigned",
    )!;
    await first.complete(target.id, {});

    // A new source is what a page refresh produces.
    const second = createFixtureSource();
    const stop = (await second.route(summary.id))!.stops.find(
      (s) => s.id === target.id,
    )!;
    expect(stop.status).toBe("done");
  });

  it("tells a subscriber when a stop on its route changes", async () => {
    const source = createFixtureSource();
    const [summary] = await source.today();
    const target = (await source.route(summary.id))!.stops.find(
      (s) => s.status === "assigned",
    )!;

    const seen: string[] = [];
    const stop = source.subscribe(summary.id, (s) => seen.push(s.status));
    await source.start(target.id);
    stop();
    await source.complete(target.id, {});

    expect(seen).toEqual(["in_progress"]);
  });
});

describe("boards", () => {
  it("puts yesterday's unfinished work in the overdue group", async () => {
    const groups = await createFixtureSource().backlog();
    // Non-empty on purpose: an always-empty overdue group would hide the bug
    // where a stop dated yesterday appears on no screen at all.
    expect(groups.overdue.length).toBeGreaterThan(0);
    expect(groups.overdue.every((s) => s.planDate! < today())).toBe(true);
    expect(groups.today.every((s) => s.planDate === today())).toBe(true);
    expect(groups.upcoming.length).toBeGreaterThan(0);
    expect(groups.upcoming.every((s) => s.planDate! > today())).toBe(true);
  });

  it("shows only routes with work recorded in the history", async () => {
    const routes = await createFixtureSource().history(14);
    expect(routes.length).toBeGreaterThan(0);
    expect(routes.every((r) => r.doneCount + r.escalatedCount > 0)).toBe(true);
    // Newest first.
    const dates = routes.map((r) => r.planDate);
    expect([...dates].sort().reverse()).toEqual(dates);
  });

  it("counts a crew's work and averages its time on site", async () => {
    const source = createFixtureSource();
    const [crew] = await source.crews();
    const detail = await source.crew(crew.id);
    expect(detail?.stats.stopsDone).toBeGreaterThan(0);
    expect(detail?.stats.averageMinutesPerStop).toBeGreaterThan(0);
    expect(detail?.routes.every((r) => r.crew.id === crew.id)).toBe(true);
  });

  it("returns null for an unknown crew", async () => {
    expect(await createFixtureSource().crew("nope")).toBeNull();
  });
});

describe("the after-photo", () => {
  it("is recorded without closing the stop", async () => {
    // Attaching a photo used to call complete(), which quietly closed whatever
    // stop it was attached to — including an escalated one.
    const source = createFixtureSource();
    const [summary] = await source.today();
    const target = (await source.route(summary.id))!.stops.find(
      (s) => s.status === "assigned",
    )!;

    const url = await source.uploadAfterPhoto(target.id, new Blob(["x"]));
    expect(url.startsWith("data:")).toBe(true);

    const stop = (await source.route(summary.id))!.stops.find(
      (s) => s.id === target.id,
    )!;
    expect(stop.afterPhotoUrl).toBe(url);
    expect(stop.status).toBe("assigned");
  });

  it("survives the stop being closed afterwards", async () => {
    const source = createFixtureSource();
    const [summary] = await source.today();
    const target = (await source.route(summary.id))!.stops.find(
      (s) => s.status === "assigned",
    )!;
    const url = await source.uploadAfterPhoto(target.id, new Blob(["x"]));
    await source.complete(target.id, {});
    const stop = (await source.route(summary.id))!.stops.find(
      (s) => s.id === target.id,
    )!;
    expect(stop.status).toBe("done");
    expect(stop.afterPhotoUrl).toBe(url);
  });
});
