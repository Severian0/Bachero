"use client";
import { useEffect, useRef, useState } from "react";
import { Marker } from "react-map-gl/maplibre";
import { createTween, retarget, tweenAt, type Tween, type XY } from "@/lib/console/interpolate";
import type { Vehicle } from "@/lib/data/types";

export function VehicleMarker({ v }: { v: Vehicle }) {
  const target: XY = [v.position.lng, v.position.lat];
  const tween = useRef<Tween | null>(null);
  const [pos, setPos] = useState<XY>(target);

  useEffect(() => {
    const now = performance.now();
    tween.current = tween.current ? retarget(tween.current, target, now) : createTween(target, target, now, 1200);
    let raf = 0;
    const step = () => {
      const now = performance.now();
      setPos(tweenAt(tween.current!, now));
      if (now < tween.current!.start + tween.current!.duration) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [v.position.lng, v.position.lat]);

  return (
    <Marker longitude={pos[0]} latitude={pos[1]} anchor="center" style={{ zIndex: 40 }}>
      <div className="flex items-center gap-2">
        <div className="w-[11px] h-[11px] rounded-full bg-accent border-2 border-bg shadow-sm" />
        <div className="whitespace-nowrap px-[7px] py-[2px] rounded-md bg-bg shadow-sm text-[11px] text-accent-800">{v.label}</div>
      </div>
    </Marker>
  );
}
