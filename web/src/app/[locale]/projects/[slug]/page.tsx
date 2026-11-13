import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { notFound } from "next/navigation";
import fs from "node:fs";
import path from "node:path";
import { Icon } from "@/components/Icons";
import { Markdown } from "@/components/Markdown";
import { PyTerminal } from "@/components/PyTerminal";
import { Tabs, type Tab } from "@/components/Tabs";
import { Window } from "@/components/Window";
import { Link } from "@/i18n/navigation";
import { routing } from "@/i18n/routing";
import { pick } from "@/lib/localized";
import { loadProjects, REPO_ROOT } from "@/lib/projects";
import { loadReadme } from "@/lib/readme";

// One static page per project per language. A new manifest = a new page, no code change.
export function generateStaticParams() {
  return routing.locales.flatMap((locale) => loadProjects().map((p) => ({ locale, slug: p.slug })));
}

export async function generateMetadata({ params }: PageProps<"/[locale]/projects/[slug]">): Promise<Metadata> {
  const { locale, slug } = await params;
  const project = loadProjects().find((p) => p.slug === slug);
  return project ? { title: project.name, description: pick(project.summary, locale) } : {};
}

export default async function ProjectPage({ params }: PageProps<"/[locale]/projects/[slug]">) {
  const { locale, slug } = await params;
  setRequestLocale(locale);
  const project = loadProjects().find((p) => p.slug === slug);
  if (!project) notFound();
  const t = await getTranslations({ locale, namespace: "projects" });
  const tt = await getTranslations({ locale });
  const readme = await loadReadme(project);

  // Source files of an in-browser project (vendored into projects/<slug>/src).
  const srcDir = path.join(REPO_ROOT, "projects", project.slug, "src");
  const files =
    project.type === "in-browser" && fs.existsSync(srcDir)
      ? fs.readdirSync(srcDir).filter((f) => /\.(py|txt|json|csv)$/.test(f))
      : [];

  const howKey = { "in-browser": "inBrowser", static: "static", runner: "runner", "bot-status": "bot" }[project.type];

  const tabs: Tab[] = [
    {
      key: "overview",
      label: tt("tabs.overview"),
      content: readme ? <Markdown source={readme} /> : <p className="text-mute">{pick(project.summary, locale)}</p>,
    },
  ];
  if (project.in_browser && files.length > 0) {
    tabs.push({
      key: "run",
      label: tt("tabs.run"),
      content: (
        <div className="flex flex-col gap-4">
          <p className="max-w-3xl text-sm text-mute">{tt("run.hint")}</p>
          <PyTerminal slug={project.slug} files={files} entry={project.in_browser.entry} />
        </div>
      ),
    });
  }
  if (project.type === "runner") {
    tabs.push({
      key: "results",
      label: tt("tabs.results"),
      content: (
        <div className="flex flex-col gap-4">
          <p className="text-mute">{tt("results.soon")}</p>
          {project.runner?.disclaimer === "not-financial-advice" ? (
            <p className="rounded-md border border-line bg-tile p-4 text-sm text-mute">{t("disclaimer")}</p>
          ) : null}
        </div>
      ),
    });
  }
  tabs.push({
    key: "how",
    label: tt("tabs.how"),
    content: (
      <div className="flex max-w-3xl flex-col gap-5">
        <p className="leading-relaxed text-mute">{tt(`how.${howKey}`)}</p>
        {project.stack.length > 0 ? (
          <div className="flex flex-col gap-2">
            <h2 className="font-mono text-xs uppercase tracking-wider text-mute">{t("stack")}</h2>
            <ul className="flex flex-wrap gap-2">
              {project.stack.map((s) => (
                <li key={s} className="rounded-full border border-line px-3 py-1 text-sm">{s}</li>
              ))}
            </ul>
          </div>
        ) : null}
        {project.in_browser ? (
          <p className="font-mono text-xs text-mute">
            {tt("how.source")} {project.in_browser.source.ref.slice(0, 7)} · {project.in_browser.source.path}
          </p>
        ) : null}
      </div>
    ),
  });

  return (
    <div className="flex flex-col gap-6" style={{ "--accent": `var(--hue-${project.accent})` } as React.CSSProperties}>
      <Link href="/#projects" className="w-fit font-mono text-sm text-mute hover:text-text">
        ← {t("back")}
      </Link>
      <Window title={`~/projects/${project.slug}`}>
        <div className="flex flex-col gap-6 p-6 sm:p-8 lg:p-10">
          <div className="flex flex-col gap-4">
            <div className="flex flex-wrap items-center gap-3" style={{ color: "var(--accent)" }}>
              <Icon name={project.type} size={28} />
              <h1 className="text-4xl font-semibold tracking-tight text-text sm:text-5xl">{project.name}</h1>
            </div>
            <p className="max-w-3xl text-lg leading-relaxed text-mute">{pick(project.summary, locale)}</p>
            <div className="flex flex-wrap items-center gap-x-4 gap-y-2 font-mono text-xs text-mute">
              <span style={{ color: "var(--accent)" }}>{t(`type.${project.type}`)}</span>
              <span>{t(`status.${project.status}`)}</span>
              {project.repo ? (
                <a href={project.repo} target="_blank" rel="noopener noreferrer" className="underline underline-offset-4 hover:text-text">
                  {t("repo")}
                </a>
              ) : null}
            </div>
          </div>
          <Tabs tabs={tabs} label={tt("tabs.label")} />
        </div>
      </Window>
    </div>
  );
}
