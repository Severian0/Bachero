// The sensor console. The dashboard's frame, on a phone in a cradle: a header
// strip, the thing being watched, metric cells divided by hairlines, the queue,
// a fixed-height inspector, and one solid steel action in the footer bar.

import 'package:flutter/material.dart';

import '../config.dart';
import '../core/format.dart';
import '../core/geo.dart';
import '../detect/vision_detector.dart';
import '../session/session_controller.dart';
import '../session/settings.dart';
import '../theme/tokens.dart';
import 'detection_row.dart';
import 'evidence_sheet.dart';
import 'inspector.dart';
import 'preview_surface.dart';
import 'settings_sheet.dart';
import 'widgets/console_widgets.dart';

class ConsoleScreen extends StatefulWidget {
  const ConsoleScreen({super.key, required this.controller});

  final SessionController controller;

  @override
  State<ConsoleScreen> createState() => _ConsoleScreenState();
}

class _ConsoleScreenState extends State<ConsoleScreen> with WidgetsBindingObserver {
  SessionController get controller => widget.controller;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    super.dispose();
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    controller.handleLifecycle(state);
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: BchColor.bg,
      body: SafeArea(
        child: ListenableBuilder(
          listenable: Listenable.merge(<Listenable>[controller, controller.queue]),
          builder: (context, _) {
            return Column(
              // Header, hairlines, metric row and footer bar are all full-bleed.
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: <Widget>[
                _header(context),
                const Hairline(),
                Expanded(flex: 62, child: _preview(context)),
                const Hairline(),
                _metrics(),
                const Hairline(),
                _sources(),
                Padding(
                  padding: const EdgeInsets.only(
                    left: BchSpace.s4,
                    right: BchSpace.s4,
                    bottom: BchSpace.s2,
                  ),
                  child: AccelMeter(
                    level: controller.accelLevel,
                    threshold: controller.settings.accelThreshold,
                    active: controller.settings.accelDetector,
                  ),
                ),
                const Hairline(),
                _logHeader(),
                const Hairline(),
                Expanded(flex: 38, child: _log()),
                const Hairline(),
                Inspector(
                  entry: controller.selected,
                  rejection: controller.lastRejection,
                  benchMode: controller.settings.gating == GatingMode.bench,
                  onExpand: () {
                    final selected = controller.selected;
                    if (selected != null) {
                      showEvidenceSheet(context, selected);
                    }
                  },
                ),
                const Hairline(),
                _footer(context),
              ],
            );
          },
        ),
      ),
    );
  }

  // ─── Header ───────────────────────────────────────────────────────────────

  Widget _header(BuildContext context) {
    final pending = controller.pendingUploads;
    return Container(
      height: BchFrame.headerH,
      color: BchColor.neutral100,
      padding: const EdgeInsets.symmetric(horizontal: BchSpace.s4),
      child: Row(
        children: <Widget>[
          Container(
            width: 26,
            height: 26,
            decoration: BoxDecoration(
              border: Border.all(color: BchColor.accent, width: 1.5),
              borderRadius: BchRadius.mdAll,
            ),
          ),
          const SizedBox(width: BchSpace.s3),
          Expanded(
            child: Column(
              mainAxisAlignment: MainAxisAlignment.center,
              crossAxisAlignment: CrossAxisAlignment.start,
              children: <Widget>[
                const Text('BACHERO', style: BchType.consoleTitle),
                Text(
                  controller.vehicle.label,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: BchType.caption,
                ),
              ],
            ),
          ),
          if (pending > 0) ...<Widget>[
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
              decoration: const BoxDecoration(
                color: BchColor.accent100,
                borderRadius: BchRadius.lgAll,
              ),
              child: Text(
                '$pending queued',
                style: BchType.caption.copyWith(color: BchColor.accent800),
              ),
            ),
            const SizedBox(width: BchSpace.s2),
          ],
          IconButton(
            onPressed: () => _openSettings(context),
            icon: const Icon(Icons.tune, size: 20, color: BchColor.ink72),
            tooltip: 'Settings',
            visualDensity: VisualDensity.compact,
          ),
        ],
      ),
    );
  }

  Future<void> _openSettings(BuildContext context) async {
    await showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      backgroundColor: BchColor.bg,
      builder: (sheetContext) => SettingsSheet(
        controller: controller,
        // Close the sheet first: the road view is the thing being aimed at, and
        // leaving the sheet on the stack under it would send Back to the wrong
        // screen.
        onAim: () {
          Navigator.of(sheetContext).pop();
          _openRoadView(context, tuning: true);
        },
      ),
    );
  }

  // ─── Camera ───────────────────────────────────────────────────────────────

  Widget _preview(BuildContext context) {
    final camera = controller.camera;
    final ready = camera != null &&
        camera.value.isInitialized &&
        controller.cameraStatus == CameraStatus.ready;

    return Container(
      color: BchColor.neutral200,
      child: Stack(
        fit: StackFit.expand,
        children: <Widget>[
          // `camera != null` is repeated rather than folded into `ready` so the
          // analyser promotes it to non-null inside the branch.
          if (camera != null && ready)
            GestureDetector(
              onTap: () => _openRoadView(context),
              child: PreviewSurface(
                controller: controller,
                camera: camera,
                coordinate: _coordinate(),
              ),
            )
          else
            _cameraPlaceholder(context),
          Positioned(
            left: BchSpace.s3,
            top: BchSpace.s3,
            child: _chip(
              child: Row(
                mainAxisSize: MainAxisSize.min,
                children: <Widget>[
                  LiveDot(active: ready && controller.settings.cameraDetector),
                  const SizedBox(width: BchSpace.s2),
                  Text(
                    controller.cameraStatus.label,
                    style: BchType.caption.copyWith(color: BchColor.accent800),
                  ),
                ],
              ),
            ),
          ),
          if (ready)
            Positioned(
              left: BchSpace.s3,
              bottom: BchSpace.s3,
              child: ValueListenableBuilder<VisionFrameResult>(
                valueListenable: controller.vision,
                builder: (context, result, _) {
                  final tracking = result.tracks.where((t) => !t.fired).length;
                  final text = result.tooDark
                      ? 'Too dark to judge the road'
                      : '${plural(tracking, 'candidate')} tracking';
                  return _chip(
                    child: Text(
                      text,
                      style: BchType.caption.copyWith(color: BchColor.ink72),
                    ),
                  );
                },
              ),
            ),
          if (ready)
            Positioned(
              right: BchSpace.s3,
              bottom: BchSpace.s3,
              child: _chip(
                child: Text(
                  '${controller.processedFps.round()} frames/s analysed',
                  style: BchType.caption.copyWith(color: BchColor.ink72),
                ),
              ),
            ),
        ],
      ),
    );
  }

  /// Where the detection would be placed if one fired now. Printed at the
  /// margin beside a fired mark, the way the console prints a linked pin's
  /// coordinate.
  String? _coordinate() {
    final position = controller.lastPosition;
    if (position != null) {
      return formatCoordinate(position.latitude, position.longitude);
    }
    return controller.settings.gating == GatingMode.bench
        ? formatCoordinate(benchFallbackLat, benchFallbackLng)
        : null;
  }

  Future<void> _openRoadView(BuildContext context, {bool tuning = false}) {
    return Navigator.of(context).push<void>(
      MaterialPageRoute<void>(
        builder: (_) => RoadViewScreen(
          controller: controller,
          coordinate: _coordinate(),
          tuning: tuning,
        ),
      ),
    );
  }

  Widget _cameraPlaceholder(BuildContext context) {
    final status = controller.cameraStatus;
    final detail = switch (status) {
      CameraStatus.denied =>
        'Camera access was refused. Allow it for Bachero Sensor in Android '
            'settings, then reopen the app.',
      CameraStatus.unavailable =>
        controller.cameraError ?? 'No camera the app can use.',
      CameraStatus.starting => 'Starting the camera.',
      _ => 'The camera is not running.',
    };

    return Padding(
      padding: const EdgeInsets.all(BchSpace.s6),
      child: Column(
        mainAxisAlignment: MainAxisAlignment.center,
        crossAxisAlignment: CrossAxisAlignment.start,
        children: <Widget>[
          const PanelLabel('Road view'),
          const SizedBox(height: BchSpace.s3),
          Text(detail, style: BchType.body),
          const SizedBox(height: BchSpace.s4),
          SecondaryButton(
            label: 'Try the camera again',
            icon: Icons.refresh,
            onPressed: () => controller.start(),
          ),
        ],
      ),
    );
  }

  Widget _chip({required Widget child}) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: BchSpace.s3, vertical: 5),
      decoration: const BoxDecoration(
        color: BchColor.bg,
        borderRadius: BchRadius.mdAll,
        boxShadow: BchShadow.sm,
      ),
      child: child,
    );
  }

  // ─── Metrics ──────────────────────────────────────────────────────────────

  Widget _metrics() {
    return MetricRow(
      cells: <Widget>[
        MetricCell(
          value: '${controller.entries.length}',
          label: 'Detections',
        ),
        MetricCell(
          value: '${controller.uploadedCount}',
          label: 'Uploaded',
        ),
        MetricCell(
          value: controller.kmScanned.toStringAsFixed(1),
          unit: 'km',
          label: 'Scanned',
        ),
      ],
    );
  }

  // ─── Sources ──────────────────────────────────────────────────────────────

  Widget _sources() {
    final settings = controller.settings;
    return Padding(
      padding: const EdgeInsets.symmetric(
        horizontal: BchSpace.s4,
        vertical: BchSpace.s2,
      ),
      child: Row(
        children: <Widget>[
          Expanded(
            child: BchChip(
              label: 'Camera',
              selected: settings.cameraDetector,
              onTap: () {
                settings.cameraDetector = !settings.cameraDetector;
                controller.applySettings(settings);
              },
            ),
          ),
          const SizedBox(width: BchSpace.s2),
          Expanded(
            child: BchChip(
              label: 'Accelerometer',
              selected: settings.accelDetector,
              onTap: () {
                settings.accelDetector = !settings.accelDetector;
                controller.applySettings(settings);
              },
            ),
          ),
          const SizedBox(width: BchSpace.s2),
          Expanded(
            child: BchChip(
              label: settings.gating.label,
              selected: settings.gating == GatingMode.bench,
              onTap: () {
                settings.gating = settings.gating == GatingMode.bench
                    ? GatingMode.onRoad
                    : GatingMode.bench;
                controller.applySettings(settings);
              },
            ),
          ),
        ],
      ),
    );
  }

  // ─── Log ──────────────────────────────────────────────────────────────────

  Widget _logHeader() {
    final count = controller.entries.length;
    return Container(
      padding: const EdgeInsets.symmetric(
        horizontal: BchSpace.s4,
        vertical: BchSpace.s2,
      ),
      child: Row(
        children: <Widget>[
          Text(
            'Detection log',
            style: BchType.caption.copyWith(
              color: BchColor.text,
              fontWeight: FontWeight.w600,
            ),
          ),
          const Spacer(),
          Flexible(
            child: Text(
              count == 0 ? 'nothing yet' : '$count this session · newest first',
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
              textAlign: TextAlign.right,
              style: BchType.caption,
            ),
          ),
        ],
      ),
    );
  }

  Widget _log() {
    final entries = controller.entries;
    if (entries.isEmpty) {
      return Padding(
        padding: const EdgeInsets.all(BchSpace.s4),
        child: PlaceholderBox(
          message: controller.settings.cameraDetector
              ? 'No detections yet. The camera is watching the marked region for '
                  'dark, compact patches that hold across frames.'
              : 'No detections yet. The camera detector is off; only impacts will '
                  'be recorded.',
          height: double.infinity,
        ),
      );
    }

    return ListView.builder(
      padding: EdgeInsets.zero,
      itemCount: entries.length,
      itemBuilder: (context, index) {
        final entry = entries[index];
        return DetectionRow(
          entry: entry,
          selected: identical(entry, controller.selected),
          onTap: () => controller.select(
            identical(entry, controller.selected) ? null : entry,
          ),
        );
      },
    );
  }

  // ─── Footer ───────────────────────────────────────────────────────────────

  Widget _footer(BuildContext context) {
    final recording = controller.recording;
    final busy = recording == RecordingState.starting ||
        recording == RecordingState.stopping;
    final notice = controller.notice;

    return Container(
      height: BchFrame.footerH,
      padding: const EdgeInsets.symmetric(horizontal: BchSpace.s4),
      child: Row(
        children: <Widget>[
          Expanded(
            child: Column(
              mainAxisAlignment: MainAxisAlignment.center,
              crossAxisAlignment: CrossAxisAlignment.start,
              children: <Widget>[
                GestureDetector(
                  // A notice is stated once and dismissed by reading it.
                  onTap: notice == null ? null : controller.clearNotice,
                  behavior: HitTestBehavior.opaque,
                  child: Text(
                    notice ?? controller.statusLine,
                    maxLines: 2,
                    overflow: TextOverflow.ellipsis,
                    style: BchType.caption.copyWith(
                      color: notice != null ? BchColor.text : BchColor.ink58,
                    ),
                  ),
                ),
                if (controller.queue.lastError != null)
                  Text(
                    'Last upload error: ${controller.queue.lastError}',
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: BchType.caption.copyWith(color: BchColor.ink45),
                  ),
              ],
            ),
          ),
          const SizedBox(width: BchSpace.s3),
          PrimaryButton(
            label: controller.isRecording ? 'Stop recording' : 'Start recording',
            busy: busy,
            onPressed: busy
                ? null
                : () {
                    if (controller.isRecording) {
                      controller.stopRecording();
                    } else {
                      controller.startRecording();
                    }
                  },
          ),
        ],
      ),
    );
  }
}
