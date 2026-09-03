// Material glue. The app draws itself almost entirely from tokens.dart; this
// only exists so Flutter's own surfaces (ripples, scrollbars, focus rings, the
// bottom sheet) inherit the same ground, ink and steel.

import 'package:flutter/material.dart';

import 'tokens.dart';

ThemeData buildBacheroTheme() {
  const scheme = ColorScheme.light(
    primary: BchColor.accent,
    onPrimary: BchColor.bg,
    secondary: BchColor.accent700,
    onSecondary: BchColor.bg,
    surface: BchColor.bg,
    onSurface: BchColor.text,
    error: BchColor.neutral800,
    onError: BchColor.bg,
  );

  return ThemeData(
    useMaterial3: true,
    colorScheme: scheme,
    fontFamily: BchType.family,
    scaffoldBackgroundColor: BchColor.bg,
    canvasColor: BchColor.bg,
    dividerColor: BchColor.divider,
    splashFactory: InkRipple.splashFactory,
    highlightColor: BchColor.ink5,
    splashColor: BchColor.ink7,
    // Hover states are tints, never movement. Nothing shifts position on press.
    visualDensity: VisualDensity.standard,
    dividerTheme: const DividerThemeData(
      color: BchColor.divider,
      thickness: 1,
      space: 1,
    ),
    bottomSheetTheme: const BottomSheetThemeData(
      backgroundColor: BchColor.bg,
      surfaceTintColor: BchColor.bg,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: BchRadius.lg),
      ),
      showDragHandle: true,
      dragHandleColor: BchColor.ink38,
    ),
    switchTheme: SwitchThemeData(
      thumbColor: WidgetStateProperty.resolveWith(
        (s) => s.contains(WidgetState.selected) ? BchColor.bg : BchColor.neutral500,
      ),
      trackColor: WidgetStateProperty.resolveWith(
        (s) => s.contains(WidgetState.selected) ? BchColor.accent : BchColor.neutral200,
      ),
      trackOutlineColor: const WidgetStatePropertyAll(BchColor.divider),
    ),
    sliderTheme: const SliderThemeData(
      activeTrackColor: BchColor.accent,
      inactiveTrackColor: BchColor.ink12,
      thumbColor: BchColor.accent,
      overlayColor: BchColor.accent24,
      trackHeight: 2,
    ),
    textSelectionTheme: const TextSelectionThemeData(
      cursorColor: BchColor.accent,
      selectionColor: BchColor.accent200,
      selectionHandleColor: BchColor.accent,
    ),
    snackBarTheme: const SnackBarThemeData(
      backgroundColor: BchColor.neutral900,
      contentTextStyle: TextStyle(
        fontFamily: BchType.family,
        fontSize: 13,
        color: BchColor.bg,
      ),
      behavior: SnackBarBehavior.floating,
      shape: RoundedRectangleBorder(borderRadius: BchRadius.mdAll),
    ),
  );
}
