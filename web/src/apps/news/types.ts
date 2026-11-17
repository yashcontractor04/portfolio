/** One card of the feed, as returned by the database function public.news_feed(). */
export type FeedItem = {
  article_id: string;
  url: string;
  title: string;
  source: string;
  image_url: string | null;
  topics: string[];
  published_at: string;
  intro: string | null;
  summary: string | null;
  snippet: string | null;
  /** 2-5 keywords saying what matched the reader. Shown as "Relevance". */
  why: string;
  score: number;
  thumb: -1 | 0 | 1;
};

/** The newest pipeline run that has finished, or null if there has never been one. */
export type LastRun = { status: "ok" | "limited" | "failed"; started_at: string } | null;

export type Topic = { slug: string; label: string };

export type Prefs = { topics: string[]; interests: string; feed_size: number };

export const DEFAULT_PREFS: Prefs = { topics: [], interests: "", feed_size: 10 };
export const INTERESTS_MAX = 500; // same limit as the database check constraint
export const FEED_SIZE_MIN = 5;
export const FEED_SIZE_MAX = 20;

export type NewsData = { enabled: boolean; items: FeedItem[]; lastRun: LastRun; topics: Topic[]; prefs: Prefs | null };

/**
 * Everything the UI needs from the backend. There is one implementation
 * (supabase.ts): News is for logged-in users only, so it has no demo store.
 */
export interface NewsStore {
  load(): Promise<NewsData>;
  savePrefs(prefs: Prefs): Promise<void>;
  markRead(articleIds: string[]): Promise<void>;
  setThumb(articleId: string, thumb: -1 | 0 | 1): Promise<void>;
}
