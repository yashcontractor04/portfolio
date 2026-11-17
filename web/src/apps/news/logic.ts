import type { LastRun } from "./types";

/** Minutes past the hour at which .github/workflows/news.yml starts the pipeline (UTC).
 *  Keep in step with the cron line there. */
export const RUN_MINUTES = [7];
const RUN_INTERVAL_MINUTES = 60 / RUN_MINUTES.length;

/** The next scheduled pipeline start after `now`. GitHub may start it some minutes late. */
export function nextRefresh(now: Date): Date {
  const next = new Date(now);
  next.setUTCSeconds(0, 0);
  const minute = RUN_MINUTES.find((m) => m > now.getUTCMinutes());
  if (minute === undefined) {
    next.setUTCHours(next.getUTCHours() + 1, RUN_MINUTES[0]);
  } else {
    next.setUTCMinutes(minute);
  }
  return next;
}

export type Notice = "never" | "limited" | "failed" | "stale" | null;

/** What to tell the reader about the pipeline, derived from its last finished run. */
export function feedNotice(lastRun: LastRun, now: Date): Notice {
  if (!lastRun) return "never";
  if (lastRun.status === "limited") return "limited";
  if (lastRun.status === "failed") return "failed";
  // About three missed runs in a row: the schedule is late or switched off.
  if (now.getTime() - new Date(lastRun.started_at).getTime() > 3.3 * RUN_INTERVAL_MINUTES * 60_000) return "stale";
  return null;
}

/** "Nvidia earnings, AI bubble" -> ["Nvidia earnings", "AI bubble"]. At most 5, each short. */
export function relevanceTags(why: string): string[] {
  return why
    .split(/[,;·|]/)
    .map((tag) => tag.trim().slice(0, 40))
    .filter(Boolean)
    .slice(0, 5);
}

/** Paragraphs of a plain-text summary. */
export function paragraphs(text: string): string[] {
  return text
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter(Boolean);
}

/** Only real web links may be opened or used as an image source. */
export function safeHttpUrl(url: string | null, httpsOnly = false): string | null {
  if (!url) return null;
  try {
    const parsed = new URL(url);
    const ok = parsed.protocol === "https:" || (!httpsOnly && parsed.protocol === "http:");
    return ok ? parsed.href : null;
  } catch {
    return null;
  }
}
