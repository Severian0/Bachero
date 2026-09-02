import { describe, it, expect, vi } from "vitest";
import { createOsrmClient } from "./osrm";
import type { LngLat } from "@/lib/solver/haversine";

const BASE_URL = "https://osrm.example.com";

function jsonResponse(body: unknown, ok = true, status = 200): Response {
  return {
    ok,
    status,
    json: () => Promise.resolve(body),
  } as unknown as Response;
}

describe("createOsrmClient.table", () => {
  it("requests the exact URL (lng first, semicolon-separated, 6 decimals) and converts units", async () => {
    const points: LngLat[] = [
      [-0.1246, 51.4994],
      [-0.13, 51.5],
    ];
    const fetchImpl = vi.fn().mockResolvedValue(
      jsonResponse({
        code: "Ok",
        durations: [
          [0, 120],
          [120, 0],
        ],
        distances: [
          [0, 1000],
          [1000, 0],
        ],
      }),
    );
    const client = createOsrmClient(BASE_URL, fetchImpl);
    const matrix = await client.table(points);

    expect(fetchImpl).toHaveBeenCalledWith(
      `${BASE_URL}/table/v1/driving/-0.124600,51.499400;-0.130000,51.500000?annotations=duration,distance`,
    );
    // seconds -> minutes, metres -> km
    expect(matrix.durationMin).toEqual([
      [0, 2],
      [2, 0],
    ]);
    expect(matrix.distanceKm).toEqual([
      [0, 1],
      [1, 0],
    ]);
  });

  it("treats a null cell (unreachable pair) as Infinity in both matrices", async () => {
    const points: LngLat[] = [
      [-0.1246, 51.4994],
      [-0.13, 51.5],
      [-0.14, 51.51],
    ];
    const fetchImpl = vi.fn().mockResolvedValue(
      jsonResponse({
        code: "Ok",
        durations: [
          [0, 120, 240],
          [120, 0, null],
          [240, null, 0],
        ],
        distances: [
          [0, 1000, 2000],
          [1000, 0, null],
          [2000, null, 0],
        ],
      }),
    );
    const client = createOsrmClient(BASE_URL, fetchImpl);
    const matrix = await client.table(points);

    expect(matrix.durationMin).toEqual([
      [0, 2, 4],
      [2, 0, Infinity],
      [4, Infinity, 0],
    ]);
    expect(matrix.distanceKm).toEqual([
      [0, 1, 2],
      [1, 0, Infinity],
      [2, Infinity, 0],
    ]);
  });

  it("throws Route service unavailable when code is not Ok", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse({ code: "InvalidQuery" }));
    const client = createOsrmClient(BASE_URL, fetchImpl);
    await expect(client.table([[0, 0], [1, 1]])).rejects.toThrow("Route service unavailable");
  });

  it("throws Route service unavailable on a non-2xx response", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse({}, false, 500));
    const client = createOsrmClient(BASE_URL, fetchImpl);
    await expect(client.table([[0, 0], [1, 1]])).rejects.toThrow("Route service unavailable");
  });

  it("throws Route service unavailable when fetch itself rejects", async () => {
    const fetchImpl = vi.fn().mockRejectedValue(new Error("network down"));
    const client = createOsrmClient(BASE_URL, fetchImpl);
    await expect(client.table([[0, 0], [1, 1]])).rejects.toThrow("Route service unavailable");
  });
});

describe("createOsrmClient.route", () => {
  it("requests the exact URL and returns the first route's geometry", async () => {
    const points: LngLat[] = [
      [-0.1246, 51.4994],
      [-0.13, 51.5],
    ];
    const coordinates = [
      [-0.1246, 51.4994],
      [-0.128, 51.4997],
      [-0.13, 51.5],
    ];
    const fetchImpl = vi.fn().mockResolvedValue(
      jsonResponse({
        code: "Ok",
        routes: [{ geometry: { type: "LineString", coordinates } }],
      }),
    );
    const client = createOsrmClient(BASE_URL, fetchImpl);
    const geometry = await client.route(points);

    expect(fetchImpl).toHaveBeenCalledWith(
      `${BASE_URL}/route/v1/driving/-0.124600,51.499400;-0.130000,51.500000?overview=full&geometries=geojson`,
    );
    expect(geometry).toEqual({ type: "LineString", coordinates });
  });

  it("throws Route service unavailable when code is not Ok", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse({ code: "NoRoute" }));
    const client = createOsrmClient(BASE_URL, fetchImpl);
    await expect(client.route([[0, 0], [1, 1]])).rejects.toThrow("Route service unavailable");
  });

  it("throws Route service unavailable on a non-2xx response", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse({}, false, 502));
    const client = createOsrmClient(BASE_URL, fetchImpl);
    await expect(client.route([[0, 0], [1, 1]])).rejects.toThrow("Route service unavailable");
  });
});
