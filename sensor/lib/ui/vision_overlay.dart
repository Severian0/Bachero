// What the detector is looking at, drawn over the camera image.
//
// The console's status language carries straight across: a blob the detector is
// still following is a hollow rounded square — evidence, not a fact — and one
// that has fired is solid steel with crosshair guides drawn to the frame edges
// and its coordinate printed at the margin. That is the same drafting move the
// map uses to tie a pin to its queue row, and it is how you see which of four
// dark patches the app actually called.

import 'dart:math' as math;

import 'package:flutter/material.dart';

import '../detect/vision_detector.dart';
import '../theme/tokens.dart';

class VisionOverlay extends StatefulWidget {
  const VisionOverlay({
    super.key,
    required this.result,
    required this.roi,
    required this.active,
    this.coordinate,
  });

  final VisionFrameResult result;

  /// Normalised ROI outline: top, bottom, half-widths and centre, all 0–1.
  final ({double top, double bottom, double topHalf, double bottomHalf, double centerX}) roi;

  /// False when the camera detector is switched off — the ROI still shows, the
  /// marks do not.
  final bool active;

  /// Printed at the margin when something fires.
  final String? coordinate;

  @override
  State<VisionOverlay> createState() => _VisionOverlayState();
}

class _VisionOverlayState extends State<VisionOverlay>
    with SingleTickerProviderStateMixin {
  late final AnimationController _flash = AnimationController(
    vsync: this,
    // Long enough to be read at a glance from a cradle, and the only mark on
    // screen that fades rather than cuts.
    duration: const Duration(milliseconds: 2400),
  );

  VisionHit? _lastHit;

  @override
  void initState() {
    super.initState();
    _lastHit = widget.result.hit;
    if (_lastHit != null) _flash.forward(from: 0);
  }

  @override
  void didUpdateWidget(covariant VisionOverlay oldWidget) {
    super.didUpdateWidget(oldWidget);
    final hit = widget.result.hit;
    if (hit != null && hit != _lastHit) {
      _lastHit = hit;
      _flash.forward(from: 0);
    }
  }

  @override
  void dispose() {
    _flash.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return RepaintBoundary(
      child: CustomPaint(
        painter: _VisionOverlayPainter(
          result: widget.result,
          roi: widget.roi,
          active: widget.active,
          hit: _lastHit,
          flash: _flash,
          coordinate: widget.coordinate,
        ),
        size: Size.infinite,
      ),
    );
  }
}

class _VisionOverlayPainter extends CustomPainter {
  _VisionOverlayPainter({
    required this.result,
    required this.roi,
    required this.active,
    required this.hit,
    required this.flash,
    required this.coordinate,
  }) : super(repaint: flash);

  final VisionFrameResult result;
  final ({double top, double bottom, double topHalf, double bottomHalf, double centerX}) roi;
  final bool active;
  final VisionHit? hit;
  final Animation<double> flash;
  final String? coordinate;

  @override
  void paint(Canvas canvas, Size size) {
    if (size.isEmpty) return;
    _paintGraticule(canvas, size);
    _paintRoi(canvas, size);
    if (active) {
      _paintTracks(canvas, size);
      _paintFlash(canvas, size);
    }
  }

  /// The graticule is what makes the surface read as survey rather than
  /// photograph. Inverted ink, because the ground here is the road.
  void _paintGraticule(Canvas canvas, Size size) {
    final paint = Paint()
      ..color = BchColor.white10
      ..strokeWidth = 1;
    for (var x = BchFrame.graticuleStep; x < size.width; x += BchFrame.graticuleStep) {
      canvas.drawLine(Offset(x, 0), Offset(x, size.height), paint);
    }
    for (var y = BchFrame.graticuleStep; y < size.height; y += BchFrame.graticuleStep) {
      canvas.drawLine(Offset(0, y), Offset(size.width, y), paint);
    }
  }

  void _paintRoi(Canvas canvas, Size size) {
    final top = roi.top * size.height;
    final bottom = roi.bottom * size.height;
    final cx = roi.centerX * size.width;
    final topHalf = roi.topHalf * size.width;
    final bottomHalf = roi.bottomHalf * size.width;

    final path = Path()
      ..moveTo(cx - topHalf, top)
      ..lineTo(cx + topHalf, top)
      ..lineTo(cx + bottomHalf, bottom)
      ..lineTo(cx - bottomHalf, bottom)
      ..close();

    canvas.drawPath(
      path,
      Paint()
        ..color = BchColor.accent40
        ..style = PaintingStyle.stroke
        ..strokeWidth = 1,
    );

    // The horizon: everything above it is sky, buildings and other people's
    // problems, and is never analysed.
    _dashedLine(
      canvas,
      Offset(cx - topHalf, top),
      Offset(cx + topHalf, top),
      Paint()
        ..color = BchColor.white55
        ..strokeWidth = 1,
    );
  }

