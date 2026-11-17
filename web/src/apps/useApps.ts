"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/components/AuthProvider";
import { getSupabase } from "@/lib/supabase";
import { visibleApps, type AppEntry } from "./registry";

/**
 * The apps the current visitor should see in the dock and the command palette.
 * Guests get the demo-capable apps. After login the profile's feature flags are read
 * once (RLS lets a user read only their own profile row).
 */
export function useApps(): AppEntry[] {
  const { user } = useAuth();
  const userId = user?.id;
  const [flags, setFlags] = useState<{ userId: string; values: Record<string, boolean> } | null>(null);

  useEffect(() => {
    const supabase = getSupabase();
    if (!userId || !supabase) return;
    let cancelled = false;
    supabase
      .from("profiles")
      .select("news_enabled")
      .eq("id", userId)
      .maybeSingle()
      .then(({ data }) => {
        if (!cancelled) setFlags({ userId, values: { news_enabled: data?.news_enabled === true } });
      });
    return () => {
      cancelled = true;
    };
  }, [userId]);

  // Flags loaded for a previous user never apply to the current one.
  return visibleApps(userId && flags?.userId === userId ? flags.values : null);
}
