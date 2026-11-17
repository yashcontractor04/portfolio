"use client";

import { useTranslations } from "next-intl";
import { useState } from "react";
import { FEED_SIZE_MAX, FEED_SIZE_MIN, INTERESTS_MAX, type Prefs, type Topic } from "./types";

const button = "h-10 rounded-sm border border-line px-4 text-sm text-mute hover:text-text disabled:cursor-not-allowed disabled:opacity-50";

type Props = { prefs: Prefs; topics: Topic[]; onSave: (prefs: Prefs) => Promise<void>; onClose: () => void };

/** Topics (preset chips), free-text interests and N. Applies at the next refresh. */
export function Settings({ prefs, topics, onSave, onClose }: Props) {
  const t = useTranslations("news");
  const [draft, setDraft] = useState<Prefs>(prefs);
  const [state, setState] = useState<"idle" | "saving" | "error">("idle");

  const toggle = (slug: string) =>
    setDraft((d) => ({ ...d, topics: d.topics.includes(slug) ? d.topics.filter((s) => s !== slug) : [...d.topics, slug] }));

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setState("saving");
    try {
      await onSave(draft);
      onClose();
    } catch {
      setState("error");
    }
  }

  return (
    <form onSubmit={submit} className="mx-auto max-w-2xl space-y-8 px-5 py-8">
      <h2 className="text-2xl font-semibold tracking-tight">{t("settings.title")}</h2>

      <fieldset>
        <legend className="text-sm font-medium">{t("settings.topics")}</legend>
        <div className="mt-3 flex flex-wrap gap-2">
          {topics.map((topic) => (
            <button
              key={topic.slug}
              type="button"
              aria-pressed={draft.topics.includes(topic.slug)}
              onClick={() => toggle(topic.slug)}
              className="news-chip news-press h-10 rounded-full border border-line px-4 text-sm text-mute hover:text-text"
            >
              {t.has(`topics.${topic.slug}`) ? t(`topics.${topic.slug}`) : topic.label}
            </button>
          ))}
        </div>
      </fieldset>

      <div>
        <label htmlFor="news-interests" className="text-sm font-medium">
          {t("settings.interests")}
        </label>
        <p id="news-interests-help" className="mt-1 text-sm text-mute">
          {t("settings.interestsHelp")}
        </p>
        <textarea
          id="news-interests"
          aria-describedby="news-interests-help"
          value={draft.interests}
          maxLength={INTERESTS_MAX}
          rows={5}
          onChange={(event) => setDraft((d) => ({ ...d, interests: event.target.value }))}
          className="mt-3 w-full rounded-sm border border-line bg-bg p-3 text-sm text-text placeholder:text-mute"
        />
        <p className="mt-1 text-right font-mono text-xs text-mute">
          {draft.interests.length} / {INTERESTS_MAX}
        </p>
      </div>

      <div>
        <label htmlFor="news-size" className="text-sm font-medium">
          {t("settings.size", { count: draft.feed_size })}
        </label>
        <p id="news-size-help" className="mt-1 text-sm text-mute">
          {t("settings.sizeHelp")}
        </p>
        <input
          id="news-size"
          aria-describedby="news-size-help"
          type="range"
          min={FEED_SIZE_MIN}
          max={FEED_SIZE_MAX}
          value={draft.feed_size}
          onChange={(event) => setDraft((d) => ({ ...d, feed_size: Number(event.target.value) }))}
          className="news-range mt-3 w-full"
        />
      </div>

      {state === "error" ? (
        <p role="alert" className="text-sm" style={{ color: "var(--negative)" }}>
          {t("settings.error")}
        </p>
      ) : null}
      <div className="flex flex-wrap items-center gap-3">
        <button type="submit" disabled={state === "saving"} className={`${button} border-line-strong text-text`}>
          {state === "saving" ? t("settings.saving") : t("settings.save")}
        </button>
        <button type="button" onClick={onClose} className={button}>
          {t("settings.cancel")}
        </button>
        <span className="text-sm text-mute">{t("settings.applies")}</span>
      </div>
    </form>
  );
}
