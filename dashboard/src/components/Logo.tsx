/**
 * The mark: a carriageway crossing a plate, with a void punched through it.
 *
 * Built on a 24 grid with one radius and one stroke weight so the silhouette
 * survives at 20px in a browser tab and at 8mm on a council letterhead. The
 * void is the product: everything Bachero does starts with a hole in a road.
 */
export function Mark({ size = 28 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      role="img"
      aria-label="Bachero"
    >
      <defs>
        <clipPath id="bch-plate">
          <rect width="24" height="24" rx="6" />
        </clipPath>
      </defs>
      <g clipPath="url(#bch-plate)">
        <rect width="24" height="24" rx="6" fill="currentColor" />
        {/* The carriageway, cut out of the plate. */}
        <path d="M-6 18.5 L18.5 -6 L26 1.5 L1.5 26 Z" fill="var(--mark-void, #fff)" />
        {/* The defect, sitting in the running lane. */}
        <circle cx="12" cy="12" r="3.4" fill="currentColor" />
      </g>
    </svg>
  );
}

/**
 * Mark plus wordmark. The wordmark is set tight and in caps because it is
 * read as an identifier, not as a word in a sentence.
 */
export function Wordmark({ size = 28 }: { size?: number }) {
  return (
    <span style={{ display: "flex", alignItems: "center", gap: 10 }}>
      <Mark size={size} />
      <span
        style={{
          fontSize: "var(--t-lead)",
          fontWeight: 700,
          letterSpacing: "0.10em",
          lineHeight: 1,
          textTransform: "uppercase",
        }}
      >
        Bachero
      </span>
    </span>
  );
}
