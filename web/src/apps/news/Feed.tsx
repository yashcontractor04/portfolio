"use client";

import { useFormatter, useTranslations } from "next-intl";
import { useCallback, useEffect, useRef, useState } from "react";
import { Icon } from "@/components/Icons";
import { Card } from "./Card";
import { feedNotice, nextRefresh } from "./logic";
import type { FeedItem, LastRun, Topic } from "./types";

const button = "flex h-10 items-center gap-2 rounded-sm border border-line px-3 text-sm text-mute hover:text-text disabled:cursor-not-allowed disabled:opacity-50";

type Props = {
  items: FeedItem[];
  topics: Topic[];
  lastRun: LastRun;
  hasTopics: boolean;
  now: Date;
  read: ReadonlySet<string>;
  onRead: (articleIds: string[]) => void;
  onThumb: (articleId: string, thumb: -1 | 0 | 1) => void;
  onRefresh: () => void;
  onSettings: () => void;
};

/**
 * The reel: one full-height card per article, CSS scroll-snap between them, and a
 * last card that says "All caught up". The list is fixed when it loads. Nothing is
 * added while you scroll, so the feed always ends.
 */
export function Feed({ items, topics, lastRun, hasTopics, now, read, onRead, onThumb, onRefresh, onSettings }: Props) {
  const t = useTranslations("news");
  const format = useFormatter();
  const scroller = useRef<HTMLDivElement>(null);
  const [index, setIndex] = useState(0);
  const total = items.length;
  const notice = feedNotice(lastRun, now);
  const unread = items.filter((item) => !read.has(item.article_id)).map((item) => item.article_id);

  // Which card is on screen? The browser tells us (IntersectionObserver), so there
  // is no scroll-event arithmetic.
  useEffect(() => {
    const root = scroller.current;
    if (!root) return;
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) setIndex(Number((entry.target as HTMLElement).dataset.index));
        }
      },
      { root, threshold: 0.6 },
    );
    root.querySelectorAll("[data-index]").forEach((el) => observer.observe(el));
    return () => observer.disconnect();
  }, [total]);

  const go = useCallback((target: number) => {
    const root = scroller.current;
    const el = root?.querySelector<HTMLElement>(`[data-index="${target}"]`);
    if (!root || !el) return;
    const calm = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    root.scrollTo({ top: el.offsetTop - root.offsetTop, behavior: calm ? "auto" : "smooth" });
  }, []);

  // Arrow keys or j / k move between cards while focus is inside the feed.
  function onKeyDown(event: React.KeyboardEvent) {
    if ((event.target as HTMLElement).closest("input, textarea, select")) return;
    if (event.metaKey || event.ctrlKey || event.altKey) return;
    if (event.key === "ArrowDown" || event.key === "j") {
      event.preventDefault();
      go(Math.min(index + 1, total));
    } else if (event.key === "ArrowUp" || event.key === "k") {
      event.preventDefault();
      go(Math.max(index - 1, 0));
    }
  }

  const position = total === 0 ? "" : index < total ? t("position", { current: index + 1, total }) : t("caughtUp");
  // With no cards at all, the end card already explains why; no banner on top of it.
  const banner = total === 0 && notice === "never" ? null : notice;

  return (
    <div>
      <div className="flex flex-wrap items-center gap-3 border-b border-line px-5 py-3">
        {/* Story-style progress: one segment per card, filled as you go. */}
        <div className="flex min-w-24 flex-1 gap-1" aria-hidden="true">
          {items.map((item, i) => (
            <span key={item.article_id} data-done={i <= index} className="news-segment h-1 flex-1 rounded-full" />
          ))}
        </div>
        <p className="font-mono text-xs text-mute" aria-live="polite">
          {position}
        </p>
        <div className="flex gap-2">
          <button type="button" onClick={() => go(Math.max(index - 1, 0))} disabled={index === 0} aria-label={t("previous")} title={t("previous")} className={button}>
            <Icon name="up" size={18} />
          </button>
          <button type="button" onClick={() => go(Math.min(index + 1, total))} disabled={index >= total} aria-label={t("next")} title={t("next")} className={button}>
            <Icon name="down" size={18} />
          </button>
          <button type="button" onClick={onSettings} aria-label={t("settings.open")} title={t("settings.open")} className={button}>
            <Icon name="gear" size={18} />
          </button>
        </div>
      </div>

      {banner ? (
        <p role="status" className="border-b border-line bg-tile px-5 py-2 text-sm text-mute">
          {t(`notice.${banner}`)}
        </p>
      ) : null}

      <div
        ref={scroller}
        tabIndex={0}
        role="region"
        aria-label={t("feedLabel")}
        onKeyDown={onKeyDown}
        className="news-scroller relative snap-y snap-mandatory overflow-y-auto"
      >
        {items.map((item, i) => (
          <div key={item.article_id} data-index={i} className="h-full snap-start">
            <Card
              item={item}
              topics={topics}
              now={now}
              active={i === index}
              read={read.has(item.article_id)}
              onRead={() => onRead([item.article_id])}
              onThumb={(thumb) => onThumb(item.article_id, thumb)}
            />
          </div>
        ))}

        <section data-index={total} data-active={index === total} aria-labelledby="news-end" className="news-card flex h-full snap-start flex-col items-center justify-center gap-4 px-6 text-center">
          <span className="news-end-mark flex size-16 items-center justify-center rounded-full border border-line-strong">
            <Icon name="check" size={30} />
          </span>
          <h2 id="news-end" className="text-2xl font-semibold tracking-tight">
            {total > 0 || notice !== "never" ? t("caughtUp") : t("empty.neverTitle")}
          </h2>
          <p className="max-w-md text-mute">
            {!hasTopics
              ? t("empty.noTopics")
              : notice === "never"
                ? t("empty.never")
                : t("nextRefresh", { time: format.dateTime(nextRefresh(now), { hour: "2-digit", minute: "2-digit" }) })}
          </p>
          <div className="flex flex-wrap justify-center gap-2">
            {unread.length > 0 ? (
              <button type="button" onClick={() => onRead(unread)} className={button}>
                <Icon name="check" size={18} /> {t("markAllRead")}
              </button>
            ) : null}
            <button type="button" onClick={onRefresh} className={button}>
              {t("checkNow")}
            </button>
            {!hasTopics ? (
              <button type="button" onClick={onSettings} className={button}>
                <Icon name="gear" size={18} /> {t("settings.open")}
              </button>
            ) : null}
          </div>
        </section>
      </div>
    </div>
  );
}
