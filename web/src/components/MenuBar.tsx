"use client";

import { useLocale, useTranslations } from "next-intl";
import { useEffect, useState } from "react";
import { Link, usePathname } from "@/i18n/navigation";

type Theme = "multicolor" | "mono";

/** Top menu bar: site name, section links, theme switch, language switch. */
export function MenuBar({ name }: { name: string }) {
  const t = useTranslations("nav");
  const locale = useLocale();
  const pathname = usePathname();
  const other = locale === "en" ? "de" : "en";
  const [theme, setTheme] = useState<Theme>("multicolor");

  // Remember the theme choice on this device. localStorage can be unavailable
  // (private mode, blocked storage), so every access is wrapped in try/catch.
  useEffect(() => {
    try {
      const saved = localStorage.getItem("theme");
      // eslint-disable-next-line react-hooks/set-state-in-effect -- one-time sync from storage after mount
      if (saved === "mono" || saved === "multicolor") setTheme(saved);
    } catch {}
  }, []);
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    try {
      localStorage.setItem("theme", theme);
    } catch {}
  }, [theme]);

  return (
    <header className="sticky top-0 z-20 border-b border-line bg-panel/90 backdrop-blur">
      <nav aria-label="Main" className="flex h-11 items-center justify-between gap-4 px-4 text-sm sm:px-6">
        <div className="flex min-w-0 items-center gap-5">
          <Link href="/" className="truncate font-semibold">{name}</Link>
          <a href={`/${locale}#projects`} className="hidden text-mute hover:text-text sm:inline">{t("projects")}</a>
          <a href={`/${locale}#skills`} className="hidden text-mute hover:text-text sm:inline">{t("skills")}</a>
          <a href={`/${locale}#contact`} className="hidden text-mute hover:text-text sm:inline">{t("contact")}</a>
        </div>
        <div className="flex items-center gap-1 font-mono text-xs">
          <button
            type="button"
            onClick={() => setTheme(theme === "mono" ? "multicolor" : "mono")}
            aria-label={`${t("theme")}: ${theme === "mono" ? t("themeMono") : t("themeMulti")}`}
            className="flex h-9 items-center gap-2 rounded-sm px-2 text-mute hover:text-text"
          >
            <span className="size-2.5 rounded-full" style={{ background: "var(--accent)" }} />
            {theme === "mono" ? t("themeMono") : t("themeMulti")}
          </button>
          <Link
            href={pathname}
            locale={other}
            aria-label={`${t("language")}: ${other.toUpperCase()}`}
            className="flex h-9 items-center rounded-sm px-2 text-mute hover:text-text"
          >
            <span className="text-text">{locale.toUpperCase()}</span>&nbsp;/ {other.toUpperCase()}
          </Link>
        </div>
      </nav>
    </header>
  );
}
