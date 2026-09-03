# Bachero sensor app

Flutter app, phone mounted in a vehicle. It watches the road through the **camera**
and feels it through the **accelerometer**, runs both detectors on-device, and
writes straight to Supabase with the anon key. Spec: `docs/ARCHITECTURE.md` §3;
design: `docs/design/DESIGN.md`.

Android is the target. The app is portrait-locked (see "Orientation" below).

---

## Run it

Flutter is not installed in this checkout, and the generated Android project is
not committed. From this directory:

```sh
flutter create . --project-name bachero_sensor --org uk.bachero --platforms android
flutter pub get
flutter run
```

`flutter create` does not overwrite files that already exist, so it leaves
`lib/`, `pubspec.yaml` and the hand-written
`android/app/src/main/AndroidManifest.xml` (which carries the camera, location
and internet permissions) alone and fills in the rest of `android/`.

With a backend to write to, pass it at build time:

```sh
flutter run \
  --dart-define=SUPABASE_URL=https://<project>.supabase.co \
  --dart-define=SUPABASE_ANON_KEY=<anon key>
```

Or leave them out and paste both into **Settings → Supabase** on the phone; the
in-app values override the compile-time ones and survive a restart. Without
either, everything still runs: detections are logged on the phone and the footer
says so.

Tests — the detectors are pure Dart over a greyscale grid, so they run with no
device attached:

```sh
flutter test
flutter analyze
```

## Seeing it detect

1. Open the app. The camera preview starts on its own; a **region of interest**
   is drawn over the road ahead as a trapezoid, with a dashed horizon across the
   top. Nothing above that line is ever analysed.
2. If you are testing at a desk or pointed at recorded footage, tap the **Bench**
   chip. The spec's discard rules — over 2 m/s, better than 20 m GPS accuracy —
   are what stop the app firing on a phone standing still, and Bench turns them
   off. Detections are still real; only the gate changes. With no GPS fix at all,
   Bench places them at Crew A's depot so they land where the demo map is looking
   — every one at the same point, so the trigger clusters them into a single
   pothole with a climbing `detection_count`. That demonstrates the clustering,
   not the map. Sit in a parked car with a fix if you want separate pins.
3. Point it at road. Dark, compact patches inside the region get a **hollow**
   rounded square while the detector is still following them, and turn **solid
   steel** with crosshair guides the moment one is called a pothole — the same
   suspected-then-confirmed language the console map uses.
4. Every detection lands in the log with its evidence line, and the fixed-height
   inspector below shows the measurement before the inference.
5. **Start recording** opens a trip, turns on the 1 Hz breadcrumb trail, keeps the
   screen awake, and sends everything to Supabase. Until then detections are held
   on the phone.

If nothing fires, the inspector says why — it names the discarded candidate and
the rule that discarded it. Sensitivity, the horizon and the region's centre are
all sliders in Settings, and they redraw live over the road.

## How the camera detector works

No model file and no network. On a stretch of carriageway the road at a given
distance has one brightness, and a pothole is a hole, so it holds a shadow and
reads as a compact dark blob against that brightness. In order:

| Step | What it does |
|---|---|
| Region of interest | A trapezoid over the road ahead. Sky, verge and oncoming traffic are never looked at. |
| Band statistics | The region is cut into horizontal bands, each with its own median and MAD. Tarmac twelve metres away is not the same grey as tarmac two metres away. A robust median stops a large blob dragging its own threshold down. |
| Threshold | Pixels more than *k*·σ **and** an absolute number of levels below the band median. |
| Components | 8-connected blobs, filtered on area, aspect, fill, whether they span the whole carriageway (a shadow, not a hole), and whether they are darker than the ring of road immediately around them. |
| Persistence | A blob must survive several frames, moving down the frame as the vehicle closes on it. This is what removes flicker, wipers and one-frame noise. |
| Near field | It fires only once the blob is well down the region, so the GPS fix at that moment is near the hole rather than fifteen metres short of it. |

Frames are downscaled to about 15,000 pixels and one in two is analysed, so a
frame costs well under a millisecond and the preview never drops.

**It will call some manhole covers and some tar patches potholes.** That is
expected: `suspected` means one vehicle and is not a claim, a second vehicle
never corroborates a shadow, and the dashboard has "Dismiss as false positive" —
which the demo script (§7 beat 5) already frames as a feature.

## How the accelerometer detector works

