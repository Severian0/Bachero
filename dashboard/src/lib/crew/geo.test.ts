import { describe, it, expect } from "vitest";
import { bearingDeg, minDistanceKm } from "./geo";

describe("bearingDeg", () => {
  it("is 0 due north, 90 due east, 180 due south, 270 due west", () => {
    expect(bearingDeg([0, 0], [0, 1])).toBeCloseTo(0, 5);
    expect(bearingDeg([0, 0], [1, 0])).toBeCloseTo(90, 5);
    expect(bearingDeg([0, 1], [0, 0])).toBeCloseTo(180, 5);
    expect(bearingDeg([1, 0], [0, 0])).toBeCloseTo(270, 5);
  });
});

describe("minDistanceKm", () => {
  const route: [number, number][] = [
    [0, 0],
    [0, 0.5],
    [0, 1],
  ];
  it("is near zero on the route and about 111 km one degree of longitude away", () => {
    expect(minDistanceKm([0, 0.5], route)).toBeCloseTo(0, 5);
    expect(minDistanceKm([1, 0.5], route)).toBeCloseTo(111.2, 0);
  });
  it("is Infinity for an empty route", () => {
    expect(minDistanceKm([0, 0], [])).toBe(Infinity);
  });
});
