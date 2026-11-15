"use client";

import { useTranslations } from "next-intl";
import { useRef, useState } from "react";

type State = "idle" | "sending" | "sent" | "invalid" | "rate_limited" | "unavailable";

export function ContactForm() {
  const t = useTranslations("contact");
  const [state, setState] = useState<State>("idle");
  const opened = useRef<number | null>(null); // when the visitor first touched the form (time trap)

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    setState("sending");
    try {
      const response = await fetch("/api/contact", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: data.get("name"),
          email: data.get("email"),
          message: data.get("message"),
          website: data.get("website"),
          elapsedMs: Math.round(performance.now() - (opened.current ?? performance.now())),
        }),
      });
      if (response.ok) {
        form.reset();
        return setState("sent");
      }
      setState(response.status === 400 ? "invalid" : response.status === 429 ? "rate_limited" : "unavailable");
    } catch {
      setState("unavailable");
    }
  }

  const field = "w-full rounded-md border border-line bg-bg px-4 text-text placeholder:text-mute";
  return (
    <form onSubmit={onSubmit} onFocus={() => (opened.current ??= performance.now())} className="flex w-full max-w-xl flex-col gap-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="flex flex-col gap-1.5 text-sm text-mute">
          {t("name")}
          <input name="name" required maxLength={80} autoComplete="name" className={`${field} h-12`} />
        </label>
        <label className="flex flex-col gap-1.5 text-sm text-mute">
          {t("email")}
          <input name="email" type="email" required maxLength={254} autoComplete="email" className={`${field} h-12`} />
        </label>
      </div>
      <label className="flex flex-col gap-1.5 text-sm text-mute">
        {t("message")}
        <textarea name="message" required minLength={10} maxLength={4000} rows={5} className={`${field} py-3`} />
      </label>
      {/* Honeypot: hidden from people and screen readers, tempting for bots. */}
      <div aria-hidden="true" className="absolute -left-[9999px] h-0 w-0 overflow-hidden">
        <label>
          Website
          <input name="website" tabIndex={-1} autoComplete="off" />
        </label>
      </div>
      <div className="flex flex-wrap items-center gap-4">
        <button type="submit" disabled={state === "sending"} className="h-12 rounded-md bg-text px-6 font-semibold text-bg disabled:opacity-60">
          {t("send")}
        </button>
        <span role="status" className={`text-sm ${state === "sent" ? "text-positive" : state === "idle" || state === "sending" ? "text-mute" : "text-negative"}`}>
          {state === "idle" ? "" : t(`state.${state}`)}
        </span>
      </div>
      <p className="text-xs text-mute">{t("privacy")}</p>
    </form>
  );
}
