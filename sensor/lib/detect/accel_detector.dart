// Accelerometer detector. docs/ARCHITECTURE.md §3.
//
// The phone is clamped to a windscreen at whatever angle the cradle allows, so
// "vertical" is not the device's z axis. We low-pass the raw acceleration vector
// to estimate gravity, which gives us the world-vertical direction for free, then
// project each sample onto it and subtract |g|. That removes gravity *and* road
// grade, which is what the spec means by high-passing the vertical axis. A second,
// gentler high-pass takes out the slow drift left by cornering and cradle flex.
//
// Firing is deliberately two-stage: the threshold crossing only arms the
// detector, and the peak is taken over the following window, because the first
// sample over the line is rarely the biggest one.

import 'dart:math' as math;
import 'dart:typed_data';

/// One accelerometer detection.
class AccelHit {
  const AccelHit({
    required this.at,
    required this.peakZ,
    required this.window,
  });

  /// When the threshold was crossed, not when the peak search finished.
  final DateTime at;

  /// Signed vertical acceleration at the peak, m/s², gravity removed.
  final double peakZ;

  /// About a second of vertical samples around the peak.
  final List<double> window;
}

class AccelTuning {
  const AccelTuning({
    this.thresholdMps2 = 2.5,
    this.debounce = const Duration(milliseconds: 1000),
    this.peakWindow = const Duration(milliseconds: 250),
    this.warmUp = const Duration(milliseconds: 1500),
    this.severityA = 2.0,
    this.severityB = 0.5,
  });

  /// |vertical acceleration| that arms the detector.
  final double thresholdMps2;

  /// One hole must not become three detections.
  final Duration debounce;

  /// How long to keep looking for a larger peak after arming.
  final Duration peakWindow;

  /// Gravity estimate needs a moment to settle before it can be trusted.
  final Duration warmUp;

  /// severity = clamp(peak / (a + b · speed), 0, 1). Fit on one speed bump at
  /// two speeds: the same hole hits harder at speed, so divide the speed out.
  final double severityA;
  final double severityB;

  AccelTuning copyWith({double? thresholdMps2}) => AccelTuning(
        thresholdMps2: thresholdMps2 ?? this.thresholdMps2,
        debounce: debounce,
        peakWindow: peakWindow,
        warmUp: warmUp,
        severityA: severityA,
        severityB: severityB,
      );
}

/// Speed-normalised severity in [0, 1]. Also used when the camera fires alone, so
/// that a vision detection's severity is on the same scale as an impact's.
double severityFromPeak(double peakZ, double? speedMps, AccelTuning t) {
  final speed = (speedMps ?? 0.0).clamp(0.0, 40.0).toDouble();
  final denominator = t.severityA + t.severityB * speed;
  if (denominator <= 0) return 0;
  return (peakZ.abs() / denominator).clamp(0.0, 1.0).toDouble();
}

class AccelDetector {
  AccelDetector({AccelTuning tuning = const AccelTuning()}) : _tuning = tuning;

  static const int _ringSize = 128;

  AccelTuning _tuning;
  AccelTuning get tuning => _tuning;
  set tuning(AccelTuning value) => _tuning = value;

  /// Emitted when a hole is felt. Set by the session controller.
  void Function(AccelHit hit)? onHit;

  final Float32List _ring = Float32List(_ringSize);
  int _ringHead = 0;
  int _ringCount = 0;

  // Low-passed gravity vector, and the low-passed vertical signal used as the
  // reference for the second high-pass stage.
  double _gx = 0, _gy = 0, _gz = 0;
  double _dcVertical = 0;
  bool _seeded = false;
  DateTime? _firstSampleAt;
  DateTime? _lastSampleAt;

  double _intervalMs = 20;

  bool _armed = false;
  DateTime? _armedAt;
  double _peak = 0;
  DateTime? _lastFireAt;

  /// Latest vertical acceleration, m/s², gravity removed. Drives the live trace.
  double get vertical => _ringCount == 0 ? 0 : _ring[(_ringHead - 1 + _ringSize) % _ringSize];

