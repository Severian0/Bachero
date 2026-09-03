// Vision detector. Finds potholes in the live camera stream, on-device, with no
// model file and no network.
//
// The idea it rests on: on a stretch of carriageway the road surface at a given
// distance has one brightness. A pothole is a hole, so it holds a shadow, and it
// reads as a compact dark blob against that brightness. Everything here is in
// service of "compact", "dark" and "against *that* brightness":
//
//   1. ROI          — a trapezoid over the road ahead. Nothing above the horizon
//                     or off the carriageway is looked at.
//   2. Band stats   — the ROI is cut into horizontal bands and each gets its own
//                     median and MAD, because tarmac twelve metres away is not the
//                     same grey as tarmac two metres away, and neither is under a
//                     bridge. A robust median means a large blob does not drag its
//                     own threshold down with it.
//   3. Threshold    — pixels more than k·σ *and* an absolute number of levels
//                     below the band median.
//   4. Components   — 8-connected blobs, filtered on area, aspect, fill, whether
//                     they span the whole carriageway (a shadow, not a hole), and
//                     whether they are actually darker than the ring of road
//                     immediately around them.
//   5. Persistence  — a blob must survive several frames, moving down the frame
//                     as the vehicle closes on it, before it is called a pothole.
//                     This is what removes flicker, wipers, and one-frame noise.
//   6. Near field   — it only fires once the blob is well down the ROI, so the GPS
//                     fix at that moment is close to the hole itself.
//
// It will call some manhole covers and some tar patches potholes. That is
// expected and is why the dashboard has "Dismiss as false positive"; a second
// vehicle never corroborates a shadow, so the clustering trigger filters the rest.

import 'dart:math' as math;
import 'dart:typed_data';

import 'frame_sampler.dart';

class VisionTuning {
  const VisionTuning({
    this.horizonFrac = 0.46,
    this.bottomFrac = 0.95,
    this.centerXFrac = 0.5,
    this.topHalfWidthFrac = 0.14,
    this.bottomHalfWidthFrac = 0.49,
    this.darkK = 2.2,
    this.minAbsContrast = 9,
    this.minLocalContrast = 7,
    this.minAreaFrac = 0.003,
    this.maxAreaFrac = 0.14,
    this.minFill = 0.42,
    this.minAspect = 0.30,
    this.maxAspect = 3.4,
    this.minHits = 3,
    this.minConfidence = 0.34,
    this.nearFieldFrac = 0.42,
    this.frameStride = 2,
  });

  /// Top of the ROI as a fraction of frame height — the horizon. Raise it if the
  /// phone points high and sky is being analysed.
  final double horizonFrac;

  /// Bottom of the ROI. Kept off 1.0 so the bonnet and the vehicle's own shadow
  /// stay out of the frame.
  final double bottomFrac;

  /// Nudge left or right when the cradle is not centred on the windscreen.
  final double centerXFrac;

  /// Half-width of the trapezoid at the horizon and at the bottom edge.
  final double topHalfWidthFrac;
  final double bottomHalfWidthFrac;

  /// A pixel is dark if it is this many robust standard deviations below its
  /// band's median.
  final double darkK;

  /// …and at least this many luma levels below it, whatever the noise says.
  final int minAbsContrast;

  /// A blob must also be this much darker than the ring of road around it. This
  /// is what separates a hole from a broad shading gradient.
  final int minLocalContrast;

  /// Blob area as a fraction of the ROI. Below the first it is noise, above the
  /// second it is a shadow, a puddle or the whole road in shade.
  final double minAreaFrac;
  final double maxAreaFrac;

  /// Blob area over bounding-box area. Potholes are blobby; sealant lines,
  /// expansion joints and kerb shadows are not.
  final double minFill;

  final double minAspect;
  final double maxAspect;

  /// Consecutive processed frames a blob must be tracked for before it fires.
  final int minHits;

  final double minConfidence;

  /// Fire only once the blob has travelled this far down the ROI, so the position
  /// recorded is near the hole rather than fifteen metres short of it.
  final double nearFieldFrac;

