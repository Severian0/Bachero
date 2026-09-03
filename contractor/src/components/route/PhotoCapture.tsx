"use client";

// The after-photo: the crew's proof the hole is filled, and the thing the
// council shows when a compensation claim arrives.
//
// `capture="environment"` opens the rear camera straight from the file input, so
// this is one tap on a phone and a file picker on a laptop, with no branching.

import { useId, useRef, useState } from "react";
import { PlaceholderBox } from "@/components/ui/console";
import { preparePhoto } from "@/lib/crew/photo";

export function PhotoCapture({
  url,
  onCaptured,
  disabled = false,
}: {
  url: string | null;
  onCaptured: (image: Blob) => Promise<void>;
  disabled?: boolean;
}) {
  const inputId = useId();
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handle(file: File | undefined) {
    if (file === undefined) return;
    setBusy(true);
    setError(null);
    try {
      await onCaptured(await preparePhoto(file));
    } catch (cause) {
      setError(
        cause instanceof Error
          ? `${cause.message} The stop is unaffected; try again.`
          : "Could not attach the photo. The stop is unaffected; try again.",
      );
    } finally {
      setBusy(false);
      // Let the same file be picked twice, which happens when a re-take fails.
      if (input.current != null) input.current.value = "";
    }
  }

  return (
    <div className="grid gap-3">
      {url != null ? (
        <figure className="m-0">
          <div className="photo-frame">
            {/* Not next/image: the source is a Supabase public URL in one mode
                and a data URL in the other, and neither wants optimising. */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={url} alt="The repair, photographed after it was made" />
          </div>
          <figcaption className="mt-1 text-[11px] text-ink-55">
            After the repair
          </figcaption>
        </figure>
      ) : (
        <PlaceholderBox>
          No after-photo yet. It is the evidence the repair was made.
        </PlaceholderBox>
      )}

      <input
        ref={input}
        id={inputId}
        type="file"
        accept="image/*"
        capture="environment"
        className="sr-only"
        disabled={disabled || busy}
        onChange={(event) => void handle(event.target.files?.[0])}
      />
      <label
        htmlFor={inputId}
        className="btn btn-secondary"
        aria-disabled={disabled || busy}
        style={{
          width: "100%",
          opacity: disabled || busy ? 0.45 : 1,
          cursor: disabled || busy ? "not-allowed" : "pointer",
        }}
      >
        {busy
          ? "Preparing the photo…"
          : url != null
            ? "Retake the after-photo"
            : "Take the after-photo"}
      </label>

      {error != null && (
        <p className="m-0 text-[12px] leading-[1.4] text-ink-72">{error}</p>
      )}
    </div>
  );
}
