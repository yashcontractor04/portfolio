import { getTranslations, setRequestLocale } from "next-intl/server";
import { Board } from "@/apps/board/Board";
import { Window } from "@/components/Window";

export async function generateMetadata({ params }: PageProps<"/[locale]/apps/board">) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "apps" });
  return { title: t("names.board"), robots: { index: false } };
}

export default async function Page({ params }: PageProps<"/[locale]/apps/board">) {
  const { locale } = await params;
  setRequestLocale(locale);
  return (
    <div style={{ "--accent": "var(--hue-cyan)" } as React.CSSProperties}>
      <Window title="~/apps/board">
        <div className="mt-4 border-t border-line">
          <Board />
        </div>
      </Window>
    </div>
  );
}
