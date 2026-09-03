// A vehicle drives through places with no signal, and a detection lost to a dead
// spot is a pothole nobody repairs. Everything bound for Supabase goes through
// this queue: one job at a time, in order, retried with a backoff, and counted in
// the header so the operator can see the phone is behind rather than broken.
//
// Nothing here is durable across a restart. That is a deliberate limit for the
// MVP; the queue survives a tunnel, not a crash.

import 'dart:async';

import 'package:flutter/foundation.dart';

import '../config.dart';
import 'models.dart';
import 'supabase_rest.dart';

abstract class UploadJob {
  int attempts = 0;

  /// Give up after this many failures. Detections are worth more retries than
  /// breadcrumbs, which are only there to draw a line on a map.
  int get maxAttempts;

  String get describe;

  Future<void> run(SupabaseRest rest);

  void onGaveUp() {}
}

class DetectionJob extends UploadJob {
  DetectionJob({
    required this.record,
    required this.deviceId,
    required this.vehicleId,
    required this.onState,
  });

  final DetectionRecord record;
  final String deviceId;
  final String vehicleId;
  final void Function(UploadState state) onState;

  @override
  int get maxAttempts => 8;

  @override
  String get describe => 'Detection ${record.id.substring(0, 8)}';

  @override
  Future<void> run(SupabaseRest rest) async {
    onState(UploadState.sending);

    // The photo goes first so the row can carry its URL, but a photo that will
    // not upload must not hold back the evidence.
    final bytes = record.photoBytes;
    if (bytes != null && record.photoUrl == null) {
      try {
        // The bytes are kept, not dropped: the inspector shows the frame the
        // detector fired on, and `photoUrl` is what stops a second upload.
        record.photoUrl = await rest.uploadPhoto(record.id, bytes);
      } on Object catch (error) {
        debugPrint('Bachero: photo upload failed, posting without it. $error');
      }
    }

    await rest.postDetection(record, deviceId: deviceId, vehicleId: vehicleId);
    onState(UploadState.uploaded);
  }

  @override
  void onGaveUp() => onState(UploadState.failed);
}

class PositionsJob extends UploadJob {
  PositionsJob({
    required this.batch,
    required this.tripId,
    required this.vehicleId,
  });

  final List<Breadcrumb> batch;
  final String tripId;
  final String vehicleId;

  @override
  int get maxAttempts => 3;

  @override
  String get describe => '${batch.length} positions';

  @override
  Future<void> run(SupabaseRest rest) =>
      rest.postPositions(batch, tripId: tripId, vehicleId: vehicleId);
}

class TripEndJob extends UploadJob {
  TripEndJob({required this.tripId, required this.distanceM});

  final String tripId;
  final double distanceM;

  @override
  int get maxAttempts => 4;

  @override
  String get describe => 'Trip end';

  @override
  Future<void> run(SupabaseRest rest) => rest.endTrip(tripId, distanceM: distanceM);
}

class UploadQueue extends ChangeNotifier {
  UploadQueue({SupabaseRest? rest}) : _rest = rest;

  SupabaseRest? _rest;
  final List<UploadJob> _jobs = <UploadJob>[];
  bool _running = false;
  Timer? _retry;

  /// The last thing that went wrong, in plain English. Stated once; not repeated
  /// as a warning on every row.
  String? lastError;

  int get pending => _jobs.length;
  bool get isIdle => _jobs.isEmpty && !_running;

  set rest(SupabaseRest? value) {
    _rest = value;
    notifyListeners();
    if (value != null) unawaited(_pump());
  }

  SupabaseRest? get rest => _rest;

  void add(UploadJob job) {
    _jobs.add(job);
    if (job is DetectionJob) job.onState(UploadState.queued);
    notifyListeners();
    unawaited(_pump());
  }

  /// Try again now rather than waiting out the backoff.
  void retryNow() {
    _retry?.cancel();
    _retry = null;
    unawaited(_pump());
  }

  void clear() {
    _retry?.cancel();
    _retry = null;
    for (final job in _jobs) {
      job.onGaveUp();
    }
    _jobs.clear();
    notifyListeners();
  }

  Future<void> _pump() async {
    if (_running) return;
    final rest = _rest;
    if (rest == null || _jobs.isEmpty) return;

    _running = true;
    notifyListeners();

    while (_jobs.isNotEmpty) {
      final job = _jobs.first;
      try {
        await job.run(rest);
        _jobs.removeAt(0);
        lastError = null;
        notifyListeners();
      } on Object catch (error) {
        job.attempts++;
        lastError = error.toString();
        if (job.attempts >= job.maxAttempts) {
          _jobs.removeAt(0);
          job.onGaveUp();
          notifyListeners();
          continue;
        }
        _running = false;
        notifyListeners();
        _scheduleRetry(job.attempts);
        return;
      }
    }

    _running = false;
    notifyListeners();
  }

  void _scheduleRetry(int attempts) {
    _retry?.cancel();
    final index = (attempts - 1).clamp(0, uploadRetrySeconds.length - 1);
    _retry = Timer(Duration(seconds: uploadRetrySeconds[index]), () {
      _retry = null;
      unawaited(_pump());
    });
  }

  @override
  void dispose() {
    _retry?.cancel();
    super.dispose();
  }
}
