// Numbers carry units and periods. Civil-service plain English, and nothing is
// abbreviated that a committee would have to ask about.

String two(int v) => v.toString().padLeft(2, '0');

String hhmmss(DateTime t) => '${two(t.hour)}:${two(t.minute)}:${two(t.second)}';

String hhmm(DateTime t) => '${two(t.hour)}:${two(t.minute)}';

/// "3 vehicles" / "1 vehicle" — measurement first, and never "1 vehicles".
String plural(int count, String singular, [String? pluralForm]) =>
    '$count ${count == 1 ? singular : (pluralForm ?? '${singular}s')}';

String metresPerSecond(double? v) =>
    v == null ? '— m/s' : '${v.toStringAsFixed(1)} m/s';

String accelerationMps2(double v) => '${v.abs().toStringAsFixed(1)} m/s²';

String accuracyMetres(double? v) => v == null ? '±— m' : '±${v.round()} m';

/// Compass bearing. Wrapped into 0–359 so a heading is never printed as 361°.
String bearingDegrees(double? v) =>
    v == null ? '—°' : '${(v.round() % 360 + 360) % 360}°';

String kilometres(double km) => '${km.toStringAsFixed(1)} km';

String percent(double zeroToOne) => '${(zeroToOne * 100).round()}%';
