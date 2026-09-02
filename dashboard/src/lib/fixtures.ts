import type { Bounds, Crew, Pothole, Vehicle } from "./model";

/** Inner London. The console opens here and the operator pans from it. */
export const LONDON_CENTRE = { lat: 51.5074, lng: -0.1178 };
export const LONDON_ZOOM = 12;

/** Used to fit the map when the operator asks to see everything. */
export const LONDON_BOUNDS: Bounds = {
  north: 51.5760,
  south: 51.4480,
  east: -0.0180,
  west: -0.1620,
};

export const FIXTURE_DAY = "2026-09-02";
const t = (hhmm: string) => `${FIXTURE_DAY}T${hhmm}:00+01:00`;
const y = (hhmm: string) => `2026-09-01T${hhmm}:00+01:00`;

/**
 * Standing fixture set: real Transport for London Road Network streets at
 * their real coordinates, so a road engineer can check the console against
 * the network they actually maintain.
 */
export const MOCK_POTHOLES: Pothole[] = [
  // Confirmed: corroborated by more than one vehicle. Actionable today.
  { id: "p01", ref: "TLRN-4471", street: "Marylebone Road",     locality: "Westminster",       lat: 51.5220, lng: -0.1570, severity: 4, priority: 1,  status: "confirmed", vehicleCount: 6, passCount: 24, firstSeenIso: t("06:14"), lastSeenIso: t("11:52"), confidence: 0.96, frameCount: 11, imageUrl: null, stopOrder: null },
  { id: "p02", ref: "TLRN-4463", street: "Old Kent Road",       locality: "Southwark",         lat: 51.4830, lng: -0.0700, severity: 4, priority: 2,  status: "confirmed", vehicleCount: 5, passCount: 19, firstSeenIso: t("06:31"), lastSeenIso: t("11:40"), confidence: 0.94, frameCount: 9,  imageUrl: null, stopOrder: null },
  { id: "p03", ref: "TLRN-4459", street: "Euston Road",         locality: "Camden",            lat: 51.5265, lng: -0.1340, severity: 3, priority: 3,  status: "confirmed", vehicleCount: 4, passCount: 16, firstSeenIso: t("06:48"), lastSeenIso: t("11:27"), confidence: 0.91, frameCount: 8,  imageUrl: null, stopOrder: null },
  { id: "p04", ref: "TLRN-4452", street: "Seven Sisters Road",  locality: "Islington",         lat: 51.5640, lng: -0.1010, severity: 3, priority: 4,  status: "confirmed", vehicleCount: 4, passCount: 13, firstSeenIso: t("07:02"), lastSeenIso: t("11:15"), confidence: 0.89, frameCount: 7,  imageUrl: null, stopOrder: null },
  { id: "p05", ref: "TLRN-4448", street: "Whitechapel Road",    locality: "Tower Hamlets",     lat: 51.5185, lng: -0.0620, severity: 2, priority: 5,  status: "confirmed", vehicleCount: 3, passCount: 11, firstSeenIso: t("07:19"), lastSeenIso: t("10:58"), confidence: 0.88, frameCount: 6,  imageUrl: null, stopOrder: null },
  { id: "p06", ref: "TLRN-4441", street: "Holloway Road",       locality: "Islington",         lat: 51.5545, lng: -0.1130, severity: 3, priority: 6,  status: "confirmed", vehicleCount: 3, passCount: 10, firstSeenIso: t("07:33"), lastSeenIso: t("10:44"), confidence: 0.87, frameCount: 6,  imageUrl: null, stopOrder: null },
  { id: "p07", ref: "TLRN-4437", street: "Clapham Road",        locality: "Lambeth",           lat: 51.4735, lng: -0.1250, severity: 2, priority: 7,  status: "confirmed", vehicleCount: 3, passCount: 9,  firstSeenIso: t("07:51"), lastSeenIso: t("10:31"), confidence: 0.85, frameCount: 5,  imageUrl: null, stopOrder: null },
  { id: "p08", ref: "TLRN-4430", street: "Bow Road",            locality: "Tower Hamlets",     lat: 51.5275, lng: -0.0230, severity: 3, priority: 8,  status: "confirmed", vehicleCount: 2, passCount: 12, firstSeenIso: t("08:04"), lastSeenIso: t("10:19"), confidence: 0.84, frameCount: 7,  imageUrl: null, stopOrder: null },
  { id: "p09", ref: "TLRN-4426", street: "Wandsworth Road",     locality: "Lambeth",           lat: 51.4720, lng: -0.1370, severity: 1, priority: 9,  status: "confirmed", vehicleCount: 2, passCount: 7,  firstSeenIso: t("08:17"), lastSeenIso: t("10:06"), confidence: 0.82, frameCount: 4,  imageUrl: null, stopOrder: null },
  { id: "p10", ref: "TLRN-4419", street: "Commercial Road",     locality: "Tower Hamlets",     lat: 51.5145, lng: -0.0490, severity: 2, priority: 10, status: "confirmed", vehicleCount: 2, passCount: 8,  firstSeenIso: t("08:29"), lastSeenIso: t("09:54"), confidence: 0.81, frameCount: 5,  imageUrl: null, stopOrder: null },
  { id: "p11", ref: "TLRN-4415", street: "Brixton Hill",        locality: "Lambeth",           lat: 51.4520, lng: -0.1180, severity: 3, priority: 11, status: "confirmed", vehicleCount: 2, passCount: 9,  firstSeenIso: t("08:41"), lastSeenIso: t("09:38"), confidence: 0.80, frameCount: 5,  imageUrl: null, stopOrder: null },
  { id: "p12", ref: "TLRN-4411", street: "Lea Bridge Road",     locality: "Waltham Forest",    lat: 51.5690, lng: -0.0410, severity: 2, priority: 12, status: "confirmed", vehicleCount: 2, passCount: 6,  firstSeenIso: t("08:56"), lastSeenIso: t("09:22"), confidence: 0.79, frameCount: 4,  imageUrl: null, stopOrder: null },

  // Suspected: one vehicle. Evidence, not a fact.
  { id: "p13", ref: "TLRN-4488", street: "Caledonian Road",     locality: "Islington",         lat: 51.5480, lng: -0.1180, severity: 3, priority: 13, status: "suspected", vehicleCount: 1, passCount: 2, firstSeenIso: t("09:12"), lastSeenIso: t("09:12"), confidence: 0.72, frameCount: 2, imageUrl: null, stopOrder: null },
  { id: "p14", ref: "TLRN-4491", street: "Jamaica Road",        locality: "Southwark",         lat: 51.4985, lng: -0.0640, severity: 2, priority: 14, status: "suspected", vehicleCount: 1, passCount: 1, firstSeenIso: t("09:38"), lastSeenIso: t("09:38"), confidence: 0.68, frameCount: 1, imageUrl: null, stopOrder: null },
  { id: "p15", ref: "TLRN-4494", street: "York Way",            locality: "Camden",            lat: 51.5410, lng: -0.1215, severity: 4, priority: 15, status: "suspected", vehicleCount: 1, passCount: 3, firstSeenIso: t("10:02"), lastSeenIso: t("10:47"), confidence: 0.75, frameCount: 3, imageUrl: null, stopOrder: null },
  { id: "p16", ref: "TLRN-4497", street: "Balls Pond Road",     locality: "Hackney",           lat: 51.5450, lng: -0.0850, severity: 2, priority: 16, status: "suspected", vehicleCount: 1, passCount: 1, firstSeenIso: t("10:24"), lastSeenIso: t("10:24"), confidence: 0.66, frameCount: 1, imageUrl: null, stopOrder: null },
  { id: "p17", ref: "TLRN-4501", street: "Camberwell New Road", locality: "Southwark",         lat: 51.4760, lng: -0.0975, severity: 1, priority: 17, status: "suspected", vehicleCount: 1, passCount: 2, firstSeenIso: t("10:41"), lastSeenIso: t("11:09"), confidence: 0.64, frameCount: 2, imageUrl: null, stopOrder: null },
  { id: "p18", ref: "TLRN-4505", street: "Great Dover Street",  locality: "Southwark",         lat: 51.4975, lng: -0.0880, severity: 2, priority: 18, status: "suspected", vehicleCount: 1, passCount: 1, firstSeenIso: t("11:03"), lastSeenIso: t("11:03"), confidence: 0.70, frameCount: 1, imageUrl: null, stopOrder: null },
  { id: "p19", ref: "TLRN-4508", street: "Blackfriars Road",    locality: "Southwark",         lat: 51.5015, lng: -0.1045, severity: 3, priority: 19, status: "suspected", vehicleCount: 1, passCount: 2, firstSeenIso: t("11:21"), lastSeenIso: t("11:48"), confidence: 0.73, frameCount: 2, imageUrl: null, stopOrder: null },
  { id: "p20", ref: "TLRN-4512", street: "New Kent Road",       locality: "Southwark",         lat: 51.4930, lng: -0.0930, severity: 1, priority: 20, status: "suspected", vehicleCount: 1, passCount: 1, firstSeenIso: t("11:44"), lastSeenIso: t("11:44"), confidence: 0.62, frameCount: 1, imageUrl: null, stopOrder: null },

  // Scheduled: on a crew's route, carrying a stop order.
  { id: "p21", ref: "TLRN-4402", street: "Victoria Street",     locality: "Westminster",       lat: 51.4975, lng: -0.1370, severity: 4, priority: 21, status: "scheduled", vehicleCount: 7, passCount: 28, firstSeenIso: y("07:10"), lastSeenIso: t("08:11"), confidence: 0.97, frameCount: 14, imageUrl: null, stopOrder: 1 },
  { id: "p22", ref: "TLRN-4398", street: "Millbank",            locality: "Westminster",       lat: 51.4930, lng: -0.1250, severity: 3, priority: 22, status: "scheduled", vehicleCount: 5, passCount: 21, firstSeenIso: y("07:44"), lastSeenIso: t("08:32"), confidence: 0.93, frameCount: 10, imageUrl: null, stopOrder: 2 },
  { id: "p23", ref: "TLRN-4391", street: "Albert Embankment",   locality: "Lambeth",           lat: 51.4900, lng: -0.1220, severity: 2, priority: 23, status: "scheduled", vehicleCount: 4, passCount: 15, firstSeenIso: y("08:20"), lastSeenIso: t("08:58"), confidence: 0.90, frameCount: 8,  imageUrl: null, stopOrder: 3 },
  { id: "p24", ref: "TLRN-4386", street: "Vauxhall Bridge Road",locality: "Westminster",       lat: 51.4915, lng: -0.1370, severity: 3, priority: 24, status: "scheduled", vehicleCount: 4, passCount: 17, firstSeenIso: y("09:02"), lastSeenIso: t("09:14"), confidence: 0.92, frameCount: 9,  imageUrl: null, stopOrder: 4 },

  // Repaired: closed. Stays visible for the day, then drops out.
  { id: "p25", ref: "TLRN-4310", street: "Borough High Street", locality: "Southwark",         lat: 51.5020, lng: -0.0910, severity: 3, priority: 25, status: "repaired", vehicleCount: 5, passCount: 18, firstSeenIso: "2026-08-28T06:50:00+01:00", lastSeenIso: t("07:05"), confidence: 0.95, frameCount: 12, imageUrl: null, stopOrder: null },
  { id: "p26", ref: "TLRN-4304", street: "Tower Bridge Road",   locality: "Southwark",         lat: 51.4985, lng: -0.0790, severity: 2, priority: 26, status: "repaired", vehicleCount: 3, passCount: 12, firstSeenIso: "2026-08-28T09:12:00+01:00", lastSeenIso: t("07:22"), confidence: 0.86, frameCount: 7,  imageUrl: null, stopOrder: null },
  { id: "p27", ref: "TLRN-4297", street: "Kennington Park Road",locality: "Lambeth",           lat: 51.4855, lng: -0.1075, severity: 1, priority: 27, status: "repaired", vehicleCount: 2, passCount: 8,  firstSeenIso: "2026-08-27T10:31:00+01:00", lastSeenIso: t("07:41"), confidence: 0.78, frameCount: 4,  imageUrl: null, stopOrder: null },
];

/** Fleet positions. In production these stream from the detector app. */
export const MOCK_VEHICLES: Vehicle[] = [
  { id: "v1", label: "TFL-114", lat: 51.5160, lng: -0.1240 },
  { id: "v2", label: "TFL-207", lat: 51.5330, lng: -0.0720 },
  { id: "v3", label: "TFL-331", lat: 51.4820, lng: -0.1080 },
];

/** Repair crews the operator can dispatch to. */
export const CREWS: Crew[] = [
  { id: "c1", name: "Crew A", depot: "Bow depot", available: true },
  { id: "c2", name: "Crew B", depot: "Battersea depot", available: true },
  { id: "c3", name: "Crew C", depot: "Hornsey depot", available: false },
];

/** Distance the fleet has covered today. */
export const MOCK_KM_SCANNED = 412.8;
