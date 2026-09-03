// Demo config. UUIDs match the seed block in supabase/migrations/20260901000000_init.sql.
// Each phone hardcodes ONE of the two device/vehicle pairs; confirmation needs a
// second distinct vehicle, so the two phones must not share a pair.

const supabaseUrl = String.fromEnvironment('SUPABASE_URL');
const supabaseAnonKey = String.fromEnvironment('SUPABASE_ANON_KEY');

class DemoVehicle {
  final String vehicleId;
  final String deviceId;
  final String label;
  const DemoVehicle(this.vehicleId, this.deviceId, this.label);
}

const phoneA = DemoVehicle(
  '00000000-0000-0000-0000-000000000002',
  '00000000-0000-0000-0000-000000000003',
  'Phone A (bus 24)',
);

const phoneB = DemoVehicle(
  '00000000-0000-0000-0000-000000000004',
  '00000000-0000-0000-0000-000000000005',
  'Phone B (bin round N)',
);

const demoVehicles = <DemoVehicle>[phoneA, phoneB];

// Detector tuning (docs/ARCHITECTURE.md §3). Calibrate on a known speed bump.
const accelThresholdMps2 = 2.5;
const debounceMs = 1000;
const maxGpsAccuracyM = 20.0;
const minSpeedMps = 2.0;
const severityA = 2.0; // severity = clamp(peak_z / (a + b * speed), 0, 1)
const severityB = 0.5;
const breadcrumbBatchSeconds = 5;

// ─── Beyond the original spec ────────────────────────────────────────────────

/// A camera detection and an accelerometer detection this close together are the
/// same hole seen twice. The upload is held for this long so the two can merge
/// before the row is written; the recorded timestamp is still the moment it fired.
const mergeWindowMs = 1500;

/// Storage bucket the detection photo goes into. Public, per the migration.
const photoBucket = 'detections';

/// Longest edge of the uploaded detection photo, in pixels. Small enough to post
/// over a phone connection in a moving vehicle, large enough to see the hole.
const photoLongEdgePx = 720;

/// JPEG quality for that photo.
const photoQuality = 78;

/// Retry backoff for the upload queue, in seconds, by attempt count.
const uploadRetrySeconds = <int>[2, 5, 15, 30, 60];

/// Where a bench-mode detection is placed when the phone has no fix at all —
/// indoors, pointed at road footage on a screen. This is Crew A's depot from the
/// seed block, so the pins land where the demo's map is already looking.
const benchFallbackLat = 51.4994;
const benchFallbackLng = -0.1246;
