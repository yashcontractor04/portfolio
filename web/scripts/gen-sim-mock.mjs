// Builds the mock data for the stock simulator pages from the EXAMPLES in the
// simulator's API contract, so the pages are designed against the real shapes.
//
//   node scripts/gen-sim-mock.mjs ../../stock-simulator/docs/openapi.yaml
//
// Writes src/lib/sim/mock/snapshot.json (the dashboard) and
// src/lib/sim/mock/demo-result.json (the demo run, already in the worker's
// Result shape: summary / series / tables).
//
// The contract's examples only have a handful of points per line. This script
// fills the gaps with a seeded random walk that still passes through every
// example point, so the charts look like real ones and the output is the same
// on every run. Re-run it whenever the examples in openapi.yaml change.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parse } from "yaml";

const source = process.argv[2];
if (!source) {
  console.error("usage: node scripts/gen-sim-mock.mjs <path to the simulator's docs/openapi.yaml>");
  process.exit(1);
}
const spec = parse(fs.readFileSync(source, "utf8"));
const out = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "src", "lib", "sim", "mock");

/** Small seeded random generator (mulberry32): same seed, same numbers. */
function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const day = (iso) => Date.parse(`${iso}T00:00:00Z`) / 86_400_000;
const iso = (d) => new Date(d * 86_400_000).toISOString().slice(0, 10);
const round2 = (n) => Math.round(n * 100) / 100;

/** Dates from the first to the last anchor, every `step` days, weekdays only, anchors included. */
function fillDates(anchors, step) {
  const set = new Set(anchors);
  for (let d = day(anchors[0]); d < day(anchors.at(-1)); d += step) {
    const weekday = new Date(d * 86_400_000).getUTCDay();
    set.add(iso(weekday === 0 ? d + 1 : weekday === 6 ? d + 2 : d));
  }
  return [...set].filter((s) => day(s) <= day(anchors.at(-1))).sort();
}

/**
 * A wiggly line through the anchor points. Between two anchors it follows the
 * straight line in log space plus a random walk that is pulled back to zero at
 * both ends (a "bridge"), so every anchor value is hit exactly.
 */
function fillValues(anchorDates, anchorValues, dates, random, wiggle) {
  const values = [];
  for (let i = 0; i < anchorDates.length - 1; i++) {
    const inside = dates.filter((s) => s >= anchorDates[i] && s < anchorDates[i + 1]);
    const [a, b] = [Math.log(anchorValues[i]), Math.log(anchorValues[i + 1])];
    const walk = [0];
    for (let k = 1; k <= inside.length; k++) walk.push(walk[k - 1] + (random() - 0.5) * wiggle);
    inside.forEach((_, k) => {
      const share = k / inside.length;
      values.push(round2(Math.exp(a + (b - a) * share + walk[k] - walk.at(-1) * share)));
    });
  }
  values.push(anchorValues.at(-1));
  return values;
}

function expandSeries(series, step, seed) {
  const scale = Math.sqrt(step); // bigger steps between points, bigger moves
  const dates = fillDates(series.dates, step);
  // Portfolio and benchmark share most of their wiggle, like real markets do.
  return {
    dates,
    portfolio: fillValues(series.dates, series.portfolio, dates, rng(seed), 0.016 * scale),
    benchmark: fillValues(series.dates, series.benchmark, dates, rng(seed), 0.021 * scale),
  };
}

/** One point per month instead of the few in the example (straight lines in log space). */
function expandOutlook(outlook) {
  const months = Array.from({ length: outlook.months.at(-1) + 1 }, (_, m) => m);
  const band = (values) =>
    months.map((m) => {
      const i = Math.min(outlook.months.findLastIndex((x) => x <= m), outlook.months.length - 2);
      const share = (m - outlook.months[i]) / (outlook.months[i + 1] - outlook.months[i]);
      return round2(Math.exp(Math.log(values[i]) + (Math.log(values[i + 1]) - Math.log(values[i])) * share));
    });
  return { ...outlook, months, p5: band(outlook.p5), p25: band(outlook.p25), p50: band(outlook.p50), p75: band(outlook.p75), p95: band(outlook.p95) };
}

// ---------------------------------------------------------------- dashboard ---
const snapshot = spec.paths["/v1/snapshot/latest"].get.responses["200"].content["application/json"].example;
snapshot.portfolios = snapshot.portfolios.map((p, i) => ({
  ...p,
  series: expandSeries(p.series, 1, 11 + i),
  outlook: expandOutlook(p.outlook),
}));
fs.mkdirSync(out, { recursive: true });
fs.writeFileSync(path.join(out, "snapshot.json"), JSON.stringify(snapshot) + "\n");

// ----------------------------------------------------------------- demo run ---
// The same mapping the adapter in worker/worker/runners/stock_sim.py will do:
// simulator result -> { summary, series, tables } (see the simulator's docs/04-api.md).
const simulation = spec.paths["/v1/simulations/{simulation_id}"].get.responses["200"].content["application/json"].examples.succeeded.value;
const { result, params } = simulation;
const series = expandSeries(result.series, 10, 7);
const start = day(series.dates[0]);
const months = (s) => Math.round(((day(s) - start) / 30.4375) * 100) / 100;
const pct = (n) => Math.round(n * 10000) / 100;
const { portfolio, benchmark } = result.metrics;

const demo = {
  summary: {
    "Final value (USD)": Math.round(portfolio.final_value),
    "Total return (%)": pct(portfolio.total_return),
    "Growth per year (%)": pct(portfolio.cagr),
    "Volatility (%)": pct(portfolio.volatility),
    "Sharpe ratio": portfolio.sharpe,
    "Max drawdown (%)": pct(portfolio.max_drawdown),
    [`${params.benchmark} final value (USD)`]: Math.round(benchmark.final_value),
    [`${params.benchmark} growth per year (%)`]: pct(benchmark.cagr),
  },
  series: [
    { name: "Portfolio", points: series.dates.map((s, i) => [months(s), series.portfolio[i]]) },
    { name: `${params.benchmark} (benchmark)`, points: series.dates.map((s, i) => [months(s), series.benchmark[i]]) },
  ],
  tables: [
    {
      title: "Allocation",
      columns: ["Ticker", "Name", "Sector", "Weight (%)", "Amount (USD)"],
      rows: result.allocation.map((a) => [a.ticker, a.name, a.sector, pct(a.weight), a.amount]),
    },
    {
      title: "Yearly returns (%)",
      columns: ["Year", "Portfolio", params.benchmark],
      rows: result.yearly_returns.map((y) => [String(y.year), pct(y.portfolio), pct(y.benchmark)]),
    },
    {
      title: `Range of outcomes over ${result.outlook.horizon_years} years (USD, ${result.outlook.paths} resampled paths)`,
      columns: ["After (years)", "Worst 5%", "Lower quarter", "Middle", "Upper quarter", "Best 5%"],
      rows: result.outlook.months.map((m, i) => [
        String(m / 12),
        result.outlook.p5[i],
        result.outlook.p25[i],
        result.outlook.p50[i],
        result.outlook.p75[i],
        result.outlook.p95[i],
      ]),
    },
    {
      title: "Notes",
      columns: ["Level", "Note"],
      rows: [...result.warnings.map((w) => [w.severity, w.message]), ["info", result.outlook.note]],
    },
  ],
};
fs.writeFileSync(path.join(out, "demo-result.json"), JSON.stringify(demo) + "\n");
console.log(`wrote ${path.relative(process.cwd(), out)}/snapshot.json and demo-result.json`);
