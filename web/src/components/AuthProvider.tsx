"use client";

import type { User } from "@supabase/supabase-js";
import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { getSupabase } from "@/lib/supabase";

type Auth = { user: User | null; loading: boolean; available: boolean; signOut: () => Promise<void> };

const AuthContext = createContext<Auth>({ user: null, loading: true, available: false, signOut: async () => {} });

/** Makes "who is logged in" available to every client component via useAuth(). */
export function AuthProvider({ children }: { children: ReactNode }) {
  const supabase = getSupabase();
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(supabase !== null);

  useEffect(() => {
    if (!supabase) return;
    // Fires once with the stored session, then on every login/logout/token refresh.
    const { data } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
      setLoading(false);
    });
    return () => data.subscription.unsubscribe();
  }, [supabase]);

  const value = useMemo<Auth>(
    () => ({
      user,
      loading,
      available: supabase !== null,
      signOut: async () => {
        await supabase?.auth.signOut();
      },
    }),
    [user, loading, supabase],
  );
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export const useAuth = () => useContext(AuthContext);
