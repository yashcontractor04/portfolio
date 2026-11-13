import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";

export default async function NotFound() {
  const t = await getTranslations("notFound");
  return (
    <div className="flex flex-col items-start gap-4 py-20">
      <p className="font-mono text-7xl font-medium">404</p>
      <h1 className="text-2xl font-semibold">{t("title")}</h1>
      <Link href="/" className="text-mute underline hover:text-text">{t("home")}</Link>
    </div>
  );
}
