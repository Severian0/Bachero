"use client";

// What the crew found. Free text, saved on the work order, read back by the
// council beside the before and after photos.

import { useState } from "react";
import { SecondaryButton } from "@/components/ui/console";

export function NoteField({
  value,
  onSave,
  disabled = false,
}: {
  value: string | null;
  onSave: (notes: string) => Promise<void>;
  disabled?: boolean;
}) {
  const [draft, setDraft] = useState(value ?? "");
  const [busy, setBusy] = useState(false);

  const dirty = draft.trim() !== (value ?? "").trim();

  return (
    <div className="grid gap-2">
      <label className="text-[12px] text-ink-72" htmlFor="stop-note">
        What was found and what was done
      </label>
      <textarea
        id="stop-note"
        className="input"
        rows={3}
        value={draft}
        disabled={disabled || busy}
        placeholder="Filled, about 0.4 m². Edge broken back to sound material."
        onChange={(event) => setDraft(event.target.value)}
      />
      {/* No "Saved." message: the button going quiet when the draft matches what
          is stored says the same thing without another line of chatter. */}
      <SecondaryButton
        onClick={async () => {
          setBusy(true);
          try {
            await onSave(draft.trim());
          } finally {
            setBusy(false);
          }
        }}
        disabled={disabled || !dirty}
        busy={busy}
      >
        Save note
      </SecondaryButton>
    </div>
  );
}
