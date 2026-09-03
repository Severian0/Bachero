// The camera detector's three controls, drawn over the road they act on.
//
// These used to live in the settings sheet, where they were unusable: the
// console preview crops to the bottom third of the frame — everything the
// near-field gate can actually fire on — so the horizon line, which sits
// between 0.28 and 0.68 of frame height, was always above the crop. Dragging
// the slider moved a line nobody could see. Here the frame is uncropped and the
// panel sits over it, so the trapezoid moves under your thumb.
//
// Changes apply on every frame of the drag. The controller applies the tuning
// immediately and debounces the write to disk.

import 'package:flutter/material.dart';

import '../core/format.dart';
import '../session/session_controller.dart';
import '../theme/tokens.dart';
import 'widgets/console_widgets.dart';

class TuningPanel extends StatelessWidget {
  const TuningPanel({
    super.key,
    required this.controller,
    required this.onClose,
  });

  final SessionController controller;
  final VoidCallback onClose;

  void _apply(void Function() change) {
    change();
    controller.applySettings(controller.settings);
  }

  @override
  Widget build(BuildContext context) {
    final settings = controller.settings;

    return Container(
      decoration: const BoxDecoration(
        color: BchColor.bg,
        borderRadius: BchRadius.mdAll,
        boxShadow: BchShadow.md,
      ),
      padding: const EdgeInsets.fromLTRB(
        BchSpace.s4,
        BchSpace.s3,
        BchSpace.s4,
        BchSpace.s3,
      ),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: <Widget>[
          PanelLabel(
            'Camera detector',
            trailing: GestureDetector(
              onTap: onClose,
              behavior: HitTestBehavior.opaque,
              child: Padding(
                padding: const EdgeInsets.only(left: BchSpace.s3),
                child: Text(
                  'Hide',
                  style: BchType.micro.copyWith(color: BchColor.accent),
                ),
              ),
            ),
          ),
          const SizedBox(height: BchSpace.s2),
          _slider(
            label: 'Horizon',
            value: settings.horizonFrac,
            min: 0.28,
            max: 0.68,
            readout: percent(settings.horizonFrac),
            onChanged: (v) => _apply(() => settings.horizonFrac = v),
          ),
          _slider(
            label: 'Region centre',
            value: settings.centerXFrac,
            min: 0.32,
            max: 0.68,
            readout: percent(settings.centerXFrac),
            onChanged: (v) => _apply(() => settings.centerXFrac = v),
          ),
          _slider(
            label: 'Sensitivity',
            value: settings.visionSensitivity,
            min: 0,
            max: 1,
            readout: percent(settings.visionSensitivity),
            onChanged: (v) => _apply(() => settings.visionSensitivity = v),
          ),
          const SizedBox(height: BchSpace.s1),
          Text(
            'Raise the horizon until no sky or verge is inside the marked '
            'region. Higher sensitivity catches more and calls more shadows '
            'potholes.',
            style: BchType.caption.copyWith(color: BchColor.ink58),
          ),
        ],
      ),
    );
  }

  /// Denser than the settings sheet's: this one sits over the road and must
  /// leave as much of it visible as it can.
  Widget _slider({
    required String label,
    required double value,
    required double min,
    required double max,
    required String readout,
    required ValueChanged<double> onChanged,
  }) {
    return SizedBox(
      height: 34,
      child: Row(
        children: <Widget>[
          SizedBox(
            width: 96,
            child: Text(label, style: BchType.caption),
          ),
          Expanded(
            child: SliderTheme(
              data: const SliderThemeData(
                trackHeight: 2,
                overlayShape: RoundSliderOverlayShape(overlayRadius: 14),
                thumbShape: RoundSliderThumbShape(enabledThumbRadius: 7),
                activeTrackColor: BchColor.accent,
                inactiveTrackColor: BchColor.ink12,
                thumbColor: BchColor.accent,
                overlayColor: BchColor.accent24,
              ),
              child: Slider(
                value: value.clamp(min, max).toDouble(),
                min: min,
                max: max,
                onChanged: onChanged,
              ),
            ),
          ),
          SizedBox(
            width: 42,
            child: Text(
              readout,
              textAlign: TextAlign.right,
              style: BchType.rowSecondary,
            ),
          ),
        ],
      ),
    );
  }
}
