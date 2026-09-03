// The before-photo. When a detection fires we keep the next frame's planes and
// turn them into a JPEG on a background isolate, so the road can be seen in the
// dashboard's detail panel and in the crew's email.
//
// Done off the UI isolate because a full YUV→RGB conversion plus JPEG encode is
// tens of milliseconds, and dropping a frame of preview at the exact moment a
// pothole goes under the wheel is the one time it would be noticed.



import 'package:camera/camera.dart';
import 'package:flutter/foundation.dart';
import 'package:image/image.dart' as img;

/// A copy of one camera frame's planes, detached from the plugin's buffer so the
/// frame can be released immediately.
class RawFrame {
  const RawFrame({
    required this.y,
    required this.u,
    required this.v,
    required this.width,
    required this.height,
    required this.yStride,
    required this.uvRowStride,
    required this.uvPixelStride,
    required this.rotation,
    required this.longEdge,
    required this.quality,
  });

  final Uint8List y;
  final Uint8List u;
  final Uint8List v;
  final int width;
  final int height;
  final int yStride;
  final int uvRowStride;
  final int uvPixelStride;

  /// Clockwise degrees that take the sensor image to what the operator sees.
  final int rotation;

  /// Longest edge of the encoded image, in pixels.
  final int longEdge;
  final int quality;

  /// Copy what is needed out of a live [CameraImage]. Cheap enough to do inside
  /// the stream callback; the expensive part happens in the isolate.
  factory RawFrame.from(
    CameraImage image, {
    required int rotation,
    required int longEdge,
    required int quality,
  }) {
    final planes = image.planes;
    final hasChroma = planes.length >= 3;
    return RawFrame(
      y: Uint8List.fromList(planes[0].bytes),
      u: hasChroma ? Uint8List.fromList(planes[1].bytes) : Uint8List(0),
      v: hasChroma ? Uint8List.fromList(planes[2].bytes) : Uint8List(0),
      width: image.width,
      height: image.height,
      yStride: planes[0].bytesPerRow,
      uvRowStride: hasChroma ? planes[1].bytesPerRow : 0,
      uvPixelStride: hasChroma ? (planes[1].bytesPerPixel ?? 1) : 1,
      rotation: ((rotation % 360) + 360) % 360,
      longEdge: longEdge,
      quality: quality,
    );
  }
}

/// Encode a frame as JPEG, upright and scaled down, on a background isolate.
/// Returns null if the frame cannot be read.
Future<Uint8List?> encodeFrameJpeg(RawFrame frame) => compute(_encode, frame);

Uint8List? _encode(RawFrame f) {
  if (f.y.isEmpty || f.width <= 0 || f.height <= 0) return null;

  final swap = f.rotation == 90 || f.rotation == 270;
  final dw = swap ? f.height : f.width;
  final dh = swap ? f.width : f.height;

  final longest = dw > dh ? dw : dh;
  final scale = longest <= f.longEdge ? 1.0 : f.longEdge / longest;
  final outW = (dw * scale).round().clamp(2, dw).toInt();
  final outH = (dh * scale).round().clamp(2, dh).toInt();

  final image = img.Image(width: outW, height: outH);
  final mono = f.u.isEmpty || f.v.isEmpty || f.uvRowStride == 0;

  for (var oy = 0; oy < outH; oy++) {
    final dy = ((oy + 0.5) * dh / outH).floor().clamp(0, dh - 1).toInt();
    for (var ox = 0; ox < outW; ox++) {
      final dx = ((ox + 0.5) * dw / outW).floor().clamp(0, dw - 1).toInt();

      final (sx, sy) = switch (f.rotation) {
        90 => (dy, f.height - 1 - dx),
        180 => (f.width - 1 - dx, f.height - 1 - dy),
        270 => (f.width - 1 - dy, dx),
        _ => (dx, dy),
      };

      final yIndex = sy * f.yStride + sx;
      final luma = yIndex < f.y.length ? f.y[yIndex] : 0;

      if (mono) {
        image.setPixelRgb(ox, oy, luma, luma, luma);
        continue;
      }

      final uvIndex = (sy >> 1) * f.uvRowStride + (sx >> 1) * f.uvPixelStride;
      final cb = uvIndex < f.u.length ? f.u[uvIndex] - 128 : 0;
      final cr = uvIndex < f.v.length ? f.v[uvIndex] - 128 : 0;

      final r = luma + 1.402 * cr;
      final g = luma - 0.344136 * cb - 0.714136 * cr;
      final b = luma + 1.772 * cb;

      image.setPixelRgb(ox, oy, _byte(r), _byte(g), _byte(b));
    }
  }

  return img.encodeJpg(image, quality: f.quality);
}

int _byte(double v) => v < 0 ? 0 : (v > 255 ? 255 : v.round());
