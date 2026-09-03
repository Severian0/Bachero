// The one place the app's moving parts meet: camera frames, accelerometer
// samples, GPS fixes, the two detectors, the trip, and the upload queue.
//
// Everything a widget needs to draw comes off this object. The high-frequency
// signals — the vision result at about 15 Hz and the accelerometer trace at 50 Hz
// — are ValueNotifiers so the overlay and the meter can repaint without rebuilding
// the console around them.

import 'dart:async';
import 'dart:math' as math;

import 'package:camera/camera.dart';
import 'package:flutter/widgets.dart';
import 'package:geolocator/geolocator.dart';
import 'package:sensors_plus/sensors_plus.dart';
import 'package:uuid/uuid.dart';
import 'package:wakelock_plus/wakelock_plus.dart';

import '../config.dart';
import '../core/geo.dart';
import '../data/models.dart';
import '../data/supabase_rest.dart';
import '../data/upload_queue.dart';
import '../detect/accel_detector.dart';
import '../detect/frame_encoder.dart';
import '../detect/frame_sampler.dart';
import '../detect/vision_detector.dart';
import 'settings.dart';

enum CameraStatus {
  idle('Camera idle'),
  starting('Starting the camera'),
  ready('Watching the road'),
  denied('Camera access refused'),
  unavailable('No usable camera');

  const CameraStatus(this.label);
  final String label;
}

enum LocationStatus {
  unknown('Waiting for a fix'),
  denied('Location access refused'),
  serviceOff('Location services are off'),
  ready('Positioned');

  const LocationStatus(this.label);
  final String label;
}

enum RecordingState { idle, starting, recording, stopping }

/// One detection as the operator sees it: the row that will go to Postgres, plus
/// where it has got to and what it looked like on the way.
class DetectionEntry {
  DetectionEntry({required this.record, required this.ref, this.visionHit});

  final DetectionRecord record;

  /// A short, quotable reference — the same shape the console prints.
  final String ref;

  final VisionHit? visionHit;

  UploadState upload = UploadState.local;
  Future<void>? photoFuture;
  bool photoRequested = false;

  bool get hasPhoto => record.photoBytes != null || record.photoUrl != null;
}

/// A candidate that was thrown away, and why. Stated once, in the inspector,
/// so it is obvious when the discard rules are the reason nothing is happening.
class Rejection {
  const Rejection(this.reason, this.at, this.source);
  final RejectReason reason;
  final DateTime at;
  final DetectionSource source;
}

class SessionController extends ChangeNotifier {
  SessionController(this._settings) {
    _accel.tuning = AccelTuning(thresholdMps2: _settings.accelThreshold);
    _accel.onHit = _onAccelHit;
    _vision.tuning = const VisionTuning()
        .withSensitivity(_settings.visionSensitivity)
        .copyWith(horizonFrac: _settings.horizonFrac, centerXFrac: _settings.centerXFrac);
    _rebuildRest();
  }

  SensorSettings _settings;
  SensorSettings get settings => _settings;

  final AccelDetector _accel = AccelDetector();
  final VisionDetector _vision = VisionDetector();
  final FrameSampler _sampler = FrameSampler();
  final UploadQueue queue = UploadQueue();
  final Uuid _uuid = const Uuid();

  SupabaseRest? _rest;

  /// Repaints the camera overlay only.
  final ValueNotifier<VisionFrameResult> vision =
      ValueNotifier<VisionFrameResult>(VisionFrameResult.empty);

  /// Vertical acceleration, m/s², gravity removed. Drives the live meter.
  final ValueNotifier<double> accelLevel = ValueNotifier<double>(0);

  CameraController? camera;
  CameraStatus cameraStatus = CameraStatus.idle;
  String? cameraError;
  int _rotation = 90;

  LocationStatus locationStatus = LocationStatus.unknown;
  Position? lastPosition;

  RecordingState recording = RecordingState.idle;
  DateTime? startedAt;
  String? tripId;

  /// Stated in the footer when something needs saying. Plain English, once.
  String? notice;

