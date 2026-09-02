import { createClient, type SupabaseClient } from "@supabase/supabase-js";

// Anon-key client for route handlers. RLS is wide open for the demo (see
// migration). Read through the *_map views, never base tables with geography
// columns — the one exception is crews.depot, parsed by ./wkb.
export function serverClient(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) {
    throw new Error("Supabase is not configured");
  }
  return createClient(url, key);
}