  /// Process one frame in this many. Two is about 15 Hz on a 30 fps stream.
  final int frameStride;

  VisionTuning copyWith({
    double? horizonFrac,
    double? centerXFrac,
    double? darkK,
    int? minHits,
    double? minConfidence,
    double? minAreaFrac,
  }) {
    return VisionTuning(
      horizonFrac: horizonFrac ?? this.horizonFrac,
      bottomFrac: bottomFrac,
      centerXFrac: centerXFrac ?? this.centerXFrac,
      topHalfWidthFrac: topHalfWidthFrac,
      bottomHalfWidthFrac: bottomHalfWidthFrac,
      darkK: darkK ?? this.darkK,
      minAbsContrast: minAbsContrast,
      minLocalContrast: minLocalContrast,
      minAreaFrac: minAreaFrac ?? this.minAreaFrac,
      maxAreaFrac: maxAreaFrac,
      minFill: minFill,
      minAspect: minAspect,
      maxAspect: maxAspect,
      minHits: minHits ?? this.minHits,
      minConfidence: minConfidence ?? this.minConfidence,
      nearFieldFrac: nearFieldFrac,
      frameStride: frameStride,
    );
  }

  /// Sensitivity as one number in [0, 1], for the settings sheet. Low is fussy,
  /// high catches more and calls more shadows potholes.
  double get sensitivity {
    final fromK = ((3.4 - darkK) / 2.2).clamp(0.0, 1.0).toDouble();
    final fromConf = ((0.62 - minConfidence) / 0.44).clamp(0.0, 1.0).toDouble();
    return ((fromK + fromConf) / 2).clamp(0.0, 1.0).toDouble();
  }

  VisionTuning withSensitivity(double s) {
    final v = s.clamp(0.0, 1.0).toDouble();
    return copyWith(
      darkK: 3.4 - 2.2 * v,
      minConfidence: 0.62 - 0.44 * v,
      minHits: v > 0.75 ? 2 : (v < 0.25 ? 4 : 3),
    );
  }
}

/// A dark blob that passed the shape filters on one frame.
class VisionBlob {
  const VisionBlob({
    required this.cx,
    required this.cy,
    required this.area,
    required this.minX,
    required this.maxX,
    required this.minY,
    required this.maxY,
    required this.meanValue,
    required this.localContrast,
    required this.confidence,
  });

  final double cx;
  final double cy;
  final int area;
  final int minX;
  final int maxX;
  final int minY;
  final int maxY;

  /// Mean luma of the blob, 0–255.
  final double meanValue;

  /// Luma levels darker than the ring of road around it.
  final double localContrast;

  final double confidence;
}

/// A blob followed across frames. Drawn hollow while it is only a candidate and
/// solid once it has fired — the same language the console uses for suspected
/// and confirmed potholes.
class VisionTrack {
  VisionTrack({
    required this.id,
    required this.blob,
    required this.firstSeen,
  })  : hits = 1,
        misses = 0,
        bestConfidence = blob.confidence,
        lastSeen = firstSeen;

  final int id;
  VisionBlob blob;
  int hits;
  int misses;
  double bestConfidence;
  bool fired = false;
  final DateTime firstSeen;
  DateTime lastSeen;

  double get cx => blob.cx;
  double get cy => blob.cy;
  double get confidence => blob.confidence;
}

/// A pothole seen. Rectangles are normalised to the frame, 0–1, in display
/// orientation, so the overlay can draw them without knowing the grid size.
class VisionHit {
  const VisionHit({
    required this.at,
    required this.confidence,
    required this.areaFrac,
    required this.left,
    required this.top,
    required this.right,
    required this.bottom,
    required this.hits,
  });

  final DateTime at;
  final double confidence;
  final double areaFrac;
  final double left;
  final double top;
  final double right;
  final double bottom;
  final int hits;

  double get centerX => (left + right) / 2;
  double get centerY => (top + bottom) / 2;
}

class VisionFrameResult {
  const VisionFrameResult({
    required this.gridWidth,
    required this.gridHeight,
    required this.tracks,
    required this.candidateCount,
    required this.roadMedian,
    required this.tooDark,
    required this.elapsedUs,
    this.hit,
  });

