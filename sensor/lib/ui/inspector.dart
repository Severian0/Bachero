// The fixed-height readout at the foot of the console. Fixed height on purpose:
// selecting a row must never move the layout underneath the thumb.
//
// Fixed height is not the same as truncated. What does not fit scrolls, and a
// tap opens the full evidence sheet — the panel holds its size, the reading is
// still complete.
//
// Uncertainty is stated once, here, and nowhere else. A camera-only detection
// says so; it does not repeat the caveat on every row.

import 'package:flutter/material.dart';

import '../core/format.dart';
import '../core/geo.dart';
import '../data/models.dart';
import '../session/session_controller.dart';
import '../theme/tokens.dart';
import 'evidence_sheet.dart';
import 'widgets/console_widgets.dart';

class Inspector extends StatelessWidget {
  const Inspector({
    super.key,
    required this.entry,
    required this.rejection,
    required this.benchMode,
    this.onExpand,
  });

  final DetectionEntry? entry;
  final Rejection? rejection;
  final bool benchMode;

  /// Opens the full evidence sheet. Null when there is nothing selected to open.
  final VoidCallback? onExpand;

  @override
  Widget build(BuildContext context) {
    final expandable = entry != null && onExpand != null;

    return GestureDetector(
      onTap: expandable ? onExpand : null,
      behavior: HitTestBehavior.opaque,
      child: Container(
        height: BchFrame.inspectorMinH,
        width: double.infinity,
        padding: const EdgeInsets.fromLTRB(
          BchSpace.s4,
          BchSpace.s3,
          BchSpace.s4,
          BchSpace.s3,
        ),
        color: BchColor.ink3,
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: <Widget>[
            PanelLabel(
              'Evidence',
              trailing: expandable
                  ? Row(
                      mainAxisSize: MainAxisSize.min,
                      children: <Widget>[
                        Text(
                          'All of it',
                          style: BchType.micro.copyWith(color: BchColor.accent),
                        ),
                        const Icon(
                          Icons.chevron_right,
                          size: 14,
                          color: BchColor.accent,
                        ),
                      ],
                    )
                  : null,
            ),
            const SizedBox(height: BchSpace.s2),
            // Scrolls rather than clips: the panel keeps its height, but a long
            // measurement line is still readable without opening the sheet.
            Expanded(
              child: SingleChildScrollView(
                physics: const ClampingScrollPhysics(),
                child: _body(context),
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _body(BuildContext context) {
    final selected = entry;
    if (selected == null) return _empty();

    final record = selected.record;
    final photo = record.photoBytes;

    return Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: <Widget>[
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            mainAxisSize: MainAxisSize.min,
            children: <Widget>[
              Row(
                crossAxisAlignment: CrossAxisAlignment.baseline,
                textBaseline: TextBaseline.alphabetic,
                children: <Widget>[
                  Expanded(
                    child: Text(
                      '${hhmmss(record.recordedAt)}  ${selected.ref}',
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: BchType.inspectorTitle,
                    ),
                  ),
                  const SizedBox(width: BchSpace.s2),
                  StatusTag(
                    selected.upload.label,
                    muted: selected.upload != UploadState.uploaded,
                  ),
                ],
              ),
              const SizedBox(height: BchSpace.s1),
              // No maxLines: a truncated measurement is a lost measurement.
              // These wrap, and the panel scrolls.
              Text(_measurements(record), style: BchType.body),
              Text(_inference(record), style: BchType.body),
              const SizedBox(height: BchSpace.s1),
              Text(
                uploadHint(selected),
                style: BchType.caption.copyWith(color: BchColor.ink45),
              ),
            ],
          ),
        ),
        if (photo != null) ...<Widget>[
          const SizedBox(width: BchSpace.s3),
          ClipRRect(
            borderRadius: BchRadius.smAll,
            child: Image.memory(
              photo,
              width: 62,
              height: 82,
              fit: BoxFit.cover,
              gaplessPlayback: true,
            ),
          ),
        ],
      ],
    );
  }

  /// Measurement first.
  String _measurements(DetectionRecord record) {
    return <String>[
      record.source.label,
      'peak ${accelerationMps2(record.accelPeakZ)}',
      metresPerSecond(record.speedMps),
      'GPS ${accuracyMetres(record.gpsAccuracyM)}',
    ].join(' · ');
  }

  /// Then the inference.
  String _inference(DetectionRecord record) {
    final confidence = record.visionConfidence;
    return <String>[
      'Severity ${record.severity.toStringAsFixed(2)}',
      if (confidence != null) 'image confidence ${percent(confidence)}',
      formatCoordinate(record.lat, record.lng),
    ].join(' · ');
  }

  Widget _empty() {
    final recent = rejection;
    if (recent != null &&
        DateTime.now().difference(recent.at) < const Duration(seconds: 8)) {
      return Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        mainAxisSize: MainAxisSize.min,
        children: <Widget>[
          const Text('Candidate discarded', style: BchType.inspectorTitle),
          const SizedBox(height: BchSpace.s1),
          Text(
            '${recent.source.label} at ${hhmmss(recent.at)}. ${recent.reason.label}.',
            style: BchType.body,
          ),
          const SizedBox(height: BchSpace.s1),
          Text(
            benchMode
                ? 'Bench mode is on, so this was not a speed or accuracy discard.'
                : 'Switch the gate to Bench to detect while stationary.',
            style: BchType.caption.copyWith(color: BchColor.ink45),
          ),
        ],
      );
    }

    return Text(
      benchMode
          ? 'Point the camera at the road. Dark, compact patches inside the marked '
              'region are tracked across frames; one that holds becomes a detection. '
              'Bench mode is on, so the speed and accuracy gates are off.'
          : 'Point the camera at the road and drive. Detections need more than '
              '2 m/s and better than 20 m GPS accuracy; stationary jolts are doors '
              'and passengers.',
      style: BchType.caption.copyWith(color: BchColor.ink45),
    );
  }
}
