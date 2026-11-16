// Run with: npm test
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { test } from "node:test";
import { parseSnapshot, simDataMode } from "./schema.ts";

const read = (name: string) => JSON.parse(fs.readFileSync(path.join(import.meta.dirname, "mock", name), "utf8"));

test("the mock snapshot has the shape of the contract", () => {
  const snapshot = parseSnapshot(read("snapshot.json"));
  assert.ok(snapshot);
  assert.deepEqual(snapshot.portfolios.map((p) => p.risk_level), ["low", "medium", "high"]);
  for (const p of snapshot.portfolios) {
    const total = p.allocation.reduce((sum, a) => sum + a.weight, 0);
    assert.ok(Math.abs(total - 1) < 0.001, `${p.risk_level}: weights add up to 1`);
    assert.equal(p.series.portfolio.at(-1), p.value, `${p.risk_level}: the line ends at today's value`);
  }
});

test("a snapshot with an unknown version or a broken series is refused", () => {
  const good = read("snapshot.json");
  assert.equal(parseSnapshot({ ...good, schema_version: 2 }), null);
  assert.equal(parseSnapshot({ ...good, portfolios: good.portfolios.slice(0, 2) }), null);
  const short = structuredClone(good);
  short.portfolios[0].series.benchmark.pop();
  assert.equal(parseSnapshot(short), null);
  assert.equal(parseSnapshot(null), null);
});

test("the mock demo result fits the worker's Result limits", () => {
  const demo = read("demo-result.json");
  assert.ok(Object.keys(demo.summary).length <= 12);
  assert.ok(demo.series.length <= 8 && demo.series.every((s: { points: unknown[] }) => s.points.length <= 2000));
  assert.ok(demo.tables.length <= 4);
  for (const table of demo.tables) assert.ok(table.columns.length <= 12 && table.rows.length <= 500);
});

test("mock is the default, live needs the exact word", () => {
  assert.equal(simDataMode(undefined), "mock");
  assert.equal(simDataMode(""), "mock");
  assert.equal(simDataMode("LIVE"), "mock");
  assert.equal(simDataMode("live"), "live");
});