  void _paintTracks(Canvas canvas, Size size) {
    final gw = result.gridWidth;
    final gh = result.gridHeight;
    if (gw == 0 || gh == 0) return;

    for (final track in result.tracks) {
      final blob = track.blob;
      final rect = Rect.fromLTRB(
        blob.minX / gw * size.width,
        blob.minY / gh * size.height,
        (blob.maxX + 1) / gw * size.width,
        (blob.maxY + 1) / gh * size.height,
      );

      // Never smaller than a thumb-sized mark, so a hole four car lengths ahead
      // is still visible on a cradle-mounted phone.
      final inflated = _atLeast(rect, 22);
      final rrect = RRect.fromRectAndRadius(inflated, BchRadius.sm);

      if (track.fired) {
        canvas.drawRRect(rrect, Paint()..color = BchColor.accent24);
        canvas.drawRRect(
          rrect,
          Paint()
            ..color = BchColor.accent
            ..style = PaintingStyle.stroke
            ..strokeWidth = 2,
        );
      } else {
        // Hollow while it is only a candidate — lighter, not louder.
        final strength = (track.hits / 3).clamp(0.3, 1.0);
        canvas.drawRRect(
          rrect,
          Paint()
            ..color = BchColor.white70.withValues(alpha: 0.35 + 0.45 * strength)
            ..style = PaintingStyle.stroke
            ..strokeWidth = 1.5,
        );
      }
    }
  }

  void _paintFlash(Canvas canvas, Size size) {
    final current = hit;
    if (current == null) return;
    final t = flash.value;
    if (t >= 1) return;

    // Fade over the second half only; the mark must be fully solid while the
    // vehicle is still over the hole.
    final opacity = t < 0.5 ? 1.0 : 1 - (t - 0.5) * 2;
    final x = current.centerX * size.width;
    final y = current.centerY * size.height;

    final guide = Paint()
      ..color = BchColor.accent40.withValues(alpha: 0.4 * opacity)
      ..strokeWidth = 1;
    canvas.drawLine(Offset(x, 0), Offset(x, size.height), guide);
    canvas.drawLine(Offset(0, y), Offset(size.width, y), guide);

    final label = coordinate;
    if (label == null) return;

    _chip(
      canvas,
      size,
      text: label,
      anchor: Offset(x + 8, 10),
      opacity: opacity,
      color: BchColor.accent800,
    );
  }

  void _chip(
    Canvas canvas,
    Size size, {
    required String text,
    required Offset anchor,
    required double opacity,
    required Color color,
  }) {
    final painter = TextPainter(
      text: TextSpan(
        text: text,
        style: BchType.rowRef.copyWith(
          color: color.withValues(alpha: opacity),
          fontSize: 11,
        ),
      ),
      textDirection: TextDirection.ltr,
    )..layout();

    final w = painter.width + 14;
    final h = painter.height + 6;
    final left = math.min(anchor.dx, size.width - w - 4);
    final rect = Rect.fromLTWH(math.max(4, left), anchor.dy, w, h);
    final rrect = RRect.fromRectAndRadius(rect, BchRadius.md);

    canvas.drawRRect(
      rrect,
      Paint()..color = BchColor.bg.withValues(alpha: opacity),
    );
    painter.paint(canvas, Offset(rect.left + 7, rect.top + 3));
  }

  void _dashedLine(Canvas canvas, Offset from, Offset to, Paint paint) {
    const dash = 5.0;
    const gap = 4.0;
    final total = (to - from).distance;
    if (total <= 0) return;
    final direction = (to - from) / total;
    var travelled = 0.0;
    while (travelled < total) {
      final end = math.min(travelled + dash, total);
      canvas.drawLine(
        from + direction * travelled,
        from + direction * end,
        paint,
      );
      travelled = end + gap;
    }
  }

  static Rect _atLeast(Rect rect, double minimum) => Rect.fromCenter(
        center: rect.center,
        width: math.max(rect.width, minimum),
        height: math.max(rect.height, minimum),
      );

  @override
  bool shouldRepaint(covariant _VisionOverlayPainter old) {
    return old.result != result ||
        old.active != active ||
        old.hit != hit ||
        old.coordinate != coordinate ||
        old.roi != roi;
  }
}
