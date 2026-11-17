import type { SupabaseClient } from "@supabase/supabase-js";
import { FEED_SIZE_MAX, FEED_SIZE_MIN, INTERESTS_MAX, type FeedItem, type LastRun, type NewsData, type NewsStore, type Prefs, type Topic } from "./types";

/**
 * News backed by the `news_*` tables. Every call runs as the logged-in user, so
 * row-level security decides what comes back: own prefs, own feed, own feedback, and
 * the shared tables only if the account has News enabled.
 */
export function createSupabaseNews(supabase: SupabaseClient, userId: string): NewsStore {
  const check = <T>(result: { data: T; error: unknown }): T => {
    if (result.error) throw result.error;
    return result.data;
  };

  // Insert-or-update in two steps. A single upsert would need UPDATE permission on the
  // key columns, which users deliberately do not have (column-level grants).
  async function writeFeedback(articleId: string, patch: { read_at?: string; thumb?: number }) {
    const updated = check(await supabase.from("news_feedback").update(patch).eq("article_id", articleId).select("article_id"));
    if ((updated ?? []).length === 0) check(await supabase.from("news_feedback").insert({ article_id: articleId, ...patch }));
  }

  return {
    async load(): Promise<NewsData> {
      const profile = check(await supabase.from("profiles").select("news_enabled").eq("id", userId).maybeSingle()) as { news_enabled?: boolean } | null;
      if (profile?.news_enabled !== true) return { enabled: false, items: [], lastRun: null, topics: [], prefs: null };
      const [feed, runs, topics, prefs] = await Promise.all([
        supabase.rpc("news_feed"),
        supabase.from("news_runs").select("status, started_at").neq("status", "running").order("id", { ascending: false }).limit(1),
        supabase.from("news_topics").select("slug, label").eq("active", true).order("position"),
        supabase.from("news_prefs").select("topics, interests, feed_size").maybeSingle(),
      ]);
      return {
        enabled: true,
        items: (check(feed) ?? []) as FeedItem[],
        lastRun: ((check(runs) ?? [])[0] ?? null) as LastRun,
        topics: (check(topics) ?? []) as Topic[],
        prefs: check(prefs) as Prefs | null,
      };
    },

    async savePrefs(prefs: Prefs) {
      // Clamp on the client for a friendly experience; the database enforces the same limits.
      const row = {
        topics: prefs.topics.slice(0, 20),
        interests: prefs.interests.slice(0, INTERESTS_MAX),
        feed_size: Math.min(FEED_SIZE_MAX, Math.max(FEED_SIZE_MIN, Math.round(prefs.feed_size))),
      };
      const updated = check(await supabase.from("news_prefs").update(row).eq("user_id", userId).select("user_id"));
      if ((updated ?? []).length === 0) check(await supabase.from("news_prefs").insert(row));
    },

    async markRead(articleIds: string[]) {
      const read_at = new Date().toISOString();
      await Promise.all(articleIds.map((id) => writeFeedback(id, { read_at })));
    },

    async setThumb(articleId: string, thumb: -1 | 0 | 1) {
      await writeFeedback(articleId, { thumb });
    },
  };
}
