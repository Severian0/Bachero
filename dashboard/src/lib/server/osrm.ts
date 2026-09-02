import type { LngLat, Matrix } from "@/lib/solver/haversine";

export interface LineString {
  type: "LineString";
  coordinates: [number, number][];
}

export interface OsrmClient {
  table(points: LngLat[]): Promise<Matrix>;
  route(points: LngLat[]): Promise<LineString>;
}

interface OsrmTableResponse {
  code: string;
  durations?: number[][];
  distances?: number[][];
}

interface OsrmRouteResponse {
  code: string;
  routes?: { geometry: LineString }[];
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
      const durationMin = body.durations.map((row) => row.map((seconds) => seconds / 60));
      const distanceKm = body.distances.map((row) => row.map((metres) => metres / 1000));
      return { durationMin, distanceKm };
    },

    async route(points: LngLat[]): Promise<LineString> {
      const url = `${baseUrl}/route/v1/driving/${formatCoords(points)}?overview=full&geometries=geojson`;
      const body = (await fetchJson(fetchImpl, url)) as OsrmRouteResponse;
      const geometry = body.routes?.[0]?.geometry;
      if (body.code !== "Ok" || !geometry) {
        throw new Error("Route service unavailable");
      }
      return geometry;
    },
  };
}
