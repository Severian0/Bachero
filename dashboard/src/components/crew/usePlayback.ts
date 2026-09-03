"use client";

import { useEffect, useRef, useState } from "react";
import type { AlongTrack } from "@/lib/crew/along";
import { minutesLeft, playbackDurationSec } from "@/lib/crew/playback";
import type { RouteStep } from "@/lib/types";

export interface Playback {
  playing: boolean;
  km: number;
  position: [number, number];
  step: RouteStep | null;
  minutesLeft: number;
  play(): void;
  pause(): void;
  reset(): void;
}

/**
 * The animation clock (spec section 9): a requestAnimationFrame loop advancing
 * km at the compressed speed. Every route question is answered by the track,
 * every timing question by playback.ts - this hook owns time and nothing else,
 * and knows nothing about either screen's store.
 */
export function usePlayback(track: AlongTrack, totalMinutes: number): Playback {
  const [playing, setPlaying] = useState(false);
  const [km, setKm] = useState(0);
  const frame = useRef<number | null>(null);
  const last = useRef<number | null>(null);

  useEffect(() => {
    if (!playing) return;
    const speedKmPerSec = track.totalKm / playbackDurationSec(totalMinutes);
    let finished = false;
    const tick = (now: number) => {
      const dt = last.current === null ? 0 : (now - last.current) / 1000;
      last.current = now;
      setKm((k) => {
        const next = Math.min(track.totalKm, k + speedKmPerSec * dt);
        // Stopping is decided here but applied outside the updater, because a
        // state updater must stay a pure function of its previous value.
        if (next >= track.totalKm) finished = true;
        return next;
      });
      if (finished) {
        setPlaying(false);
        return;
      }
      frame.current = requestAnimationFrame(tick);
    };
    frame.current = requestAnimationFrame(tick);
    return () => {
      if (frame.current !== null) cancelAnimationFrame(frame.current);
      frame.current = null;
      last.current = null;
    };
  }, [playing, track, totalMinutes]);

  return {
    playing,
    km,
    position: track.pointAt(km),
    step: track.stepAt(km),
    minutesLeft: minutesLeft(totalMinutes, km, track.totalKm),
    play() {
      // Replay from the start when the last run finished.
      if (km >= track.totalKm && track.totalKm > 0) setKm(0);
      setPlaying(true);
    },
    pause() {
      setPlaying(false);
    },
    reset() {
      setPlaying(false);
      setKm(0);
    },
  };
}
