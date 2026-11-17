import assert from "node:assert/strict";
import { test } from "node:test";
import { visibleApps } from "../registry.ts";
import { feedNotice, nextRefresh, paragraphs, relevanceTags, safeHttpUrl } from "./logic.ts";

const at = (time: string) => new Date(`2026-11-17T${time}Z`);

test("next refresh is the next hourly run at minute 7, also across the day", () => {
  assert.equal(nextRefresh(at("10:00:30")).toISOString(), "2026-11-17T10:07:00.000Z");
  assert.equal(nextRefresh(at("10:07:00")).toISOString(), "2026-11-17T11:07:00.000Z");
  assert.equal(nextRefresh(at("10:55:00")).toISOString(), "2026-11-17T11:07:00.000Z");
  assert.equal(nextRefresh(at("23:59:00")).toISOString(), "2026-11-18T00:07:00.000Z");
});

test("the notice reflects the last pipeline run", () => {
  const now = at("12:00:00");
  assert.equal(feedNotice(null, now), "never");
  assert.equal(feedNotice({ status: "limited", started_at: "2026-11-17T11:52:00Z" }, now), "limited");
  assert.equal(feedNotice({ status: "failed", started_at: "2026-11-17T11:52:00Z" }, now), "failed");
  assert.equal(feedNotice({ status: "ok", started_at: "2026-11-17T11:52:00Z" }, now), null);
  assert.equal(feedNotice({ status: "ok", started_at: "2026-11-17T10:07:00Z" }, now), null); // one late run is normal
  assert.equal(feedNotice({ status: "ok", started_at: "2026-11-17T08:30:00Z" }, now), "stale");
});

test("relevance keywords are split, trimmed and capped", () => {
  assert.deepEqual(relevanceTags("Nvidia earnings, AI bubble"), ["Nvidia earnings", "AI bubble"]);
  assert.deepEqual(relevanceTags(" a ; b | c , d , e , f "), ["a", "b", "c", "d", "e"]);
  assert.deepEqual(relevanceTags(""), []);
});

test("summaries are split into paragraphs", () => {
  assert.deepEqual(paragraphs("One.\n\nTwo.\n \nThree."), ["One.", "Two.", "Three."]);
});

test("only http(s) links are accepted", () => {
  assert.equal(safeHttpUrl("https://example.com/a"), "https://example.com/a");
  assert.equal(safeHttpUrl("javascript:alert(1)"), null);
  assert.equal(safeHttpUrl("http://example.com/i.jpg", true), null);
  assert.equal(safeHttpUrl("not a url"), null);
  assert.equal(safeHttpUrl(null), null);
});

test("News is listed only for accounts that have it enabled", () => {
  const keys = (flags: Record<string, boolean> | null) => visibleApps(flags).map((app) => app.key);
  assert.deepEqual(keys(null), ["workspace", "board"]); // guests and logged-out visitors
  assert.deepEqual(keys({ news_enabled: false }), ["workspace", "board"]);
  assert.deepEqual(keys({ news_enabled: true }), ["workspace", "board", "news"]);
});
