import { describe, it, expect, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  DispatchError,
  buildDispatchEmail,
  buildGmapsLegs,
  dispatch,
  validateDispatchRequest,
  type DispatchPlan,
  type Mailer,
} from "./dispatch";
import type { LngLat } from "@/lib/solver/haversine";
import type { DispatchRequest, PotholeMapRow } from "@/lib/types";

const PLAN = "44444444-4444-4444-4444-444444444444";
const CREW = "00000000-0000-0000-0000-000000000006";
// SRID=4326;POINT(-0.1246 51.4994), the seeded Crew A depot.
const DEPOT_HEX = "0101000020e6100000bde3141dc9e5bfbfabcfd556ecbf4940";
const DEPOT: LngLat = [-0.1246, 51.4994];
const APP_URL = "https://bachero.example";

// ─── validateDispatchRequest ──────────────────────────────────────────────────

function errorOf(result: DispatchRequest | { error: string }): string {
  if (!("error" in result)) throw new Error("expected a validation error");
  return result.error;
}

function okOf(result: DispatchRequest | { error: string }): DispatchRequest {
  if ("error" in result) throw new Error(`expected success, got: ${result.error}`);
  return result;
}

describe("validateDispatchRequest", () => {
  it("rejects a non-object body", () => {
    expect(errorOf(validateDispatchRequest(null))).toMatch(/JSON object/);
    expect(errorOf(validateDispatchRequest([PLAN]))).toMatch(/JSON object/);
  });

  it("rejects a missing or malformed route_plan_id", () => {
    expect(errorOf(validateDispatchRequest({ to: ["a@b.com"] }))).toMatch(/route_plan_id/);
    expect(errorOf(validateDispatchRequest({ route_plan_id: "nope", to: ["a@b.com"] }))).toMatch(/route_plan_id/);
  });

  it("requires a non-empty list of email addresses", () => {
    expect(errorOf(validateDispatchRequest({ route_plan_id: PLAN }))).toMatch(/to/);
    expect(errorOf(validateDispatchRequest({ route_plan_id: PLAN, to: [] }))).toMatch(/to/);
    expect(errorOf(validateDispatchRequest({ route_plan_id: PLAN, to: ["not-an-address"] }))).toMatch(/to/);
    expect(errorOf(validateDispatchRequest({ route_plan_id: PLAN, to: [42] }))).toMatch(/to/);
  });

  it("accepts a well-formed request and keeps only the contract fields", () => {
    const req = okOf(
      validateDispatchRequest({ route_plan_id: PLAN, to: ["crew@council.gov.uk"], subject: "ignored" }),
    );
    expect(req).toEqual({ route_plan_id: PLAN, to: ["crew@council.gov.uk"] });
  });
});

// ─── buildGmapsLegs ───────────────────────────────────────────────────────────

/** Distinct, easily identified points: [lng, lat] = [i, 100 + i]. */
function stopPoints(count: number): LngLat[] {
  return Array.from({ length: count }, (_, i): LngLat => [i + 1, 101 + i]);
}

function paramsOf(url: string): URLSearchParams {
  return new URL(url).searchParams;
}

function waypointsOf(url: string): string[] {
  const raw = paramsOf(url).get("waypoints");
  return raw === null ? [] : raw.split("|");
}

