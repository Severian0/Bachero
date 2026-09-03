// Everything the operator can change, and the one place it is written down.
// Persisted, because a phone that reboots in a van at 07:00 must come back as
// Phone B and not as Phone A.

import 'package:shared_preferences/shared_preferences.dart';

import '../config.dart';
import '../data/supabase_rest.dart';

/// How hard the app insists on the spec's discard rules.
enum GatingMode {
  /// docs/ARCHITECTURE.md §3: discard below 2 m/s or worse than 20 m accuracy.
  /// Stationary jolts are doors and passengers, not potholes.
  onRoad(
    'On road',
    'Discards anything below 2 m/s or worse than 20 m GPS accuracy',
  ),

  /// For testing at a desk, or pointed at recorded footage. Detections are still
  /// real; only the discard rules are relaxed. Position falls back to the depot
  /// when the phone has no fix.
  bench(
    'Bench',
    'No speed or accuracy gate. Uses the last fix, or the depot if there is none',
  );

  const GatingMode(this.label, this.detail);
  final String label;
  final String detail;
}

class SensorSettings {
  SensorSettings({
    this.vehicleIndex = 0,
    this.cameraDetector = true,
    this.accelDetector = true,
    this.uploadEnabled = true,
    this.gating = GatingMode.onRoad,
    this.accelThreshold = accelThresholdMps2,
    this.visionSensitivity = 0.5,
    this.horizonFrac = 0.46,
    this.centerXFrac = 0.5,
    this.supabaseUrlOverride = '',
    this.supabaseKeyOverride = '',
  });

  /// Index into [demoVehicles]. The two phones must not share one.
  int vehicleIndex;

  bool cameraDetector;
  bool accelDetector;

  /// Off means detect and log, write nothing. Useful before the backend is up.
  bool uploadEnabled;

  GatingMode gating;

  double accelThreshold;

  /// 0–1. Low is fussy, high catches more and calls more shadows potholes.
  double visionSensitivity;

  /// Top of the region of interest. Raise it if the cradle points high and the
  /// detector is looking at sky.
  double horizonFrac;

  /// Nudge the region of interest left or right for an off-centre cradle.
  double centerXFrac;

  /// Set in the app; overrides the --dart-define values when non-empty.
  String supabaseUrlOverride;
  String supabaseKeyOverride;

  DemoVehicle get vehicle =>
      demoVehicles[vehicleIndex.clamp(0, demoVehicles.length - 1).toInt()];

  SupabaseConfig get supabase {
    final url = supabaseUrlOverride.trim().isNotEmpty
        ? supabaseUrlOverride.trim()
        : SupabaseConfig.fromEnvironment.url;
    final key = supabaseKeyOverride.trim().isNotEmpty
        ? supabaseKeyOverride.trim()
        : SupabaseConfig.fromEnvironment.anonKey;
    return SupabaseConfig(url: url, anonKey: key);
  }

  static const _kVehicle = 'vehicle_index';
  static const _kCamera = 'camera_detector';
  static const _kAccel = 'accel_detector';
  static const _kUpload = 'upload_enabled';
  static const _kGating = 'gating_mode';
  static const _kThreshold = 'accel_threshold';
  static const _kSensitivity = 'vision_sensitivity';
  static const _kHorizon = 'horizon_frac';
  static const _kCenterX = 'center_x_frac';
  static const _kUrl = 'supabase_url';
  static const _kKey = 'supabase_key';

  static Future<SensorSettings> load() async {
    final prefs = await SharedPreferences.getInstance();
    return SensorSettings(
      vehicleIndex: prefs.getInt(_kVehicle) ?? 0,
      cameraDetector: prefs.getBool(_kCamera) ?? true,
      accelDetector: prefs.getBool(_kAccel) ?? true,
      uploadEnabled: prefs.getBool(_kUpload) ?? true,
      gating: GatingMode.values[(prefs.getInt(_kGating) ?? 0)
          .clamp(0, GatingMode.values.length - 1)
          .toInt()],
      accelThreshold: prefs.getDouble(_kThreshold) ?? accelThresholdMps2,
      visionSensitivity: prefs.getDouble(_kSensitivity) ?? 0.5,
      horizonFrac: prefs.getDouble(_kHorizon) ?? 0.46,
      centerXFrac: prefs.getDouble(_kCenterX) ?? 0.5,
      supabaseUrlOverride: prefs.getString(_kUrl) ?? '',
      supabaseKeyOverride: prefs.getString(_kKey) ?? '',
    );
  }

  Future<void> save() async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.setInt(_kVehicle, vehicleIndex);
    await prefs.setBool(_kCamera, cameraDetector);
    await prefs.setBool(_kAccel, accelDetector);
    await prefs.setBool(_kUpload, uploadEnabled);
    await prefs.setInt(_kGating, gating.index);
    await prefs.setDouble(_kThreshold, accelThreshold);
    await prefs.setDouble(_kSensitivity, visionSensitivity);
    await prefs.setDouble(_kHorizon, horizonFrac);
    await prefs.setDouble(_kCenterX, centerXFrac);
    await prefs.setString(_kUrl, supabaseUrlOverride);
    await prefs.setString(_kKey, supabaseKeyOverride);
  }
}
