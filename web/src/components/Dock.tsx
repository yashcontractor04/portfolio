"use client";

import { useLocale, useTranslations } from "next-intl";
import { APPS } from "@/apps/registry";
import { Link } from "@/i18n/navigation";
import { useAuth } from "./AuthProvider";
import { Icon } from "./Icons";

const tile =
  "flex size-12 items-center justify-center rounded-md border border-line bg-tile transition-transform duration-150 hover:-translate-y-1 motion-reduce:transition-none motion-reduce:hover:translate-y-0";

/**
 * Bottom dock. Guests see the section links plus the apps in demo mode.
 * After login it turns into the app launcher with a log-out button.
 */
export function Dock() {
  const t = useTranslations();
  const locale = useLocale();
  const { user, available, signOut } = useAuth();
  const sections = [
    { href: `/${locale}`, label: t("nav.home"), icon: "home", hue: "blue" },
    ...(user
      ? []
      : [
          { href: `/${locale}#projects`, label: t("nav.projects"), icon: "grid", hue: "teal" },
          { href: `/${locale}#skills`, label: t("nav.skills"), icon: "spark", hue: "violet" },
          { href: `/${locale}#contact`, label: t("nav.contact"), icon: "mail", hue: "orange" },
        ]),
  ];
  return (
    <nav aria-label="Dock" className="pointer-events-none fixed inset-x-0 bottom-4 z-20 flex justify-center px-2">
      <ul className="pointer-events-auto flex max-w-full items-end gap-2 overflow-x-auto rounded-[22px] border border-line bg-panel/90 p-2 backdrop-blur">
        {sections.map((item) => (
          <li key={item.href}>
            <a href={item.href} aria-label={item.label} title={item.label} className={tile} style={{ color: `var(--hue-${item.hue})` }}>
              <Icon name={item.icon} size={22} />
            </a>
          </li>
        ))}
        <li aria-hidden="true" className="mx-1 h-10 w-px self-center bg-line" />
        {APPS.map((app) => {
          const label = t(`apps.names.${app.key}`) + (user ? "" : ` (${t("apps.demo")})`);
          return (
            <li key={app.key}>
              <Link href={app.href} aria-label={label} title={label} className={tile} style={{ color: `var(--hue-${app.hue})` }}>
                <Icon name={app.icon} size={22} />
              </Link>
            </li>
          );
        })}
        {available ? (
          <li>
            {user ? (
              <button type="button" onClick={signOut} aria-label={t("auth.logout")} title={t("auth.logout")} className={`${tile} text-mute`}>
                <Icon name="logout" size={22} />
              </button>
            ) : (
              <Link href="/login" aria-label={t("auth.title.login")} title={t("auth.title.login")} className={`${tile} text-mute`}>
                <Icon name="login" size={22} />
              </Link>
            )}
          </li>
        ) : null}
      </ul>
    </nav>
  );
}
