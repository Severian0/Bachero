import { createClient } from "@supabase/supabase-js";

// Anon-key client, safe for the browser. RLS is wide open for the demo (see migration).
// Read through the *_map views, never base tables with geography columns.
export const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
);
