export type XY = [number, number];

/** cubic-bezier(.2,.6,.2,1) sampled by Newton iteration on the x-axis. */
export function easeConsole(t: number): number {
  if (t <= 0) return 0;
  if (t >= 1) return 1;
  const [x1, y1, x2, y2] = [0.2, 0.6, 0.2, 1];
  const bx = (u: number) => 3 * (1 - u) ** 2 * u * x1 + 3 * (1 - u) * u ** 2 * x2 + u ** 3;
  const by = (u: number) => 3 * (1 - u) ** 2 * u * y1 + 3 * (1 - u) * u ** 2 * y2 + u ** 3;
  let u = t;
  for (let i = 0; i < 8; i++) {
    const dx = (bx(u + 1e-6) - bx(u - 1e-6)) / 2e-6;
    if (dx === 0) break;
    u -= (bx(u) - t) / dx;
    u = Math.min(1, Math.max(0, u));
  }
  return by(u);
}

export interface Tween { from: XY; to: XY; start: number; duration: number }

export const createTween = (from: XY, to: XY, now: number, duration = 1200): Tween => ({ from, to, start: now, duration });

export function tweenAt(tw: Tween, now: number): XY {
  const raw = (now - tw.start) / tw.duration;
  if (raw <= 0) return tw.from;
  if (raw >= 1) return tw.to;
  const k = easeConsole(raw);
  return [tw.from[0] + (tw.to[0] - tw.from[0]) * k, tw.from[1] + (tw.to[1] - tw.from[1]) * k];
}

export const retarget = (tw: Tween, to: XY, now: number): Tween => createTween(tweenAt(tw, now), to, now, tw.duration);