describe("buildGmapsLegs", () => {
  it("writes lat,lng (the one place that is not longitude first)", () => {
    const [link, ...rest] = buildGmapsLegs([DEPOT, [1, 101], DEPOT]);
    expect(rest).toEqual([]);
    expect(link.startsWith("https://www.google.com/maps/dir/?api=1&")).toBe(true);
    expect(paramsOf(link).get("origin")).toBe("51.4994,-0.1246");
    expect(paramsOf(link).get("destination")).toBe("51.4994,-0.1246");
    expect(waypointsOf(link)).toEqual(["101,1"]);
    expect(paramsOf(link).get("travelmode")).toBe("driving");
  });

  it("keeps 8 stops in a single leg", () => {
    const links = buildGmapsLegs([DEPOT, ...stopPoints(8), DEPOT]);
    expect(links).toHaveLength(1);
    expect(waypointsOf(links[0])).toHaveLength(8);
    expect(paramsOf(links[0]).get("origin")).toBe("51.4994,-0.1246");
    expect(paramsOf(links[0]).get("destination")).toBe("51.4994,-0.1246");
  });

  it("splits 9 stops into two legs that meet at stop 9", () => {
    const links = buildGmapsLegs([DEPOT, ...stopPoints(9), DEPOT]);
    expect(links).toHaveLength(2);
    expect(waypointsOf(links[0])).toHaveLength(8);
    // Leg 1 ends at stop 9, which is where leg 2 starts.
    expect(paramsOf(links[0]).get("destination")).toBe("109,9");
    expect(paramsOf(links[1]).get("origin")).toBe("109,9");
    expect(waypointsOf(links[1])).toEqual([]);
    expect(paramsOf(links[1]).get("destination")).toBe("51.4994,-0.1246");
  });

  it("splits 20 stops into three legs with no gaps and never more than 8 waypoints", () => {
    const links = buildGmapsLegs([DEPOT, ...stopPoints(20), DEPOT]);
    expect(links).toHaveLength(3);
    expect(links.map((l) => waypointsOf(l).length)).toEqual([8, 8, 2]);
    expect(paramsOf(links[0]).get("origin")).toBe("51.4994,-0.1246");
    expect(paramsOf(links[0]).get("destination")).toBe("109,9");
    expect(paramsOf(links[1]).get("origin")).toBe("109,9");
    expect(paramsOf(links[1]).get("destination")).toBe("118,18");
    expect(paramsOf(links[2]).get("origin")).toBe("118,18");
    expect(paramsOf(links[2]).get("destination")).toBe("51.4994,-0.1246");

    // Every stop appears exactly once across the legs, in order.
    const visited = links.flatMap((l, i) => [
      ...(i === 0 ? [paramsOf(l).get("origin")] : []),
      ...waypointsOf(l),
      paramsOf(l).get("destination"),
    ]);
    expect(visited).toEqual([
      "51.4994,-0.1246",
      ...stopPoints(20).map(([lng, lat]) => `${lat},${lng}`),
      "51.4994,-0.1246",
    ]);
  });
});

// ─── buildDispatchEmail ───────────────────────────────────────────────────────

function pothole(over: Partial<PotholeMapRow> & { id: string }): PotholeMapRow {
  return {
    authority_id: "00000000-0000-0000-0000-000000000001",
    road_name: null,
    status: "scheduled",
    severity: 0.5,
    detection_count: 2,
    distinct_vehicles: 2,
    first_detected_at: "2026-09-01T00:00:00.000Z",
    last_detected_at: "2026-09-01T00:00:00.000Z",
    repaired_at: null,
    updated_at: "2026-09-01T00:00:00.000Z",
    lng: 0,
    lat: 0,
    photo_url: null,
    priority: 1,
    ...over,
  };
}

/** Local-time ISO instant, so the HH:MM assertions hold in any time zone. */
function localIso(hour: number, minute: number): string {
  return new Date(2026, 8, 3, hour, minute).toISOString();
}

function makePlan(stops: number, over: Partial<DispatchPlan> = {}): DispatchPlan {
  return {
    id: PLAN,
    crew_id: CREW,
    plan_date: "2026-09-03",
    status: "draft",
    total_km: 14.2,
    total_minutes: 312,
    baseline_km: 21.9,
    objective: null,
    path_geojson: null,
    crew: {
      id: CREW,
      authority_id: "00000000-0000-0000-0000-000000000001",
      name: "Crew A",
      shift_minutes: 480,
      repairs_per_shift: 12,
      depot: DEPOT_HEX,
    },
    work_orders: Array.from({ length: stops }, (_, i) => ({
      id: `wo-${i + 1}`,
      pothole_id: `p-${i + 1}`,
      crew_id: CREW,
      route_plan_id: PLAN,
      stop_order: i + 1,
      status: "assigned" as const,
      eta: localIso(8, 5 + i),
      started_at: null,
      completed_at: null,
      before_photo_url: null,
      after_photo_url: null,
      notes: null,
      pothole: pothole({ id: `p-${i + 1}`, lng: i + 1, lat: 101 + i }),
    })),
    ...over,
  };
}