  final int gridWidth;
  final int gridHeight;
  final List<VisionTrack> tracks;
  final int candidateCount;

  /// Median luma of the road under the ROI, 0–255. Shown so the operator can see
  /// the detector has a road to look at.
  final double roadMedian;

  /// The scene is too dark to judge — dusk, a tunnel, or a lens against a seat.
  final bool tooDark;

  final int elapsedUs;
  final VisionHit? hit;

  static const empty = VisionFrameResult(
    gridWidth: 0,
    gridHeight: 0,
    tracks: <VisionTrack>[],
    candidateCount: 0,
    roadMedian: 0,
    tooDark: false,
    elapsedUs: 0,
  );
}

class VisionDetector {
  VisionDetector({VisionTuning tuning = const VisionTuning()}) : _tuning = tuning;

  VisionTuning _tuning;
  VisionTuning get tuning => _tuning;
  set tuning(VisionTuning value) {
    _tuning = value;
    _roiDirty = true;
  }

  int _gw = 0;
  int _gh = 0;
  bool _roiDirty = true;

  Uint8List _mask = Uint8List(0);
  Int32List _stack = Int32List(0);
  Int32List _xL = Int32List(0);
  Int32List _xR = Int32List(0);
  Float32List _rowThresh = Float32List(0);
  Float32List _rowMedian = Float32List(0);

  final Int32List _hist = Int32List(256);
  final Int32List _madHist = Int32List(256);

  int _roiTop = 0;
  int _roiBottom = 0;
  int _roiArea = 0;

  final List<VisionTrack> _tracks = <VisionTrack>[];
  int _nextTrackId = 1;
  int _frameCounter = 0;

  List<VisionTrack> get tracks => List.unmodifiable(_tracks);

  /// True on the frames the caller should hand to [analyse]. Keeps the stride in
  /// one place so the caller does not also have to remember it.
  bool shouldProcess() {
    _frameCounter++;
    return _frameCounter % math.max(1, _tuning.frameStride) == 0;
  }

  void reset() {
    _tracks.clear();
    _frameCounter = 0;
  }

  VisionFrameResult analyse(GrayFrame frame, DateTime now) {
    final watch = Stopwatch()..start();

    if (frame.width != _gw || frame.height != _gh) {
      _gw = frame.width;
      _gh = frame.height;
      _mask = Uint8List(_gw * _gh);
      _stack = Int32List(_gw * _gh);
      _xL = Int32List(_gh);
      _xR = Int32List(_gh);
      _rowThresh = Float32List(_gh);
      _rowMedian = Float32List(_gh);
      _tracks.clear();
      _roiDirty = true;
    }
    if (_roiDirty) {
      _buildRoi();
      _roiDirty = false;
    }

    final grid = frame.pixels;
    _mask.fillRange(0, _mask.length, 0);

    final roadMedian = _bandStatistics(grid);
    final tooDark = roadMedian < 22;

    if (tooDark) {
      _decayTracks();
      watch.stop();
      return VisionFrameResult(
        gridWidth: _gw,
        gridHeight: _gh,
        tracks: List.of(_tracks),
        candidateCount: 0,
        roadMedian: roadMedian,
        tooDark: true,
        elapsedUs: watch.elapsedMicroseconds,
      );
    }

    // Mark every pixel darker than its band's threshold.
    for (var y = _roiTop; y <= _roiBottom; y++) {
      final thr = _rowThresh[y];
      if (thr <= 0) continue;
      final row = y * _gw;
      final xr = _xR[y];
      for (var x = _xL[y]; x <= xr; x++) {
        if (grid[row + x] < thr) _mask[row + x] = 1;
      }
    }

    final blobs = _findBlobs(grid);
    final hit = _updateTracks(blobs, now);

    watch.stop();
    return VisionFrameResult(
      gridWidth: _gw,
      gridHeight: _gh,
      tracks: List.of(_tracks),
      candidateCount: blobs.length,
      roadMedian: roadMedian,
      tooDark: false,
      elapsedUs: watch.elapsedMicroseconds,
      hit: hit,
    );
  }

