import type { Metadata } from "next";
import { hasLocale, NextIntlClientProvider } from "next-intl";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { notFound } from "next/navigation";
import { Dock } from "@/components/Dock";
import { MenuBar } from "@/components/MenuBar";
import { Spotlight } from "@/components/Spotlight";
import { routing } from "@/i18n/routing";
import { loadCv } from "@/lib/cv";
import { pick } from "@/lib/localized";
import "../globals.css";

// Build one static copy of every page per language.
export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}

export async function generateMetadata({ params }: LayoutProps<"/[locale]">): Promise<Metadata> {
  const { locale } = await params;
  const cv = loadCv();
  return {
    title: { default: cv.person.name, template: `%s · ${cv.person.name}` },
    description: pick(cv.person.headline, locale),
  };
}

export default async function LocaleLayout({ children, params }: LayoutProps<"/[locale]">) {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) notFound();
  setRequestLocale(locale); // lets next-intl work during static generation
  const t = await getTranslations({ locale, namespace: "nav" });
  const cv = loadCv();

  return (
    <html lang={locale} data-theme="multicolor">
      <body className="min-h-dvh pb-28">
        <NextIntlClientProvider>
          <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-14 focus:z-30 focus:bg-text focus:px-3 focus:py-2 focus:text-bg">
            {t("skip")}
          </a>
          <MenuBar name={cv.person.name} />
          <main id="main" className="mx-auto w-full max-w-[1680px] px-4 py-6 sm:px-6 lg:px-10">
            {children}
          </main>
          <Dock locale={locale} />
          <Spotlight />
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