  Rejection? lastRejection;

  final List<DetectionEntry> entries = <DetectionEntry>[];
  DetectionEntry? selected;

  double distanceM = 0;
  double processedFps = 0;

  StreamSubscription<AccelerometerEvent>? _accelSub;
  StreamSubscription<Position>? _posSub;
  Timer? _flushTimer;

  final List<Breadcrumb> _breadcrumbs = <Breadcrumb>[];
  DateTime? _lastBreadcrumbAt;
  Position? _lastDistanceFix;

  DetectionEntry? _photoWanted;
  int _detectionCounter = 0;
  int _accelTick = 0;
  DateTime? _lastProcessedAt;
  bool _disposed = false;

  // ─── Derived state for the console ────────────────────────────────────────

  bool get isRecording => recording == RecordingState.recording;
  bool get supabaseConfigured => _settings.supabase.isConfigured;
  bool get uploadsOn => _settings.uploadEnabled && supabaseConfigured;
  DemoVehicle get vehicle => _settings.vehicle;
  int get pendingUploads => queue.pending;

  /// Display aspect of the preview, width over height, portrait.
  double get previewAspect {
    final controller = camera;
    if (controller == null || !controller.value.isInitialized) return 9 / 16;
    final ratio = controller.value.aspectRatio;
    return ratio <= 0 ? 9 / 16 : 1 / ratio;
  }

  double get kmScanned => distanceM / 1000.0;

  /// The region of interest as normalised numbers, for the overlay.
  ({double top, double bottom, double topHalf, double bottomHalf, double centerX})
      get visionRoi => _vision.roi;

  int get uploadedCount =>
      entries.where((e) => e.upload == UploadState.uploaded).length;

  /// What the footer says the app is doing. Measurement, then inference.
  String get statusLine {
    if (cameraStatus == CameraStatus.denied) {
      return 'Camera access refused. Grant it in Android settings, then reopen the app.';
    }
    if (recording == RecordingState.starting) return 'Starting the trip';
    if (recording == RecordingState.stopping) return 'Ending the trip';
    if (isRecording) {
      final started = startedAt;
      final since = started == null ? '' : ' since ${_hhmm(started)}';
      return uploadsOn
          ? 'Recording$since · writing to ${_settings.supabase.host}'
          : 'Recording$since · held on the phone';
    }
    return supabaseConfigured
        ? 'Not recording. Detections are held on the phone.'
        : 'Not recording. Supabase is not configured; detections are held on the phone.';
  }

  // ─── Lifecycle ────────────────────────────────────────────────────────────

  Future<void> start() async {
    await _initCamera();
    await _initLocation();
    _initAccelerometer();
  }

  Future<void> _initCamera() async {
    // The retry button and a resume can both land here with a controller still
    // held; a second one on the same sensor fails on most devices.
    await _disposeCamera();
    _set(() {
      cameraStatus = CameraStatus.starting;
      cameraError = null;
    });
    try {
      final cameras = await availableCameras();
      if (cameras.isEmpty) {
        _set(() => cameraStatus = CameraStatus.unavailable);
        return;
      }
      final description = cameras.firstWhere(
        (c) => c.lensDirection == CameraLensDirection.back,
        orElse: () => cameras.first,
      );

      final controller = CameraController(
        description,
        ResolutionPreset.high,
        enableAudio: false,
        imageFormatGroup: ImageFormatGroup.yuv420,
      );
      await controller.initialize();
      if (_disposed) {
        await controller.dispose();
        return;
      }

      _rotation = description.sensorOrientation;
      camera = controller;
      await controller.startImageStream(_handleFrame);
      _set(() => cameraStatus = CameraStatus.ready);
    } on CameraException catch (error) {
      _set(() {
        cameraStatus = error.code == 'CameraAccessDenied' ||
                error.code == 'CameraAccessDeniedWithoutPrompt'
            ? CameraStatus.denied
            : CameraStatus.unavailable;
        cameraError = error.description ?? error.code;
      });
    } on Object catch (error) {
      _set(() {
        cameraStatus = CameraStatus.unavailable;
        cameraError = error.toString();
      });
    }
  }