The phone is clamped at whatever angle the cradle allows, so "vertical" is not
the device's z axis. A one-second low pass over the raw acceleration vector
estimates gravity, which gives the world-vertical direction for free; each sample
is projected onto it and |g| subtracted. That removes gravity *and* road grade,
which is what the spec means by high-passing the vertical axis. A threshold
crossing only *arms* the detector — the peak is taken over the next 250 ms,
because the first sample over the line is rarely the biggest one — and there is a
1 s debounce after each firing.

`severity = clamp(peak / (a + b · speed), 0, 1)`, with `a = 2.0`, `b = 0.5` in
`lib/config.dart`. Fit them by driving over one known speed bump at two speeds.

## Where the two meet

A camera detection and an impact within 1.5 s are the same hole seen twice, so
they merge into one row: the source becomes "Camera and accelerometer", severity
is the stronger of the two readings, and the camera's frame becomes the
before-photo. The upload is held for that window so the merge happens before the
row is written; the recorded timestamp is still the moment it fired.

Every detection carries a real `accel_peak_z`, even one the camera fired alone —
a sub-threshold peak is evidence too, and the column is `NOT NULL`.

## What it writes

Exactly what `docs/ARCHITECTURE.md` §3 specifies, over plain HTTP with
`apikey` + `Authorization: Bearer <anon>`. Geography is EWKT, **longitude first**:
`SRID=4326;POINT(lng lat)`.

| When | Request |
|---|---|
| Start recording | `POST /rest/v1/trips` with `Prefer: return=representation` |
| Every ~5 s | `POST /rest/v1/vehicle_positions` (a batch of 1 Hz breadcrumbs) |
| On a camera detection | `POST /storage/v1/object/detections/{id}.jpg` — the id is generated on the phone so the path matches the row |
| On detection | `POST /rest/v1/detections` |
| Stop recording | `PATCH /rest/v1/trips?id=eq.{id}` with `ended_at` and `distance_m` |

Nothing else. The `BEFORE INSERT` trigger on `detections` does the clustering,
the corroboration and `pothole_id`.

Everything goes through an upload queue: one job at a time, in order, retried
with a backoff, counted in the header. A tunnel costs nothing; a crash loses the
queue, which is a deliberate limit for the MVP.

## The two phones

`lib/config.dart` hardcodes the two device/vehicle pairs from the seed block in
`supabase/migrations/20260901000000_init.sql`. **The two phones must not share a
pair** — confirmation needs a second *distinct vehicle* over the same hole, which
is beat 3 of the demo and the whole network-effect claim. Pick the pair in
Settings → Vehicle; it is locked while a trip is recording.

## Orientation

Portrait only, deliberately. Frames arrive from the image stream in *sensor*
orientation, which on nearly every Android phone is 90° from the preview, and the
region of interest is meaningless until they are rotated into the operator's
view. Locking the orientation keeps that one rotation honest, and a portrait
windscreen cradle sees further down the road anyway.

## Layout

```
lib/
  config.dart                  seeded UUIDs, detector constants, demo fallbacks
  core/geo.dart                EWKT (longitude first), haversine, coordinate text
  core/format.dart             units, times, plurals
  detect/frame_sampler.dart    CameraImage → small upright greyscale grid
  detect/vision_detector.dart  the camera detector — pure, testable
  detect/accel_detector.dart   the impact detector — pure, testable
  detect/frame_encoder.dart    YUV → JPEG on a background isolate
  data/models.dart             the two row shapes and their JSON
  data/supabase_rest.dart      PostgREST and Storage over http
  data/upload_queue.dart       ordered, retried, counted
  session/settings.dart        persisted; gating modes
  session/session_controller.dart  where all of it meets
  theme/                       the design tokens, transcribed
  ui/                          the console
test/detector_test.dart        synthetic road, no device needed
```

## Design

Tokens are transcribed from `dashboard/src/app/globals.css` into
`lib/theme/tokens.dart` — one accent (steel), no status palette, the 3.4px
spacing scale, 5/10/16 radii, 120/240/1200 ms motion, Inter bundled in
`assets/fonts/`. Status is carried by fill, weight and form, and always also by a
word: the log row's left marker repeats what its evidence line already says.

The one deviation is on the camera image itself, where ink at 5% is invisible
against a photograph, so the graticule and candidate outlines are the same steps
inverted. Chips and labels over the image still sit on `bg` with `shadow-sm`, as
in the mockup.

## Not built

- Durable queue across a crash, and background recording with the screen off.
- Device auth. `devices.api_token_hash` exists; the check belongs in an Edge
  Function, and RLS is wide open for the demo.
- A learned detector. The vision pipeline is deliberately model-free so it runs
  offline on any phone; a TFLite model would drop in behind `VisionDetector`'s
  interface without the rest of the app noticing.
