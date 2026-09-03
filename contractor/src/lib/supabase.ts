import { createClient, type SupabaseClient } from "@supabase/supabase-js";

// Created on first use, not on import.
//
// `createClient` throws "supabaseUrl is required" when the URL is empty, and the
// empty case is the *default* here: fixture mode is what you get with no
// `.env.local`. A module-level client would therefore crash every page in the
// mode the app is meant to run in out of the box.

let client: SupabaseClient | null = null;

export const hasSupabase = (): boolean =>
  (process.env.NEXT_PUBLIC_SUPABASE_URL ?? "").length > 0 &&
  (process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "").length > 0;

/**
 * Anon-key client, safe for the browser. RLS is wide open for the demo (see the
 * migration). Read through the *_map views, and never select a geography column:
 * PostgREST hands them back as hex WKB, which is why every query in
 * `lib/crew/supabase.ts` names its columns rather than using `*`.
 */
export function getSupabase(): SupabaseClient {
  if (client === null) {
    client = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL ?? "",
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "",
    );
  }
  return client;
}
