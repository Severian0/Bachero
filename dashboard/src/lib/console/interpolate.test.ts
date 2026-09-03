import { describe, it, expect } from "vitest";
import { createTween, tweenAt, retarget, easeConsole } from "./interpolate";

describe("tween", () => {
  it("starts at from, ends at to after the duration", () => {
    const tw = createTween([0, 0], [10, 20], 1000, 1200);
    expect(tweenAt(tw, 1000)).toEqual([0, 0]);
    expect(tweenAt(tw, 2200)).toEqual([10, 20]);
    expect(tweenAt(tw, 5000)).toEqual([10, 20]);
  });
  it("is monotonic and eased in the middle", () => {
    const tw = createTween([0, 0], [10, 0], 0, 1000);
    const a = tweenAt(tw, 250)[0], b = tweenAt(tw, 500)[0], c = tweenAt(tw, 750)[0];
    expect(a).toBeGreaterThan(0);
    expect(b).toBeGreaterThan(a);
    expect(c).toBeGreaterThan(b);
    expect(c).toBeLessThan(10);
  });
  it("retarget restarts from the current interpolated point", () => {
    const tw = createTween([0, 0], [10, 0], 0, 1000);
    const mid = tweenAt(tw, 500);
    const next = retarget(tw, [0, 10], 500);
    expect(next.from).toEqual(mid);
    expect(next.start).toBe(500);
    expect(tweenAt(next, 500)).toEqual(mid);
    expect(tweenAt(next, 1700)).toEqual([0, 10]);
  });
  it("ease endpoints", () => {
    expect(easeConsole(0)).toBe(0);
    expect(easeConsole(1)).toBe(1);
  });
});
