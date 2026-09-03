// Bachero design tokens, transcribed from dashboard/src/app/globals.css.
// Spec: docs/design/DESIGN.md. Never hard-code a colour, size, radius, shadow or
// duration in a widget — take it from here, exactly as the web app takes it from
// var(--…). Light theme only; there is no dark mode.
//
// Ink steps are written as explicit ARGB constants rather than computed with
// withOpacity/withValues so they are const and stable across Flutter versions.

import 'package:flutter/widgets.dart';

/// Colour. One accent (steel). No red/amber/green status palette — status is
/// carried by fill, weight and form, and always also by a word.
abstract final class BchColor {
  static const bg = Color(0xFFF2F2F3);
  static const surface = Color(0xFFE9E9EA);
  static const text = Color(0xFF1D1F20);
  static const accent = Color(0xFF5980A6);

  static const accent100 = Color(0xFFEEF6FF);
  static const accent200 = Color(0xFFD6EBFF);
  static const accent300 = Color(0xFFB5D9FD);
  static const accent400 = Color(0xFF94BCE3);
  static const accent500 = Color(0xFF749DC4);
  static const accent600 = Color(0xFF597EA3);
  static const accent700 = Color(0xFF416180);
  static const accent800 = Color(0xFF2C455D);
  static const accent900 = Color(0xFF1D2D3D);

  static const neutral100 = Color(0xFFF5F5F8);
  static const neutral200 = Color(0xFFE7E7EA);
  static const neutral300 = Color(0xFFD4D4D7);
  static const neutral400 = Color(0xFFB7B7BA);
  static const neutral500 = Color(0xFF98989B);
  static const neutral600 = Color(0xFF7A7A7D);
  static const neutral700 = Color(0xFF5D5D60);
  static const neutral800 = Color(0xFF424244);
  static const neutral900 = Color(0xFF2B2B2D);

  /// Ink at the fixed opacities used throughout the mockup.
  static const ink72 = Color(0xB81D1F20);
  static const ink58 = Color(0x941D1F20);
  static const ink55 = Color(0x8C1D1F20);
  static const ink45 = Color(0x731D1F20);
  static const ink38 = Color(0x611D1F20);
  static const ink12 = Color(0x1F1D1F20);
  static const ink7 = Color(0x121D1F20);
  static const ink5 = Color(0x0D1D1F20);
  static const ink3 = Color(0x081D1F20);

  /// Hairlines. Everything is separated by one of these, never by a gap.
  static const divider = Color(0x291D1F20); // ink 16%

  /// Steel at partial strength — guides, washes and the fired-blob fill.
  static const accent40 = Color(0x665980A6);
  static const accent24 = Color(0x3D5980A6);
  static const accent10 = Color(0x1A5980A6);

  /// Over the camera image the ground is a photograph, not `bg`, so ink at 5%
  /// is invisible. These are the same steps inverted — the one deviation from
  /// the token table, and only for marks drawn on top of the image. Chips and
  /// labels over the image still sit on `bg` with `shadow-sm`, as in the mockup.
  static const scrim = Color(0x8C1D1F20);
  static const white = Color(0xFFFFFFFF);
  static const white10 = Color(0x1AFFFFFF);
  static const white24 = Color(0x3DFFFFFF);
  static const white55 = Color(0x8CFFFFFF);
  static const white70 = Color(0xB3FFFFFF);
}

/// Space. The Industry scale, 3.4px × n. No other values are allowed.
abstract final class BchSpace {
  static const s1 = 3.4;
  static const s2 = 6.8;
  static const s3 = 10.2;
  static const s4 = 13.6;
  static const s6 = 20.4;
  static const s8 = 27.2;
}

/// Radius. The mockup's override of the Industry base (which is 0).
abstract final class BchRadius {
  static const sm = Radius.circular(5);
  static const md = Radius.circular(10);
  static const lg = Radius.circular(16);

  static const smAll = BorderRadius.all(sm);
  static const mdAll = BorderRadius.all(md);
  static const lgAll = BorderRadius.all(lg);
}

/// Elevation. Only for things that overlap the map — here, the camera image.
abstract final class BchShadow {
  static const sm = <BoxShadow>[
    BoxShadow(color: Color(0x242B2B2D), blurRadius: 2, offset: Offset(0, 1)),
  ];
  static const md = <BoxShadow>[
    BoxShadow(color: Color(0x292B2B2D), blurRadius: 10, offset: Offset(0, 3)),
  ];
}

