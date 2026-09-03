// The console's parts, built from docs/design/mockup/console.html. Panels are
// separated by a single hairline, never by a gap and never by a shadow; elevation
// is reserved for things that overlap the camera image.

import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';

import '../../theme/tokens.dart';

/// The 11px uppercase label every panel carries, top-left inside the frame.
class PanelLabel extends StatelessWidget {
  const PanelLabel(this.text, {super.key, this.trailing});

  final String text;
  final Widget? trailing;

  @override
  Widget build(BuildContext context) {
    final label = Text(text.toUpperCase(), style: BchType.panelLabel);
    if (trailing == null) return label;
    return Row(
      crossAxisAlignment: CrossAxisAlignment.center,
      children: <Widget>[
        Expanded(child: label),
        trailing!,
      ],
    );
  }
}

class Hairline extends StatelessWidget {
  const Hairline({super.key, this.color = BchColor.divider});

  final Color color;

  // Full-bleed on purpose: panels are separated by a single rule, never by a gap.
  @override
  Widget build(BuildContext context) =>
      Container(height: 1, width: double.infinity, color: color);
}

class VerticalHairline extends StatelessWidget {
  const VerticalHairline({super.key, this.color = BchColor.divider});

  final Color color;

  @override
  Widget build(BuildContext context) => Container(width: 1, color: color);
}

/// A Condensed numeral over a micro label. Units are set separately at 55% ink so
/// the numeral column stays clean.
class MetricCell extends StatelessWidget {
  const MetricCell({
    super.key,
    required this.value,
    required this.label,
    this.unit,
  });

  final String value;
  final String label;
  final String? unit;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.all(BchSpace.s3),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        mainAxisSize: MainAxisSize.min,
        children: <Widget>[
          Row(
            crossAxisAlignment: CrossAxisAlignment.baseline,
            textBaseline: TextBaseline.alphabetic,
            children: <Widget>[
              Flexible(
                child: Text(
                  value,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: BchType.metric,
                ),
              ),
              if (unit != null) ...<Widget>[
                const SizedBox(width: BchSpace.s1),
                Text(unit!, style: BchType.caption),
              ],
            ],
          ),
          const SizedBox(height: BchSpace.s2),
          Text(
            label,
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
            style: BchType.metricLabel,
          ),
        ],
      ),
    );
  }
}

/// Equal-width metric cells divided by hairlines. Fixed height rather than
/// intrinsic, so a metric growing a digit never moves the panel below it.
class MetricRow extends StatelessWidget {
  const MetricRow({super.key, required this.cells, this.height = 78});

  final List<Widget> cells;
  final double height;

  @override
  Widget build(BuildContext context) {
    final children = <Widget>[];
    for (var i = 0; i < cells.length; i++) {
      if (i > 0) children.add(const VerticalHairline());
      children.add(Expanded(child: cells[i]));
    }
    return SizedBox(
      height: height,
      child: Row(crossAxisAlignment: CrossAxisAlignment.stretch, children: children),
    );
  }
}

/// Four segments filled from the left. Segmented rather than continuous so
/// severity reads as a measured grade, not a mood.
class SeverityBar extends StatelessWidget {
  const SeverityBar({super.key, required this.severity, required this.mark});

  final double severity;
  final Color mark;

  @override
  Widget build(BuildContext context) {
    final filled = (severity.clamp(0.0, 1.0) * 4).ceil().clamp(1, 4);
    return Row(
      mainAxisSize: MainAxisSize.min,
      children: List<Widget>.generate(4, (i) {
        return Container(
          width: 9,
          height: 5,
          margin: EdgeInsets.only(left: i == 0 ? 0 : 2),
          decoration: BoxDecoration(
            color: i < filled ? mark : BchColor.ink12,
            borderRadius: const BorderRadius.all(Radius.circular(2)),
          ),
        );
      }),
    );
  }
}

/// A pill that filters or switches. The count in its label is a filter, never a
/// decorative statistic.
class BchChip extends StatelessWidget {
  const BchChip({
    super.key,
    required this.label,
    required this.selected,
    required this.onTap,
    this.enabled = true,
  });

  final String label;
  final bool selected;
  final VoidCallback onTap;
  final bool enabled;

