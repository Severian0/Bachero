import type { CrewInput } from "@/lib/data/types";

/** The crew form as typed: strings until Save, so a half-typed number is not a bug. */
export interface Draft {
  id: string | null;
  name: string;
  lng: string;
  lat: string;
  shift_minutes: string;
  repairs_per_shift: string;
  error: string | null;
  saving: boolean;
}

/** Turn the form's strings into a request, or say which field is wrong. */
export function parseDraft(d: Draft): { input: CrewInput } | { error: string } {
  const name = d.name.trim();
  if (!name) return { error: "Give the crew a name." };
  const lng = Number(d.lng), lat = Number(d.lat);
  if (d.lng.trim() === "" || d.lat.trim() === "" || !Number.isFinite(lng) || !Number.isFinite(lat)) {
    return { error: "Place the depot on the map or type its latitude and longitude." };
  }
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return { error: "The depot's coordinates are out of range." };
  const shift = Number(d.shift_minutes), repairs = Number(d.repairs_per_shift);
  if (!Number.isInteger(shift) || shift < 60 || shift > 900) return { error: "Shift must be between 60 and 900 minutes." };
  if (!Number.isInteger(repairs) || repairs < 1 || repairs > 60) return { error: "Repairs per shift must be between 1 and 60." };
  return { input: { ...(d.id ? { id: d.id } : {}), name, depot_lng: lng, depot_lat: lat, shift_minutes: shift, repairs_per_shift: repairs } };
}

