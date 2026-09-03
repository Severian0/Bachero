import { describe, it, expect } from "vitest";
import { minutesLeft, playbackDurationSec } from "./playback";

describe("playbackDurationSec", () => {
  it("compresses a working day to about 30 seconds", () => {
    expect(playbackDurationSec(480)).toBe(30);
    expect(playbackDurationSec(60)).toBe(30);
  });
  it("plays a mid-length route proportionally faster", () => {
    expect(playbackDurationSec(40)).toBe(20);
  });
  it("never lets a short route flash by in under 8 seconds", () => {
    expect(playbackDurationSec(2)).toBe(8);
    expect(playbackDurationSec(0)).toBe(8);
  });
});

describe("minutesLeft", () => {
  it("scales real minutes by the fraction of the route remaining", () => {
    expect(minutesLeft(70, 0, 10)).toBe(70);
    expect(minutesLeft(70, 5, 10)).toBe(35);
    expect(minutesLeft(70, 10, 10)).toBe(0);
  });
  it("never goes negative and treats a zero-length route as finished", () => {
    expect(minutesLeft(70, 11, 10)).toBe(0);
    expect(minutesLeft(70, 0, 0)).toBe(0);
  });
});
