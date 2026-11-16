/**
 * Where the stock simulator pages get their data.
 *
 * One switch, the environment variable SIM_DATA:
 *   unset or "mock"  sample data generated from the simulator's API contract
 *                    (src/lib/sim/mock, built by scripts/gen-sim-mock.mjs)
 *   "live"           the newest row of the public table sim_snapshots in Supabase,
 *                    which the simulator fills once a day
 *
 * Going live = set SIM_DATA=live in Vercel and redeploy. Nothing else changes.
 */
import { cacheLife } from "next/cache";
import type { DemoResult } from "@/components/DemoRun";
import mockDemo from "./mock/demo-result.json";
import mockSnapshot from "./mock/snapshot.json";
import { parseSnapshot, simDataMode, type Snapshot } from "./schema";

async function fetchLatestSnapshot(): Promise<unknown> {
  "use cache";
  cacheLife("hours"); // the snapshot changes once a day
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  let origin = "";
  try {
    origin = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL ?? "").origin;
  } catch {
    return null;
  }
  if (!key) return null;
  try {
    // Plain read with the PUBLISHABLE key: the table is public and read-only (RLS).
    const response = await fetch(`${origin}/rest/v1/sim_snapshots?select=payload&order=as_of.desc&limit=1`, {
      headers: { apikey: key, Authorization: `Bearer ${key}` },
      signal: AbortSignal.timeout(8000),
    });
    if (!response.ok) return null;
    const rows: unknown = await response.json();
    return Array.isArray(rows) && rows.length > 0 ? (rows[0] as { payload?: unknown }).payload : null;
  } catch {
    return null;
  }
}

export type SimData = { mode: "mock" | "live"; snapshot: Snapshot | null };

/** The snapshot for the dashboard. null means: nothing published yet, or it did not validate. */
export async function loadSimSnapshot(): Promise<SimData> {
  const mode = simDataMode();
  if (mode === "mock") return { mode, snapshot: parseSnapshot(mockSnapshot) };
  return { mode, snapshot: parseSnapshot(await fetchLatestSnapshot()) };
}

/** In mock mode the demo run shows this fixed result instead of using the queue. */
export function mockDemoResult(): DemoResult | undefined {
  return simDataMode() === "mock" ? (mockDemo as unknown as DemoResult) : undefined; // JSON has no tuple types; the shape is checked in schema.test.ts
}
