// Run with: npm test   (Node's built-in test runner, no extra dependencies)
import assert from "node:assert/strict";
import path from "node:path";
import { test } from "node:test";
import { loadProjects, parseManifest } from "./projects.ts";

const valid = {
  schema: 1,
  name: "Demo",
  type: "static",
  status: "live",
  tags: ["python"],
  summary: { en: "English", de: "Deutsch" },
};

test("a minimal manifest is accepted and gets defaults", () => {
  const p = parseManifest("demo", valid);
  assert.equal(p.slug, "demo");
  assert.equal(p.featured, false);
  assert.equal(p.accent, "blue");
  assert.deepEqual(p.stack, []);
});

test("unknown keys are rejected (typos cannot slip through)", () => {
  assert.throws(() => parseManifest("demo", { ...valid, sumary: "typo" }), /invalid/);
});

test("a German summary is required", () => {
  assert.throws(() => parseManifest("demo", { ...valid, summary: { en: "only english" } }), /summary/);
});

test("a runner without a runner section is rejected", () => {
  assert.throws(() => parseManifest("demo", { ...valid, type: "runner" }), /runner section/);
});

test("in-browser code must be pinned to a full commit SHA", () => {
  const m = {
    ...valid,
    type: "in-browser",
    in_browser: { entry: "main.py", source: { repo: "https://github.com/a/b", path: "x", ref: "main" } },
  };
  assert.throws(() => parseManifest("demo", m), /commit SHA/);
});

test("bad folder names are rejected", () => {
  assert.throws(() => parseManifest("Bad Name", valid), /folder name/);
});

test("every manifest in the repo is valid", () => {
  const projects = loadProjects(path.resolve(import.meta.dirname, "../../.."));
  assert.ok(projects.length >= 1);
  assert.ok(projects[0].featured || projects.every((p) => !p.featured), "featured projects come first");
});