describe("buildDispatchEmail", () => {
  it("names the crew, the date and the stop count in the subject", () => {
    expect(buildDispatchEmail(makePlan(5), APP_URL).subject).toBe("Repair route for Crew A, 2026-09-03: 5 stops");
    expect(buildDispatchEmail(makePlan(1), APP_URL).subject).toBe("Repair route for Crew A, 2026-09-03: 1 stop");
  });

  it("opens with the totals and leads with the crew page link", () => {
    const { text, html } = buildDispatchEmail(makePlan(5), APP_URL);
    expect(text).toContain("14.2 km");
    expect(text).toContain("312 min");
    const crewPage = `${APP_URL}/route/${PLAN}`;
    expect(text).toContain(crewPage);
    expect(html).toContain(`href="${crewPage}"`);
    // The crew page comes before the Google Maps links in both bodies.
    expect(text.indexOf(crewPage)).toBeLessThan(text.indexOf("google.com/maps"));
    expect(html.indexOf(crewPage)).toBeLessThan(html.indexOf("google.com/maps"));
    expect(text).not.toContain("!");
  });

  it("lists the stops in order with road name, severity and eta", () => {
    const plan = makePlan(2);
    plan.work_orders[0].pothole = pothole({
      id: "p-1",
      road_name: "Acacia Avenue",
      severity: 0.82,
      lng: 1,
      lat: 101,
    });
    plan.work_orders[0].eta = localIso(8, 5);
    plan.work_orders[1].eta = localIso(9, 40);

    const { text } = buildDispatchEmail(plan, APP_URL);
    expect(text).toContain("1. Acacia Avenue — severity 0.82 — eta 08:05");
    // No road name, so the coordinates stand in, latitude first for a human.
    expect(text).toContain("2. 102.00000, 2.00000 — severity 0.50 — eta 09:40");
  });

  it("sorts the stops by stop_order even if the rows arrive shuffled", () => {
    const plan = makePlan(3);
    plan.work_orders.reverse();
    const { text } = buildDispatchEmail(plan, APP_URL);
    // Anchored to line starts: the plan date ends in "-03. " too.
    expect(text.indexOf("\n1. ")).toBeLessThan(text.indexOf("\n2. "));
    expect(text.indexOf("\n2. ")).toBeLessThan(text.indexOf("\n3. "));
  });

  it("includes the before photo when there is one, and no img otherwise", () => {
    const plain = buildDispatchEmail(makePlan(1), APP_URL);
    expect(plain.html).not.toContain("<img");

    const plan = makePlan(1);
    plan.work_orders[0].pothole = pothole({ id: "p-1", photo_url: "https://example.com/a.jpg" });
    const withPhoto = buildDispatchEmail(plan, APP_URL);
    expect(withPhoto.html).toContain('src="https://example.com/a.jpg"');
    expect(withPhoto.text).toContain("https://example.com/a.jpg");
  });

  it("escapes HTML in road names", () => {
    const plan = makePlan(1);
    plan.work_orders[0].pothole = pothole({ id: "p-1", road_name: "Fish & <Chips> Lane" });
    const { html } = buildDispatchEmail(plan, APP_URL);
    expect(html).toContain("Fish &amp; &lt;Chips&gt; Lane");
    expect(html).not.toContain("<Chips>");
  });

  it("chunks the Google Maps links per leg, depot to depot", () => {
    for (const stops of [1, 8, 9, 20]) {
      const plan = makePlan(stops);
      const { text, html } = buildDispatchEmail(plan, APP_URL);
      const expected = buildGmapsLegs([
        DEPOT,
        ...plan.work_orders.map((w): LngLat => [w.pothole.lng, w.pothole.lat]),
        DEPOT,
      ]);
      expect(expected).toHaveLength(stops > 8 ? (stops > 17 ? 3 : 2) : 1);
      for (const link of expected) {
        expect(text).toContain(link);
        // Ampersands are entity-escaped inside href attributes.
        expect(html).toContain(link.replaceAll("&", "&amp;"));
      }
      expect(text.match(/google\.com\/maps/g)).toHaveLength(expected.length);
    }
  });

  it("throws when the depot cannot be read", () => {
    const plan = makePlan(1, {});
    plan.crew.depot = "not-wkb";
    expect(() => buildDispatchEmail(plan, APP_URL)).toThrow(DispatchError);
  });
});

// ─── fake PostgREST ───────────────────────────────────────────────────────────

type Row = Record<string, unknown>;
type Filter = { col: string; values: unknown[] };
interface WriteLog {
  table: string;
  payload: Row;
  filters: Filter[];
}

/** Minimal in-memory stand-in for the two supabase-js chains dispatch uses. */
function makeDb(tables: Record<string, Row[]>, errors: Record<string, { message: string }> = {}) {
  const writes: WriteLog[] = [];

  function from(table: string) {
    const filters: Filter[] = [];
    let payload: Row | undefined;

    function run(): { data: Row[] | null; error: { message: string } | null } {
      if (errors[table]) return { data: null, error: errors[table] };
      const rows = tables[table] ?? (tables[table] = []);
      const hit = rows.filter((r) => filters.every((f) => f.values.includes(r[f.col])));
      if (payload === undefined) return { data: hit.map((r) => ({ ...r })), error: null };
      writes.push({ table, payload, filters: [...filters] });
      for (const r of hit) Object.assign(r, payload);
      return { data: hit.map((r) => ({ ...r })), error: null };
    }

    const q = {
      select: () => q,
      eq: (col: string, value: unknown) => {
        filters.push({ col, values: [value] });
        return q;
      },
      order: () => q,
      update: (row: Row) => {
        payload = row;
        return q;
      },
      then: <T>(resolve: (v: { data: Row[] | null; error: { message: string } | null }) => T) =>
        Promise.resolve(run()).then(resolve),
    };
    return q;
  }

  return { db: { from } as unknown as SupabaseClient, tables, writes };
}

