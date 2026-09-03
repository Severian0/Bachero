// Everything held about one detection, on a sheet that can be read at a stop.
//
// The inspector at the foot of the console is deliberately fixed-height, so it
// shows the headline and nothing more. This is where the rest lives: the frame
// the detector fired on at full width, every measured quantity with its unit,
// the second of vertical acceleration around the peak, and the identifiers that
// tie the row on the phone to the row in Postgres.
//
// Measurement before inference, here as everywhere: what the sensors read comes
// first, what the app concluded from it comes second, and the caveat comes last.

import 'package:flutter/material.dart';

import '../core/format.dart';
import '../core/geo.dart';
import '../data/models.dart';
import '../session/session_controller.dart';
import '../theme/tokens.dart';
import 'widgets/console_widgets.dart';

/// Open the evidence sheet for [entry].
Future<void> showEvidenceSheet(BuildContext context, DetectionEntry entry) {
  return showModalBottomSheet<void>(
    context: context,
    isScrollControlled: true,
    backgroundColor: BchColor.bg,
    builder: (_) => EvidenceSheet(entry: entry),
  );
}

class EvidenceSheet extends StatelessWidget {
  const EvidenceSheet({super.key, required this.entry});

  final DetectionEntry entry;

  @override
  Widget build(BuildContext context) {
    final media = MediaQuery.of(context);
    final record = entry.record;

    return ConstrainedBox(
      constraints: BoxConstraints(maxHeight: media.size.height * 0.88),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: <Widget>[
          _header(context),
          const Hairline(),
          Flexible(
            child: SingleChildScrollView(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                mainAxisSize: MainAxisSize.min,
                children: <Widget>[
                  _photo(record),
                  _section('Measurement', <Widget>[
                    _kv('Source', record.source.label),
                    _kv('Peak vertical acceleration',
                        accelerationMps2(record.accelPeakZ)),
                    _kv('Speed', metresPerSecond(record.speedMps)),
                    _kv('Heading', bearingDegrees(record.headingDeg)),
                    _kv('GPS accuracy', accuracyMetres(record.gpsAccuracyM)),
                    _kv('Recorded at', hhmmss(record.recordedAt)),
                  ]),
                  if (record.accelWindow.isNotEmpty)
                    _section('Impact trace', <Widget>[
                      _trace(record),
                    ]),
                  _section('Inference', <Widget>[
                    _severity(record),
                    _kv(
                      'Image confidence',
                      record.visionConfidence == null
                          ? 'not measured — the accelerometer fired alone'
                          : percent(record.visionConfidence!),
                    ),
                    _kv('Coordinates', formatCoordinate(record.lat, record.lng)),
                  ]),
                  _section('Record', <Widget>[
                    _kv('Upload', entry.upload.label),
                    _kv('Detection', record.id),
                    _kv('Trip', record.tripId ?? 'no trip — not recording'),
                    _kv('Photo', _photoState(record)),
                  ]),
                  Padding(
                    padding: const EdgeInsets.fromLTRB(
                      BchSpace.s4,
                      BchSpace.s3,
                      BchSpace.s4,
                      BchSpace.s6,
                    ),
                    child: Text(
                      uploadHint(entry),
                      style: BchType.caption.copyWith(color: BchColor.ink45),
                    ),
                  ),
                ],
              ),
            ),
          ),
        ],
      ),
    );
  }

  // ─── Header ─────────────────────────────────────────────────────────────────

  Widget _header(BuildContext context) {
    return Container(
      height: BchFrame.headerH,
      color: BchColor.neutral100,
      padding: const EdgeInsets.only(left: BchSpace.s4, right: BchSpace.s2),
      child: Row(
        children: <Widget>[
          Expanded(
            child: Column(
              mainAxisAlignment: MainAxisAlignment.center,
              crossAxisAlignment: CrossAxisAlignment.start,
              children: <Widget>[
                const Text('EVIDENCE', style: BchType.panelLabel),
                const SizedBox(height: 2),
                Text(
                  '${hhmmss(entry.record.recordedAt)}  ${entry.ref}',
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: BchType.rowPrimary,
                ),
              ],
            ),
          ),
          const SizedBox(width: BchSpace.s2),
          StatusTag(
            entry.upload.label,
            muted: entry.upload != UploadState.uploaded,
          ),
          IconButton(
            onPressed: () => Navigator.of(context).pop(),
            icon: const Icon(Icons.close, size: 20, color: BchColor.ink72),
            tooltip: 'Close',
            visualDensity: VisualDensity.compact,
          ),
        ],
      ),
    );
  }

  // ─── The frame the detector fired on ────────────────────────────────────────

  Widget _photo(DetectionRecord record) {
    final bytes = record.photoBytes;
    if (bytes == null) {
      return Padding(
        padding: const EdgeInsets.all(BchSpace.s4),
        child: PlaceholderBox(
          message: record.photoUrl != null
              ? 'The frame has been uploaded and dropped from memory. It is in '
                  'the detections bucket.'
              : 'No frame was kept. The accelerometer fired without the camera '
                  'detector running.',
          height: 88,
        ),
      );
    }

    return Padding(
      padding: const EdgeInsets.all(BchSpace.s4),
      child: ClipRRect(
        borderRadius: BchRadius.mdAll,
        child: AspectRatio(
          aspectRatio: 4 / 3,
          child: Image.memory(bytes, fit: BoxFit.cover, gaplessPlayback: true),
        ),
      ),
    );
  }

  // ─── Sections ───────────────────────────────────────────────────────────────

  Widget _section(String label, List<Widget> children) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      mainAxisSize: MainAxisSize.min,
      children: <Widget>[
        const Hairline(),
        Padding(
          padding: const EdgeInsets.fromLTRB(
            BchSpace.s4,
            BchSpace.s3,
            BchSpace.s4,
            BchSpace.s3,
          ),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            mainAxisSize: MainAxisSize.min,
            children: <Widget>[
              PanelLabel(label),
              const SizedBox(height: BchSpace.s2),
              ...children,
            ],
          ),
        ),
      ],
    );
  }

  /// Label left, value right. The value wraps rather than truncating — a
  /// coordinate or a uuid that has been cut off is worse than one that is long.
  Widget _kv(String label, String value) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: BchSpace.s1),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: <Widget>[
          SizedBox(
            width: 132,
            child: Text(label, style: BchType.caption),
          ),
          const SizedBox(width: BchSpace.s2),
          Expanded(
            child: Text(
              value,
              textAlign: TextAlign.right,
              style: BchType.body.copyWith(color: BchColor.text),
            ),
          ),
        ],
      ),
    );
  }

  Widget _severity(DetectionRecord record) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: BchSpace.s1),
      child: Row(
        children: <Widget>[
          const SizedBox(
            width: 132,
            child: Text('Severity', style: BchType.caption),
          ),
          const SizedBox(width: BchSpace.s2),
          Expanded(
            child: Row(
              mainAxisAlignment: MainAxisAlignment.end,
              children: <Widget>[
                SeverityBar(severity: record.severity, mark: BchColor.accent),
                const SizedBox(width: BchSpace.s3),
                Text(
                  record.severity.toStringAsFixed(2),
                  style: BchType.rowNumeral.copyWith(color: BchColor.text),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }

  /// The second of vertical acceleration the severity was scored from. Drawn as
  /// an instrument: the samples as they arrived, scaled to their own peak, with
  /// the peak stated in words underneath so the shape is never the only reading.
  Widget _trace(DetectionRecord record) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      mainAxisSize: MainAxisSize.min,
      children: <Widget>[
        SizedBox(
          height: 56,
          width: double.infinity,
          child: RepaintBoundary(
            child: CustomPaint(painter: _TracePainter(record.accelWindow)),
          ),
        ),
        const SizedBox(height: BchSpace.s2),
        Text(
          '${plural(record.accelWindow.length, 'sample')} either side of the '
          'peak at ${accelerationMps2(record.accelPeakZ)}. Kept so severity can '
          'be scored again on the server without re-driving the road.',
          style: BchType.caption.copyWith(color: BchColor.ink45),
        ),
      ],
    );
  }

  String _photoState(DetectionRecord record) {
    if (record.photoUrl != null) return 'uploaded';
    if (record.photoBytes != null) return 'held on the phone';
    return 'none';
  }
}

/// The caveat, stated once. Shared with the inspector so the two never disagree.
String uploadHint(DetectionEntry entry) {
  switch (entry.upload) {
    case UploadState.uploaded:
      return 'Written to detections. The clustering trigger has placed it on a '
          'pothole; a second vehicle over the same spot confirms it.';
    case UploadState.failed:
      return 'Not written. The evidence is still on the phone; check the '
          'connection in settings and record again.';
    case UploadState.sending:
    case UploadState.queued:
      return 'Waiting for the network. Nothing is lost while the queue is behind.';
    case UploadState.local:
      if (entry.record.source == DetectionSource.camera) {
        return 'Camera only. Severity is estimated from the image, not measured '
            'from the impact. Held on the phone.';
      }
      return 'Held on the phone. Start recording, with Supabase configured, to '
          'write it.';
  }
}

class _TracePainter extends CustomPainter {
  const _TracePainter(this.samples);

  final List<double> samples;

  @override
  void paint(Canvas canvas, Size size) {
    if (size.isEmpty || samples.isEmpty) return;

    final midY = size.height / 2;
    canvas.drawLine(
      Offset(0, midY),
      Offset(size.width, midY),
      Paint()
        ..color = BchColor.ink12
        ..strokeWidth = 1,
    );

    var peak = 0.0;
    for (final v in samples) {
      final a = v.abs();
      if (a > peak) peak = a;
    }
    if (peak <= 0) return;

    // Scaled to the window's own peak, so the shape fills the box whatever the
    // impact was. The number under it carries the magnitude.
    final scale = (midY - 2) / peak;
    final step = samples.length == 1 ? 0.0 : size.width / (samples.length - 1);

    final path = Path();
    for (var i = 0; i < samples.length; i++) {
      final x = samples.length == 1 ? size.width / 2 : i * step;
      final y = midY - samples[i] * scale;
      if (i == 0) {
        path.moveTo(x, y);
      } else {
        path.lineTo(x, y);
      }
    }

    canvas.drawPath(
      path,
      Paint()
        ..color = BchColor.accent
        ..style = PaintingStyle.stroke
        ..strokeWidth = 1.5
        ..strokeJoin = StrokeJoin.round
        ..strokeCap = StrokeCap.round,
    );
  }

  @override
  bool shouldRepaint(covariant _TracePainter old) => old.samples != samples;
}