  @override
  Widget build(BuildContext context) {
    return Opacity(
      opacity: enabled ? 1 : 0.45,
      child: GestureDetector(
        onTap: enabled ? onTap : null,
        behavior: HitTestBehavior.opaque,
        child: AnimatedContainer(
          duration: BchMotion.tint,
          curve: BchMotion.ease,
          padding: const EdgeInsets.symmetric(vertical: 7, horizontal: BchSpace.s2),
          decoration: BoxDecoration(
            color: selected ? BchColor.accent : Colors.transparent,
            border: Border.all(color: selected ? BchColor.accent : BchColor.divider),
            borderRadius: BchRadius.lgAll,
          ),
          child: Text(
            label,
            textAlign: TextAlign.center,
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
            style: BchType.chip.copyWith(
              color: selected ? BchColor.bg : BchColor.ink72,
            ),
          ),
        ),
      ),
    );
  }
}

/// The one solid steel object on screen.
class PrimaryButton extends StatelessWidget {
  const PrimaryButton({
    super.key,
    required this.label,
    required this.onPressed,
    this.busy = false,
  });

  final String label;
  final VoidCallback? onPressed;
  final bool busy;

  @override
  Widget build(BuildContext context) {
    final enabled = onPressed != null && !busy;
    return Opacity(
      opacity: enabled ? 1 : 0.45,
      child: Material(
        color: BchColor.accent,
        borderRadius: BchRadius.lgAll,
        child: InkWell(
          borderRadius: BchRadius.lgAll,
          onTap: enabled ? onPressed : null,
          child: Padding(
            padding: const EdgeInsets.symmetric(vertical: 11, horizontal: 18),
            child: Row(
              mainAxisSize: MainAxisSize.min,
              children: <Widget>[
                if (busy) ...<Widget>[
                  const SizedBox(
                    width: 12,
                    height: 12,
                    child: CircularProgressIndicator(
                      strokeWidth: 1.5,
                      valueColor: AlwaysStoppedAnimation<Color>(BchColor.bg),
                    ),
                  ),
                  const SizedBox(width: BchSpace.s2),
                ],
                Text(label, style: BchType.button.copyWith(color: BchColor.bg)),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

class SecondaryButton extends StatelessWidget {
  const SecondaryButton({
    super.key,
    required this.label,
    required this.onPressed,
    this.icon,
  });

  final String label;
  final VoidCallback? onPressed;
  final IconData? icon;

  @override
  Widget build(BuildContext context) {
    return Opacity(
      opacity: onPressed == null ? 0.45 : 1,
      child: Material(
        color: Colors.transparent,
        borderRadius: BchRadius.mdAll,
        child: InkWell(
          borderRadius: BchRadius.mdAll,
          onTap: onPressed,
          child: Container(
            padding: const EdgeInsets.symmetric(vertical: 8, horizontal: 12),
            decoration: const BoxDecoration(
              border: Border.fromBorderSide(BorderSide(color: BchColor.divider)),
              borderRadius: BchRadius.mdAll,
            ),
            child: Row(
              mainAxisSize: MainAxisSize.min,
              children: <Widget>[
                if (icon != null) ...<Widget>[
                  Icon(icon, size: 15, color: BchColor.ink72),
                  const SizedBox(width: BchSpace.s2),
                ],
                Text(label, style: BchType.button.copyWith(color: BchColor.text)),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

/// Status spelled out in an outlined pill. Status text is never abbreviated and
/// never carried by colour alone.
class StatusTag extends StatelessWidget {
  const StatusTag(this.text, {super.key, this.muted = false});

  final String text;
  final bool muted;

  @override
  Widget build(BuildContext context) {
    final color = muted ? BchColor.neutral500 : BchColor.accent;
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 3),
      decoration: BoxDecoration(
        border: Border.all(color: color),
        borderRadius: BchRadius.lgAll,
      ),
      child: Text(
        text,
        style: BchType.caption.copyWith(
          color: color,
          fontSize: 11,
          letterSpacing: 0.22,
        ),
      ),
    );
  }
}

/// The only looping animation in the product.
class LiveDot extends StatefulWidget {
  const LiveDot({super.key, this.active = true, this.color = BchColor.accent});

  final bool active;
  final Color color;

  @override
  State<LiveDot> createState() => _LiveDotState();
}

class _LiveDotState extends State<LiveDot> with SingleTickerProviderStateMixin {
  late final AnimationController _controller = AnimationController(
    vsync: this,
    duration: const Duration(milliseconds: 1200),
  );

  @override
  void initState() {
    super.initState();
    if (widget.active) _controller.repeat(reverse: true);
  }

  @override
  void didUpdateWidget(covariant LiveDot oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (widget.active && !_controller.isAnimating) {
      _controller.repeat(reverse: true);
    } else if (!widget.active && _controller.isAnimating) {
      _controller.stop();
      _controller.value = 1;
    }
  }

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return AnimatedBuilder(
      animation: _controller,
      builder: (context, _) {
        final opacity = widget.active ? 1 - _controller.value * 0.7 : 0.35;
        return Container(
          width: 7,
          height: 7,
          decoration: BoxDecoration(
            shape: BoxShape.circle,
            color: widget.color.withAlpha((opacity * 255).round()),
          ),
        );
      },
    );
  }
}

/// Vertical acceleration, live, with the firing threshold marked on both sides.
/// An instrument, not an animation: it draws the signal as it arrives, with no
/// transition of its own, so what it shows is what the detector is deciding on.
class AccelMeter extends StatelessWidget {
  const AccelMeter({
    super.key,
    required this.level,
    required this.threshold,
    required this.active,
  });

  final ValueListenable<double> level;

  /// m/s² at which the detector arms.
  final double threshold;

  final bool active;

  @override
  Widget build(BuildContext context) {
    return RepaintBoundary(
      child: CustomPaint(
        size: const Size(double.infinity, 12),
        painter: _AccelMeterPainter(
          level: level,
          threshold: threshold,
          active: active,
        ),
      ),
    );
  }
}

class _AccelMeterPainter extends CustomPainter {
  _AccelMeterPainter({
    required this.level,
    required this.threshold,
    required this.active,
  }) : super(repaint: level);

  final ValueListenable<double> level;
  final double threshold;
  final bool active;

  @override
  void paint(Canvas canvas, Size size) {
    if (size.isEmpty) return;
    final midX = size.width / 2;
    final midY = size.height / 2;

    canvas.drawLine(
      Offset(0, midY),
      Offset(size.width, midY),
      Paint()
        ..color = BchColor.ink7
        ..strokeWidth = 3,
    );

    // The threshold sits at 45% out from the centre, so a firing impact runs
    // visibly past its mark rather than pinning at the edge.
    final scale = threshold <= 0 ? 0.0 : (midX * 0.45) / threshold;
    for (final side in <double>[-1, 1]) {
      final x = midX + side * threshold * scale;
      canvas.drawLine(
        Offset(x, 1),
        Offset(x, size.height - 1),
        Paint()
          ..color = BchColor.accent40
          ..strokeWidth = 1,
      );
    }

    if (!active) return;

    final value = level.value;
    final extent = (value * scale).clamp(-midX, midX).toDouble();
    canvas.drawLine(
      Offset(midX, midY),
      Offset(midX + extent, midY),
      Paint()
        ..color = value.abs() >= threshold ? BchColor.accent : BchColor.ink38
        ..strokeWidth = 3
        ..strokeCap = StrokeCap.round,
    );
  }

  @override
  bool shouldRepaint(covariant _AccelMeterPainter old) =>
      old.threshold != threshold || old.active != active || old.level != level;
}

/// Pending data shows a hairline placeholder with the panel label still legible.
/// No skeleton shimmer.
class PlaceholderBox extends StatelessWidget {
  const PlaceholderBox({super.key, required this.message, this.height = 72});

  final String message;
  final double height;

  @override
  Widget build(BuildContext context) {
    return Container(
      height: height,
      alignment: Alignment.center,
      padding: const EdgeInsets.all(BchSpace.s4),
      decoration: const BoxDecoration(
        border: Border.fromBorderSide(BorderSide(color: BchColor.divider)),
        borderRadius: BchRadius.mdAll,
      ),
      child: Text(
        message,
        textAlign: TextAlign.center,
        style: BchType.caption,
      ),
    );
  }
}
