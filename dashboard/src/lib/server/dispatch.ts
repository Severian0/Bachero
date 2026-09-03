import type { SupabaseClient } from "@supabase/supabase-js";
import { Resend } from "resend";
import { parsePointWkb } from "./wkb";
import type { LngLat } from "@/lib/solver/haversine";
import type { Crew, DispatchRequest, PotholeMapRow, RoutePlanMapRow, WorkOrder } from "@/lib/types";

/** Error carrying the HTTP status the route handler should return. */
export class DispatchError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = "DispatchError";
  }
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Normalises an untrusted request body into a `DispatchRequest`, or returns one
 * plain sentence describing the first problem found.
 */
export function validateDispatchRequest(body: unknown): DispatchRequest | { error: string } {
  if (typeof body !== "object" || body === null || Array.isArray(body)) {
    return { error: "The request body must be a JSON object." };
  }
  const raw = body as Record<string, unknown>;

  if (typeof raw.route_plan_id !== "string" || !UUID.test(raw.route_plan_id)) {
    return { error: "route_plan_id must be a route plan UUID." };
  }
  const to = raw.to;
  if (
    !Array.isArray(to) ||
    to.length === 0 ||
    !to.every((address) => typeof address === "string" && address.includes("@"))
  ) {
    return { error: "to must be a non-empty array of email addresses." };
  }

  return { route_plan_id: raw.route_plan_id, to: to as string[] };
}

// ─── The nested route_plans_map row this module reads ─────────────────────────
// `crews(*)` includes the depot geography, which PostgREST returns as WKB hex —
// the one geography column the server reads directly (see CLAUDE.md).

export interface DispatchCrew extends Crew {
  depot: string;
}

export interface DispatchStop extends WorkOrder {
  pothole: PotholeMapRow;
}

export interface DispatchPlan extends RoutePlanMapRow {
  crew: DispatchCrew;
  work_orders: DispatchStop[];
}

// ─── Google Maps deep links ───────────────────────────────────────────────────

/**
 * Waypoints per link. Google's limit varies by platform (~9 on desktop, fewer
 * on mobile), so stay under it and let the crew page be the real interface.
 */
export const MAX_WAYPOINTS = 8;

/** Google Maps is the one place that wants latitude first. */
function latLng([lng, lat]: LngLat): string {
  return `${lat.toFixed(6)},${lng.toFixed(6)}`;
}

/**
 * Splits a depot-to-depot tour into Google Maps directions links of at most
 * `MAX_WAYPOINTS` intermediate stops each. Consecutive legs share the point
 * they meet at, so following them in order visits every stop exactly once.
 *
 * The query is written by hand rather than with `URLSearchParams`: the format
 * in docs/ARCHITECTURE.md §5 keeps the commas between coordinates and the pipes
 * between waypoints literal, and `URLSearchParams` percent-encodes both.
 */
export function buildGmapsLegs(points: LngLat[]): string[] {
  if (points.length < 2) return [];
  const step = MAX_WAYPOINTS + 1;
  const links: string[] = [];

  for (let start = 0; start < points.length - 1; start += step) {
    const end = Math.min(start + step, points.length - 1);
    const waypoints = points.slice(start + 1, end);
    links.push(
      "https://www.google.com/maps/dir/?api=1" +
        `&origin=${latLng(points[start])}` +
        `&destination=${latLng(points[end])}` +
        (waypoints.length === 0 ? "" : `&waypoints=${waypoints.map(latLng).join("|")}`) +
        "&travelmode=driving",
    );
  }

  return links;
}

// ─── Email body ───────────────────────────────────────────────────────────────

