// The after-photo, prepared in the browser before it is uploaded.
//
// A phone camera hands back 3–8 MB. A crew is on a mobile connection in a van,
// and the photo only has to show that the hole is filled, so it is resized to
// the same 720px long edge at quality 78 the sensor app uses
// (`sensor/lib/config.dart`) — one number for the whole project.

/** Longest edge of the uploaded photo, in pixels. */
export const PHOTO_LONG_EDGE_PX = 720;

/** JPEG quality, 0–1. `photoQuality = 78` in the sensor's config. */
export const PHOTO_QUALITY = 0.78;

/**
 * Scale factor for an image of `width` × `height`, never above 1: a photo
 * smaller than the target is left alone rather than blown up.
 */
export function scaleFor(
  width: number,
  height: number,
  longEdge: number = PHOTO_LONG_EDGE_PX,
): number {
  const longest = Math.max(width, height);
  return longest <= longEdge ? 1 : longEdge / longest;
}

/**
 * Downscale and re-encode as JPEG. Throws with a sentence a crew can act on;
 * the caller shows it and keeps the stop open.
 */
export async function preparePhoto(file: Blob): Promise<Blob> {
  const bitmap = await createImageBitmap(file);
  try {
    const scale = scaleFor(bitmap.width, bitmap.height);
    const width = Math.round(bitmap.width * scale);
    const height = Math.round(bitmap.height * scale);

    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d");
    if (context == null) {
      throw new Error("This browser could not process the photo.");
    }
    context.drawImage(bitmap, 0, 0, width, height);

    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, "image/jpeg", PHOTO_QUALITY),
    );
    if (blob == null) throw new Error("This browser could not process the photo.");
    return blob;
  } finally {
    bitmap.close();
  }
}
