"use client";

import { useLocale, useTranslations } from "next-intl";
import { useState } from "react";
import { z } from "zod";
import { Link, useRouter } from "@/i18n/navigation";
import { getSupabase } from "@/lib/supabase";

type Mode = "login" | "signup" | "reset" | "update";

// Client-side validation is for quick feedback only. The real rules are enforced
// by Supabase Auth (password, email) and by the database trigger (invite code).
const email = z.email().max(254);
const password = z.string().min(10).max(72);
const invite = z.string().trim().regex(/^[A-Za-z0-9]{20}$/);

export function AuthForm({ mode }: { mode: Mode }) {
  const t = useTranslations("auth");
  const locale = useLocale();
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setNotice(null);
    const supabase = getSupabase();
    if (!supabase) return setError(t("unavailable"));
    const form = new FormData(event.currentTarget);
    const values = {
      email: String(form.get("email") ?? ""),
      password: String(form.get("password") ?? ""),
      invite: String(form.get("invite") ?? ""),
    };
    if (mode !== "update" && !email.safeParse(values.email).success) return setError(t("errors.email"));
    if (mode !== "reset" && !password.safeParse(values.password).success) return setError(t("errors.password"));
    if (mode === "signup" && !invite.safeParse(values.invite).success) return setError(t("errors.invite"));

    setBusy(true);
    try {
      const origin = window.location.origin;
      if (mode === "login") {
        const { error } = await supabase.auth.signInWithPassword({ email: values.email, password: values.password });
        // One generic message for wrong email OR wrong password: never reveal which accounts exist.
        if (error) return setError(error.code === "email_not_confirmed" ? t("errors.unconfirmed") : t("errors.login"));
        router.push("/apps/workspace");
      } else if (mode === "signup") {
        const { error } = await supabase.auth.signUp({
          email: values.email,
          password: values.password,
          options: {
            // The database trigger reads the code from here and rejects the signup if it is not valid.
            data: { invite_code: values.invite.trim(), locale },
            emailRedirectTo: `${origin}/${locale}/apps/workspace`,
          },
        });
        if (error) {
          const text = error.message.toLowerCase();
          return setError(text.includes("invite") || text.includes("database") ? t("errors.inviteRejected") : t("errors.generic"));
        }
        setNotice(t("checkEmail"));
      } else if (mode === "reset") {
        await supabase.auth.resetPasswordForEmail(values.email, { redirectTo: `${origin}/${locale}/update-password` });
        setNotice(t("resetSent")); // same message whether or not the address has an account
      } else {
        const { error } = await supabase.auth.updateUser({ password: values.password });
        if (error) return setError(t("errors.generic"));
        router.push("/apps/workspace");
      }
    } catch {
      setError(t("errors.generic"));
    } finally {
      setBusy(false);
    }
  }

  const field = "h-12 w-full rounded-md border border-line bg-bg px-4 text-text placeholder:text-mute";
  return (
    <form onSubmit={onSubmit} noValidate className="flex w-full max-w-md flex-col gap-4">
      <h1 className="text-3xl font-semibold tracking-tight">{t(`title.${mode}`)}</h1>
      {mode === "signup" ? <p className="text-sm text-mute">{t("inviteOnly")}</p> : null}
      {mode !== "update" ? (
        <label className="flex flex-col gap-1.5 text-sm">
          {t("email")}
          <input name="email" type="email" autoComplete="email" required className={field} />
        </label>
      ) : null}
      {mode !== "reset" ? (
        <label className="flex flex-col gap-1.5 text-sm">
          {mode === "update" ? t("newPassword") : t("password")}
          <input
            name="password"
            type="password"
            autoComplete={mode === "login" ? "current-password" : "new-password"}
            required
            minLength={10}
            className={field}
          />
          {mode !== "login" ? <span className="text-xs text-mute">{t("passwordHint")}</span> : null}
        </label>
      ) : null}
      {mode === "signup" ? (
        <label className="flex flex-col gap-1.5 text-sm">
          {t("invite")}
          <input name="invite" type="text" autoComplete="off" spellCheck={false} required className={`${field} font-mono uppercase`} />
        </label>
      ) : null}
      {error ? <p role="alert" className="text-sm text-negative">{error}</p> : null}
      {notice ? <p role="status" className="text-sm text-positive">{notice}</p> : null}
      <button type="submit" disabled={busy} className="h-12 rounded-md bg-text font-semibold text-bg disabled:opacity-60">
        {t(`submit.${mode}`)}
      </button>
      <div className="flex flex-wrap gap-x-5 gap-y-2 text-sm text-mute">
        {mode !== "login" ? <Link href="/login" className="underline underline-offset-4 hover:text-text">{t("toLogin")}</Link> : null}
        {mode === "login" ? <Link href="/signup" className="underline underline-offset-4 hover:text-text">{t("toSignup")}</Link> : null}
        {mode === "login" ? <Link href="/reset-password" className="underline underline-offset-4 hover:text-text">{t("toReset")}</Link> : null}
      </div>
    </form>
  );
}
