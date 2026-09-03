/** A bitmap in the shape map.addImage accepts: raw rgba pixels. */
export interface ArrowImage {
  width: number;
  height: number;
  data: Uint8ClampedArray;
}

const HEX = /^#([0-9a-f]{6})$/i;

/**
 * A right-pointing solid triangle. MapLibre rotates it to the line's
 * direction at render time (icon-rotation-alignment: "map"), so drawing it
 * once, pointing right, is enough. Pure pixels: no canvas, no DOM, no font.
 *
 * The colour must be a resolved #rrggbb literal (from readToken), because a
 * bitmap has no way to reference a CSS custom property.
 */
export function buildArrowImage(hexColor: string, size = 24): ArrowImage {
  const match = HEX.exec(hexColor.trim());
  if (!match) throw new Error("arrow colour must be a #rrggbb literal");
  const value = parseInt(match[1], 16);
  const r = (value >> 16) & 0xff;
  const g = (value >> 8) & 0xff;
  const b = value & 0xff;

  const data = new Uint8ClampedArray(size * size * 4);
  // Base along the left edge (inset by a margin), apex at the right inset by
  // the same margin. A pixel is inside while its distance from the midline is
  // under the half-height, which shrinks linearly towards the apex.
  const margin = size / 6;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const t = (x - margin) / (size - 2 * margin); // 0 at the base, 1 at the apex
      const halfHeight = (1 - t) * (size / 2 - margin);
      const inside = t >= 0 && t <= 1 && Math.abs(y - size / 2 + 0.5) <= halfHeight;
      const i = (y * size + x) * 4;
      data[i] = r;
      data[i + 1] = g;
      data[i + 2] = b;
      data[i + 3] = inside ? 255 : 0;
    }
  }
  return { width: size, height: size, data };
}
