import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * Browser Supabase client. It uses the PUBLISHABLE key, which is safe to ship:
 * every request runs as the logged-in user and row-level security decides what
 * they can read or write. The secret key never appears in browser code.
 *
 * Returns null when the env vars are missing (e.g. a local build without
 * Supabase), so the site still works in demo mode.
 */
let client: SupabaseClient | null | undefined;

export function getSupabase(): SupabaseClient | null {
  if (client !== undefined) return client;
  // Accept a URL pasted with a trailing path such as /rest/v1/.
  const raw = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? "";
  let url = "";
  try {
    url = raw ? new URL(raw).origin : "";
  } catch {
    url = "";
  }
  client = url && key ? createClient(url, key) : null;
  return client;
}
