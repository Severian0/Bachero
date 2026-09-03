"use client";

// The console header, on this app. 62px, full-bleed, neutral-100 over a hairline
// — the same strip the dashboard mockup and the sensor app both carry, so a
// judge looking at three screens sees one product.

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { LiveDot } from "@/components/ui/console";
import { createCrewDataSource } from "@/lib/crew";
import { createOutbox } from "@/lib/crew/outbox";
import { longDate, isoDate, plural } from "@/lib/crew/format";

export function AppHeader({
  subtitle,
  back,
}: {
  /** What this screen is showing: the contractor, or the crew and its route. */
  subtitle: string;
  /** Where the back chevron goes. Omitted on the top-level boards. */
  back?: { href: string; label: string };
}) {
  return (
    <header className="app-header">
      {back !== undefined ? (
        <Link
          href={back.href}
          className="btn btn-secondary btn-icon"
          aria-label={back.label}
          style={{ flex: "none", color: "var(--color-text)" }}
        >
          <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
            <path
              d="M10 3 5 8l5 5"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </Link>
      ) : (
        <Link href="/" className="app-mark" aria-label="Bachero — today" />
      )}

      <div className="min-w-0 flex-1">
        <div className="app-title">Bachero</div>
        <div className="truncate text-[12px] leading-[1.3] text-ink-58">
          {subtitle}
        </div>
      </div>

      <QueuedChip />
      <FeedChip />
    </header>
  );
}

/**
 * Work done but not yet sent. The sensor app carries the same chip for the same
 * reason: a count the crew can see is the difference between "held in a tunnel"
 * and "lost". Absent when there is nothing waiting.
 */
function QueuedChip() {
  const outbox = useMemo(() => createOutbox(createCrewDataSource()), []);
  const [pending, setPending] = useState(0);

  useEffect(() => outbox.subscribe(setPending), [outbox]);

  if (pending === 0) return null;
  return (
    <span
      className="tag"
      style={{
        flex: "none",
        background: "var(--color-accent-100)",
        color: "var(--color-accent-800)",
      }}
      title="Held on this phone until the connection returns"
    >
      {plural(pending, "change")} queued
    </span>
  );
}

/**
 * Where the data is coming from, stated rather than implied. On fixture data it
 * says so — a demo that quietly shows invented numbers is worse than one that
 * admits it.
 */
function FeedChip() {
  const live = (process.env.NEXT_PUBLIC_SUPABASE_URL ?? "").length > 0;
  return (
    <span
      className="tag"
      style={{
        flex: "none",
        gap: "var(--space-2)",
        background: live ? "var(--color-accent-100)" : "transparent",
        border: live ? "0" : "1px solid var(--color-divider)",
        color: live ? "var(--color-accent-800)" : "var(--ink-55)",
      }}
      title={longDate(isoDate(new Date()))}
    >
      {live && <LiveDot />}
      {live ? "Live" : "Fixture data"}
    </span>
  );
}