  Future<void> _disposeCamera() async {
    final controller = camera;
    camera = null;
    if (controller == null) return;
    try {
      if (controller.value.isStreamingImages) await controller.stopImageStream();
    } on Object catch (_) {
      // Stopping a stream that has already gone is not worth reporting.
    }
    await controller.dispose();
  }

  Future<void> _initLocation() async {
    try {
      if (!await Geolocator.isLocationServiceEnabled()) {
        _set(() => locationStatus = LocationStatus.serviceOff);
        return;
      }
      var permission = await Geolocator.checkPermission();
      if (permission == LocationPermission.denied) {
        permission = await Geolocator.requestPermission();
      }
      if (permission == LocationPermission.denied ||
          permission == LocationPermission.deniedForever) {
        _set(() => locationStatus = LocationStatus.denied);
        return;
      }

      await _posSub?.cancel();
      _posSub = Geolocator.getPositionStream(
        locationSettings: const LocationSettings(
          accuracy: LocationAccuracy.bestForNavigation,
        ),
      ).listen(_onPosition, onError: (Object error) {
        debugPrint('Bachero: position stream error. $error');
      });
    } on Object catch (error) {
      debugPrint('Bachero: location unavailable. $error');
      _set(() => locationStatus = LocationStatus.denied);
    }
  }

  void _initAccelerometer() {
    _accelSub?.cancel();
    _accelSub = accelerometerEventStream(
      samplingPeriod: SensorInterval.gameInterval,
    ).listen((event) {
      _accel.addSample(event.x, event.y, event.z, DateTime.now());
      if (++_accelTick % 3 == 0) accelLevel.value = _accel.vertical;
    }, onError: (Object error) {
      debugPrint('Bachero: accelerometer unavailable. $error');
    });
  }

  /// Android tears the camera away when the app leaves the foreground.
  ///
  /// Deliberately not on `inactive`: that fires for the camera and location
  /// permission prompts too, and tearing the controller down underneath its own
  /// permission dialog is how the camera ends up dead on first run.
  Future<void> handleLifecycle(AppLifecycleState state) async {
    if (state == AppLifecycleState.paused || state == AppLifecycleState.hidden) {
      await _disposeCamera();
      _set(() => cameraStatus = CameraStatus.idle);
    } else if (state == AppLifecycleState.resumed && camera == null && !_disposed) {
      await _initCamera();
    }
  }

  // ─── Frames ───────────────────────────────────────────────────────────────

  void _handleFrame(CameraImage image) {
    if (_disposed) return;

    // A detection asked for a photograph; this is the next frame, so take it.
    final wanted = _photoWanted;
    if (wanted != null) {
      _photoWanted = null;
      _capturePhoto(image, wanted);
    }

    if (!_settings.cameraDetector) return;
    if (!_vision.shouldProcess()) return;

    try {
      final frame = _sampler.sample(image, _rotation);
      final result = _vision.analyse(frame, DateTime.now());
      vision.value = result;
      _tickFps();

      final hit = result.hit;
      if (hit != null) _onVisionHit(hit);
    } on Object catch (error) {
      debugPrint('Bachero: frame analysis failed. $error');
    }
  }

  void _capturePhoto(CameraImage image, DetectionEntry entry) {
    try {
      final raw = RawFrame.from(
        image,
        rotation: _rotation,
        longEdge: photoLongEdgePx,
        quality: photoQuality,
      );
      entry.photoFuture = encodeFrameJpeg(raw).then((bytes) {
        if (bytes == null || _disposed) return;
        entry.record.photoBytes = bytes;
        notifyListeners();
      }).catchError((Object error) {
        debugPrint('Bachero: photo encode failed. $error');
      });
    } on Object catch (error) {
      debugPrint('Bachero: could not copy the frame. $error');
    }
  }

