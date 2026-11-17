"use client";

import { useTranslations } from "next-intl";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useAuth } from "@/components/AuthProvider";
import { useRouter } from "@/i18n/navigation";
import { getSupabase } from "@/lib/supabase";
import { Feed } from "./Feed";
import { Settings } from "./Settings";
import { createSupabaseNews } from "./supabase";
import { DEFAULT_PREFS, type NewsData, type Prefs } from "./types";

/**
 * The News app. This component owns the data: it loads the feed once, keeps read
 * and thumb state in step with the database, and switches between feed and settings.
 * The page it sits on is static and contains no data; everything arrives through
 * Supabase as the logged-in user, so row-level security is the real gate.
 */
export function News() {
  const t = useTranslations("news");
  const router = useRouter();
  const { user, loading } = useAuth();
  const userId = user?.id;
  const store = useMemo(() => {
    const supabase = getSupabase();
    return userId && supabase ? createSupabaseNews(supabase, userId) : null;
  }, [userId]);

  const [data, setData] = useState<NewsData | null>(null);
  const [now, setNow] = useState<Date | null>(null);
  const [read, setRead] = useState<ReadonlySet<string>>(new Set());
  const [view, setView] = useState<"feed" | "settings">("feed");
  const [error, setError] = useState<"load" | "save" | null>(null);

  const load = useCallback(async () => {
    if (!store) return;
    setError(null);
    try {
      const loaded = await store.load();
      setData(loaded);
      setRead(new Set());
      setNow(new Date());
    } catch {
      setError("load");
    }
  }, [store]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch when the user is known
    void load();
  }, [load]);

  // Guests and logged-out visitors have nothing to see here.
  useEffect(() => {
    if (!loading && !userId) router.replace("/login");
  }, [loading, userId, router]);

  // Optimistic: the screen changes at once; if the write fails we say so and reload the truth.
  const write = useCallback(
    async (action: () => Promise<void>) => {
      setError(null);
      try {
        await action();
      } catch {
        setError("save");
        await load();
      }
    },
    [load],
  );

  if (loading || !userId) return <p className="p-8 text-mute">{t("loading")}</p>;
  if (error === "load" && !data) {
    return (
      <div className="space-y-4 p-8">
        <p role="alert">{t("loadError")}</p>
        <button type="button" onClick={() => void load()} className="h-10 rounded-sm border border-line px-4 text-sm text-mute hover:text-text">
          {t("retry")}
        </button>
      </div>
    );
  }
  if (!data || !now || !store) return <p className="p-8 text-mute">{t("loading")}</p>;
  if (!data.enabled) return <p className="p-8 text-mute">{t("notEnabled")}</p>;

  const prefs = data.prefs ?? DEFAULT_PREFS;

  if (view === "settings") {
    return (
      <Settings
        prefs={prefs}
        topics={data.topics}
        onClose={() => setView("feed")}
        onSave={async (next: Prefs) => {
          await store.savePrefs(next);
          setData((d) => (d ? { ...d, prefs: next } : d));
        }}
      />
    );
  }

  return (
    <>
      {error === "save" ? (
        <p role="alert" className="border-b border-line bg-tile px-5 py-2 text-sm">
          {t("saveError")}
        </p>
      ) : null}
      <Feed
        items={data.items}
        topics={data.topics}
        lastRun={data.lastRun}
        hasTopics={prefs.topics.length > 0}
        now={now}
        read={read}
        onRefresh={() => void load()}
        onSettings={() => setView("settings")}
        onRead={(ids) => {
          setRead((current) => new Set([...current, ...ids]));
          void write(() => store.markRead(ids));
        }}
        onThumb={(id, thumb) => {
          setData((d) => (d ? { ...d, items: d.items.map((item) => (item.article_id === id ? { ...item, thumb } : item)) } : d));
          void write(() => store.setThumb(id, thumb));
        }}
      />
    </>
  );
}