  // ─── ROI ──────────────────────────────────────────────────────────────────

  void _buildRoi() {
    final t = _tuning;
    _roiTop = (_gh * t.horizonFrac).round().clamp(0, _gh - 6).toInt();
    _roiBottom = (_gh * t.bottomFrac).round().clamp(_roiTop + 5, _gh - 1).toInt();

    final span = (_roiBottom - _roiTop).toDouble();
    final cx = _gw * t.centerXFrac;
    _roiArea = 0;

    for (var y = 0; y < _gh; y++) {
      if (y < _roiTop || y > _roiBottom) {
        _xL[y] = 1;
        _xR[y] = 0;
        continue;
      }
      final f = span <= 0 ? 1.0 : (y - _roiTop) / span;
      final half = _gw * (t.topHalfWidthFrac + (t.bottomHalfWidthFrac - t.topHalfWidthFrac) * f);
      final l = (cx - half).round().clamp(0, _gw - 1).toInt();
      final r = (cx + half).round().clamp(0, _gw - 1).toInt();
      _xL[y] = l;
      _xR[y] = r;
      if (r >= l) _roiArea += r - l + 1;
    }
    if (_roiArea <= 0) _roiArea = 1;
  }

  /// Normalised ROI outline, for the overlay. Left/right at the horizon and at
  /// the bottom, all 0–1 in display orientation.
  ({double top, double bottom, double topHalf, double bottomHalf, double centerX}) get roi => (
        top: _tuning.horizonFrac,
        bottom: _tuning.bottomFrac,
        topHalf: _tuning.topHalfWidthFrac,
        bottomHalf: _tuning.bottomHalfWidthFrac,
        centerX: _tuning.centerXFrac,
      );

  // ─── Band statistics ──────────────────────────────────────────────────────

  /// Per-band median and MAD, written into `_rowThresh` and `_rowMedian`.
  /// Returns the median of the band nearest the vehicle — the road's brightness
  /// where it can be seen best.
  double _bandStatistics(Uint8List grid) {
    const bandRows = 6;
    final t = _tuning;
    var nearest = 0.0;

    for (var y0 = _roiTop; y0 <= _roiBottom; y0 += bandRows) {
      final y1 = math.min(y0 + bandRows - 1, _roiBottom);

      _hist.fillRange(0, 256, 0);
      var count = 0;
      for (var y = y0; y <= y1; y++) {
        final row = y * _gw;
        final xr = _xR[y];
        for (var x = _xL[y]; x <= xr; x++) {
          _hist[grid[row + x]]++;
          count++;
        }
      }
      if (count < 24) {
        for (var y = y0; y <= y1; y++) {
          _rowThresh[y] = -1;
          _rowMedian[y] = 0;
        }
        continue;
      }

      final median = _percentile(_hist, count, 0.5);

      _madHist.fillRange(0, 256, 0);
      for (var y = y0; y <= y1; y++) {
        final row = y * _gw;
        final xr = _xR[y];
        for (var x = _xL[y]; x <= xr; x++) {
          _madHist[(grid[row + x] - median).abs()]++;
        }
      }
      final mad = _percentile(_madHist, count, 0.5);
      final sigma = (1.4826 * mad).clamp(3.0, 40.0).toDouble();

      final drop = math.max(t.darkK * sigma, t.minAbsContrast.toDouble());
      final thr = (median - drop).clamp(2.0, 250.0).toDouble();

      for (var y = y0; y <= y1; y++) {
        _rowThresh[y] = thr;
        _rowMedian[y] = median.toDouble();
      }
      nearest = median.toDouble();
    }
    return nearest;
  }

  static int _percentile(Int32List hist, int count, double p) {
    final target = (count * p).round().clamp(1, count).toInt();
    var acc = 0;
    for (var v = 0; v < 256; v++) {
      acc += hist[v];
      if (acc >= target) return v;
    }
    return 255;
  }

