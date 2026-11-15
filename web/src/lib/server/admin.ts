import "server-only"; // importing this file from browser code fails the build
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * Supabase client with the SECRET key. It bypasses row-level security, so it
 * must only ever be used in server code (route handlers), for the few actions a
 * browser is not allowed to do itself.
 */
export function getAdminClient(): SupabaseClient | null {
  const key = process.env.SUPABASE_SECRET_KEY;
  let url = "";
  try {
    url = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL ?? "").origin;
  } catch {
    return null;
  }
  if (!key) return null;
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}
