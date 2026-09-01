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

// Detector tuning (docs/ARCHITECTURE.md §3). Calibrate on a known speed bump.
const accelThresholdMps2 = 2.5;
const debounceMs = 1000;
const maxGpsAccuracyM = 20.0;
const minSpeedMps = 2.0;
const severityA = 2.0; // severity = clamp(peak_z / (a + b * speed), 0, 1)
const severityB = 0.5;
const breadcrumbBatchSeconds = 5;
