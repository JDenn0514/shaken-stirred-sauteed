#!/usr/bin/env node
// Rebuilds recipes/index.json from every recipes/<slug>.json file, and checks
// each recipe for mistakes. Run from the repo root:  node scripts/build-index.mjs
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const DIR = "recipes";
const CATEGORIES = ["baking", "cooking", "cocktails"];
const errors = [];
const index = [];

const flatten = (list = []) =>
  list.flatMap((e) => (typeof e === "string" ? [e] : e && Array.isArray(e.items) ? e.items : []));

for (const file of readdirSync(DIR).sort()) {
  if (!file.endsWith(".json") || file === "index.json" || file.startsWith("_")) continue;
  const slug = file.slice(0, -5);
  const where = `${DIR}/${file}`;

  let r;
  try {
    r = JSON.parse(readFileSync(join(DIR, file), "utf8"));
  } catch (e) {
    errors.push(`${where}: not valid JSON (${e.message})`);
    continue;
  }

  if (!/^[a-z0-9-]+$/.test(slug)) errors.push(`${where}: file name must be lowercase letters, numbers and dashes`);
  if (!r.title) errors.push(`${where}: missing "title"`);
  if (!CATEGORIES.includes(r.category)) errors.push(`${where}: "category" must be one of ${CATEGORIES.join(", ")}`);
  if (!flatten(r.ingredients).length) errors.push(`${where}: no ingredients`);
  if (!flatten(r.steps).length) errors.push(`${where}: no steps`);
  if (r.added && !/^\d{4}-\d{2}-\d{2}$/.test(r.added)) errors.push(`${where}: "added" should look like 2026-10-31`);

  const t = r.time || {};
  const total = t.total ?? ([t.prep, t.cook, t.chill, t.rest].some((x) => x != null)
    ? [t.prep, t.cook, t.chill, t.rest].reduce((a, b) => a + (b || 0), 0)
    : null);

  index.push({
    slug,
    title: r.title,
    category: r.category,
    description: r.description || "",
    tags: r.tags || [],
    yield: r.yield || "",
    image: r.image || "",
    added: r.added || "",
    totalMinutes: total,
    // Lower-cased text the search box matches against.
    search: [r.title, r.description, r.category, ...(r.tags || []), ...flatten(r.ingredients), r.glass, r.garnish]
      .filter(Boolean).join(" ").toLowerCase(),
  });
}

if (errors.length) {
  console.error(`Found ${errors.length} problem(s):\n  - ${errors.join("\n  - ")}`);
  process.exit(1);
}

index.sort((a, b) => a.title.localeCompare(b.title));
writeFileSync(join(DIR, "index.json"), JSON.stringify(index, null, 2) + "\n");
console.log(`Wrote ${DIR}/index.json with ${index.length} recipe(s).`);
