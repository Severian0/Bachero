// The detector is pure Dart over a greyscale grid, so it can be exercised on
// synthetic road without a phone, a camera or a pothole. Run with `flutter test`.

import 'dart:typed_data';

import 'package:bachero_sensor/core/geo.dart';
import 'package:bachero_sensor/detect/accel_detector.dart';
import 'package:bachero_sensor/detect/frame_sampler.dart';
import 'package:bachero_sensor/detect/vision_detector.dart';
import 'package:flutter_test/flutter_test.dart';

const int w = 90;
const int h = 160;

/// A stretch of tarmac with a little deterministic sensor noise, optionally with
/// one dark patch painted into it.
GrayFrame road({
  int base = 130,
  int? blobLeft,
  int? blobTop,
  int blobWidth = 10,
  int blobHeight = 8,
  int blobValue = 70,
}) {
  final pixels = Uint8List(w * h);
  for (var i = 0; i < pixels.length; i++) {
    pixels[i] = (base + (i * 37) % 7 - 3).clamp(0, 255);
  }
  if (blobLeft != null && blobTop != null) {
    for (var y = blobTop; y < blobTop + blobHeight; y++) {
      for (var x = blobLeft; x < blobLeft + blobWidth; x++) {
        if (x < 0 || x >= w || y < 0 || y >= h) continue;
        pixels[y * w + x] = blobValue;
      }
    }
  }
  return GrayFrame(pixels, w, h);
}

VisionFrameResult run(VisionDetector detector, GrayFrame frame, int frames) {
  var result = VisionFrameResult.empty;
  var now = DateTime(2026, 9, 2, 10);
  for (var i = 0; i < frames; i++) {
    now = now.add(const Duration(milliseconds: 66));
    result = detector.analyse(frame, now);
    if (result.hit != null) return result;
  }
  return result;
}

void main() {
  group('vision detector', () {
    test('does not fire on clean tarmac', () {
      final detector = VisionDetector();
      final result = run(detector, road(), 10);

      expect(result.hit, isNull);
      expect(result.candidateCount, 0);
      expect(result.tooDark, isFalse);
      expect(result.roadMedian, greaterThan(100));
    });

    test('fires on a dark, compact patch in the near field', () {
      final detector = VisionDetector();
      // Row 121 sits about 60% of the way down the region of interest, which is
      // past the near-field gate, and the trapezoid is ~64 px wide there.
      final frame = road(blobLeft: 40, blobTop: 117);

      final result = run(detector, frame, 8);

      expect(result.hit, isNotNull);
      final hit = result.hit!;
      expect(hit.confidence, greaterThan(0.34));
      expect(hit.hits, greaterThanOrEqualTo(3));
      // Normalised into display coordinates, 0-1.
      expect(hit.centerX, closeTo(45 / w, 0.05));
      expect(hit.centerY, closeTo(121 / h, 0.05));
    });

    test('fires once per hole, not once per frame', () {
      final detector = VisionDetector();
      final frame = road(blobLeft: 40, blobTop: 117);

      expect(run(detector, frame, 8).hit, isNotNull);
      // The track is spent; the same patch must not produce a second detection.
      expect(run(detector, frame, 8).hit, isNull);
    });

    test('ignores a shadow band across the carriageway', () {
      final detector = VisionDetector();
      final frame = road(blobLeft: 12, blobTop: 120, blobWidth: 66, blobHeight: 3);

      final result = run(detector, frame, 10);

      expect(result.hit, isNull);
    });

    test('ignores anything above the horizon', () {
      final detector = VisionDetector();
      // Dark and compact, but at row 30 it is sky, a hedge or somebody's window.
      final frame = road(blobLeft: 40, blobTop: 28);

      final result = run(detector, frame, 10);

      expect(result.hit, isNull);
      expect(result.candidateCount, 0);
    });

    test('reports a scene it cannot judge instead of guessing', () {
      final detector = VisionDetector();
      final result = run(detector, road(base: 8), 4);

      expect(result.tooDark, isTrue);
      expect(result.hit, isNull);
    });

    test('sensitivity moves the thresholds it is meant to move', () {
      const base = VisionTuning();
      final fussy = base.withSensitivity(0.0);
      final eager = base.withSensitivity(1.0);

      expect(fussy.darkK, greaterThan(eager.darkK));
      expect(fussy.minConfidence, greaterThan(eager.minConfidence));
      expect(eager.sensitivity, greaterThan(fussy.sensitivity));
    });
  });

  group('accelerometer detector', () {
    test('severity divides out speed', () {
      const tuning = AccelTuning();
      // The same hole hits harder at speed, so the same peak means less.
      final slow = severityFromPeak(4.0, 5, tuning);
      final fast = severityFromPeak(4.0, 15, tuning);

      expect(slow, greaterThan(fast));
      expect(severityFromPeak(400, 0, tuning), 1.0);
      expect(severityFromPeak(0, 10, tuning), 0.0);
    });

    test('removes gravity whatever angle the cradle sits at', () {
      final detector = AccelDetector();
      AccelHit? fired;
      detector.onHit = (hit) => fired = hit;

      // A phone tilted in a cradle: gravity spread across two axes, still 9.81.
      var now = DateTime(2026, 9, 2, 10);
      const gx = 6.94, gy = 6.94, gz = 0.0;
      for (var i = 0; i < 200; i++) {
        now = now.add(const Duration(milliseconds: 20));
        detector.addSample(gx, gy, gz, now);
      }

      expect(detector.ready, isTrue);
      expect(detector.vertical.abs(), lessThan(0.5));
      expect(fired, isNull, reason: 'a steady tilt is not a pothole');

      // Now a jolt along the gravity direction.
      for (var i = 0; i < 6; i++) {
        now = now.add(const Duration(milliseconds: 20));
        detector.addSample(gx * 1.55, gy * 1.55, gz, now);
      }
      for (var i = 0; i < 20; i++) {
        now = now.add(const Duration(milliseconds: 20));
        detector.addSample(gx, gy, gz, now);
      }

      expect(fired, isNotNull);
      expect(fired!.peakZ.abs(), greaterThan(2.5));
      expect(fired!.window, isNotEmpty);
    });
  });

  group('geography', () {
    test('EWKT is longitude first', () {
      expect(ewktPoint(-0.1275, 51.5072), 'SRID=4326;POINT(-0.1275000 51.5072000)');
    });

    test('haversine is in metres', () {
      // One minute of latitude is a nautical mile.
      expect(haversineMetres(51.5, -0.1275, 51.5 + 1 / 60, -0.1275),
          closeTo(1852, 5));
    });
  });
}