  void _tickFps() {
    final now = DateTime.now();
    final previous = _lastProcessedAt;
    _lastProcessedAt = now;
    if (previous == null) return;
    final dt = now.difference(previous).inMicroseconds / 1e6;
    if (dt <= 0 || dt > 2) return;
    final instant = 1 / dt;
    processedFps = processedFps == 0 ? instant : processedFps + (instant - processedFps) * 0.15;
  }

  // ─── Positions ────────────────────────────────────────────────────────────

  void _onPosition(Position position) {
    lastPosition = position;
    if (locationStatus != LocationStatus.ready) locationStatus = LocationStatus.ready;

    if (isRecording) {
      final last = _lastBreadcrumbAt;
      if (last == null || DateTime.now().difference(last).inMilliseconds >= 900) {
        _lastBreadcrumbAt = DateTime.now();
        _breadcrumbs.add(Breadcrumb(
          recordedAt: position.timestamp,
          lat: position.latitude,
          lng: position.longitude,
          speedMps: position.speed,
          headingDeg: position.heading,
        ));

        final previous = _lastDistanceFix;
        if (previous != null && position.accuracy <= 30) {
          final step = haversineMetres(
            previous.latitude,
            previous.longitude,
            position.latitude,
            position.longitude,
          );
          // Ignore GPS jumps; a vehicle does not move 120 m in a second.
          if (step < 120) distanceM += step;
        }
        if (position.accuracy <= 30) _lastDistanceFix = position;
      }
    }
    notifyListeners();
  }

  void _flushBreadcrumbs() {
    if (_breadcrumbs.isEmpty) return;
    final trip = tripId;
    final batch = List<Breadcrumb>.of(_breadcrumbs);
    _breadcrumbs.clear();
    if (trip == null || !uploadsOn) return;
    queue.add(PositionsJob(
      batch: batch,
      tripId: trip,
      vehicleId: vehicle.vehicleId,
    ));
  }

  // ─── Detections ───────────────────────────────────────────────────────────

  void _onAccelHit(AccelHit hit) {
    if (!_settings.accelDetector) return;
    _fire(
      source: DetectionSource.accelerometer,
      at: hit.at,
      peakZ: hit.peakZ,
      window: hit.window,
    );
  }

  void _onVisionHit(VisionHit hit) {
    _fire(
      source: DetectionSource.camera,
      at: hit.at,
      // A camera detection still carries the real accelerometer reading from the
      // moment it fired. A sub-threshold peak is evidence too, and the column is
      // NOT NULL.
      peakZ: _accel.peakOver(const Duration(milliseconds: 700)),
      window: _accel.windowSamples(),
      hit: hit,
    );
  }

