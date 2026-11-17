"use client";

import { useFormatter, useTranslations } from "next-intl";
import { useState } from "react";
import { Icon } from "@/components/Icons";
import { paragraphs, relevanceTags, safeHttpUrl } from "./logic";
import type { FeedItem, Topic } from "./types";

// Each preset has its own hue and icon, used for the chip and the image fallback.
const TOPIC_LOOK: Record<string, { hue: string; icon: string }> = {
  "ai-jobs": { hue: "violet", icon: "chip" },
  "germany-berlin": { hue: "teal", icon: "city" },
  markets: { hue: "amber", icon: "chart" },
  geopolitics: { hue: "blue", icon: "globe" },
  "local-politics": { hue: "pink", icon: "flag" },
};
const DEFAULT_LOOK = { hue: "orange", icon: "news" };

const action =
  "flex h-11 min-w-11 items-center justify-center gap-2 rounded-sm border border-line px-3 text-sm text-mute hover:text-text aria-pressed:border-line-strong aria-pressed:text-text";

type Props = {
  item: FeedItem;
  topics: Topic[];
  now: Date;
  active: boolean;
  read: boolean;
  onRead: () => void;
  onThumb: (thumb: -1 | 0 | 1) => void;
};

export function Card({ item, topics, now, active, read, onRead, onThumb }: Props) {
  const t = useTranslations("news");
  const format = useFormatter();
  const [imageFailed, setImageFailed] = useState(false);

  const slug = item.topics.find((s) => TOPIC_LOOK[s]) ?? item.topics[0] ?? "";
  const look = TOPIC_LOOK[slug] ?? DEFAULT_LOOK;
  const topicLabel = t.has(`topics.${slug}`) ? t(`topics.${slug}`) : topics.find((x) => x.slug === slug)?.label;
  const image = imageFailed ? null : safeHttpUrl(item.image_url, true);
  const link = safeHttpUrl(item.url);
  const tags = relevanceTags(item.why);
  // A publisher's clock may run ahead of ours: never show "in 5 minutes".
  const published = new Date(Math.min(new Date(item.published_at).getTime(), now.getTime()));
  // Model output is rendered as plain text nodes only: never as HTML.
  const body = item.summary ? paragraphs(item.summary) : [];

  return (
    <article
      aria-labelledby={`news-${item.article_id}`}
      data-active={active}
      className="news-card flex h-full snap-start flex-col"
      style={{ "--card-hue": `var(--hue-${look.hue})` } as React.CSSProperties}
    >
      <div className="news-hero relative h-28 shrink-0 overflow-hidden border-b border-line sm:h-52">
        {image ? (
          // A plain <img>: the picture stays on the publisher's server (hotlinked, never copied).
          // No referrer is sent, and under COEP credentialless no cookies either.
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={image}
            alt=""
            loading="lazy"
            decoding="async"
            referrerPolicy="no-referrer"
            onError={() => setImageFailed(true)}
            // An image can fail before React is listening (e.g. blocked while the page loads):
            // "finished loading but has no size" means the same thing.
            ref={(img) => {
              if (img?.complete && img.naturalWidth === 0) setImageFailed(true);
            }}
            className="size-full object-cover"
          />
        ) : (
          <div className="news-fallback flex size-full items-center justify-center" aria-hidden="true">
            <Icon name={look.icon} size={56} />
          </div>
        )}
      </div>

      <div className="news-body min-h-0 flex-1 overflow-y-auto px-5 py-4 sm:px-8">
        <div className="mx-auto max-w-3xl">
          <p className="flex flex-wrap items-center gap-x-2 gap-y-1 font-mono text-xs text-mute">
            {topicLabel ? (
              <>
                <span style={{ color: "var(--card-hue)" }}>{topicLabel}</span>
                <span aria-hidden="true">·</span>
              </>
            ) : null}
            <span>{item.source}</span>
            <span aria-hidden="true">·</span>
            <time dateTime={item.published_at}>{format.relativeTime(published, now)}</time>
            {read ? (
              <span className="flex items-center gap-1 text-text">
                <Icon name="check" size={14} /> {t("read")}
              </span>
            ) : null}
          </p>
          <h2 id={`news-${item.article_id}`} className="mt-2 text-xl font-semibold tracking-tight sm:text-2xl">
            {item.title}
          </h2>
          {tags.length > 0 ? (
            <p className="mt-3 flex flex-wrap items-center gap-2 text-xs">
              <span className="font-mono uppercase tracking-wider text-mute">{t("relevance")}</span>
              {tags.map((tag) => (
                <span key={tag} className="news-tag rounded-full border px-2 py-0.5">
                  {tag}
                </span>
              ))}
            </p>
          ) : null}
          {item.intro ? <p className="mt-4 text-base text-text">{item.intro}</p> : null}
          {body.length > 0 ? (
            <div className="mt-3 space-y-3 leading-relaxed text-mute">
              {body.map((paragraph, index) => (
                <p key={index}>{paragraph}</p>
              ))}
            </div>
          ) : (
            <div className="mt-3 space-y-3 leading-relaxed text-mute">
              {item.snippet ? <p>{item.snippet}</p> : null}
              <p className="font-mono text-xs">{t("summaryPending")}</p>
            </div>
          )}
        </div>
      </div>

      <div className="flex shrink-0 flex-wrap items-center gap-2 border-t border-line px-5 py-3 sm:px-8">
        <button type="button" aria-pressed={item.thumb === 1} aria-label={t("thumbUp")} title={t("thumbUp")} onClick={() => onThumb(item.thumb === 1 ? 0 : 1)} className={`${action} news-press`}>
          <Icon name="thumb-up" size={18} />
        </button>
        <button type="button" aria-pressed={item.thumb === -1} aria-label={t("thumbDown")} title={t("thumbDown")} onClick={() => onThumb(item.thumb === -1 ? 0 : -1)} className={`${action} news-press`}>
          <Icon name="thumb-down" size={18} />
        </button>
        <button type="button" aria-pressed={read} disabled={read} onClick={onRead} className={`${action} news-press disabled:cursor-default`}>
          <Icon name="check" size={18} /> {read ? t("read") : t("markRead")}
        </button>
        {link ? (
          <a href={link} target="_blank" rel="noopener noreferrer" aria-label={t("original")} title={t("original")} className={`${action} ml-auto`}>
            <span className="hidden sm:inline">{t("original")}</span> <Icon name="external" size={16} />
          </a>
        ) : null}
      </div>
    </article>
  );
}
