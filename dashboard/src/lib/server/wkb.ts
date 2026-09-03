import type { LngLat } from "@/lib/solver/haversine";

// Hardcodes SRID 4326 (the `e6100000` little-endian encoding of 4326) since
// every geography column in this schema is WGS84; a different SRID here
// falls through to "Unsupported WKB" rather than being parsed wrongly.
const EWKB_LE_POINT_WITH_SRID = "0101000020e6100000";
const WKB_LE_POINT_PLAIN = "0101000000";

/**
 * Parses a 2-D point out of PostGIS EWKB hex (byte order + SRID flag + SRID +
 * two little-endian doubles) or plain WKB hex (byte order + type + two
 * little-endian doubles), both little-endian. Anything else — big-endian
 * variants, other geometry types, malformed input — throws.
 */
export function parsePointWkb(hex: string): LngLat {
  const lower = hex.toLowerCase();
  if (!/^[0-9a-f]+$/.test(lower)) {
    throw new Error("Unsupported WKB");
  }

  let coordsOffsetHexChars: number;
  if (lower.startsWith(EWKB_LE_POINT_WITH_SRID)) {
    coordsOffsetHexChars = EWKB_LE_POINT_WITH_SRID.length;
  } else if (lower.startsWith(WKB_LE_POINT_PLAIN)) {
    coordsOffsetHexChars = WKB_LE_POINT_PLAIN.length;
  } else {
    throw new Error("Unsupported WKB");
  }

  // Two little-endian IEEE-754 doubles (lng, then lat), 16 bytes = 32 hex chars.
  if (lower.length < coordsOffsetHexChars + 32) {
    throw new Error("Unsupported WKB");
  }

  const buf = Buffer.from(lower.slice(coordsOffsetHexChars, coordsOffsetHexChars + 32), "hex");
  const lng = buf.readDoubleLE(0);
  const lat = buf.readDoubleLE(8);
  return [lng, lat];
}
