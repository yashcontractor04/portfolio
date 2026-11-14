"use client";

import type { SupabaseClient } from "@supabase/supabase-js";
import { useMemo } from "react";
import { useAuth } from "@/components/AuthProvider";
import { getSupabase } from "@/lib/supabase";

/**
 * The demo/personal switch. Guests get the demo store (sample data in memory);
 * logged-in users get the Supabase store. Returns null while the session loads.
 */
export function useStore<T>(createDemo: () => T, createReal: (supabase: SupabaseClient) => T): { store: T | null; demo: boolean } {
  const { user, loading } = useAuth();
  const userId = user?.id;
  return useMemo(() => {
    if (loading) return { store: null, demo: false };
    const supabase = getSupabase();
    if (userId && supabase) return { store: createReal(supabase), demo: false };
    return { store: createDemo(), demo: true };
    // The factories are module-level functions; only the login state matters here.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, userId]);
}
