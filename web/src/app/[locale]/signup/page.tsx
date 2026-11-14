import { setRequestLocale } from "next-intl/server";
import { AuthForm } from "@/components/AuthForm";
import { Window } from "@/components/Window";

export const metadata = { robots: { index: false } };

export default async function Page({ params }: PageProps<"/[locale]/signup">) {
  const { locale } = await params;
  setRequestLocale(locale);
  return (
    <Window title="~/account" className="mx-auto max-w-xl">
      <div className="flex justify-center p-6 sm:p-10">
        <AuthForm mode="signup" />
      </div>
    </Window>
  );
}
