import { describe, it, expect } from "vitest";
import { parsePointWkb } from "./wkb";

// Seeded depot: SRID=4326;POINT(-0.1246 51.4994)
const LNG = -0.1246;
const LAT = 51.4994;

function hex(buf: Buffer): string {
  return buf.toString("hex").toUpperCase();
}

function ewkbLittleEndian(lng: number, lat: number): string {
  // byte order (1 = LE) + geom type with SRID flag (0x20000000 | 1) + SRID (4326) + lng + lat
  const buf = Buffer.alloc(1 + 4 + 4 + 8 + 8);
  let offset = 0;
  buf.writeUInt8(1, offset);
  offset += 1;
  buf.writeUInt32LE(0x20000001, offset);
  offset += 4;
  buf.writeUInt32LE(4326, offset);
  offset += 4;
  buf.writeDoubleLE(lng, offset);
  offset += 8;
  buf.writeDoubleLE(lat, offset);
  offset += 8;
  return hex(buf);
}

function wkbLittleEndianNoSrid(lng: number, lat: number): string {
  // byte order (1 = LE) + geom type (1, no SRID flag) + lng + lat
  const buf = Buffer.alloc(1 + 4 + 8 + 8);
  let offset = 0;
  buf.writeUInt8(1, offset);
  offset += 1;
  buf.writeUInt32LE(1, offset);
  offset += 4;
  buf.writeDoubleLE(lng, offset);
  offset += 8;
  buf.writeDoubleLE(lat, offset);
  offset += 8;
  return hex(buf);
}

function ewkbBigEndian(lng: number, lat: number): string {
  const buf = Buffer.alloc(1 + 4 + 4 + 8 + 8);
  let offset = 0;
  buf.writeUInt8(0, offset);
  offset += 1;
  buf.writeUInt32BE(0x20000001, offset);
  offset += 4;
  buf.writeUInt32BE(4326, offset);
  offset += 4;
  buf.writeDoubleBE(lng, offset);
  offset += 8;
  buf.writeDoubleBE(lat, offset);
  offset += 8;
  return hex(buf);
}

describe("parsePointWkb", () => {
  it("parses PostGIS EWKB (little-endian, with SRID) for the seeded depot", () => {
    const [lng, lat] = parsePointWkb(ewkbLittleEndian(LNG, LAT));
    expect(lng).toBeCloseTo(LNG, 9);
    expect(lat).toBeCloseTo(LAT, 9);
  });

  it("parses plain WKB (little-endian, no SRID)", () => {
    const [lng, lat] = parsePointWkb(wkbLittleEndianNoSrid(LNG, LAT));
    expect(lng).toBeCloseTo(LNG, 9);
    expect(lat).toBeCloseTo(LAT, 9);
  });

  it("throws Unsupported WKB for a big-endian variant", () => {
    expect(() => parsePointWkb(ewkbBigEndian(LNG, LAT))).toThrow("Unsupported WKB");
  });

  it("throws Unsupported WKB for a garbage string", () => {
    expect(() => parsePointWkb("not-hex-at-all")).toThrow("Unsupported WKB");
  });

  it("throws Unsupported WKB for a too-short hex string", () => {
    expect(() => parsePointWkb("0101")).toThrow("Unsupported WKB");
  });
});