  void _fire({
    required DetectionSource source,
    required DateTime at,
    required double peakZ,
    required List<double> window,
    VisionHit? hit,
  }) {
    final position = lastPosition;
    final bench = _settings.gating == GatingMode.bench;

    final double lat;
    final double lng;
    double? accuracy;
    double? speed;
    double? heading;

    if (position != null) {
      lat = position.latitude;
      lng = position.longitude;
      accuracy = position.accuracy;
      speed = position.speed;
      heading = position.heading;
    } else if (bench) {
      lat = benchFallbackLat;
      lng = benchFallbackLng;
    } else {
      _reject(RejectReason.noFix, at, source);
      return;
    }

    if (!bench) {
      if ((accuracy ?? double.infinity) > maxGpsAccuracyM) {
        _reject(RejectReason.gpsTooCoarse, at, source);
        return;
      }
      if ((speed ?? 0) < minSpeedMps) {
        _reject(RejectReason.speedTooLow, at, source);
        return;
      }
    }

    final severity = _severityFor(peakZ, speed, hit);

    // One hole must not become three rows. Anything inside the merge window
    // joins the detection already on the log instead of starting a new one.
    final previous = entries.isEmpty ? null : entries.first;
    if (previous != null &&
        at.difference(previous.record.recordedAt).inMilliseconds.abs() < mergeWindowMs &&
        previous.upload != UploadState.uploaded &&
        previous.upload != UploadState.sending) {
      final record = previous.record;
      record.source = record.source.merge(source);
      if (peakZ.abs() > record.accelPeakZ.abs()) {
        record.accelPeakZ = peakZ;
        record.accelWindow = window;
      }
      if (severity > record.severity) record.severity = severity;
      if (hit != null) {
        record.visionConfidence =
            math.max(record.visionConfidence ?? 0, hit.confidence);
        if (!previous.photoRequested) {
          previous.photoRequested = true;
          _photoWanted = previous;
        }
      }
      lastRejection = null;
      notifyListeners();
      return;
    }

    final record = DetectionRecord(
      id: _uuid.v4(),
      recordedAt: at,
      lat: lat,
      lng: lng,
      gpsAccuracyM: accuracy,
      speedMps: speed,
      headingDeg: heading,
      accelPeakZ: peakZ,
      accelWindow: window,
      severity: severity,
      source: source,
      visionConfidence: hit?.confidence,
      tripId: tripId,
    );

    final entry = DetectionEntry(
      record: record,
      ref: 'BCH-${1040 + _detectionCounter * 7}',
      visionHit: hit,
    );
    _detectionCounter++;

    if (hit != null) {
      entry.photoRequested = true;
      _photoWanted = entry;
    }

    entries.insert(0, entry);
    if (entries.length > 120) entries.removeRange(120, entries.length);
    selected = entry;
    lastRejection = null;
    notifyListeners();

    _scheduleUpload(entry);
  }

  double _severityFor(double peakZ, double? speed, VisionHit? hit) {
    final fromImpact = severityFromPeak(peakZ, speed, _accel.tuning);
    if (hit == null) return fromImpact;
    // The camera cannot measure depth, so a vision-only severity is an estimate
    // and is labelled as one in the inspector.
    final fromImage = (0.15 + 0.7 * hit.confidence).clamp(0.0, 1.0).toDouble();
    return math.max(fromImpact, fromImage);
  }

  void _reject(RejectReason reason, DateTime at, DetectionSource source) {
    lastRejection = Rejection(reason, at, source);
    notifyListeners();
  }

  void _scheduleUpload(DetectionEntry entry) {
    Timer(const Duration(milliseconds: mergeWindowMs), () async {
      final future = entry.photoFuture;
      if (future != null) {
        try {
          await future.timeout(const Duration(milliseconds: 2500));
        } on Object catch (_) {
          // Post the evidence with no photograph rather than not at all.
        }
      }
      _enqueue(entry);
    });
  }

  void _enqueue(DetectionEntry entry) {
    if (_disposed) return;
    if (!uploadsOn) {
      entry.upload = UploadState.local;
      notifyListeners();
      return;
    }
    entry.record.tripId ??= tripId;
    queue.add(DetectionJob(
      record: entry.record,
      deviceId: vehicle.deviceId,
      vehicleId: vehicle.vehicleId,
      onState: (state) {
        entry.upload = state;
        if (!_disposed) notifyListeners();
      },
    ));
  }

  // ─── Trip ─────────────────────────────────────────────────────────────────

  Future<void> startRecording() async {
    if (recording != RecordingState.idle) return;
    _set(() {
      recording = RecordingState.starting;
      notice = null;
    });

    distanceM = 0;
    _breadcrumbs.clear();
    _lastDistanceFix = null;
    _lastBreadcrumbAt = null;
    _accel.reset();
    _vision.reset();

    if (uploadsOn) {
      try {
        tripId = await _rest!.createTrip(
          deviceId: vehicle.deviceId,
          vehicleId: vehicle.vehicleId,
        );
      } on Object catch (error) {
        tripId = null;
        notice = 'Could not open a trip. Detections will still be sent; '
            'the breadcrumb trail will not. ${_short(error)}';
      }
    }

    startedAt = DateTime.now();
    _flushTimer?.cancel();
    _flushTimer = Timer.periodic(
      const Duration(seconds: breadcrumbBatchSeconds),
      (_) => _flushBreadcrumbs(),
    );
    unawaited(WakelockPlus.enable());

    _set(() => recording = RecordingState.recording);
  }

