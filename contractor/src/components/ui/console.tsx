"use client";

// The console's parts, on the web. This is the contractor app's counterpart to
// `sensor/lib/ui/widgets/console_widgets.dart` — same components, same rules,
// same reasons, so the three surfaces of Bachero look like one product.
//
// Every value comes from a token. Panels are separated by a single hairline,
// never by a gap and never by a shadow; elevation is reserved for things that
// overlap a map or a photograph, and this app has neither.

import type { CSSProperties, ReactNode } from "react";
import type { WorkOrderStatus } from "@/lib/types";
import { severitySegments, statusWord } from "@/lib/crew/derive";

/** The 11px uppercase label every panel carries, top-left inside the frame. */
export function PanelLabel({
  children,
  trailing,
}: {
  children: ReactNode;
  trailing?: ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="panel-label">{children}</span>
      {trailing}
    </div>
  );
}

export const Hairline = () => <div className="hairline" role="presentation" />;

/**
 * A section of the column. Separated from the one above by a rule, and given a
 * label so a pending or empty panel still says what it is (DESIGN.md §7).
 */
export function Panel({
  label,
  trailing,
  children,
  padded = true,
}: {
  label?: string;
  trailing?: ReactNode;
  children: ReactNode;
  padded?: boolean;
}) {
  return (
    <section className="panel">
      {label !== undefined && (
        <div className="panel-pad pb-0">
          <PanelLabel trailing={trailing}>{label}</PanelLabel>
        </div>
      )}
      <div className={padded ? "panel-pad" : undefined}>{children}</div>
    </section>
  );
}

export interface Metric {
  value: string;
  label: string;
  unit?: string;
}

/**
 * Equal-width cells divided by hairlines. Units are set separately at 55% ink so
 * the numeral column stays clean.
 */
export function MetricRow({ metrics }: { metrics: readonly Metric[] }) {
  return (
    <div className="metric-row">
      {metrics.map((m) => (
        <div className="metric-cell" key={m.label}>
          <div className="flex items-baseline gap-1">
            <span className="metric-value truncate">{m.value}</span>
            {m.unit !== undefined && (
              <span className="text-[12px] text-ink-55">{m.unit}</span>
            )}
          </div>
          <div className="metric-label">{m.label}</div>
        </div>
      ))}
    </div>
  );
}

/**
 * Four segments filled from the left. Segmented rather than continuous so
 * severity reads as a measured grade, not a mood (DESIGN.md §4).
 */
export function SeverityBar({
  severity,
  mark,
}: {
  severity: number;
  mark: string;
}) {
  return (
    <span
      className="severity-bar"
      style={{ "--mark": mark } as CSSProperties}
      aria-hidden="true"
    >
      {severitySegments(severity).map((filled, i) => (
        <i key={i} data-filled={filled} />
      ))}
    </span>
  );
}

/**
 * Continuous, deliberately — the segmented bar means severity. Decorative on its
 * own, so callers must state the same fact in words beside it.
 */
export function ProgressRule({ fraction }: { fraction: number }) {
  const pct = Math.round(Math.min(1, Math.max(0, fraction)) * 100);
  return (
    <div className="progress-rule" aria-hidden="true">
      <i style={{ width: `${pct}%` }} />
    </div>
  );
}

/** Status spelled out in an outlined pill. Never abbreviated, never colour alone. */
export function StatusTag({
  status,
  muted = false,
}: {
  status: WorkOrderStatus;
  muted?: boolean;
}) {
  return (
    <span
      className="tag"
      style={{
        border: `1px solid ${muted ? "var(--color-neutral-500)" : "var(--color-accent)"}`,
        color: muted ? "var(--color-neutral-700)" : "var(--color-accent)",
      }}
    >
      {statusWord(status)}
    </span>
  );
}

/** A plain outlined pill for text that is not a work-order status. */
export function Tag({ children }: { children: ReactNode }) {
  return <span className="tag tag-neutral">{children}</span>;
}

/**
 * The stop number, in the console's pin shape. Its form carries the state; the
 * row always prints the word beside it, so the badge is `aria-hidden`.
 */
export function StopBadge({
  order,
  status,
}: {
  order: number | null;
  status: WorkOrderStatus;
}) {
  return (
    <span className="stop-badge" data-state={status} aria-hidden="true">
      {order ?? "—"}
    </span>
  );
}

type ButtonProps = {
  children: ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  busy?: boolean;
  type?: "button" | "submit";
  full?: boolean;
};

/** The one solid steel object on screen. There is never a second. */
export function PrimaryButton({
  children,
  onClick,
  disabled,
  busy,
  type = "button",
  full,
}: ButtonProps) {
  return (
    <button
      type={type}
      className="btn btn-primary btn-pill"
      style={{ padding: "11px 18px", width: full ? "100%" : undefined }}
      onClick={onClick}
      disabled={disabled === true || busy === true}
    >
      {busy === true ? "Working…" : children}
    </button>
  );
}

export function SecondaryButton({
  children,
  onClick,
  disabled,
  busy,
  type = "button",
  full,
}: ButtonProps) {
  return (
    <button
      type={type}
      className="btn btn-secondary"
      style={{ width: full ? "100%" : undefined }}
      onClick={onClick}
      disabled={disabled === true || busy === true}
    >
      {busy === true ? "Working…" : children}
    </button>
  );
}

export function GhostButton({ children, onClick, disabled }: ButtonProps) {
  return (
    <button
      type="button"
      className="btn btn-ghost"
      onClick={onClick}
      disabled={disabled === true}
    >
      {children}
    </button>
  );
}

/**
 * Pending or absent data. A hairline box with a sentence — no skeleton shimmer,
 * no spinner (DESIGN.md §7).
 */
export function PlaceholderBox({ children }: { children: ReactNode }) {
  return <div className="placeholder-box">{children}</div>;
}

/** The only looping animation in the product. */
export const LiveDot = () => <i className="live-dot" aria-hidden="true" />;

/**
 * A failure states what failed and what to do, in one sentence, and offers the
 * way back. Never an exclamation mark, never "Oops".
 */
export function ErrorNotice({
  message,
  onRetry,
}: {
  message: string;
  onRetry?: () => void;
}) {
  return (
    <div className="placeholder-box" style={{ gap: "var(--space-3)" }}>
      <p className="m-0">{message}</p>
      {onRetry !== undefined && (
        <SecondaryButton onClick={onRetry}>Retry</SecondaryButton>
      )}
    </div>
  );
}
