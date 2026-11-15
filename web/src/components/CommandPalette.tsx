"use client";

import { Command } from "cmdk";
import { useLocale, useTranslations } from "next-intl";
import { useEffect, useState } from "react";
import { APPS } from "@/apps/registry";
import { usePathname, useRouter } from "@/i18n/navigation";
import { useAuth } from "./AuthProvider";

/**
 * Spotlight-style command palette (cmdk). Open with Cmd+K / Ctrl+K or the
 * button in the menu bar; type to jump to any project, app, section or action.
 */
export function CommandPalette({ projects }: { projects: { slug: string; name: string }[] }) {
  const t = useTranslations();
  const locale = useLocale();
  const router = useRouter();
  const pathname = usePathname();
  const { user, available, signOut } = useAuth();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key.toLowerCase() === "k" && (event.metaKey || event.ctrlKey)) {
        event.preventDefault();
        setOpen((value) => !value);
      }
    };
    const onOpen = () => setOpen(true); // fired by the menu bar button
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("open-command-palette", onOpen);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("open-command-palette", onOpen);
    };
  }, []);

  const run = (action: () => void) => () => {
    setOpen(false);
    action();
  };
  const go = (href: string) => run(() => router.push(href));
  const section = (hash: string) => go(`/#${hash}`);
  const other = locale === "en" ? "de" : "en";

  const item = "flex cursor-pointer items-center justify-between rounded-sm px-3 py-2.5 text-sm data-[selected=true]:bg-tile";
  const kind = "font-mono text-xs text-mute";
  const heading = "[&_[cmdk-group-heading]]:px-3 [&_[cmdk-group-heading]]:py-1.5 [&_[cmdk-group-heading]]:font-mono [&_[cmdk-group-heading]]:text-xs [&_[cmdk-group-heading]]:uppercase [&_[cmdk-group-heading]]:tracking-wider [&_[cmdk-group-heading]]:text-mute";

  return (
    <Command.Dialog
      open={open}
      onOpenChange={setOpen}
      label={t("palette.label")}
      overlayClassName="fixed inset-0 z-40 bg-black/70"
      contentClassName="fixed left-1/2 top-[15vh] z-50 w-[min(92vw,36rem)] -translate-x-1/2 overflow-hidden rounded-lg border border-line-strong bg-panel shadow-2xl"
    >
      <Command.Input placeholder={t("palette.placeholder")} className="h-14 w-full border-b border-line bg-transparent px-5 text-base placeholder:text-mute focus:outline-none" />
      <Command.List className="max-h-[50vh] overflow-y-auto p-2">
        <Command.Empty className="px-3 py-6 text-center text-sm text-mute">{t("palette.empty")}</Command.Empty>
        <Command.Group heading={t("nav.projects")} className={heading}>
          {projects.map((p) => (
            <Command.Item key={p.slug} value={`${p.name} ${p.slug}`} onSelect={go(`/projects/${p.slug}`)} className={item}>
              {p.name} <span className={kind}>{t("palette.project")}</span>
            </Command.Item>
          ))}
        </Command.Group>
        <Command.Group heading={t("palette.apps")} className={heading}>
          {APPS.map((app) => (
            <Command.Item key={app.key} value={t(`apps.names.${app.key}`)} onSelect={go(app.href)} className={item}>
              {t(`apps.names.${app.key}`)} <span className={kind}>{user ? t("palette.app") : t("apps.demo")}</span>
            </Command.Item>
          ))}
        </Command.Group>
        <Command.Group heading={t("palette.pages")} className={heading}>
          <Command.Item onSelect={go("/")} className={item}>{t("nav.home")}</Command.Item>
          <Command.Item onSelect={section("projects")} className={item}>{t("nav.projects")}</Command.Item>
          <Command.Item onSelect={section("skills")} className={item}>{t("nav.skills")}</Command.Item>
          <Command.Item onSelect={section("contact")} className={item}>{t("nav.contact")}</Command.Item>
        </Command.Group>
        <Command.Group heading={t("palette.actions")} className={heading}>
          <Command.Item value={`${t("hero.cv")} cv pdf`} onSelect={run(() => window.open(`/cv/cv-${locale}.pdf`, "_blank", "noopener"))} className={item}>
            {t("hero.cv")}
          </Command.Item>
          <Command.Item value={`${t("nav.language")} ${other} deutsch english`} onSelect={run(() => router.replace(pathname, { locale: other }))} className={item}>
            {t("nav.language")}: {other.toUpperCase()}
          </Command.Item>
          {available ? (
            user ? (
              <Command.Item onSelect={run(() => void signOut())} className={item}>{t("auth.logout")}</Command.Item>
            ) : (
              <Command.Item onSelect={go("/login")} className={item}>{t("auth.title.login")}</Command.Item>
            )
          ) : null}
        </Command.Group>
      </Command.List>
    </Command.Dialog>
  );
}
