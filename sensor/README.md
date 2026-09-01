# Bachero sensor app

Flutter app, phone mounted in a vehicle. Accelerometer + GPS (+ camera). The detector runs on-device; the app writes straight to Supabase with the anon key. Spec: docs/ARCHITECTURE.md §3.

## Bootstrap

Flutter isn't installed in this checkout yet. From this directory:

```sh
flutter create . --project-name bachero_sensor --org uk.bachero --platforms android,ios
flutter pub add sensors_plus geolocator http uuid camera
```

`flutter create .` keeps the existing `lib/config.dart`.

## Detector (from docs/ARCHITECTURE.md §3)

- High-pass the vertical axis; fire when |z| exceeds ~2.5 m/s² (calibrate).
- 1 s debounce.
- Discard if GPS accuracy > 20 m or speed < 2 m/s.
- `severity = clamp(peak_z / (a + b · speed_mps), 0, 1)`; fit `a`, `b` on one known speed bump at two speeds.
- Keep ~1 s of raw vertical samples around the peak in `accel_window`.
- GPS breadcrumb every second, POSTed in batches every ~5 s.

## Requests

All PostgREST with `apikey` + `Authorization: Bearer <anon>`. Geography as EWKT, longitude first: `"SRID=4326;POINT(lng lat)"`. Generate the detection UUID on the phone so the photo path `detections/{id}.jpg` matches. See docs/ARCHITECTURE.md §3 for the table of endpoints and the detection body.
