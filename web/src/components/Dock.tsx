import { getTranslations } from "next-intl/server";
import { Icon } from "./Icons";

/**
 * Bottom dock. For guests it holds the section links; after login (Phase 2) the
 * same component becomes the app launcher.
 */
export async function Dock({ locale }: { locale: string }) {
  const t = await getTranslations({ locale, namespace: "nav" });
  const items = [
    { href: `/${locale}`, label: t("home"), icon: "home", hue: "blue" },
    { href: `/${locale}#projects`, label: t("projects"), icon: "grid", hue: "teal" },
    { href: `/${locale}#skills`, label: t("skills"), icon: "spark", hue: "violet" },
    { href: `/${locale}#contact`, label: t("contact"), icon: "mail", hue: "orange" },
  ];
  return (
    <nav aria-label="Dock" className="pointer-events-none fixed inset-x-0 bottom-4 z-20 flex justify-center">
      <ul className="pointer-events-auto flex items-end gap-2 rounded-[22px] border border-line bg-panel/90 p-2 backdrop-blur">
        {items.map((item) => (
          <li key={item.href}>
            <a
              href={item.href}
              aria-label={item.label}
              title={item.label}
              className="flex size-12 items-center justify-center rounded-md border border-line bg-tile transition-transform duration-150 hover:-translate-y-1 motion-reduce:transition-none motion-reduce:hover:translate-y-0"
              style={{ color: `var(--hue-${item.hue})` }}
            >
              <Icon name={item.icon} size={22} />
            </a>
          </li>
        ))}
      </ul>
    </nav>
  );
}
