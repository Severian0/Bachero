import type { ConsoleDataSource } from "./types";
import { createSyntheticSource } from "./synthetic";

export { startOfTodayISO } from "./supabase";

export const isSupabaseConfigured = () => Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL);

/** Supabase when NEXT_PUBLIC_SUPABASE_URL is set, else the synthetic generator. */
export async function createDataSource(): Promise<ConsoleDataSource> {
  if (isSupabaseConfigured()) {
    const [{ createSupabaseSource }, { supabase }] = await Promise.all([
      import("./supabase"),
      import("@/lib/supabase"),
    ]);
    return createSupabaseSource(supabase);
  }
  return createSyntheticSource();
}
