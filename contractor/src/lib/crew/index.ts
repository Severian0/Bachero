// Which data source the app runs on.
//
// Supabase when it is configured, the fixture otherwise. The check is the same
// one the console spec makes, so both apps behave the same way on a laptop with
// no `.env.local`: they work.

import { hasSupabase } from "@/lib/supabase";
import type { CrewDataSource } from "./source";
import { createFixtureSource } from "./fixture";
import { createSupabaseSource } from "./supabase";

let cached: CrewDataSource | null = null;

export function createCrewDataSource(): CrewDataSource {
  cached ??= hasSupabase() ? createSupabaseSource() : createFixtureSource();
  return cached;
}

/** True when the screens are showing generated data, so the header can say so. */
export const isFixture = (): boolean => !hasSupabase();

export type { CrewDataSource } from "./source";
