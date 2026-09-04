"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Mark } from "./Logo";
import { AUTHORITY, OPERATOR } from "@/lib/console/branding";
import { km, plural } from "@/lib/console/format";

/**
 * The bar across the top: what this is, whether it is live, and who is
 * signed in. Nothing else.
 *
 * It carries the command colour and sits flush against the working surface
 * with no rule under it, so it reads as furniture rather than a strip laid on
 * the page. Measurements that used to float here have gone down into the
 * console, where a number is attributable to something.
 */
export default function Header({
  live,
  kmToday,
  reporting,
  loading,
  inert,
}: {
  live: boolean;
  kmToday: number;
  reporting: number;
  loading: boolean;
  /** While the dispatch sheet is open the bar is behind it and takes no focus. */
  inert?: boolean;
}) {
  return (
    <header className="console-header" inert={inert}>
      <div style={{ display: "flex", alignItems: "center", gap: "var(--s4)", minWidth: 0 }}>
        <h1 style={{ display: "flex", alignItems: "center", gap: 10, margin: 0 }}>
          <span style={{ color: "var(--rail-ink)", ["--mark-void" as string]: "var(--rail)", display: "flex" }}>
            <Mark size={26} />
          </span>
          <span
            style={{
              fontSize: "var(--t-lead)",
              fontWeight: 700,
              letterSpacing: "0.11em",
              textTransform: "uppercase",
              lineHeight: 1,
            }}
          >
            Bachero
          </span>
        </h1>
        <Rule className="hdr-tagline" />
        <p
          className="hdr-tagline"
          style={{
            margin: 0,
            fontSize: "var(--t-small)",
            lineHeight: 1.35,
            color: "var(--rail-ink-2)",
            whiteSpace: "nowrap",
            overflow: "hidden",
            textOverflow: "ellipsis",
          }}
        >
          Pothole detection and repair dispatch
        </p>
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: "var(--s4)", flexShrink: 0 }}>
        <FeedState live={live} loading={loading} />
        <Rule />
        <Stats kmToday={kmToday} reporting={reporting} loading={loading} />
        <Rule className="hdr-clock" />
        <Clock />
        <Rule className="hdr-clock" />
        <Link
          href="/settings"
          aria-label="Settings: crews and depots"
          title="Crews and depots"
          className="hdr-settings"
        >
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <circle cx="8" cy="8" r="2.2" />
            <path d="M8 1.5v1.8M8 12.7v1.8M1.5 8h1.8M12.7 8h1.8M3.4 3.4l1.3 1.3M11.3 11.3l1.3 1.3M3.4 12.6l1.3-1.3M11.3 4.7l1.3-1.3" />
          </svg>
        </Link>
        <Operator />
      </div>
    </header>
  );
}

function Rule({ className }: { className?: string }) {
  return <span aria-hidden className={className} style={{ width: 1, height: 22, background: "var(--rail-rule)", flexShrink: 0 }} />;
}

/**
 * Whether detections are arriving, said as a light rather than a sentence.
 * The words behind it are for a screen reader and for the operator who wants
 * to be certain, not a banner that repeats itself all day. While the data
 * source is still loading, neither claim is true yet, so only the light
 * shows: no sentence to have to walk back a moment later.
 */
function FeedState({ live, loading }: { live: boolean; loading: boolean }) {
  return (
    <p style={{ display: "flex", alignItems: "center", gap: "var(--s2)", margin: 0, fontSize: "var(--t-small)", color: "var(--rail-ink-2)", whiteSpace: "nowrap" }}>
      <span
        aria-hidden
        style={{
          width: 8,
          height: 8,
          borderRadius: "50%",
          flexShrink: 0,
          background: live ? "var(--feed-live)" : "var(--feed-idle)",
          animation: live ? "bch-pulse 2.4s ease-in-out infinite" : undefined,
        }}
      />
      <span className="hdr-feed-words">{loading ? null : live ? "Detector feed live" : "Synthetic fleet, backend not connected"}</span>
    </p>
  );
}

/**
 * What the fleet has covered today, and how much of it is reporting now.
 * While the data source is still loading, neither figure is true yet — the
 * block holds its two-line height so nothing else in the rail shifts, but
 * says nothing, so "0.0 km" never appears ahead of the real number.
 */
function Stats({ kmToday, reporting, loading }: { kmToday: number; reporting: number; loading: boolean }) {
  return (
    <div style={{ display: "grid", lineHeight: 1.3 }}>
      <span className="data" style={{ fontSize: "var(--t-small)", color: "var(--rail-ink-2)" }}>
        {loading ? " " : <>{km(kmToday)} <span className="hdr-scanned">scanned </span>today</>}
      </span>
      <span className="hdr-reporting" style={{ fontSize: "var(--t-micro)", color: "var(--rail-ink-2)" }}>
        {loading ? " " : `${plural(reporting, "vehicle")} reporting`}
      </span>
    </div>
  );
}

/** A duty console shows the time. It is the cheapest proof it is running. */
function Clock() {
  const [now, setNow] = useState<string | null>(null);

  useEffect(() => {
    const read = () => {
      const d = new Date();
      const hh = String(d.getHours()).padStart(2, "0");
      const mm = String(d.getMinutes()).padStart(2, "0");
      const day = d.toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" });
      setNow(`${hh}:${mm}  ${day}`);
    };
    read();
    const id = window.setInterval(read, 15_000);
    return () => window.clearInterval(id);
  }, []);

  return (
    <p className="data hdr-clock" style={{ margin: 0, fontSize: "var(--t-small)", color: "var(--rail-ink-2)", whiteSpace: "nowrap", minWidth: 118 }}>
      {now ?? " "}
    </p>
  );
}

/** Every dispatch is attributed to a named person. Say who that is. */
function Operator() {
  const initials = OPERATOR.name
    .replace(/[^A-Za-z. ]/g, "")
    .split(/[. ]+/)
    .filter(Boolean)
    .map((w) => w[0])
    .slice(0, 2)
    .join("");

  return (
    <div className="hdr-operator" style={{ alignItems: "center", gap: "var(--s2)" }}>
      <span
        aria-hidden
        style={{
          width: 30,
          height: 30,
          borderRadius: "var(--r-md)",
          background: "var(--rail-2)",
          border: "1px solid var(--rail-rule)",
          display: "grid",
          placeItems: "center",
          fontSize: "var(--t-micro)",
          fontWeight: 700,
          letterSpacing: "0.04em",
          color: "var(--rail-ink)",
          flexShrink: 0,
        }}
      >
        {initials}
      </span>
      <span className="hdr-operator-text" style={{ lineHeight: 1.3 }}>
        <span style={{ fontSize: "var(--t-small)", fontWeight: 600 }}>{OPERATOR.name}</span>
        <span style={{ fontSize: "var(--t-micro)", color: "var(--rail-ink-2)" }}>{AUTHORITY}</span>
      </span>
    </div>
  );
}