export interface DispatchEmail {
  subject: string;
  html: string;
  text: string;
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

/** Local wall-clock HH:MM. The plan's ETAs are written in server local time. */
function formatEta(iso: string | null): string | null {
  if (!iso) return null;
  const at = new Date(iso);
  if (Number.isNaN(at.getTime())) return null;
  return `${String(at.getHours()).padStart(2, "0")}:${String(at.getMinutes()).padStart(2, "0")}`;
}

function stopLabel(pothole: PotholeMapRow): string {
  return pothole.road_name ?? `${pothole.lat.toFixed(5)}, ${pothole.lng.toFixed(5)}`;
}

function stopLine(stop: DispatchStop, index: number): string {
  const eta = formatEta(stop.eta);
  const parts = [
    `${stop.stop_order ?? index + 1}. ${stopLabel(stop.pothole)}`,
    `severity ${stop.pothole.severity.toFixed(2)}`,
    ...(eta ? [`eta ${eta}`] : []),
  ];
  return parts.join(" — ");
}

function photoOf(stop: DispatchStop): string | null {
  return stop.pothole.photo_url;
}

const round1 = (value: number | null) => (value === null ? null : Math.round(value * 10) / 10);

/**
 * The crew email: totals, the crew page as the call to action, the stops in
 * order with before-photos, then Google Maps links chunked per leg.
 * `plan` is the nested `route_plans_map` row; stops are sorted defensively.
 */
export function buildDispatchEmail(plan: DispatchPlan, appUrl: string): DispatchEmail {
  let depot: LngLat;
  try {
    depot = parsePointWkb(plan.crew.depot);
  } catch {
    throw new DispatchError(500, "The crew depot could not be read.");
  }

  const stops = [...plan.work_orders].sort((a, b) => (a.stop_order ?? 0) - (b.stop_order ?? 0));
  const crewPage = `${appUrl}/route/${plan.id}`;
  const km = round1(plan.total_km);
  const minutes = plan.total_minutes === null ? null : Math.round(plan.total_minutes);

  const subject = `Repair route for ${plan.crew.name}, ${plan.plan_date}: ${stops.length} ${
    stops.length === 1 ? "stop" : "stops"
  }`;
  const totals = [
    `${stops.length} ${stops.length === 1 ? "stop" : "stops"}`,
    ...(km === null ? [] : [`${km} km`]),
    ...(minutes === null ? [] : [`about ${minutes} min`]),
  ].join(", ");
  const opening = `${plan.crew.name}, ${plan.plan_date}. ${totals}.`;

  const legs = buildGmapsLegs([depot, ...stops.map((s): LngLat => [s.pothole.lng, s.pothole.lat]), depot]);
  const legLine = (link: string, i: number) => `Leg ${i + 1} of ${legs.length}: ${link}`;

  const text = [
    opening,
    "",
    "Open the crew page to see the map and mark each stop done as you go:",
    crewPage,
    "",
    "Stops",
    ...stops.flatMap((stop, i) => {
      const photo = photoOf(stop);
      return photo ? [stopLine(stop, i), `   Before photo: ${photo}`] : [stopLine(stop, i)];
    }),
    "",
    "Open in Google Maps (the route is split so it fits Google's waypoint limit)",
    ...legs.map(legLine),
  ].join("\n");

  const html = [
    `<p>${escapeHtml(opening)}</p>`,
    `<p><a href="${escapeHtml(crewPage)}">Open the crew page</a> to see the map and mark each stop done as you go.</p>`,
    "<h3>Stops</h3>",
    "<ol>",
    ...stops.map((stop) => {
      const eta = formatEta(stop.eta);
      const photo = photoOf(stop);
      return [
        "<li>",
        escapeHtml(stopLabel(stop.pothole)),
        ` — severity ${stop.pothole.severity.toFixed(2)}`,
        eta ? ` — eta ${eta}` : "",
        photo
          ? `<br><img src="${escapeHtml(photo)}" alt="Before photo" width="240" style="max-width:100%">`
          : "",
        "</li>",
      ].join("");
    }),
    "</ol>",
    "<h3>Open in Google Maps</h3>",
    `<p>The route is split so it fits Google's waypoint limit.</p>`,
    "<ul>",
    ...legs.map(
      (link, i) => `<li><a href="${escapeHtml(link)}">Leg ${i + 1} of ${legs.length}</a></li>`,
    ),
    "</ul>",
  ].join("\n");

  return { subject, html, text };
}

// ─── Mailer ───────────────────────────────────────────────────────────────────

export interface MailerMessage {
  from: string;
  to: string[];
  subject: string;
  html: string;
  text: string;
}

export interface Mailer {
  send(msg: MailerMessage): Promise<{ id: string }>;
}

/** Resend behind the `Mailer` seam so tests never reach the network. */
export function createResendMailer(apiKey: string): Mailer {
  const resend = new Resend(apiKey);
  return {
    async send(msg: MailerMessage): Promise<{ id: string }> {
      const { data, error } = await resend.emails.send(msg);
      if (error || !data) {
        throw new Error(error?.message ?? "Resend returned no message id");
      }
      return { id: data.id };
    },
  };
}

// ─── Orchestration ────────────────────────────────────────────────────────────

export interface DispatchDeps {
  db: SupabaseClient;
  mailer: Mailer | null;
  appUrl: string;
  from: string;
}

export interface DispatchResponse {
  route_plan_id: string;
  sent: boolean;
  to: string[];
  crew_page: string;
  message_id?: string;
}

interface QueryResult {
  data: unknown;
  error: { message?: string } | null;
}

/** Unwraps a PostgREST result, turning any database error into a 500. */
function rows<T>(result: QueryResult): T[] {
  if (result.error) throw new DispatchError(500, "The database request failed.");
  return (result.data ?? []) as T[];
}

/** docs/ARCHITECTURE.md §5 — email a crew its route and publish the plan. */
export async function dispatch(deps: DispatchDeps, req: DispatchRequest): Promise<DispatchResponse> {
  const { db, mailer, appUrl, from } = deps;

  const plans = rows<DispatchPlan>(
    await db
      .from("route_plans_map")
      .select("*, crew:crews(*), work_orders(*, pothole:potholes_map(*))")
      .eq("id", req.route_plan_id)
      .order("stop_order", { referencedTable: "work_orders", ascending: true }),
  );
  const plan = plans[0];
  if (!plan) throw new DispatchError(404, "That route plan was not found.");
  if (!plan.crew) throw new DispatchError(500, "That route plan has no crew.");
  if (!plan.work_orders || plan.work_orders.length === 0) {
    throw new DispatchError(400, "That route plan has no stops to dispatch.");
  }

  const email = buildDispatchEmail(plan, appUrl);
  const crewPage = `${appUrl}/route/${plan.id}`;

  // Send before publishing, so a failed send leaves the plan a draft.
  let messageId: string | undefined;
  if (mailer) {
    try {
      messageId = (await mailer.send({ from, to: req.to, ...email })).id;
    } catch {
      throw new DispatchError(502, "Email service unavailable.");
    }
  }

  rows(await db.from("route_plans").update({ status: "published" }).eq("id", req.route_plan_id));

  return {
    route_plan_id: plan.id,
    sent: messageId !== undefined,
    to: req.to,
    crew_page: crewPage,
    ...(messageId === undefined ? {} : { message_id: messageId }),
  };
}
