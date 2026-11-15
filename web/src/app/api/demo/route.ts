/**
 * Guest demo runs.
 *   POST /api/demo   { slug }        -> { id, token }   start a demo run
 *   GET  /api/demo?id=..&token=..    -> { status, summary, series, tables }
 *
 * Why this goes through the server: a guest has no account, so the database
 * cannot identify them. The server rate-limits by IP, starts the job with the
 * runner's FIXED demo parameters (the guest sends none), and hands back a random
 * token. Only someone holding that token can read the result.
 */
import { createHash, createHmac, randomBytes } from "node:crypto";
import { z } from "zod";
import { getAdminClient } from "@/lib/server/admin";

const MAX_RUNS = 5; // per IP ...
const WINDOW_SECONDS = 600; // ... per 10 minutes

const startSchema = z.object({ slug: z.string().regex(/^[a-z0-9][a-z0-9-]{1,62}$/) });
const pollSchema = z.object({ id: z.uuid(), token: z.string().regex(/^[0-9a-f]{64}$/) });

const json = (body: unknown, status = 200) =>
  Response.json(body, { status, headers: { "Cache-Control": "no-store" } });
const sha256 = (text: string) => createHash("sha256").update(text).digest("hex");

export async function POST(request: Request) {
  const supabase = getAdminClient();
  const secret = process.env.IP_HASH_SECRET;
  if (!supabase || !secret) return json({ error: "unavailable" }, 503);

  const parsed = startSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return json({ error: "invalid" }, 400);

  // Rate limit. The IP is HMAC-ed with a secret before it reaches the database,
  // so no raw IP address is ever stored (GDPR).
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  const ipKey = createHmac("sha256", secret).update(ip).digest("hex");
  const limit = await supabase.rpc("check_rate_limit", {
    p_bucket: "demo",
    p_key: ipKey,
    p_limit: MAX_RUNS,
    p_window_seconds: WINDOW_SECONDS,
  });
  if (limit.error) return json({ error: "unavailable" }, 503);
  if (limit.data !== true) return json({ error: "rate_limited" }, 429);

  const token = randomBytes(32).toString("hex");
  const started = await supabase.rpc("enqueue_demo", { p_runner: parsed.data.slug, p_token_hash: sha256(token) });
  if (started.error) {
    const busy = started.error.message.includes("demo_busy");
    const gone = started.error.message.includes("runner_unavailable");
    return json({ error: busy ? "busy" : gone ? "not_available" : "unavailable" }, busy ? 429 : gone ? 404 : 503);
  }
  return json({ id: started.data, token });
}

export async function GET(request: Request) {
  const supabase = getAdminClient();
  if (!supabase) return json({ error: "unavailable" }, 503);
  const url = new URL(request.url);
  const parsed = pollSchema.safeParse({ id: url.searchParams.get("id"), token: url.searchParams.get("token") });
  if (!parsed.success) return json({ error: "invalid" }, 400);

  const result = await supabase.rpc("get_demo", { p_job: parsed.data.id, p_token_hash: sha256(parsed.data.token) });
  if (result.error) return json({ error: "unavailable" }, 503);
  if (result.data === null) return json({ error: "not_found" }, 404); // wrong token, or purged after an hour
  return json(result.data);
}
