// Everything the operator can change, in the order they will want it: which
// phone this is, what the discard rules are, where the rows go, and how fussy
// the two detectors should be.
//
// Changes apply as they are made, because the region of interest is drawn live
// over the road and dragging a slider blind would be no use in a cradle.

import 'package:flutter/material.dart';

import '../config.dart';
import '../core/format.dart';
import '../session/session_controller.dart';
import '../session/settings.dart';
import '../theme/tokens.dart';
import 'widgets/console_widgets.dart';

class SettingsSheet extends StatefulWidget {
  const SettingsSheet({super.key, required this.controller, this.onAim});

  final SessionController controller;

  /// Closes the sheet and opens the road view with the tuning panel up. The
  /// region of interest cannot be aimed from here — the console preview crops
  /// away the part of the frame the horizon sits in.
  final VoidCallback? onAim;

  @override
  State<SettingsSheet> createState() => _SettingsSheetState();
}

class _SettingsSheetState extends State<SettingsSheet> {
  late final SensorSettings _settings = widget.controller.settings;
  late final TextEditingController _url =
      TextEditingController(text: _settings.supabaseUrlOverride);
  late final TextEditingController _key =
      TextEditingController(text: _settings.supabaseKeyOverride);

  String? _connectionResult;
  bool _checking = false;

  @override
  void dispose() {
    _url.dispose();
    _key.dispose();
    super.dispose();
  }

  void _apply() {
    widget.controller.applySettings(_settings);
    setState(() {});
  }

  Future<void> _check() async {
    setState(() {
      _checking = true;
      _connectionResult = null;
    });
    final result = await widget.controller.checkConnection();
    if (!mounted) return;
    setState(() {
      _checking = false;
      _connectionResult = result;
    });
  }