function baseTables(plan: DispatchPlan = makePlan(2)): Record<string, Row[]> {
  return {
    route_plans_map: [plan as unknown as Row],
    route_plans: [{ id: PLAN, crew_id: CREW, plan_date: plan.plan_date, status: "draft" }],
  };
}

function makeMailer(over: Partial<Mailer> = {}): Mailer & { send: ReturnType<typeof vi.fn> } {
  return {
    send: vi.fn().mockResolvedValue({ id: "email-1" }),
    ...over,
  } as Mailer & { send: ReturnType<typeof vi.fn> };
}

const REQ: DispatchRequest = { route_plan_id: PLAN, to: ["crew@council.gov.uk"] };

// ─── dispatch ─────────────────────────────────────────────────────────────────

describe("dispatch", () => {
  it("sends the email and publishes the plan", async () => {
    const { db, tables, writes } = makeDb(baseTables());
    const mailer = makeMailer();

    const result = await dispatch({ db, mailer, appUrl: APP_URL, from: "bachero@example.com" }, REQ);

    expect(mailer.send).toHaveBeenCalledTimes(1);
    const msg = mailer.send.mock.calls[0][0];
    expect(msg.from).toBe("bachero@example.com");
    expect(msg.to).toEqual(["crew@council.gov.uk"]);
    expect(msg.subject).toBe("Repair route for Crew A, 2026-09-03: 2 stops");
    expect(msg.html).toContain(`${APP_URL}/route/${PLAN}`);
    expect(msg.text).toContain(`${APP_URL}/route/${PLAN}`);

    expect(result).toEqual({
      route_plan_id: PLAN,
      sent: true,
      to: ["crew@council.gov.uk"],
      crew_page: `${APP_URL}/route/${PLAN}`,
      message_id: "email-1",
    });

    expect(tables.route_plans[0].status).toBe("published");
    expect(writes).toEqual([
      { table: "route_plans", payload: { status: "published" }, filters: [{ col: "id", values: [PLAN] }] },
    ]);
  });

  it("publishes without sending when there is no mailer", async () => {
    const { db, tables } = makeDb(baseTables());

    const result = await dispatch({ db, mailer: null, appUrl: APP_URL, from: "bachero@example.com" }, REQ);

    expect(result).toEqual({
      route_plan_id: PLAN,
      sent: false,
      to: ["crew@council.gov.uk"],
      crew_page: `${APP_URL}/route/${PLAN}`,
    });
    expect(result).not.toHaveProperty("message_id");
    expect(tables.route_plans[0].status).toBe("published");
  });

  it("502s and leaves the plan unpublished when the mailer fails", async () => {
    const { db, tables, writes } = makeDb(baseTables());
    const mailer = makeMailer({ send: vi.fn().mockRejectedValue(new Error("resend is down")) });

    const error = await dispatch({ db, mailer, appUrl: APP_URL, from: "bachero@example.com" }, REQ).catch(
      (e: unknown) => e,
    );

    expect(error).toBeInstanceOf(DispatchError);
    expect((error as DispatchError).status).toBe(502);
    expect((error as DispatchError).message).toBe("Email service unavailable.");
    expect(tables.route_plans[0].status).toBe("draft");
    expect(writes).toEqual([]);
  });

  it("404s when the plan does not exist", async () => {
    const { db } = makeDb({ ...baseTables(), route_plans_map: [] });
    await expect(
      dispatch({ db, mailer: makeMailer(), appUrl: APP_URL, from: "f@e.com" }, REQ),
    ).rejects.toMatchObject({ status: 404 });
  });

  it("400s when the plan has no stops", async () => {
    const { db } = makeDb(baseTables(makePlan(0)));
    const error = await dispatch({ db, mailer: makeMailer(), appUrl: APP_URL, from: "f@e.com" }, REQ).catch(
      (e: unknown) => e,
    );
    expect((error as DispatchError).status).toBe(400);
  });

  it("500s when the database returns an error", async () => {
    const { db } = makeDb(baseTables(), { route_plans_map: { message: "boom" } });
    await expect(
      dispatch({ db, mailer: makeMailer(), appUrl: APP_URL, from: "f@e.com" }, REQ),
    ).rejects.toMatchObject({ status: 500 });
  });

  it("500s when publishing fails, after the email has gone", async () => {
    const { db } = makeDb(baseTables(), { route_plans: { message: "boom" } });
    await expect(
      dispatch({ db, mailer: makeMailer(), appUrl: APP_URL, from: "f@e.com" }, REQ),
    ).rejects.toMatchObject({ status: 500 });
  });
});
