"use client";

import { useState } from "react";
import { supabase } from "@/lib/supabase";
import { hhmm } from "@/lib/console/format";
import type { CrewStop } from "@/lib/crew/plan";
import type { WorkOrderStatus } from "@/lib/types";

export const SAVE_ERROR = "Could not save that. Check the signal and try again.";

/**
 * The stop the crew is working now. Optimistic: the PATCH is reflected
 * immediately and reverted with one plain sentence when it fails.
 */
export function StopCard({
  stop,
  status,
  onStatus,
}: {
  stop: CrewStop;
  status: WorkOrderStatus;
  onStatus: (workOrderId: string, status: WorkOrderStatus) => void;
}) {
  const [error, setError] = useState<string | null>(null);
  const [photoUrl, setPhotoUrl] = useState<string | null>(stop.after_photo_url);
  const [uploading, setUploading] = useState(false);

  async function patch(update: Record<string, unknown>, next: WorkOrderStatus) {
    const previous = status;
    setError(null);
    onStatus(stop.work_order_id, next);
    const { error: dbError } = await supabase
      .from("work_orders")
      .update(update)
      .eq("id", stop.work_order_id);
    if (dbError) {
      onStatus(stop.work_order_id, previous);
      setError(SAVE_ERROR);
    }
  }

  async function uploadAfterPhoto(file: File) {
    setUploading(true);
    setError(null);
    const path = `after_${stop.work_order_id}.jpg`;
    const { error: upError } = await supabase.storage
      .from("detections")
      .upload(path, file, { upsert: true, contentType: "image/jpeg" });
    if (upError) {
      setError(SAVE_ERROR);
    } else {
      setPhotoUrl(supabase.storage.from("detections").getPublicUrl(path).data.publicUrl);
    }
    setUploading(false);
  }

  const label = stop.road_name ?? `${stop.lat.toFixed(4)}, ${stop.lng.toFixed(4)}`;
  // Google Maps is the one place coordinates are latitude first.
  const gmaps = `https://www.google.com/maps/dir/?api=1&destination=${stop.lat.toFixed(6)},${stop.lng.toFixed(6)}&travelmode=driving`;

  return (
    <article style={{ display: "grid", gap: "var(--s2)" }}>
      <header style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: "var(--s3)" }}>
        <h2 style={{ margin: 0, fontSize: "var(--t-lead)", fontWeight: 600 }}>
          Stop {stop.stop_order}: {label}
        </h2>
        {stop.eta && (
          <span className="data secondary" style={{ fontSize: "var(--t-small)" }}>
            eta {hhmm(stop.eta)}
          </span>
        )}
      </header>
      {stop.photo_url && (
        <img
          src={stop.photo_url}
          alt="Before photo of the defect"
          style={{ maxWidth: "100%", borderRadius: "var(--r-md)", border: "1px solid var(--rule-soft)" }}
        />
      )}
      <p style={{ margin: 0, fontSize: "var(--t-small)" }}>
        <a className="data" href={gmaps} target="_blank" rel="noreferrer" style={{ color: "var(--action)" }}>
          Open in Google Maps
        </a>
      </p>
      <div style={{ display: "flex", gap: "var(--s2)", alignItems: "center", flexWrap: "wrap" }}>
        {status === "assigned" && (
          <button type="button" className="btn btn-commit" onClick={() => void patch({ status: "in_progress", started_at: new Date().toISOString() }, "in_progress")}>
            Arrived at this stop
          </button>
        )}
        {status === "in_progress" && (
          <>
            <label className="btn btn-secondary" style={{ cursor: "pointer" }}>
              {uploading ? "Uploading photo" : photoUrl ? "Retake after photo" : "Take after photo"}
              <input
                type="file"
                accept="image/*"
                capture="environment"
                style={{ display: "none" }}
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) void uploadAfterPhoto(file);
                }}
              />
            </label>
            <button
              type="button"
              className="btn btn-commit"
              disabled={uploading}
              onClick={() => void patch({ status: "done", completed_at: new Date().toISOString(), after_photo_url: photoUrl }, "done")}
            >
              Mark this stop done
            </button>
          </>
        )}
      </div>
      {error && (
        <p role="alert" className="secondary" style={{ margin: 0, fontSize: "var(--t-small)" }}>
          {error}
        </p>
      )}
    </article>
  );
}
