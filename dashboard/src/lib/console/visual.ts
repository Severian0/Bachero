import type { PotholeStatus } from "@/lib/types";

/**
 * Two lanes of meaning, and only two.
 *
 * Blue is work proposed, green is work committed to a crew. That distinction
 * is the product, so it is the only place a second hue is spent. Severity is
 * never coloured by status: it has its own size and its own bar, so magnitude
 * can never be misread as state.
 *
 * Status is also always spelled out in the row and in the record, so colour
 * never carries a meaning on its own.
 */
export interface StatusVisual {
  /** Pin fill. `transparent` leaves the square hollow. */
  fill: string;
  stroke: string;
  /** The 3px marker down the left edge of a queue row. */
  mark: string;
  label: string;
  /** Class on the status tag. */
  tag: string;
  opacity: number;
}

export const STATUS_VISUAL: Record<PotholeStatus, StatusVisual> = {
  suspected: {
    fill: "var(--surface)",
    stroke: "var(--ink-2)",
    mark: "var(--rule)",
    label: "Suspected",
    tag: "tag tag-suspected",
    opacity: 1,
  },
  confirmed: {
    fill: "var(--action)",
    stroke: "var(--action)",
    mark: "var(--action)",
    label: "Confirmed",
    tag: "tag tag-confirmed",
    opacity: 1,
  },
  scheduled: {
    fill: "var(--committed)",
    stroke: "var(--committed)",
    mark: "var(--committed)",
    label: "Scheduled",
    tag: "tag tag-scheduled",
    opacity: 1,
  },
  repaired: {
    fill: "var(--surface)",
    stroke: "var(--rule)",
    mark: "var(--rule)",
    label: "Repaired",
    tag: "tag tag-repaired",
    opacity: 0.55,
  },
  false_positive: {
    fill: "transparent",
    stroke: "transparent",
    mark: "transparent",
    label: "Dismissed",
    tag: "tag tag-repaired",
    opacity: 0,
  },
};

/**
 * Severity is the pin's size, honestly scaled: 14px to 26px across the four
 * grades. Takes the grade, not the raw 0-1 severity: callers pass
 * `severityGrade(p.severity)` from `./derive`.
 */
export function pinSize(grade: number): number {
  return 14 + (Math.min(4, Math.max(1, grade)) - 1) * 4;
}

/**
 * The severity bar fills in ink, except grade 4, which is the one place
 * oxblood appears anywhere in the console. Because it is rare, it means
 * something when you see it.
 */
export function severityFill(severity: number, filled: boolean): string {
  if (!filled) return "var(--rule-soft)";
  return severity === 4 ? "var(--severe)" : "var(--ink)";
}

export const SEVERITY_WORD = ["", "Minor", "Moderate", "Serious", "Severe"];

/** HH:MM in the record's own offset. No locale, no timezone drift. */
export function timeOf(iso: string): string {
  return iso.slice(11, 16);
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** "2 Sep" for a record's own day. */
export function dayOf(iso: string): string {
  const [yy, mm, dd] = iso.slice(0, 10).split("-");
  return `${Number(dd)} ${MONTHS[Number(mm) - 1]}${yy === "2026" ? "" : ` ${yy}`}`;
}

/** "Today, 11:52" or "1 Sep, 07:10". Operators think in days, not stamps. */
export function whenOf(iso: string, today: string): string {
  return iso.slice(0, 10) === today
    ? `Today, ${timeOf(iso)}`
    : `${dayOf(iso)}, ${timeOf(iso)}`;
}