/// Motion exists to preserve continuity, not to entertain. Nothing else animates.
abstract final class BchMotion {
  static const ease = Cubic(0.2, 0.6, 0.2, 1);

  /// Hover and selection tints.
  static const tint = Duration(milliseconds: 120);

  /// A status change — a candidate becoming a detection.
  static const state = Duration(milliseconds: 240);

  /// Position interpolation. A jumping marker reads as a bug.
  static const track = Duration(milliseconds: 1200);
}

/// The console frame, from DESIGN.md §0.
abstract final class BchFrame {
  static const headerH = 62.0;
  static const rowH = 58.0;
  static const rowHCompact = 46.0;
  static const footerH = 68.0;
  static const inspectorMinH = 132.0;

  /// The graticule that makes a surface read as survey rather than photograph.
  static const graticuleStep = 64.0;
}

/// Type. Inter for both roles; headings at 600. Identifiers, coordinates and
/// timestamps are tabular so numbers align down a column.
abstract final class BchType {
  static const family = 'Inter';

  static const consoleTitle = TextStyle(
    fontFamily: family,
    fontSize: 16,
    fontWeight: FontWeight.w700,
    letterSpacing: 0.64,
    height: 1.25,
    color: BchColor.text,
  );

  /// 10–11px uppercase. Every panel gets one, top-left.
  static const panelLabel = TextStyle(
    fontFamily: family,
    fontSize: 11,
    fontWeight: FontWeight.w600,
    letterSpacing: 0.88,
    height: 1.2,
    color: BchColor.ink55,
  );

  static const metric = TextStyle(
    fontFamily: family,
    fontSize: 30,
    fontWeight: FontWeight.w600,
    height: 1,
    letterSpacing: -0.45,
    color: BchColor.text,
    fontFeatures: [FontFeature.tabularFigures()],
  );

  static const metricLabel = TextStyle(
    fontFamily: family,
    fontSize: 11.5,
    fontWeight: FontWeight.w400,
    height: 1.3,
    color: BchColor.ink58,
  );

  static const rowPrimary = TextStyle(
    fontFamily: family,
    fontSize: 15,
    fontWeight: FontWeight.w500,
    height: 1.25,
    color: BchColor.text,
    fontFeatures: [FontFeature.tabularFigures()],
  );

  static const rowRef = TextStyle(
    fontFamily: family,
    fontSize: 11,
    fontWeight: FontWeight.w400,
    height: 1.3,
    letterSpacing: 0.44,
    color: BchColor.ink45,
    fontFeatures: [FontFeature.tabularFigures()],
  );

  static const rowSecondary = TextStyle(
    fontFamily: family,
    fontSize: 12,
    fontWeight: FontWeight.w400,
    height: 1.3,
    color: BchColor.ink58,
    fontFeatures: [FontFeature.tabularFigures()],
  );

  static const rowNumeral = TextStyle(
    fontFamily: family,
    fontSize: 18,
    fontWeight: FontWeight.w600,
    height: 1.1,
    color: BchColor.ink72,
    fontFeatures: [FontFeature.tabularFigures()],
  );

  static const inspectorTitle = TextStyle(
    fontFamily: family,
    fontSize: 20,
    fontWeight: FontWeight.w600,
    height: 1.15,
    letterSpacing: -0.3,
    color: BchColor.text,
    fontFeatures: [FontFeature.tabularFigures()],
  );

  static const body = TextStyle(
    fontFamily: family,
    fontSize: 13,
    fontWeight: FontWeight.w400,
    height: 1.4,
    color: BchColor.ink72,
    fontFeatures: [FontFeature.tabularFigures()],
  );

  static const caption = TextStyle(
    fontFamily: family,
    fontSize: 12,
    fontWeight: FontWeight.w400,
    height: 1.35,
    color: BchColor.ink58,
  );

  static const micro = TextStyle(
    fontFamily: family,
    fontSize: 10,
    fontWeight: FontWeight.w600,
    letterSpacing: 1.2,
    height: 1.2,
    color: BchColor.ink55,
  );

  static const button = TextStyle(
    fontFamily: family,
    fontSize: 13,
    fontWeight: FontWeight.w600,
    height: 1.2,
    letterSpacing: 0,
  );

  static const chip = TextStyle(
    fontFamily: family,
    fontSize: 12,
    fontWeight: FontWeight.w500,
    height: 1.2,
  );
}