  // ─── Connected components ─────────────────────────────────────────────────

  List<VisionBlob> _findBlobs(Uint8List grid) {
    final t = _tuning;
    final out = <VisionBlob>[];

    final minArea = math.max(8, (_roiArea * t.minAreaFrac).round());
    final maxArea = (_roiArea * t.maxAreaFrac).round();
    final pad = math.max(2, (_gh * 0.018).round());

    for (var y = _roiTop; y <= _roiBottom; y++) {
      final row = y * _gw;
      final xr = _xR[y];
      for (var x = _xL[y]; x <= xr; x++) {
        final seed = row + x;
        if (_mask[seed] != 1) continue;

        var sp = 0;
        _stack[sp++] = seed;
        _mask[seed] = 2;

        var area = 0;
        var sumX = 0;
        var sumY = 0;
        var sumVal = 0;
        var minX = _gw, maxX = -1, minY = _gh, maxY = -1;

        while (sp > 0) {
          final p = _stack[--sp];
          final py = p ~/ _gw;
          final px = p - py * _gw;

          area++;
          sumX += px;
          sumY += py;
          sumVal += grid[p];
          if (px < minX) minX = px;
          if (px > maxX) maxX = px;
          if (py < minY) minY = py;
          if (py > maxY) maxY = py;

          for (var dy = -1; dy <= 1; dy++) {
            final ny = py + dy;
            if (ny < _roiTop || ny > _roiBottom) continue;
            final nrow = ny * _gw;
            final nxr = _xR[ny];
            final nxl = _xL[ny];
            for (var dx = -1; dx <= 1; dx++) {
              if (dx == 0 && dy == 0) continue;
              final nx = px + dx;
              if (nx < nxl || nx > nxr) continue;
              final q = nrow + nx;
              if (_mask[q] != 1) continue;
              _mask[q] = 2;
              _stack[sp++] = q;
            }
          }
        }

        if (area < minArea || area > maxArea) continue;

        final w = maxX - minX + 1;
        final h = maxY - minY + 1;
        if (w < 2 || h < 2) continue;

        final aspect = w / h;
        if (aspect < t.minAspect || aspect > t.maxAspect) continue;

        final fill = area / (w * h);
        if (fill < t.minFill) continue;

        final cx = sumX / area;
        final cy = sumY / area;
        final cyRow = cy.round().clamp(_roiTop, _roiBottom).toInt();

        // A dark band spanning the carriageway is a shadow, not a hole.
        final roadWidth = _xR[cyRow] - _xL[cyRow] + 1;
        if (w > roadWidth * 0.82) continue;

        final meanValue = sumVal / area;
        final localContrast = _ringContrast(grid, minX, maxX, minY, maxY, pad, meanValue);
        if (localContrast.isFinite && localContrast < t.minLocalContrast) continue;

        final bandMedian = _rowMedian[cyRow];
        if (bandMedian <= 0) continue;

        final deficit = bandMedian - meanValue;
        final contrastScore =
            ((deficit - t.minAbsContrast) / 42.0).clamp(0.0, 1.0).toDouble();
        final areaFrac = area / _roiArea;
        final sizeScore = math.sqrt((areaFrac / 0.02).clamp(0.0, 1.0));
        final shapeScore =
            0.5 + 0.5 * ((fill - t.minFill) / 0.4).clamp(0.0, 1.0).toDouble();
        final depth = ((cy - _roiTop) / math.max(1, _roiBottom - _roiTop))
            .clamp(0.0, 1.0)
            .toDouble();
        final depthWeight = 0.55 + 0.45 * depth;

        final confidence =
            ((0.5 * contrastScore + 0.3 * sizeScore + 0.2 * shapeScore) * depthWeight)
                .clamp(0.0, 1.0)
                .toDouble();

        out.add(VisionBlob(
          cx: cx,
          cy: cy,
          area: area,
          minX: minX,
          maxX: maxX,
          minY: minY,
          maxY: maxY,
          meanValue: meanValue,
          localContrast: localContrast,
          confidence: confidence,
        ));
      }
    }

    out.sort((a, b) => b.confidence.compareTo(a.confidence));
    return out;
  }

