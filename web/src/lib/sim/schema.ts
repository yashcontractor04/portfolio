/**
 * The daily snapshot of the stock simulator, as the dashboard reads it.
 *
 * This mirrors `Snapshot` in the simulator's API contract
 * (github.com/yashcontractor04/stock-simulator, docs/openapi.yaml, schema_version 1).
 * The snapshot comes from outside this repo, so it is validated here before
 * anything is drawn. If it does not fit, the page shows "no data" instead of
 * a broken chart.
 */
import { z } from "zod";

const money = z.number().finite();
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

const position = z.object({
  ticker: z.string().regex(/^[A-Z0-9.\-]{1,12}$/),
  name: z.string().max(80),
  kind: z.enum(["stock", "etf"]),
  sector: z.string().max(40),
  role: z.enum(["core", "satellite"]),
  weight: z.number().min(0).max(1),
});

const series = z
  .object({
    dates: z.array(isoDate).min(2).max(400),
    portfolio: z.array(money).max(400),
    benchmark: z.array(money).max(400),
  })
  .refine((s) => s.portfolio.length === s.dates.length && s.benchmark.length === s.dates.length, {
    message: "series lists must have the same length",
  });

const band = z.array(money).max(121);
const outlook = z
  .object({
    method: z.string().max(40),
    paths: z.number().int().positive(),
    horizon_years: z.number().int().min(1).max(10),
    months: z.array(z.number().int().min(0)).min(2).max(121),
    p5: band,
    p25: band,
    p50: band,
    p75: band,
    p95: band,
    note: z.string().max(200),
  })
  .refine((o) => [o.p5, o.p25, o.p50, o.p75, o.p95].every((b) => b.length === o.months.length), {
    message: "outlook lists must have the same length",
  });

const warning = z.object({
  code: z.string().max(40),
  severity: z.enum(["info", "warning"]),
  message: z.string().max(200),
});

const portfolio = z.object({
  risk_level: z.enum(["low", "medium", "high"]),
  value: money,
  total_return: money,
  benchmark_return: money,
  day_change: money,
  volatility: money.nullable(),
  max_drawdown: money,
  sharpe: money.nullable(),
  series,
  allocation: z.array(position).min(1).max(25),
  outlook,
  warnings: z.array(warning).max(10),
});

export const snapshotSchema = z.object({
  schema_version: z.literal(1),
  as_of: isoDate,
  generated_at: z.string().max(40),
  started_on: isoDate,
  start_value: money,
  currency: z.literal("USD"),
  benchmark: z.object({ ticker: z.string().max(12), name: z.string().max(80) }),
  portfolios: z.array(portfolio).length(3),
  notes: z.array(z.string().max(200)).max(5),
});

export type Snapshot = z.infer<typeof snapshotSchema>;
export type SnapshotPortfolio = Snapshot["portfolios"][number];

/** Returns the snapshot if it has the expected shape, otherwise null. */
export function parseSnapshot(data: unknown): Snapshot | null {
  const result = snapshotSchema.safeParse(data);
  return result.success ? result.data : null;
}

/** "mock" unless SIM_DATA=live. One switch for the dashboard and the demo run. */
export function simDataMode(value: string | undefined = process.env.SIM_DATA): "mock" | "live" {
  return value === "live" ? "live" : "mock";
}
