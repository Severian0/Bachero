import type { LngLat, Matrix } from "@/lib/solver/haversine";

export interface LineString {
  type: "LineString";
  coordinates: [number, number][];
}

export interface OsrmClient {
  table(points: LngLat[]): Promise<Matrix>;
  route(points: LngLat[]): Promise<OsrmRoute>;
}

interface OsrmTableResponse {
  code: string;
  durations?: (number | null)[][];
  distances?: (number | null)[][];
}

// OSRM returns null for a cell whose pair has no route between them. Treat
// those (and any other non-finite value) as infinite cost so the solver's
// insertion cost never picks an unreachable leg.
function toCostOrInfinity(value: number | null, unit: number): number {
  return value === null || !Number.isFinite(value) ? Infinity : value / unit;
}

export interface OsrmManoeuvre {
  type: string;               // "turn", "depart", "arrive", "roundabout", and so on
  modifier?: string;          // "left", "right", "slight left", "straight", "uturn"
  exit?: number;              // roundabout exit count
  location: [number, number]; // [lng, lat]
}

export interface OsrmStep {
  name: string;               // road name; "" when OSRM has none
  distance: number;           // metres driven in this step
  maneuver: OsrmManoeuvre;
}

/** What planRoute consumes: the drawn line plus the manoeuvres along it. */
export interface OsrmRoute {
  geometry: LineString;
  steps: OsrmStep[];
}

interface OsrmRouteResponse {
  code: string;
  routes?: {
    geometry: LineString;
    legs?: {
      steps?: {
        name?: string;
        distance?: number;
        maneuver?: { type?: string; modifier?: string; exit?: number; location?: [number, number] };
      }[];
    }[];
  }[];
}

function formatCoords(points: LngLat[]): string {
  return points.map(([lng, lat]) => `${lng.toFixed(6)},${lat.toFixed(6)}`).join(";");
}

async function fetchJson(fetchImpl: typeof fetch, url: string): Promise<unknown> {
  let response: Response;
  try {
    response = await fetchImpl(url);
  } catch {
    throw new Error("Route service unavailable");
  }
  if (!response.ok) {
    throw new Error("Route service unavailable");
  }
  return response.json();
}

export function createOsrmClient(baseUrl: string, fetchImpl: typeof fetch = fetch): OsrmClient {
  return {
    async table(points: LngLat[]): Promise<Matrix> {
      const url = `${baseUrl}/table/v1/driving/${formatCoords(points)}?annotations=duration,distance`;
      const body = (await fetchJson(fetchImpl, url)) as OsrmTableResponse;
      if (body.code !== "Ok" || !body.durations || !body.distances) {
        throw new Error("Route service unavailable");
      }
      const durationMin = body.durations.map((row) => row.map((seconds) => toCostOrInfinity(seconds, 60)));
      const distanceKm = body.distances.map((row) => row.map((metres) => toCostOrInfinity(metres, 1000)));
      return { durationMin, distanceKm };
    },

    async route(points: LngLat[]): Promise<OsrmRoute> {
      const url = `${baseUrl}/route/v1/driving/${formatCoords(points)}?overview=full&geometries=geojson&steps=true`;
      const body = (await fetchJson(fetchImpl, url)) as OsrmRouteResponse;
      const first = body.routes?.[0];
      if (body.code !== "Ok" || !first?.geometry) {
        throw new Error("Route service unavailable");
      }
      // One route, several legs (one per waypoint pair); the banner wants a
      // single ordered list, so the legs are flattened here, once.
      const steps: OsrmStep[] = (first.legs ?? []).flatMap((leg) =>
        (leg.steps ?? []).flatMap((s) => {
          const location = s.maneuver?.location;
          if (!location) return [];
          return [{
            name: s.name ?? "",
            distance: s.distance ?? 0,
            maneuver: {
              type: s.maneuver?.type ?? "turn",
              modifier: s.maneuver?.modifier,
              exit: s.maneuver?.exit,
              location,
            },
          }];
        }),
      );
      return { geometry: first.geometry, steps };
    },
  };
}
