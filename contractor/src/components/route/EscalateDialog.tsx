"use client";

// "Cannot repair" — a crew arrives, the hole needs a planing gang and a lane
// closure, and the honest answer is to hand it back rather than log a repair
// that did not happen.
//
// An inline panel, not a browser confirm: a modal dialog blocks the page, and a
// note is required, which a confirm cannot collect. The note is required because
// the council reads it to decide what to send next.

import { useState } from "react";
import { GhostButton, PrimaryButton, SecondaryButton } from "@/components/ui/console";

export function EscalateDialog({
  onEscalate,
}: {
  onEscalate: (notes: string) => Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);

  if (!open) {
    return (
      <GhostButton onClick={() => setOpen(true)}>
        Cannot repair — escalate to the council
      </GhostButton>
    );
  }

  return (
    <div className="grid gap-3">
      <p className="m-0 text-[13px] leading-[1.45] text-ink-72">
        The stop leaves this route and the pothole returns to the council&rsquo;s
        queue for replanning. Say what is needed, so they can send the right crew.
      </p>
      <textarea
        className="input"
        rows={3}
        value={notes}
        placeholder="About 2 m across and deeper than a patch. Needs a planing gang and a lane closure."
        onChange={(event) => setNotes(event.target.value)}
      />
      <div className="flex items-center gap-2">
        <PrimaryButton
          onClick={async () => {
            setBusy(true);
            try {
              await onEscalate(notes.trim());
            } finally {
              setBusy(false);
            }
          }}
          disabled={notes.trim().length === 0}
          busy={busy}
        >
          Escalate to the council
        </PrimaryButton>
        <SecondaryButton onClick={() => setOpen(false)} disabled={busy}>
          Keep the stop
        </SecondaryButton>
      </div>
      {notes.trim().length === 0 && (
        <p className="m-0 text-[12px] text-ink-55">
          A note is required before a stop can be escalated.
        </p>
      )}
    </div>
  );
}
