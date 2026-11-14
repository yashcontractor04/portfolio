import { getTranslations, setRequestLocale } from "next-intl/server";
import { Workspace } from "@/apps/workspace/Workspace";
import { Window } from "@/components/Window";

export async function generateMetadata({ params }: PageProps<"/[locale]/apps/workspace">) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "apps" });
  return { title: t("names.workspace"), robots: { index: false } };
}

export default async function Page({ params }: PageProps<"/[locale]/apps/workspace">) {
  const { locale } = await params;
  setRequestLocale(locale);
  return (
    <div style={{ "--accent": "var(--hue-indigo)" } as React.CSSProperties}>
      <Window title="~/apps/workspace">
        <div className="mt-4 border-t border-line">
          <Workspace />
        </div>
      </Window>
    </div>
  );
}
