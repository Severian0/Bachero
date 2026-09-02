"use client";
import { useEffect, useState } from "react";
import { useConsole, DISMISS_UNDO_MS } from "@/lib/console/store";
import { displayName } from "@/lib/console/derive";

const remainingFor = (expiresAt: number) => Math.max(0, (expiresAt - Date.now()) / DISMISS_UNDO_MS);

// Keyed by dismissal id so a new dismissal replacing an in-flight one remounts this bar:
// its initial `remaining` is then computed fresh (lazy useState initializer, not a
// setState call inside the effect) instead of holding the previous countdown's value
// until the next 100ms tick.
function UndoBar({ expiresAt }: { expiresAt: number }) {
  const [remaining, setRemaining] = useState(() => remainingFor(expiresAt));
  useEffect(() => {
    const t = setInterval(() => setRemaining(remainingFor(expiresAt)), 100);
    return () => clearInterval(t);
  }, [expiresAt]);
  return <i className="absolute left-0 bottom-0 h-[2px] bg-accent" style={{ width: `${remaining * 100}%`, transition: "width 100ms linear" }} aria-hidden />;
}

export function UndoToast() {
  const pending = useConsole((s) => s.pendingDismiss);
  const undo = useConsole((s) => s.undoDismiss);
  if (!pending) return null;
  return (
    <div className="relative flex items-center justify-between gap-3 px-4 py-2 border-t border-divider text-[12px] text-ink-72" role="status">
      <span>Dismissed {displayName(pending.previous)} as false positive.</span>
      <button type="button" className="btn btn-ghost" onClick={undo}>Undo</button>
      <UndoBar key={pending.id} expiresAt={pending.expiresAt} />
    </div>
  );
}
