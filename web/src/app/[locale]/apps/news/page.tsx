import { getTranslations, setRequestLocale } from "next-intl/server";
import { News } from "@/apps/news/News";
import { Window } from "@/components/Window";

export async function generateMetadata({ params }: PageProps<"/[locale]/apps/news">) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "apps" });
  return { title: t("names.news"), robots: { index: false } };
}

// This page is a static, empty shell: it contains no news. The feed is fetched in the
// browser as the logged-in user, and the database decides what that user may read.
export default async function Page({ params }: PageProps<"/[locale]/apps/news">) {
  const { locale } = await params;
  setRequestLocale(locale);
  return (
    <div style={{ "--accent": "var(--hue-orange)" } as React.CSSProperties}>
      <Window title="~/apps/news">
        <div className="mt-4 border-t border-line">
          <News />
        </div>
      </Window>
    </div>
  );
}