  Future<void> stopRecording() async {
    if (recording != RecordingState.recording) return;
    _set(() => recording = RecordingState.stopping);

    _flushTimer?.cancel();
    _flushTimer = null;
    _flushBreadcrumbs();

    final trip = tripId;
    if (trip != null && uploadsOn) {
      queue.add(TripEndJob(tripId: trip, distanceM: distanceM));
    }
    tripId = null;
    unawaited(WakelockPlus.disable());

    _set(() => recording = RecordingState.idle);
  }

  // ─── Settings ─────────────────────────────────────────────────────────────

  /// Applied immediately, saved shortly after. A slider dragged over the live
  /// road view calls this on every frame of the drag, so the tuning has to take
  /// effect before the write to disk rather than behind it, and the HTTP client
  /// must not be torn down and rebuilt fifty times on the way past.
  Future<void> applySettings(SensorSettings next) async {
    _settings = next;
    _accel.tuning = AccelTuning(thresholdMps2: next.accelThreshold);
    _vision.tuning = const VisionTuning()
        .withSensitivity(next.visionSensitivity)
        .copyWith(horizonFrac: next.horizonFrac, centerXFrac: next.centerXFrac);
    _rebuildRest();
    notifyListeners();
    _scheduleSave();
  }

  /// The settings sheet mutates the controller's own settings object in place,
  /// so the incoming values cannot be compared against the outgoing ones. What
  /// was last handed to the queue is remembered here instead.
  String _appliedUrl = '';
  String _appliedKey = '';
  Timer? _saveTimer;

  void _rebuildRest() {
    final config = _settings.supabase;
    if (config.url == _appliedUrl && config.anonKey == _appliedKey) return;
    _appliedUrl = config.url;
    _appliedKey = config.anonKey;
    _rest?.close();
    _rest = config.isConfigured ? SupabaseRest(config) : null;
    queue.rest = _rest;
  }

  void _scheduleSave() {
    _saveTimer?.cancel();
    _saveTimer = Timer(const Duration(milliseconds: 400), () {
      unawaited(_settings.save());
    });
  }

  /// Confirm the key and the URL before the demo rather than during it.
  Future<String> checkConnection() async {
    final rest = _rest;
    if (rest == null) return 'Supabase is not configured.';
    try {
      await rest.ping();
      return 'Connected to ${_settings.supabase.host}.';
    } on Object catch (error) {
      return _short(error);
    }
  }

  void select(DetectionEntry? entry) {
    selected = entry;
    notifyListeners();
  }

  void clearNotice() {
    notice = null;
    notifyListeners();
  }

  // ─── Teardown ─────────────────────────────────────────────────────────────

  Future<void> shutdown() async {
    _disposed = true;
    _flushTimer?.cancel();
    if (_saveTimer?.isActive ?? false) {
      _saveTimer!.cancel();
      await _settings.save();
    }
    await _accelSub?.cancel();
    await _posSub?.cancel();
    await _disposeCamera();
    unawaited(WakelockPlus.disable());
    _rest?.close();
  }

  @override
  void dispose() {
    _disposed = true;
    _flushTimer?.cancel();
    // A pending debounce must not lose the last drag of a slider.
    if (_saveTimer?.isActive ?? false) {
      _saveTimer!.cancel();
      unawaited(_settings.save());
    }
    _accelSub?.cancel();
    _posSub?.cancel();
    queue.dispose();
    vision.dispose();
    accelLevel.dispose();
    super.dispose();
  }

  void _set(void Function() change) {
    change();
    if (!_disposed) notifyListeners();
  }

  static String _hhmm(DateTime t) =>
      '${t.hour.toString().padLeft(2, '0')}:${t.minute.toString().padLeft(2, '0')}';

  static String _short(Object error) {
    final text = error.toString();
    return text.length > 160 ? '${text.substring(0, 160)}…' : text;
  }
}
