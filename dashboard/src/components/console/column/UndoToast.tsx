"use client";
import { useEffect, useState } from "react";
import { useConsole, DISMISS_UNDO_MS } from "@/lib/console/store";
import { displayName } from "@/lib/console/derive";

export function UndoToast() {
  const pending = useConsole((s) => s.pendingDismiss);
  const undo = useConsole((s) => s.undoDismiss);
  const [remaining, setRemaining] = useState(1);

  useEffect(() => {
    if (!pending) return;
    const t = setInterval(() => setRemaining(Math.max(0, (pending.expiresAt - Date.now()) / DISMISS_UNDO_MS)), 100);
    return () => clearInterval(t);
  }, [pending]);

  if (!pending) return null;
  return (
    <div className="relative flex items-center justify-between gap-3 px-4 py-2 border-t border-divider text-[12px] text-ink-72" role="status">
      <span>Dismissed {displayName(pending.previous)} as false positive.</span>
      <button type="button" className="btn btn-ghost" onClick={undo}>Undo</button>
      <i className="absolute left-0 bottom-0 h-[2px] bg-accent" style={{ width: `${remaining * 100}%`, transition: "width 100ms linear" }} aria-hidden />
    </div>
  );
}
