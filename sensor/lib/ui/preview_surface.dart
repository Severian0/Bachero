// The camera image with the detector's overlay on exactly the same rectangle, so
// a marked blob sits over the thing it marked.
//
// A portrait 16:9 frame is far taller than the console's monitor panel, so the
// panel crops rather than letterboxes, anchored to the bottom of the frame. That
// is not an arbitrary choice: the detector only fires once a blob is past the
// near-field gate, which is the bottom third of the frame, so the compact panel
// shows every mark that can actually become a detection. Candidates still being
// followed further up the road are tracked off-panel — tap the panel for the
// whole frame.

import 'package:camera/camera.dart';
import 'package:flutter/material.dart';

import '../detect/vision_detector.dart';
import '../session/session_controller.dart';
import '../theme/tokens.dart';
import 'tuning_panel.dart';
import 'vision_overlay.dart';

class PreviewSurface extends StatelessWidget {
  const PreviewSurface({
    super.key,
    required this.controller,
    required this.camera,
    required this.coordinate,
    this.crop = true,
  });

  final SessionController controller;
  final CameraController camera;
  final String? coordinate;

  /// True fills the panel and crops the frame; false fits the whole frame in.
  final bool crop;

  @override
  Widget build(BuildContext context) {
    return LayoutBuilder(
      builder: (context, constraints) {
        final boxAspect = constraints.maxWidth / constraints.maxHeight;
        final previewAspect = controller.previewAspect;

        // Cover fills the box on the axis that would otherwise letterbox;
        // contain does the opposite.
        final fillByWidth = crop
            ? boxAspect > previewAspect
            : boxAspect <= previewAspect;

        final double width;
        final double height;
        if (fillByWidth) {
          width = constraints.maxWidth;
          height = width / previewAspect;
        } else {
          height = constraints.maxHeight;
          width = height * previewAspect;
        }

        return ClipRect(
          child: OverflowBox(
            alignment: crop ? Alignment.bottomCenter : Alignment.center,
            minWidth: width,
            maxWidth: width,
            minHeight: height,
            maxHeight: height,
            child: Stack(
              fit: StackFit.expand,
              children: <Widget>[
                CameraPreview(camera),
                ValueListenableBuilder<VisionFrameResult>(
                  valueListenable: controller.vision,
                  builder: (context, result, _) => VisionOverlay(
                    result: result,
                    roi: controller.visionRoi,
                    active: controller.settings.cameraDetector,
                    coordinate: coordinate,
                  ),
                ),
              ],
            ),
          ),
        );
      },
    );
  }
}

/// The whole frame, for aiming the cradle and for watching the detector work.
/// Nothing changes about the detection — this is the same stream, drawn larger.
///
/// This is also where the camera detector is tuned. The console panel crops to
/// the bottom of the frame, which is the right crop for watching marks fire but
/// puts the horizon line off-screen; the region can only be aimed against the
/// whole frame, so the controls live here rather than in the settings sheet.
class RoadViewScreen extends StatefulWidget {
  const RoadViewScreen({
    super.key,
    required this.controller,
    required this.coordinate,
    this.tuning = false,
  });

  final SessionController controller;
  final String? coordinate;

  /// Open with the tuning panel already up — how the settings sheet arrives.
  final bool tuning;

  @override
  State<RoadViewScreen> createState() => _RoadViewScreenState();
}

class _RoadViewScreenState extends State<RoadViewScreen> {
  late bool _tuning = widget.tuning;

  SessionController get controller => widget.controller;
  String? get coordinate => widget.coordinate;

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: BchColor.neutral900,
      body: SafeArea(
        child: ListenableBuilder(
          listenable: controller,
          builder: (context, _) {
            final camera = controller.camera;
            if (camera == null || !camera.value.isInitialized) {
              return Center(
                child: Padding(
                  padding: const EdgeInsets.all(BchSpace.s6),
                  child: Text(
                    controller.cameraStatus.label,
                    style: BchType.body.copyWith(color: BchColor.white70),
                  ),
                ),
              );
            }

            return Stack(
              fit: StackFit.expand,
              children: <Widget>[
                PreviewSurface(
                  controller: controller,
                  camera: camera,
                  coordinate: coordinate,
                  crop: false,
                ),
                Positioned(
                  left: BchSpace.s3,
                  top: BchSpace.s3,
                  child: _chip(
                    ValueListenableBuilder<VisionFrameResult>(
                      valueListenable: controller.vision,
                      builder: (context, result, _) => Text(
                        result.tooDark
                            ? 'Too dark to judge the road'
                            : 'Road ${result.roadMedian.round()} · '
                                '${result.candidateCount} in frame · '
                                '${controller.processedFps.round()} frames/s',
                        style: BchType.caption.copyWith(color: BchColor.ink72),
                      ),
                    ),
                  ),
                ),
                Positioned(
                  right: BchSpace.s3,
                  top: BchSpace.s3,
                  child: Material(
                    color: BchColor.bg,
                    borderRadius: BchRadius.lgAll,
                    child: InkWell(
                      borderRadius: BchRadius.lgAll,
                      onTap: () => Navigator.of(context).pop(),
                      child: const Padding(
                        padding: EdgeInsets.symmetric(
                          horizontal: BchSpace.s4,
                          vertical: BchSpace.s2,
                        ),
                        child: Text('Close road view', style: BchType.button),
                      ),
                    ),
                  ),
                ),
                Positioned(
                  left: BchSpace.s3,
                  right: BchSpace.s3,
                  bottom: BchSpace.s3,
                  child: _tuning
                      ? TuningPanel(
                          controller: controller,
                          onClose: () => setState(() => _tuning = false),
                        )
                      : Row(
                          children: <Widget>[
                            Expanded(
                              child: _chip(
                                Text(
                                  'Aim the cradle until the marked region holds '
                                  'road and no sky or verge.',
                                  style: BchType.caption
                                      .copyWith(color: BchColor.ink72),
                                ),
                              ),
                            ),
                            const SizedBox(width: BchSpace.s2),
                            Material(
                              color: BchColor.bg,
                              borderRadius: BchRadius.mdAll,
                              child: InkWell(
                                borderRadius: BchRadius.mdAll,
                                onTap: () => setState(() => _tuning = true),
                                child: const Padding(
                                  padding: EdgeInsets.symmetric(
                                    horizontal: BchSpace.s4,
                                    vertical: BchSpace.s3,
                                  ),
                                  child: Text(
                                    'Tune region',
                                    style: BchType.button,
                                  ),
                                ),
                              ),
                            ),
                          ],
                        ),
                ),
              ],
            );
          },
        ),
      ),
    );
  }

  Widget _chip(Widget child) => Container(
        padding: const EdgeInsets.symmetric(
          horizontal: BchSpace.s3,
          vertical: 5,
        ),
        decoration: const BoxDecoration(
          color: BchColor.bg,
          borderRadius: BchRadius.mdAll,
          boxShadow: BchShadow.sm,
        ),
        child: child,
      );
}
