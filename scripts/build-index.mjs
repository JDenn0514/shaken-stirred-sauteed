#!/usr/bin/env node
// Rebuilds recipes/index.json from every recipes/<slug>.json file, and checks
// each recipe for mistakes. Run from the repo root:  node scripts/build-index.mjs
//
// The checks and the index entries come from assets/recipe-checks.js, which the
// editor and the Worker use too. This script reads the files, names the file in
// each message, warns about vocabulary values no recipe uses, and writes the index.
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { createRequire } from "node:module";

const { checkRecipe, checkLinks, indexEntry, allowedTags, byTitle } = createRequire(import.meta.url)("../assets/recipe-checks.js");

const DIR = "recipes";
const errors = [];
const warnings = [];
const index = [];

const vocab = JSON.parse(readFileSync(join(DIR, "vocabulary.json"), "utf8"));
const { allowed } = allowedTags(vocab);
const used = new Set(); // dimension values seen in some recipe

for (const file of readdirSync(DIR).sort()) {
  if (!file.endsWith(".json") || file === "index.json" || file === "vocabulary.json" || file.startsWith("_")) continue;
  const slug = file.slice(0, -5);
  const where = `${DIR}/${file}`;

  let r;
  try {
    r = JSON.parse(readFileSync(join(DIR, file), "utf8"));
  } catch (e) {
    errors.push(`${where}: not valid JSON (${e.message})`);
    continue;
  }

  const found = checkRecipe(slug, r, vocab);
  errors.push(...found.errors.map((e) => `${where}: ${e}`));
  warnings.push(...found.warnings.map((w) => `${where}: ${w}`));

  // Note which vocabulary values this recipe uses (the ones checkRecipe accepts).
  const tags = r.tags ?? {};
  if (typeof tags === "object" && !Array.isArray(tags)) for (const [dim, vals] of Object.entries(tags)) {
    const spec = allowed.get(dim);
    if (!spec || spec.computed || !spec.sections.includes(r.category) || !Array.isArray(vals)) continue;
    for (const v of vals) if (spec.sets[r.category]?.has(v)) used.add(spec.perSection ? `${r.category} ${dim}: ${v}` : `${dim}: ${v}`);
  }

  index.push(indexEntry(slug, r, vocab));
}

// Ingredient links between recipes: each must exist, and they mustn't loop.
errors.push(...checkLinks(index));

// Values in the vocabulary that no recipe uses yet.
{
  const unused = new Set();
  for (const [dim, spec] of allowed) if (!spec.computed) for (const c of spec.sections) for (const v of spec.sets[c]) {
    const id = spec.perSection ? `${c} ${dim}: ${v}` : `${dim}: ${v}`;
    if (!used.has(id)) unused.add(id);
  }
  if (unused.size) warnings.push(`${unused.size} vocabulary value(s) not used by any recipe yet: ${[...unused].join(", ")}`);
}
if (warnings.length) console.warn(`${warnings.length} warning(s):\n  - ${warnings.join("\n  - ")}`);

if (errors.length) {
  console.error(`Found ${errors.length} problem(s):\n  - ${errors.join("\n  - ")}`);
  process.exit(1);
}

index.sort(byTitle);
writeFileSync(join(DIR, "index.json"), JSON.stringify(index, null, 2) + "\n");
console.log(`Wrote ${DIR}/index.json with ${index.length} recipe(s).`);