  /// True once the gravity estimate has settled and the detector can fire.
  bool get ready {
    final first = _firstSampleAt;
    if (!_seeded || first == null) return false;
    return DateTime.now().difference(first) >= _tuning.warmUp;
  }

  void reset() {
    _ringHead = 0;
    _ringCount = 0;
    _seeded = false;
    _firstSampleAt = null;
    _armed = false;
    _peak = 0;
    _lastFireAt = null;
  }

  /// Feed one raw accelerometer sample, gravity included, in m/s².
  void addSample(double x, double y, double z, DateTime at) {
    if (!_seeded) {
      _gx = x;
      _gy = y;
      _gz = z;
      _seeded = true;
      _firstSampleAt = at;
      _lastSampleAt = at;
      return;
    }

    final last = _lastSampleAt;
    if (last != null) {
      final dt = at.difference(last).inMicroseconds / 1000.0;
      if (dt > 0.5 && dt < 200) _intervalMs += (dt - _intervalMs) * 0.05;
    }
    _lastSampleAt = at;

    // Gravity: a one-second low pass. Slow enough that a pothole passes straight
    // through it, fast enough to follow the cradle being knocked.
    const gAlpha = 0.02;
    _gx += (x - _gx) * gAlpha;
    _gy += (y - _gy) * gAlpha;
    _gz += (z - _gz) * gAlpha;

    final gMag = math.sqrt(_gx * _gx + _gy * _gy + _gz * _gz);
    if (gMag < 1e-3) return;

    // Project onto the gravity direction and take out the 1 g bias.
    final vertical = (x * _gx + y * _gy + z * _gz) / gMag - gMag;

    // Second stage: remove whatever slow component survived.
    _dcVertical += (vertical - _dcVertical) * 0.02;
    final hp = vertical - _dcVertical;

    _ring[_ringHead] = hp;
    _ringHead = (_ringHead + 1) % _ringSize;
    if (_ringCount < _ringSize) _ringCount++;

    if (!ready) return;

    final magnitude = hp.abs();

    if (_armed) {
      if (magnitude > _peak.abs()) _peak = hp;
      final armedAt = _armedAt;
      if (armedAt != null && at.difference(armedAt) >= _tuning.peakWindow) {
        _armed = false;
        _lastFireAt = at;
        onHit?.call(AccelHit(at: armedAt, peakZ: _peak, window: windowSamples()));
      }
      return;
    }

    if (magnitude < _tuning.thresholdMps2) return;

    final lastFire = _lastFireAt;
    if (lastFire != null && at.difference(lastFire) < _tuning.debounce) return;

    _armed = true;
    _armedAt = at;
    _peak = hp;
  }

  /// The largest |vertical| seen in the recent past, signed. Read when the camera
  /// fires on its own, so the detection still carries a real accel_peak_z.
  double peakOver(Duration span) {
    if (_ringCount == 0) return 0;
    final wanted = math.max(1, (span.inMilliseconds / _intervalMs).round());
    final n = math.min(wanted, _ringCount);
    var best = 0.0;
    for (var i = 1; i <= n; i++) {
      final v = _ring[(_ringHead - i + _ringSize) % _ringSize];
      if (v.abs() > best.abs()) best = v;
    }
    return best;
  }

  /// About a second of vertical samples, oldest first, for `accel_window`.
  List<double> windowSamples({int maxSamples = 50}) {
    if (_ringCount == 0) return const <double>[];
    final wanted = math.max(1, (1000 / _intervalMs).round());
    final n = math.min(math.min(wanted, _ringCount), maxSamples);
    final out = List<double>.filled(n, 0);
    for (var i = 0; i < n; i++) {
      out[i] = _ring[(_ringHead - n + i + _ringSize) % _ringSize].toDouble();
    }
    return out;
  }

  /// The last `n` samples for the live trace in the inspector, oldest first.
  List<double> trace(int n) {
    final count = math.min(n, _ringCount);
    final out = List<double>.filled(count, 0);
    for (var i = 0; i < count; i++) {
      out[i] = _ring[(_ringHead - count + i + _ringSize) % _ringSize].toDouble();
    }
    return out;
  }
}
