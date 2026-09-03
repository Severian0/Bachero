// Wire shapes for the two tables this app writes to. Column names and types come
// straight from supabase/migrations/20260901000000_init.sql; keep them in sync.

import 'dart:typed_data';

import '../core/geo.dart';

/// What produced a detection. Recorded for the operator, not for the database —
/// `detections` has no column for it, so it lives in the app's own log and in the
/// evidence line the inspector prints.
enum DetectionSource {
  camera('Camera'),
  accelerometer('Accelerometer'),
  both('Camera and accelerometer');

  const DetectionSource(this.label);
  final String label;

  DetectionSource merge(DetectionSource other) =>
      this == other ? this : DetectionSource.both;
}

/// Why a candidate never became a detection. Shown once, in the inspector.
enum RejectReason {
  none(''),
  speedTooLow('Below 2 m/s — stationary jolts are doors and passengers'),
  gpsTooCoarse('GPS accuracy worse than 20 m'),
  noFix('No GPS fix yet'),
  debounced('Within 1 s of the previous detection');

  const RejectReason(this.label);
  final String label;
}

/// One row of `detections`, plus the app-side fields the table has no column for.
class DetectionRecord {
  DetectionRecord({
    required this.id,
    required this.recordedAt,
    required this.lat,
    required this.lng,
    required this.gpsAccuracyM,
    required this.speedMps,
    required this.headingDeg,
    required this.accelPeakZ,
    required this.accelWindow,
    required this.severity,
    required this.source,
    this.visionConfidence,
    this.tripId,
    this.photoUrl,
    this.photoBytes,
  });

  final String id;
  final DateTime recordedAt;
  final double lat;
  final double lng;
  final double? gpsAccuracyM;
  final double? speedMps;
  final double? headingDeg;

  /// Vertical acceleration peak in m/s², gravity removed. Always the real reading,
  /// even when the camera fired and the accelerometer did not — a sub-threshold
  /// peak is evidence too, and the column is NOT NULL.
  double accelPeakZ;

  /// ~1 s of vertical samples around the peak, so severity can be re-scored
  /// server-side later without re-driving the road.
  List<double> accelWindow;

  double severity;
  DetectionSource source;

  /// 0–1 from the vision detector. Null when the accelerometer fired alone.
  double? visionConfidence;

  String? tripId;
  String? photoUrl;

  /// Held in memory until the photo is uploaded, then dropped.
  Uint8List? photoBytes;

  Map<String, dynamic> toJson({
    required String deviceId,
    required String vehicleId,
  }) {
    return <String, dynamic>{
      'id': id,
      if (tripId != null) 'trip_id': tripId,
      'device_id': deviceId,
      'vehicle_id': vehicleId,
      'recorded_at': recordedAt.toUtc().toIso8601String(),
      'location': ewktPoint(lng, lat),
      'gps_accuracy_m': gpsAccuracyM,
      'speed_mps': speedMps,
      'heading_deg': headingDeg,
      'accel_peak_z': accelPeakZ,
      'accel_window': accelWindow.map((v) => double.parse(v.toStringAsFixed(3))).toList(),
      'severity': severity.clamp(0.0, 1.0),
      if (photoUrl != null) 'photo_url': photoUrl,
    };
  }
}

/// One row of `vehicle_positions`. Posted in batches of about five seconds.
class Breadcrumb {
  const Breadcrumb({
    required this.recordedAt,
    required this.lat,
    required this.lng,
    this.speedMps,
    this.headingDeg,
  });

  final DateTime recordedAt;
  final double lat;
  final double lng;
  final double? speedMps;
  final double? headingDeg;

  Map<String, dynamic> toJson({
    required String tripId,
    required String vehicleId,
  }) {
    return <String, dynamic>{
      'trip_id': tripId,
      'vehicle_id': vehicleId,
      'recorded_at': recordedAt.toUtc().toIso8601String(),
      'location': ewktPoint(lng, lat),
      'speed_mps': speedMps,
      'heading_deg': headingDeg,
    };
  }
}

/// Where a detection has got to on its way to Postgres. Spelled out in the row's
/// evidence line — the left marker's weight repeats it, never carries it alone.
enum UploadState {
  local('Held on the phone'),
  queued('Queued'),
  sending('Sending'),
  uploaded('Uploaded'),
  failed('Upload failed');

  const UploadState(this.label);
  final String label;
}
