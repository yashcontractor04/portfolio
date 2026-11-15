/**
 * Contact form. POST /api/contact { name, email, message, website, elapsedMs }
 *
 * Spam protection without a third-party captcha (no tracking, no cookies):
 *   1. honeypot: `website` is a field humans never see; bots fill it in
 *   2. time trap: a human needs more than 3 seconds to write a message
 *   3. rate limit: 3 messages per hour per (hashed) IP, enforced in Postgres
 * Honeypot and time-trap hits get a normal "ok" answer, so a bot learns nothing.
 * The message is emailed through Resend and stored nowhere.
 */
import { createHmac } from "node:crypto";
import { z } from "zod";
import { getAdminClient } from "@/lib/server/admin";

const schema = z.object({
  name: z.string().trim().min(1).max(80),
  email: z.email().max(254),
  message: z.string().trim().min(10).max(4000),
  website: z.string().max(200).optional(),
  elapsedMs: z.number().int().nonnegative(),
});

const json = (body: unknown, status = 200) => Response.json(body, { status, headers: { "Cache-Control": "no-store" } });

export async function POST(request: Request) {
  const apiKey = process.env.RESEND_API_KEY;
  const to = process.env.CONTACT_TO_EMAIL;
  const secret = process.env.IP_HASH_SECRET;
  const supabase = getAdminClient();
  if (!apiKey || !to || !secret || !supabase) return json({ error: "unavailable" }, 503);

  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return json({ error: "invalid" }, 400);
  const { name, email, message, website, elapsedMs } = parsed.data;
  if (website || elapsedMs < 3000) return json({ ok: true }); // looks like a bot: pretend it worked

  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  const limit = await supabase.rpc("check_rate_limit", {
    p_bucket: "contact",
    p_key: createHmac("sha256", secret).update(ip).digest("hex"),
    p_limit: 3,
    p_window_seconds: 3600,
  });
  if (limit.error) return json({ error: "unavailable" }, 503);
  if (limit.data !== true) return json({ error: "rate_limited" }, 429);

  // Plain text only, and no line breaks in the subject, so nothing a visitor
  // types can change the email's headers or inject HTML.
  const safeName = name.replace(/[\r\n]+/g, " ");
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from: process.env.CONTACT_FROM_EMAIL || "Yash Contractor <onboarding@resend.dev>",
      to: [to],
      reply_to: email,
      subject: `Portfolio contact: ${safeName}`,
      text: `From: ${safeName} <${email}>\n\n${message}`,
    }),
    signal: AbortSignal.timeout(10_000),
  }).catch(() => null);
  if (!response?.ok) return json({ error: "unavailable" }, 502);
  return json({ ok: true });
}
