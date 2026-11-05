#!/usr/bin/env node
// Checks that every file the site points at exists. Run from the repo root:
// node scripts/check-links.mjs
import { readdirSync, readFileSync, existsSync } from "node:fs";
import { join, dirname, normalize, resolve } from "node:path";
import { createRequire } from "node:module";

const SKIP_DIRS = new Set([".git", "node_modules", "test-results", "playwright-report"]);

// Every file under the current folder, as paths relative to it.
function* walk(dir = ".") {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    if (SKIP_DIRS.has(e.name)) continue;
    const path = dir === "." ? e.name : join(dir, e.name);
    if (e.isDirectory()) yield* walk(path);
    else yield path;
  }
}

const broken = [];
// Reports `ref` (found in the file `from`) if it doesn't point at a file, read
// relative to the folder `base`. Links to other websites (or email, inline data,
// in-page anchors) aren't checked.
function check(from, ref, base = dirname(from)) {
  if (/^([a-z]+:|\/\/|#|$)/i.test(ref)) return;
  let path = normalize(join(base, ref.replace(/[?#].*/, "")));
  if (ref.replace(/[?#].*/, "").endsWith("/")) path = join(path, "index.html");
  if (!existsSync(path)) broken.push(`${from}: ${ref}`);
}

for (const file of walk()) {
  if (file.endsWith(".html")) {
    // Only real tags: a tag shown as text (&lt;a href=...&gt;) isn't a link.
    // <base> sets where links start; it doesn't point at a file.
    for (const [tag] of readFileSync(file, "utf8").matchAll(/<(?!base\b)[a-z][^>]*>/gi)) {
      for (const [, ref] of tag.matchAll(/\s(?:href|src)="([^"]*)"/g)) check(file, ref);
    }
  } else if (file.endsWith(".css")) {
    const urls = /url\(\s*(?:"([^"]*)"|'([^']*)'|([^)\s]*))\s*\)/g;
    for (const [, dq, sq, bare] of readFileSync(file, "utf8").matchAll(urls)) check(file, dq ?? sq ?? bare);
  } else if (file.endsWith(".webmanifest")) {
    for (const icon of JSON.parse(readFileSync(file, "utf8")).icons || []) check(file, icon.src);
  } else if (/^recipes\/(?!index\.json$|vocabulary\.json$)[^/]+\.json$/.test(file)) {
    // Recipe photos are shown by the pages in the top folder.
    const { image } = JSON.parse(readFileSync(file, "utf8"));
    if (image) check(file, image, ".");
  } else if (file === join("assets", "recipe-icons.js")) {
    // The drawings are picked by name in code, so no page links to them directly.
    for (const key of createRequire(import.meta.url)(resolve(file)).KEYS) check(file, `icons/${key}.svg`);
  }
}

if (broken.length) {
  console.error(`Found ${broken.length} broken link(s):\n  - ${broken.join("\n  - ")}`);
  process.exit(1);
}
console.log("No broken links.");
