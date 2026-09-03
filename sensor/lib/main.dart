// Bachero sensor app. A phone in a council vehicle's cradle, watching the road
// through the camera and feeling it through the accelerometer, writing straight
// to Supabase. Spec: docs/ARCHITECTURE.md §3.
//
// Portrait only, on purpose: the frames the detector works on arrive in sensor
// orientation and have to be rotated into the operator's view before the region
// of interest means anything. Locking the orientation keeps that one rotation
// honest, and a portrait windscreen cradle sees further down the road anyway.

import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import 'session/session_controller.dart';
import 'session/settings.dart';
import 'theme/theme.dart';
import 'theme/tokens.dart';
import 'ui/console_screen.dart';

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();
  await SystemChrome.setPreferredOrientations(
    <DeviceOrientation>[DeviceOrientation.portraitUp],
  );
  SystemChrome.setSystemUIOverlayStyle(const SystemUiOverlayStyle(
    statusBarColor: Colors.transparent,
    statusBarIconBrightness: Brightness.dark,
    statusBarBrightness: Brightness.light,
    systemNavigationBarColor: BchColor.bg,
    systemNavigationBarIconBrightness: Brightness.dark,
  ));

  final settings = await SensorSettings.load();
  runApp(BacheroSensorApp(controller: SessionController(settings)));
}

class BacheroSensorApp extends StatefulWidget {
  const BacheroSensorApp({super.key, required this.controller});

  final SessionController controller;

  @override
  State<BacheroSensorApp> createState() => _BacheroSensorAppState();
}

class _BacheroSensorAppState extends State<BacheroSensorApp> {
  @override
  void initState() {
    super.initState();
    // After the first frame, so the camera and location prompts appear over a
    // drawn console rather than a blank screen.
    WidgetsBinding.instance.addPostFrameCallback((_) {
      unawaited(widget.controller.start());
    });
  }

  @override
  void dispose() {
    unawaited(widget.controller.shutdown());
    widget.controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'Bachero Sensor',
      debugShowCheckedModeBanner: false,
      theme: buildBacheroTheme(),
      home: ConsoleScreen(controller: widget.controller),
      builder: (context, child) {
        // The console is read at arm's length in a moving vehicle; it does not
        // reflow, so cap the text scale rather than let rows collide.
        final media = MediaQuery.of(context);
        return MediaQuery(
          data: media.copyWith(
            textScaler: media.textScaler.clamp(maxScaleFactor: 1.15),
          ),
          child: child ?? const SizedBox.shrink(),
        );
      },
    );
  }
}