  /// Mean luma of the road immediately around a blob, minus the blob's own mean.
  /// Only background pixels count, so a neighbouring blob does not flatter it.
  /// Returns [double.infinity] when there is not enough road to compare against.
  double _ringContrast(
    Uint8List grid,
    int minX,
    int maxX,
    int minY,
    int maxY,
    int pad,
    double blobMean,
  ) {
    var sum = 0;
    var n = 0;
    final y0 = math.max(_roiTop, minY - pad);
    final y1 = math.min(_roiBottom, maxY + pad);
    for (var y = y0; y <= y1; y++) {
      final row = y * _gw;
      final x0 = math.max(_xL[y], minX - pad);
      final x1 = math.min(_xR[y], maxX + pad);
      final insideRows = y >= minY && y <= maxY;
      for (var x = x0; x <= x1; x++) {
        if (insideRows && x >= minX && x <= maxX) continue;
        final p = row + x;
        if (_mask[p] != 0) continue;
        sum += grid[p];
        n++;
      }
    }
    if (n < 20) return double.infinity;
    return sum / n - blobMean;
  }

  // ─── Tracking ─────────────────────────────────────────────────────────────

  VisionHit? _updateTracks(List<VisionBlob> blobs, DateTime now) {
    final t = _tuning;
    final span = math.max(1, _roiBottom - _roiTop).toDouble();
    final claimed = <int>{};

    for (final blob in blobs) {
      final depth = ((blob.cy - _roiTop) / span).clamp(0.0, 1.0).toDouble();
      final radius = (0.05 + 0.13 * depth) * _gh;

      VisionTrack? best;
      var bestDistance = double.infinity;
      for (var i = 0; i < _tracks.length; i++) {
        if (claimed.contains(i)) continue;
        final track = _tracks[i];
        // Blobs approach, so they move down the frame and grow; allow a little
        // upward slack for jitter but no more.
        if (blob.cy < track.cy - _gh * 0.03) continue;
        final dx = blob.cx - track.cx;
        final dy = blob.cy - track.cy;
        final d = math.sqrt(dx * dx + dy * dy);
        if (d < bestDistance && d <= radius) {
          bestDistance = d;
          best = track;
        }
      }

      if (best == null) {
        _tracks.add(VisionTrack(id: _nextTrackId++, blob: blob, firstSeen: now));
        claimed.add(_tracks.length - 1);
      } else {
        claimed.add(_tracks.indexOf(best));
        best.blob = blob;
        best.hits++;
        best.misses = 0;
        best.lastSeen = now;
        if (blob.confidence > best.bestConfidence) best.bestConfidence = blob.confidence;
      }
    }

    for (var i = 0; i < _tracks.length; i++) {
      if (!claimed.contains(i)) _tracks[i].misses++;
    }
    _tracks.removeWhere((track) => track.misses > 3);
    if (_tracks.length > 24) _tracks.removeRange(0, _tracks.length - 24);

    // One hit per frame: the strongest track that has earned it.
    VisionTrack? firing;
    for (final track in _tracks) {
      if (track.fired) continue;
      if (track.hits < t.minHits) continue;
      if (track.bestConfidence < t.minConfidence) continue;
      final depth = ((track.cy - _roiTop) / span).clamp(0.0, 1.0).toDouble();
      if (depth < t.nearFieldFrac) continue;
      if (firing == null || track.bestConfidence > firing.bestConfidence) firing = track;
    }
    if (firing == null) return null;

    firing.fired = true;
    final b = firing.blob;
    return VisionHit(
      at: now,
      confidence: firing.bestConfidence,
      areaFrac: b.area / _roiArea,
      left: b.minX / _gw,
      top: b.minY / _gh,
      right: (b.maxX + 1) / _gw,
      bottom: (b.maxY + 1) / _gh,
      hits: firing.hits,
    );
  }

  void _decayTracks() {
    for (final track in _tracks) {
      track.misses++;
    }
    _tracks.removeWhere((track) => track.misses > 3);
  }
}
