"use client";

import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";

/** Shown above an app when a guest is looking at sample data. */
export function DemoBanner({ canLogin }: { canLogin: boolean }) {
  const t = useTranslations("apps");
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 border-b border-line bg-tile px-5 py-3 text-sm">
      <span className="font-mono text-xs uppercase tracking-wider" style={{ color: "var(--accent)" }}>{t("demo")}</span>
      <span className="text-mute">{t("demoText")}</span>
      {canLogin ? (
        <Link href="/login" className="underline underline-offset-4 hover:text-text">{t("login")}</Link>
      ) : null}
    </div>
  );
}
