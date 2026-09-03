// CameraImage → a small, upright, greyscale grid.
//
// Two things make this less trivial than it sounds. First, the frames arriving
// from the image stream are in *sensor* orientation, which on nearly every
// Android phone is 90° away from the portrait preview the operator is looking at;
// if the detector worked in sensor space its ROI trapezoid would lie on its side.
// Second, the luma plane is strided, so rows are not `width` bytes apart.
//
// Both are folded into one precomputed index map: grid pixel i reads source byte
// `_map[i]`. Rebuilt only when the camera configuration changes, so the per-frame
// cost is one array read per output pixel.

import 'dart:math' as math;
import 'dart:typed_data';

import 'package:camera/camera.dart';

/// A greyscale frame in display orientation. 0 = black, 255 = white.
class GrayFrame {
  const GrayFrame(this.pixels, this.width, this.height);

  final Uint8List pixels;
  final int width;
  final int height;

  int at(int x, int y) => pixels[y * width + x];
}

class FrameSampler {
  FrameSampler({this.targetPixels = 15000});

  /// Roughly how many pixels the detector should work on. Small enough that a
  /// frame costs well under a millisecond, large enough that a pothole four car
  /// lengths ahead is still a dozen pixels across.
  final int targetPixels;

  int _srcW = -1;
  int _srcH = -1;
  int _stride = -1;
  int _rotation = -1;

  int _gw = 0;
  int _gh = 0;
  Int32List _map = Int32List(0);
  Uint8List _grid = Uint8List(0);
  Uint8List _scratch = Uint8List(0);

  int get gridWidth => _gw;
  int get gridHeight => _gh;

  /// Downscale, rotate and lightly blur the luma plane.
  ///
  /// [rotationDegrees] is the clockwise rotation that takes the sensor image to
  /// what the operator sees — for a back camera with the device held portrait,
  /// that is the camera's `sensorOrientation`.
  GrayFrame sample(CameraImage image, int rotationDegrees) {
    final plane = image.planes[0];
    final stride = plane.bytesPerRow;
    final rotation = ((rotationDegrees % 360) + 360) % 360;

    if (image.width != _srcW ||
        image.height != _srcH ||
        stride != _stride ||
        rotation != _rotation) {
      _rebuild(image.width, image.height, stride, rotation);
    }

    final bytes = plane.bytes;
    final map = _map;
    final grid = _grid;
    final n = grid.length;
    final limit = bytes.length;
    for (var i = 0; i < n; i++) {
      final idx = map[i];
      grid[i] = idx < limit ? bytes[idx] : 0;
    }

    _blur3x3();
    return GrayFrame(grid, _gw, _gh);
  }

  void _rebuild(int srcW, int srcH, int stride, int rotation) {
    _srcW = srcW;
    _srcH = srcH;
    _stride = stride;
    _rotation = rotation;

    final swap = rotation == 90 || rotation == 270;
    final dw = swap ? srcH : srcW;
    final dh = swap ? srcW : srcH;
    final aspect = dw / dh;

    _gw = math.max(32, math.sqrt(targetPixels * aspect).round());
    _gh = math.max(32, (_gw / aspect).round());

    _map = Int32List(_gw * _gh);
    _grid = Uint8List(_gw * _gh);
    _scratch = Uint8List(_gw * _gh);

    for (var gy = 0; gy < _gh; gy++) {
      final dy = (((gy + 0.5) * dh) / _gh).floor().clamp(0, dh - 1).toInt();
      for (var gx = 0; gx < _gw; gx++) {
        final dx = (((gx + 0.5) * dw) / _gw).floor().clamp(0, dw - 1).toInt();

        final (sx, sy) = switch (rotation) {
          90 => (dy, srcH - 1 - dx),
          180 => (srcW - 1 - dx, srcH - 1 - dy),
          270 => (srcW - 1 - dy, dx),
          _ => (dx, dy),
        };
        _map[gy * _gw + gx] = sy * stride + sx;
      }
    }
  }

  /// Separable 3-tap box blur. Nearest-neighbour downscaling keeps sensor noise;
  /// the band statistics downstream are robust, but a blob two pixels across is
  /// not, and this is what stops single hot pixels becoming candidates.
  void _blur3x3() {
    final src = _grid;
    final tmp = _scratch;
    final w = _gw;
    final h = _gh;

    for (var y = 0; y < h; y++) {
      final row = y * w;
      for (var x = 0; x < w; x++) {
        final l = src[row + (x == 0 ? 0 : x - 1)];
        final c = src[row + x];
        final r = src[row + (x == w - 1 ? w - 1 : x + 1)];
        tmp[row + x] = (l + c + r) ~/ 3;
      }
    }
    for (var y = 0; y < h; y++) {
      final up = (y == 0 ? 0 : y - 1) * w;
      final row = y * w;
      final down = (y == h - 1 ? h - 1 : y + 1) * w;
      for (var x = 0; x < w; x++) {
        src[row + x] = (tmp[up + x] + tmp[row + x] + tmp[down + x]) ~/ 3;
      }
    }
  }
}
