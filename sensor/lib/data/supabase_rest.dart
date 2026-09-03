// PostgREST and Storage over plain HTTP. docs/ARCHITECTURE.md §3.
//
// No Supabase SDK: the app writes four shapes to two tables and one bucket, and
// the anon key goes in a header. Geography is sent as EWKT, longitude first.
//
// RLS is wide open for the demo (`demo_all` policies), which is why the anon key
// is enough. That is a property of the demo, not of the design.

import 'dart:convert';
import 'dart:typed_data';

import 'package:http/http.dart' as http;

import '../config.dart';
import 'models.dart';

class SupabaseConfig {
  const SupabaseConfig({required this.url, required this.anonKey});

  /// Project URL, e.g. https://abcdefgh.supabase.co — no trailing slash.
  final String url;
  final String anonKey;

  bool get isConfigured => url.trim().isNotEmpty && anonKey.trim().isNotEmpty;

  /// Compile-time values from --dart-define, used when nothing is set in-app.
  static const fromEnvironment = SupabaseConfig(
    url: supabaseUrl,
    anonKey: supabaseAnonKey,
  );

  /// Project reference for display: "abcdefgh.supabase.co".
  String get host {
    final trimmed = url.trim();
    if (trimmed.isEmpty) return 'not set';
    return Uri.tryParse(trimmed)?.host ?? trimmed;
  }
}

class SupabaseException implements Exception {
  SupabaseException(this.what, this.statusCode, this.body);

  final String what;
  final int statusCode;
  final String body;

  @override
  String toString() {
    final detail = body.length > 180 ? '${body.substring(0, 180)}…' : body;
    return '$what failed with HTTP $statusCode. $detail';
  }
}

class SupabaseRest {
  SupabaseRest(this.config, {http.Client? client}) : _client = client ?? http.Client();

  final SupabaseConfig config;
  final http.Client _client;

  static const _timeout = Duration(seconds: 20);

  Map<String, String> get _headers => <String, String>{
        'apikey': config.anonKey,
        'Authorization': 'Bearer ${config.anonKey}',
        'Content-Type': 'application/json',
      };

  String get _base => config.url.trim().replaceAll(RegExp(r'/+$'), '');

  /// Start a recording session. Returns the new trip id.
  Future<String> createTrip({
    required String deviceId,
    required String vehicleId,
  }) async {
    final response = await _client
        .post(
          Uri.parse('$_base/rest/v1/trips'),
          headers: <String, String>{..._headers, 'Prefer': 'return=representation'},
          body: jsonEncode(<String, dynamic>{
            'device_id': deviceId,
            'vehicle_id': vehicleId,
          }),
        )
        .timeout(_timeout);

    if (response.statusCode >= 300) {
      throw SupabaseException('Start trip', response.statusCode, response.body);
    }
    final rows = jsonDecode(response.body) as List<dynamic>;
    if (rows.isEmpty) {
      throw SupabaseException('Start trip', response.statusCode, 'no row returned');
    }
    return (rows.first as Map<String, dynamic>)['id'] as String;
  }

  Future<void> endTrip(String tripId, {double? distanceM}) async {
    final response = await _client
        .patch(
          Uri.parse('$_base/rest/v1/trips?id=eq.$tripId'),
          headers: _headers,
          body: jsonEncode(<String, dynamic>{
            'ended_at': DateTime.now().toUtc().toIso8601String(),
            if (distanceM != null) 'distance_m': distanceM,
          }),
        )
        .timeout(_timeout);

    if (response.statusCode >= 300) {
      throw SupabaseException('End trip', response.statusCode, response.body);
    }
  }

  /// A batch of 1 Hz breadcrumbs. One request per five seconds of driving.
  Future<void> postPositions(
    List<Breadcrumb> batch, {
    required String tripId,
    required String vehicleId,
  }) async {
    if (batch.isEmpty) return;
    final response = await _client
        .post(
          Uri.parse('$_base/rest/v1/vehicle_positions'),
          headers: _headers,
          body: jsonEncode(
            batch.map((b) => b.toJson(tripId: tripId, vehicleId: vehicleId)).toList(),
          ),
        )
        .timeout(_timeout);

    if (response.statusCode >= 300) {
      throw SupabaseException('Post positions', response.statusCode, response.body);
    }
  }

  /// The whole write path. The trigger does the rest: clustering, corroboration
  /// and `pothole_id` on the way in.
  Future<void> postDetection(
    DetectionRecord record, {
    required String deviceId,
    required String vehicleId,
  }) async {
    final response = await _client
        .post(
          Uri.parse('$_base/rest/v1/detections'),
          headers: _headers,
          body: jsonEncode(record.toJson(deviceId: deviceId, vehicleId: vehicleId)),
        )
        .timeout(_timeout);

    if (response.statusCode >= 300) {
      throw SupabaseException('Post detection', response.statusCode, response.body);
    }
  }

  /// The detection id is generated on the phone so this path matches the row.
  /// Returns the public URL, which the bucket serves without a token.
  Future<String> uploadPhoto(String detectionId, Uint8List bytes) async {
    final path = '$photoBucket/$detectionId.jpg';
    final response = await _client
        .post(
          Uri.parse('$_base/storage/v1/object/$path'),
          headers: <String, String>{
            'apikey': config.anonKey,
            'Authorization': 'Bearer ${config.anonKey}',
            'Content-Type': 'image/jpeg',
            'x-upsert': 'true',
          },
          body: bytes,
        )
        .timeout(_timeout);

    if (response.statusCode >= 300) {
      throw SupabaseException('Upload photo', response.statusCode, response.body);
    }
    return '$_base/storage/v1/object/public/$path';
  }

  /// One cheap round trip, to tell "the key is wrong" from "there is no signal"
  /// before the demo rather than during it.
  Future<void> ping() async {
    final response = await _client
        .get(
          Uri.parse('$_base/rest/v1/crews?select=id&limit=1'),
          headers: _headers,
        )
        .timeout(const Duration(seconds: 10));

    if (response.statusCode >= 300) {
      throw SupabaseException('Check connection', response.statusCode, response.body);
    }
  }

  void close() => _client.close();
}
