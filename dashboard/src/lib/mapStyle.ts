/**
 * Google basemap style.
 *
 * The map is a working surface, not a picture: every hue is drained out of it
 * so the detection data is the only saturated thing on screen. Labels stay,
 * because an operator needs to name the street they are dispatching to.
 */
export const GOOGLE_MAP_STYLE: google.maps.MapTypeStyle[] = [
  { elementType: "geometry", stylers: [{ color: "#f5f4f3" }] },
  { elementType: "labels.icon", stylers: [{ visibility: "off" }] },
  { elementType: "labels.text.fill", stylers: [{ color: "#6b7276" }] },
  { elementType: "labels.text.stroke", stylers: [{ color: "#f8f7f6" }, { weight: 3 }] },

  { featureType: "administrative", elementType: "geometry.stroke", stylers: [{ color: "#d4d1ce" }] },
  { featureType: "administrative.land_parcel", stylers: [{ visibility: "off" }] },
  { featureType: "administrative.neighborhood", elementType: "labels.text.fill", stylers: [{ color: "#9aa0a3" }] },

  { featureType: "poi", stylers: [{ visibility: "off" }] },
  { featureType: "transit", stylers: [{ visibility: "off" }] },

  { featureType: "landscape.man_made", elementType: "geometry", stylers: [{ color: "#efedeb" }] },
  { featureType: "landscape.natural", elementType: "geometry", stylers: [{ color: "#eceae7" }] },
  { featureType: "poi.park", elementType: "geometry", stylers: [{ color: "#e6e8e2" }, { visibility: "on" }] },

  { featureType: "road", elementType: "geometry", stylers: [{ color: "#ffffff" }] },
  { featureType: "road", elementType: "geometry.stroke", stylers: [{ color: "#e0dedb" }] },
  { featureType: "road", elementType: "labels.text.fill", stylers: [{ color: "#7c8388" }] },
  { featureType: "road.arterial", elementType: "geometry", stylers: [{ color: "#ffffff" }] },
  { featureType: "road.highway", elementType: "geometry", stylers: [{ color: "#fbfaf9" }] },
  { featureType: "road.highway", elementType: "geometry.stroke", stylers: [{ color: "#d8d5d1" }] },
  { featureType: "road.local", elementType: "labels", stylers: [{ visibility: "simplified" }] },

  { featureType: "water", elementType: "geometry", stylers: [{ color: "#dfe4e8" }] },
  { featureType: "water", elementType: "labels.text.fill", stylers: [{ color: "#9fa9b0" }] },
];

export const GOOGLE_MAPS_KEY = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY ?? "";
