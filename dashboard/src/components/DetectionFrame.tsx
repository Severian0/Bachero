import type { Pothole } from "@/lib/model";

/**
 * The evidence slot.
 *
 * When the detector project is connected this is the captured frame from the
 * vehicle. Until then it draws the detector's own output instead of a stock
 * photograph: the road surface, the accepted bounding box, and the model's
 * confidence. Inventing a photograph of a defect that was never photographed
 * would be a fabricated record, and this console is quoted at committee.
 */
export default function DetectionFrame({ pothole }: { pothole: Pothole }) {
  if (pothole.imageUrl) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={pothole.imageUrl}
        alt={`Captured defect on ${pothole.street}`}
        style={{ display: "block", width: "100%", aspectRatio: "16 / 9", objectFit: "cover", borderRadius: "var(--r-md)" }}
      />
    );
  }

  const specks = aggregate(pothole.id);

  const w = 66 + pothole.severity * 16;
  const h = 34 + pothole.severity * 9;
  const x = 160 - w / 2;
  const y = 92 - h / 2;

  return (
    <figure style={{ margin: 0 }}>
      <svg
        viewBox="0 0 320 180"
        style={{ display: "block", width: "100%", borderRadius: "var(--r-md)", background: "#33373a" }}
        role="img"
        aria-label={
          pothole.confidence === null
            ? `Detector output for ${pothole.ref}: accepted bounding box`
            : `Detector output for ${pothole.ref}: bounding box at confidence ${Math.round(pothole.confidence * 100)} per cent`
        }
      >
        <rect width="320" height="180" fill="#33373a" />
        {specks.map((s, i) => (
          <circle key={i} cx={s.cx} cy={s.cy} r={s.r} fill="#ffffff" opacity={s.o} />
        ))}
        {/* Lane edge, so the frame reads as a carriageway. */}
        <rect x="0" y="150" width="320" height="4" fill="#ffffff" opacity="0.30" />
        <rect x="0" y="16" width="320" height="2" fill="#ffffff" opacity="0.12" />

        {/* The accepted detection. */}
        <rect x={x} y={y} width={w} height={h} fill="none" stroke="#ffffff" strokeWidth="1.5" strokeDasharray="5 4" opacity="0.95" />
        {[
          [x, y, 1, 1],
          [x + w, y, -1, 1],
          [x, y + h, 1, -1],
          [x + w, y + h, -1, -1],
        ].map(([cx, cy, sx, sy], i) => (
          <path
            key={i}
            d={`M${cx} ${cy + sy * 9} L${cx} ${cy} L${cx + sx * 9} ${cy}`}
            stroke="#ffffff"
            strokeWidth="2"
            fill="none"
          />
        ))}
        {pothole.confidence !== null && (
          <>
            <rect x={x} y={y - 17} width={54} height={16} rx="2" fill="#1d70b8" />
            <text
              x={x + 6}
              y={y - 5}
              fill="#ffffff"
              fontSize="10"
              fontFamily="var(--font-data)"
              letterSpacing="0.02em"
            >
              {pothole.confidence.toFixed(2)}
            </text>
          </>
        )}
      </svg>
      <figcaption className="secondary" style={{ marginTop: 6, fontSize: "var(--t-small)", lineHeight: 1.4 }}>
        Detector output, {pothole.frameCount} {pothole.frameCount === 1 ? "frame" : "frames"} accepted. The captured
        photograph loads once the detector project is connected.
      </figcaption>
    </figure>
  );
}

/**
 * Deterministic surface aggregate, seeded from the record id so the server
 * and the client draw the same frame and nothing flickers on hydration.
 */
function aggregate(id: string) {
  let seed = 0;
  for (let i = 0; i < id.length; i += 1) seed = (seed * 31 + id.charCodeAt(i)) % 9973;
  const out: { cx: number; cy: number; r: number; o: number }[] = [];
  const next = () => {
    seed = (seed * 1103515245 + 12345) % 2147483648;
    return seed / 2147483648;
  };
  for (let i = 0; i < 46; i += 1) {
    out.push({ cx: next() * 320, cy: next() * 180, r: 0.6 + next() * 1.5, o: 0.05 + next() * 0.12 });
  }
  return out;
}
