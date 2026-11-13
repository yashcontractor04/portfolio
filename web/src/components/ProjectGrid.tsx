"use client";

import { useTranslations } from "next-intl";
import { useState } from "react";
import { Link } from "@/i18n/navigation";
import { Icon } from "./Icons";

// Only the fields the grid needs are sent to the browser (not the whole manifest).
export type ProjectCard = {
  slug: string;
  name: string;
  summary: string;
  type: "static" | "in-browser" | "runner" | "bot-status";
  status: "live" | "building" | "coming-soon";
  featured: boolean;
  tags: string[];
  accent: string;
  stack: string[];
};

const FILTERS = ["all", "python", "bots", "data", "web"] as const;

/** Bento grid of projects with tag filters. Featured projects get a double-width tile. */
export function ProjectGrid({ projects }: { projects: ProjectCard[] }) {
  const t = useTranslations("projects");
  const [filter, setFilter] = useState<(typeof FILTERS)[number]>("all");
  const visible = projects.filter((p) => filter === "all" || p.tags.includes(filter));

  return (
    <div className="flex flex-col gap-5">
      <div role="group" aria-label={t("filter")} className="flex flex-wrap gap-2">
        {FILTERS.map((f) => (
          <button
            key={f}
            type="button"
            aria-pressed={filter === f}
            onClick={() => setFilter(f)}
            className={`h-11 rounded-full border px-4 text-sm transition-colors ${
              filter === f ? "border-text bg-text text-bg" : "border-line text-mute hover:text-text"
            }`}
          >
            {t(f)}
          </button>
        ))}
      </div>

      {visible.length === 0 ? <p className="text-mute">{t("empty")}</p> : null}

      <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {visible.map((p) => (
          <li key={p.slug} className={p.featured ? "sm:col-span-2" : ""}>
            <Link
              href={`/projects/${p.slug}`}
              className="spot flex h-full flex-col gap-3 rounded-md border border-line bg-tile p-5"
              style={{ "--accent": `var(--hue-${p.accent})` } as React.CSSProperties}
            >
              <div className="flex items-center justify-between gap-3">
                <span className="flex items-center gap-2.5" style={{ color: "var(--accent)" }}>
                  <Icon name={p.type} />
                  <span className={`font-semibold text-text ${p.featured ? "text-xl" : "text-base"}`}>{p.name}</span>
                </span>
                <span className="flex shrink-0 items-center gap-1.5 font-mono text-xs text-mute">
                  <span
                    className="size-2 rounded-full"
                    style={{ background: p.status === "live" ? "var(--positive)" : "var(--line-strong)" }}
                  />
                  {t(`status.${p.status}`)}
                </span>
              </div>
              <p className="text-sm leading-relaxed text-mute">{p.summary}</p>
              <div className="mt-auto flex flex-wrap items-center gap-x-3 gap-y-1 pt-2 font-mono text-xs text-mute">
                <span style={{ color: "var(--accent)" }}>{t(`type.${p.type}`)}</span>
                {p.stack.slice(0, 3).map((s) => (
                  <span key={s}>{s}</span>
                ))}
              </div>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