  @override
  Widget build(BuildContext context) {
    final media = MediaQuery.of(context);
    final recording = widget.controller.isRecording;

    return Padding(
      padding: EdgeInsets.only(bottom: media.viewInsets.bottom),
      child: ConstrainedBox(
        constraints: BoxConstraints(maxHeight: media.size.height * 0.88),
        child: SingleChildScrollView(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            mainAxisSize: MainAxisSize.min,
            children: <Widget>[
              _section('Vehicle', <Widget>[
                Row(
                  children: <Widget>[
                    for (var i = 0; i < demoVehicles.length; i++) ...<Widget>[
                      if (i > 0) const SizedBox(width: BchSpace.s2),
                      Expanded(
                        child: BchChip(
                          label: demoVehicles[i].label,
                          selected: _settings.vehicleIndex == i,
                          enabled: !recording,
                          onTap: () {
                            _settings.vehicleIndex = i;
                            _apply();
                          },
                        ),
                      ),
                    ],
                  ],
                ),
                const SizedBox(height: BchSpace.s2),
                Text(
                  recording
                      ? 'Locked while a trip is recording. Stop the trip to change it.'
                      : 'The two phones must not share a pair. Confirmation needs a '
                          'second distinct vehicle over the same hole.',
                  style: BchType.caption,
                ),
              ]),

              _section('Discard rules', <Widget>[
                Row(
                  children: <Widget>[
                    for (final mode in GatingMode.values) ...<Widget>[
                      if (mode.index > 0) const SizedBox(width: BchSpace.s2),
                      Expanded(
                        child: BchChip(
                          label: mode.label,
                          selected: _settings.gating == mode,
                          onTap: () {
                            _settings.gating = mode;
                            _apply();
                          },
                        ),
                      ),
                    ],
                  ],
                ),
                const SizedBox(height: BchSpace.s2),
                Text(_settings.gating.detail, style: BchType.caption),
              ]),

              _section('Camera detector', <Widget>[
                Row(
                  children: <Widget>[
                    Expanded(
                      child: Text(
                        'Horizon ${percent(_settings.horizonFrac)} · '
                        'centre ${percent(_settings.centerXFrac)} · '
                        'sensitivity ${percent(_settings.visionSensitivity)}',
                        style: BchType.body,
                      ),
                    ),
                    const SizedBox(width: BchSpace.s2),
                    SecondaryButton(
                      label: 'Aim in road view',
                      icon: Icons.crop_free,
                      onPressed: widget.onAim,
                    ),
                  ],
                ),
                const SizedBox(height: BchSpace.s2),
                // These are set over the uncropped frame, not here. The console
                // panel shows only the bottom of the frame, so the horizon line
                // sits above its crop and dragging a slider here moved a mark
                // that could not be seen.
                const Text(
                  'The region is aimed in the road view, where the whole frame '
                  'is drawn and the marked region moves as you drag. Raise the '
                  'horizon until no sky or verge is inside it.',
                  style: BchType.caption,
                ),
              ]),

              _section('Accelerometer detector', <Widget>[
                _slider(
                  label: 'Impact threshold',
                  value: _settings.accelThreshold,
                  min: 1.0,
                  max: 6.0,
                  readout: '${_settings.accelThreshold.toStringAsFixed(1)} m/s²',
                  onChanged: (v) {
                    _settings.accelThreshold = v;
                    _apply();
                  },
                ),
                const SizedBox(height: BchSpace.s2),
                const Text(
                  'Vertical acceleration with gravity removed. Calibrate on one '
                  'known speed bump at two speeds; 2.5 m/s² is the starting point.',
                  style: BchType.caption,
                ),
              ]),

              _section('Supabase', <Widget>[
                Row(
                  children: <Widget>[
                    Expanded(
                      child: Text(
                        _settings.uploadEnabled
                            ? 'Writing to ${_settings.supabase.host}'
                            : 'Detections are held on the phone',
                        style: BchType.body,
                      ),
                    ),
                    Switch(
                      value: _settings.uploadEnabled,
                      onChanged: (v) {
                        _settings.uploadEnabled = v;
                        _apply();
                      },
                    ),
                  ],
                ),
                const SizedBox(height: BchSpace.s3),
                _field(
                  label: 'Project URL',
                  hint: 'https://your-project.supabase.co',
                  controller: _url,
                  onChanged: (v) {
                    _settings.supabaseUrlOverride = v;
                    _apply();
                  },
                ),
                const SizedBox(height: BchSpace.s3),
                _field(
                  label: 'Anon key',
                  hint: 'eyJhbGciOi…',
                  controller: _key,
                  obscure: true,
                  onChanged: (v) {
                    _settings.supabaseKeyOverride = v;
                    _apply();
                  },
                ),
                const SizedBox(height: BchSpace.s3),
                Row(
                  children: <Widget>[
                    SecondaryButton(
                      label: _checking ? 'Checking' : 'Check connection',
                      icon: Icons.cloud_outlined,
                      onPressed: _checking ? null : _check,
                    ),
                    const SizedBox(width: BchSpace.s3),
                    Expanded(
                      child: Text(
                        _connectionResult ?? '',
                        maxLines: 3,
                        overflow: TextOverflow.ellipsis,
                        style: BchType.caption,
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: BchSpace.s2),
                const Text(
                  'Blank fields fall back to the values passed with --dart-define '
                  'at build time. RLS is wide open for the demo, so the anon key '
                  'is enough to write.',
                  style: BchType.caption,
                ),
              ]),

              Padding(
                padding: const EdgeInsets.all(BchSpace.s4),
                child: Row(
                  children: <Widget>[
                    Expanded(
                      child: Text(
                        'Device ${_settings.vehicle.deviceId.substring(0, 8)} · '
                        'vehicle ${_settings.vehicle.vehicleId.substring(0, 8)}',
                        style: BchType.caption,
                      ),
                    ),
                    SecondaryButton(
                      label: 'Close',
                      onPressed: () => Navigator.of(context).pop(),
                    ),
                  ],
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }

  Widget _section(String label, List<Widget> children) {
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(BchSpace.s4),
      decoration: const BoxDecoration(
        border: Border(bottom: BorderSide(color: BchColor.divider)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        mainAxisSize: MainAxisSize.min,
        children: <Widget>[
          PanelLabel(label),
          const SizedBox(height: BchSpace.s3),
          ...children,
        ],
      ),
    );
  }

  Widget _slider({
    required String label,
    required double value,
    required double min,
    required double max,
    required String readout,
    required ValueChanged<double> onChanged,
  }) {
    return Row(
      children: <Widget>[
        SizedBox(
          width: 118,
          child: Text(label, style: BchType.body),
        ),
        Expanded(
          child: Slider(
            value: value.clamp(min, max).toDouble(),
            min: min,
            max: max,
            onChanged: onChanged,
          ),
        ),
        SizedBox(
          width: 58,
          child: Text(
            readout,
            textAlign: TextAlign.right,
            style: BchType.rowSecondary,
          ),
        ),
      ],
    );
  }

  Widget _field({
    required String label,
    required String hint,
    required TextEditingController controller,
    required ValueChanged<String> onChanged,
    bool obscure = false,
  }) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      mainAxisSize: MainAxisSize.min,
      children: <Widget>[
        Text(label, style: BchType.caption),
        const SizedBox(height: 5),
        TextField(
          controller: controller,
          onChanged: onChanged,
          obscureText: obscure,
          autocorrect: false,
          enableSuggestions: false,
          style: BchType.body.copyWith(color: BchColor.text),
          decoration: InputDecoration(
            hintText: hint,
            hintStyle: BchType.body.copyWith(color: BchColor.ink38),
            isDense: true,
            filled: true,
            fillColor: BchColor.surface,
            contentPadding: const EdgeInsets.symmetric(horizontal: 10, vertical: 9),
            border: const OutlineInputBorder(
              borderRadius: BchRadius.mdAll,
              borderSide: BorderSide(color: BchColor.divider),
            ),
            enabledBorder: const OutlineInputBorder(
              borderRadius: BchRadius.mdAll,
              borderSide: BorderSide(color: BchColor.divider),
            ),
            focusedBorder: const OutlineInputBorder(
              borderRadius: BchRadius.mdAll,
              borderSide: BorderSide(color: BchColor.accent),
            ),
          ),
        ),
      ],
    );
  }
}
