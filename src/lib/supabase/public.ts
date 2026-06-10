import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/types";

/**
 * Anonymous, cookie-less Supabase client for the public portal.
 *
 * Only the `public_*` SECURITY DEFINER RPCs are reachable through the anon role —
 * everything else stays RLS-gated behind a logged-in profile. Because it carries no
 * session cookies, responses are safe to cache (ISR) and identical for every visitor.
 */
export function createPublicClient() {
  return createSupabaseClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );
}
