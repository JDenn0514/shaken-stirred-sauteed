// Every page of the site gets the accessibility scan (tests/e2e/accessibility.spec.mjs).
// Reads the scan's PAGES list as text, so a new page that isn't in it fails here,
// in the quick checks, rather than going unscanned. moved/ is left out: it's a
// separate page for the old address, published by its own workflow.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";

const root = new URL("../../", import.meta.url);
const spec = readFileSync(new URL("tests/e2e/accessibility.spec.mjs", root), "utf8");
const scanned = new Set([...spec.matchAll(/^ {2}\["[^"]*", "([\w-]+\.html)/gm)].map((m) => m[1]));

test("the accessibility scan has found its page list", () => assert.ok(scanned.size > 0));

for (const page of readdirSync(root).filter((f) => f.endsWith(".html"))) {
  test(`${page} is in the accessibility scan's PAGES`, () =>
    assert.ok(scanned.has(page), `Add ${page} to PAGES in tests/e2e/accessibility.spec.mjs (and each new state of it, like an open panel).`));
}
