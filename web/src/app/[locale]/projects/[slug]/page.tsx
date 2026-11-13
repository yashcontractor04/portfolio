import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { notFound } from "next/navigation";
import { Icon } from "@/components/Icons";
import { Window } from "@/components/Window";
import { Link } from "@/i18n/navigation";
import { routing } from "@/i18n/routing";
import { pick } from "@/lib/localized";
import { loadProjects } from "@/lib/projects";

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

  return (
    <div className="flex flex-col gap-6" style={{ "--accent": `var(--hue-${project.accent})` } as React.CSSProperties}>
      <Link href="/#projects" className="w-fit font-mono text-sm text-mute hover:text-text">
        ← {t("back")}
      </Link>
      <Window title={`~/projects/${project.slug}`}>
        <div className="flex flex-col gap-5 p-6 sm:p-8 lg:p-10">
          <div className="flex flex-wrap items-center gap-3" style={{ color: "var(--accent)" }}>
            <Icon name={project.type} size={28} />
            <h1 className="text-4xl font-semibold tracking-tight text-text sm:text-5xl">{project.name}</h1>
          </div>
          <p className="max-w-3xl text-lg leading-relaxed text-mute">{pick(project.summary, locale)}</p>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2 font-mono text-xs text-mute">
            <span style={{ color: "var(--accent)" }}>{t(`type.${project.type}`)}</span>
            <span>{t(`status.${project.status}`)}</span>
          </div>
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
          {project.status !== "live" ? <p className="text-mute">{t("runSoon")}</p> : null}
          {project.runner?.disclaimer === "not-financial-advice" ? (
            <p className="rounded-md border border-line bg-tile p-4 text-sm text-mute">{t("disclaimer")}</p>
          ) : null}
          {project.repo ? (
            <a href={project.repo} target="_blank" rel="noopener noreferrer" className="flex h-12 w-fit items-center gap-2 rounded-md border border-line px-5 hover:border-line-strong">
              {t("repo")} <Icon name="arrow" size={18} />
            </a>
          ) : null}
        </div>
      </Window>
    </div>
  );
}
