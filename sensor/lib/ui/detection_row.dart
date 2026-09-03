// One detection in the log. The console's queue row, on a phone: a 3px left
// marker carrying the state, the time and reference, the evidence line, a
// segmented severity bar and the severity numeral right-aligned.
//
// The marker's weight repeats what the evidence line already says in words. No
// state is carried by colour alone.

import 'package:flutter/material.dart';

import '../core/format.dart';
import '../data/models.dart';
import '../session/session_controller.dart';
import '../theme/tokens.dart';
import 'widgets/console_widgets.dart';

Color markColour(UploadState state) => switch (state) {
      UploadState.uploaded => BchColor.accent,
      UploadState.sending => BchColor.accent400,
      UploadState.queued => BchColor.neutral400,
      UploadState.failed => BchColor.neutral600,
      UploadState.local => BchColor.neutral300,
    };

class DetectionRow extends StatelessWidget {
  const DetectionRow({
    super.key,
    required this.entry,
    required this.selected,
    required this.onTap,
  });

  final DetectionEntry entry;
  final bool selected;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final record = entry.record;
    final mark = markColour(entry.upload);

    final evidence = <String>[
      record.source.label,
      accelerationMps2(record.accelPeakZ),
      metresPerSecond(record.speedMps),
      entry.upload.label.toLowerCase(),
    ].join(' · ');

    return Material(
      color: selected ? BchColor.accent100 : Colors.transparent,
      child: InkWell(
        onTap: onTap,
        highlightColor: BchColor.ink5,
        splashColor: BchColor.ink7,
        child: AnimatedContainer(
          duration: BchMotion.tint,
          curve: BchMotion.ease,
          height: BchFrame.rowH,
          padding: const EdgeInsets.only(right: BchSpace.s4),
          decoration: BoxDecoration(
            border: Border(
              left: BorderSide(color: mark, width: 3),
              bottom: const BorderSide(color: BchColor.ink7),
            ),
          ),
          child: Row(
            children: <Widget>[
              const SizedBox(width: BchSpace.s4 - 3),
              Expanded(
                child: Column(
                  mainAxisAlignment: MainAxisAlignment.center,
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: <Widget>[
                    Row(
                      crossAxisAlignment: CrossAxisAlignment.baseline,
                      textBaseline: TextBaseline.alphabetic,
                      children: <Widget>[
                        Text(hhmmss(record.recordedAt), style: BchType.rowPrimary),
                        const SizedBox(width: BchSpace.s2),
                        Flexible(
                          child: Text(
                            entry.ref,
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
                            style: BchType.rowRef,
                          ),
                        ),
                        if (entry.hasPhoto) ...<Widget>[
                          const SizedBox(width: BchSpace.s2),
                          const Icon(Icons.photo_outlined, size: 12, color: BchColor.ink45),
                        ],
                      ],
                    ),
                    const SizedBox(height: 2),
                    Text(
                      evidence,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: BchType.rowSecondary,
                    ),
                  ],
                ),
              ),
              const SizedBox(width: BchSpace.s3),
              SeverityBar(severity: record.severity, mark: mark),
              const SizedBox(width: BchSpace.s3),
              SizedBox(
                width: 42,
                child: Text(
                  record.severity.toStringAsFixed(2),
                  textAlign: TextAlign.right,
                  style: BchType.rowNumeral.copyWith(
                    color: selected ? BchColor.accent800 : BchColor.ink72,
                  ),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
