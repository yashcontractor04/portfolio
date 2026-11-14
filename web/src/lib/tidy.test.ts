import assert from "node:assert/strict";
import { test } from "node:test";
import { tidyReadme } from "./tidy.ts";

test("the first heading is removed (the page shows the project name)", () => {
  assert.equal(tidyReadme("# Day 7: Hangman\n\nThe classic game."), "The classic game.");
});

test("a Day prefix is removed from later headings, other text is untouched", () => {
  const out = tidyReadme("# Title\n\n## Day 11 - Rules\n\nSame as Day 15.\n\n## Daylight");
  assert.equal(out, "## Rules\n\nSame as Day 15.\n\n## Daylight");
});
