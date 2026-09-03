// Geography helpers.
//
// Longitude first. EWKT is "SRID=4326;POINT(lng lat)". Every geospatial bug in
// this project will be this, so it is written in exactly one place.

import 'dart:math' as math;

/// PostGIS EWKT for a geography(Point, 4326) column, longitude first.
String ewktPoint(double lng, double lat) =>
    'SRID=4326;POINT(${lng.toStringAsFixed(7)} ${lat.toStringAsFixed(7)})';

/// Great-circle distance in metres. Used to accumulate "km scanned" from the
/// breadcrumb trail without asking the server.
double haversineMetres(double lat1, double lng1, double lat2, double lng2) {
  const earthRadiusM = 6371000.0;
  final dLat = _rad(lat2 - lat1);
  final dLng = _rad(lng2 - lng1);
  final a = math.sin(dLat / 2) * math.sin(dLat / 2) +
      math.cos(_rad(lat1)) * math.cos(_rad(lat2)) * math.sin(dLng / 2) * math.sin(dLng / 2);
  return earthRadiusM * 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a));
}

double _rad(double deg) => deg * math.pi / 180.0;

/// "51.5072, -0.1275" — the coordinate as it is printed at the map margin.
/// Latitude first here, because this is read by a person, not by PostGIS.
String formatCoordinate(double lat, double lng) =>
    '${lat.toStringAsFixed(5)}, ${lng.toStringAsFixed(5)}';
