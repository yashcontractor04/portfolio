import { getTranslations, setRequestLocale } from "next-intl/server";
import { Icon } from "@/components/Icons";
import { ProjectGrid, type ProjectCard } from "@/components/ProjectGrid";
import { StatTile } from "@/components/StatTile";
import { Window } from "@/components/Window";
import { loadCv } from "@/lib/cv";
import { pick } from "@/lib/localized";
import { loadProjects } from "@/lib/projects";

export default async function HomePage({ params }: PageProps<"/[locale]">) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations({ locale });

  // Both files are read at build time: the page ships as static HTML.
  const cv = loadCv();
  const projects = loadProjects();
  const live = projects.filter((p) => p.status === "live").length;
  const inProgress = projects.filter((p) => p.status === "building").length;
  const building = projects.find((p) => p.status === "building" && p.featured) ?? projects.find((p) => p.status === "building");

  const cards: ProjectCard[] = projects.map((p) => ({
    slug: p.slug,
    name: p.name,
    summary: pick(p.summary, locale),
    type: p.type,
    status: p.status,
    featured: p.featured,
    tags: p.tags,
    accent: p.accent,
    stack: p.stack,
  }));

  return (
    <div className="flex flex-col gap-14">
      {/* Hero */}
      <Window title="~/yash — about">
        <div className="grid gap-8 p-6 sm:p-8 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)] lg:items-center lg:p-10">
          <div className="flex flex-col gap-5">
            <h1 className="text-5xl font-semibold leading-[1.02] tracking-tight sm:text-6xl xl:text-7xl">
              {t("hero.title")}
            </h1>
            <p className="max-w-2xl text-lg leading-relaxed text-mute">{pick(cv.person.about, locale)}</p>
            <div className="flex flex-wrap gap-3 pt-1">
              <a href="#projects" className="flex h-12 items-center gap-2 rounded-md bg-text px-6 font-semibold text-bg">
                {t("hero.explore")} <Icon name="arrow" size={18} />
              </a>
              {/* Built from content/cv.yaml by .github/workflows/cv.yml */}
              <a
                href={`/cv/cv-${locale}.pdf`}
                download={`Yash-Contractor-CV-${locale.toUpperCase()}.pdf`}
                className="flex h-12 items-center rounded-md border border-line px-6 font-medium hover:border-line-strong"
              >
                {t("hero.cv")}
              </a>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <StatTile value={String(live)} label={t("stats.live")} />
            <StatTile value={String(inProgress)} label={t("stats.inProgress")} />
            {building ? <StatTile wide value={building.name} label={t("stats.building")} /> : null}
          </div>
        </div>
      </Window>

      {/* Projects */}
      <section id="projects" aria-labelledby="projects-title" className="flex scroll-mt-16 flex-col gap-5">
        <h2 id="projects-title" className="text-3xl font-semibold tracking-tight">{t("projects.title")}</h2>
        <ProjectGrid projects={cards} />
      </section>

      {/* Skills */}
      <section id="skills" aria-labelledby="skills-title" className="flex scroll-mt-16 flex-col gap-5">
        <h2 id="skills-title" className="text-3xl font-semibold tracking-tight">{t("skills.title")}</h2>
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {cv.skills.map((group) => (
            <div key={pick(group.group, "en")} className="flex flex-col gap-3 rounded-md border border-line bg-tile p-5">
              <h3 className="font-mono text-xs uppercase tracking-wider text-mute">{pick(group.group, locale)}</h3>
              <ul className="flex flex-wrap gap-2">
                {group.items.map((item) => (
                  <li key={pick(item, "en")} className="rounded-full border border-line px-3 py-1 text-sm">
                    {pick(item, locale)}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </section>

      {/* Footer / contact */}
      <footer id="contact" className="flex scroll-mt-16 flex-col gap-6 border-t border-line pt-10">
        <div className="flex flex-col gap-3">
          <h2 className="text-3xl font-semibold tracking-tight">{t("footer.contact")}</h2>
          <p className="text-mute">{t("footer.contactText")}</p>
          <div className="flex flex-wrap gap-3">
            <a href={`mailto:${cv.person.email}`} className="flex h-12 items-center gap-2 rounded-md border border-line px-5 hover:border-line-strong">
              <Icon name="mail" size={18} /> {t("footer.email")}
            </a>
            <a href={cv.person.links.github} rel="noopener noreferrer" target="_blank" className="flex h-12 items-center rounded-md border border-line px-5 hover:border-line-strong">
              GitHub
            </a>
            <a href={cv.person.links.linkedin} rel="noopener noreferrer" target="_blank" className="flex h-12 items-center rounded-md border border-line px-5 hover:border-line-strong">
              LinkedIn
            </a>
          </div>
        </div>
        <p className="font-mono text-xs text-mute">{t("footer.credit")}</p>
      </footer>
    </div>
  );
}
