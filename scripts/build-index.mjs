#!/usr/bin/env node
// Rebuilds recipes/index.json from every recipes/<slug>.json file, and checks
// each recipe for mistakes. Run from the repo root:  node scripts/build-index.mjs
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { createRequire } from "node:module";

// The recipe drawings: the same chooser the site uses (assets/recipe-icons.js).
const { KEYS: ICONS, iconFor } = createRequire(import.meta.url)("../assets/recipe-icons.js");

const DIR = "recipes";
const CATEGORIES = ["baking", "cooking", "cocktails"];
const errors = [];
const warnings = [];
const index = [];

// The fixed tag list. Each dimension lists its sections and allowed values
// (flat "values", grouped "groups", or per-section "valuesBySection").
// "computed" dimensions are filled in below, never tagged by hand.
const vocab = JSON.parse(readFileSync(join(DIR, "vocabulary.json"), "utf8"));
const allowed = new Map(); // dimension key -> { sections, sets: section -> Set of value keys }
const labels = new Map();  // "section dimension value" -> display label, for search
for (const d of vocab.dimensions) {
  const flat = d.values || (d.groups || []).flatMap((g) => g.values);
  const sets = {};
  for (const c of CATEGORIES) {
    const vals = d.valuesBySection ? d.valuesBySection[c] || [] : flat;
    sets[c] = new Set(vals.map((v) => v.key));
    vals.forEach((v) => labels.set(`${c} ${d.key} ${v.key}`, v.label));
  }
  allowed.set(d.key, { sections: d.sections, sets, perSection: !!d.valuesBySection, computed: !!d.computed });
}
const used = new Set(); // dimension values seen in some recipe

// Computed filters.
const timeFacet = (min) => (min == null ? [] : [min <= 30 && "under-30", min <= 60 && "under-60"].filter(Boolean));
const strengthFacet = (sd) => (sd == null || !Number.isFinite(sd) ? [] : [sd < 1 ? "light" : sd <= 2 ? "medium" : "strong"]);

const KINDS = ["dish", "component"];

// Lists hold entries (strings or objects) and { group, items } sections.
const flatten = (list = []) =>
  list.flatMap((e) => (e && Array.isArray(e.items) ? e.items : [e]));
// Ingredients may be { grams, qty, ml, item, note }; steps may be { do, wait, cue }.
const ingText = (i) => (typeof i === "string" ? i : [i?.qty, i?.item, i?.note].filter(Boolean).join(" "));
const stepText = (s) => (typeof s === "string" ? s : s?.do);

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

  if (!/^[a-z0-9-]+$/.test(slug)) errors.push(`${where}: file name must be lowercase letters, numbers and dashes`);
  if (!r.title) errors.push(`${where}: missing "title"`);
  if (!CATEGORIES.includes(r.category)) errors.push(`${where}: "category" must be one of ${CATEGORIES.join(", ")}`);
  if (r.kind && !KINDS.includes(r.kind)) errors.push(`${where}: "kind" must be one of ${KINDS.join(", ")}`);
  const ings = flatten(r.ingredients), steps = flatten(r.steps);
  if (!ings.length) errors.push(`${where}: no ingredients`);
  if (!steps.length) errors.push(`${where}: no steps`);
  if (ings.some((i) => !ingText(i) || (typeof i === "object" && !i.item))) errors.push(`${where}: every ingredient needs text or an "item"`);
  if (steps.some((s) => !stepText(s))) errors.push(`${where}: every step needs text or a "do"`);
  if (r.time?.total != null && !Number.isFinite(r.time.total)) errors.push(`${where}: "time.total" must be a number of minutes`);
  if (r.source?.url && !/^https?:\/\//i.test(r.source.url)) errors.push(`${where}: "source.url" must start with https:// or http://`);
  if (r.image && !/^(https:\/\/|images\/)/.test(r.image)) errors.push(`${where}: "image" must be an images/ path or an https:// URL`);
  if (r.added && !/^\d{4}-\d{2}-\d{2}$/.test(r.added)) errors.push(`${where}: "added" should look like 2026-10-31`);
  if (r.icon != null && !ICONS.includes(r.icon)) errors.push(`${where}: "icon" must be one of ${ICONS.join(", ")}`);

  // Filter tags: { dimension: [values] }, checked against the vocabulary.
  const tags = r.tags ?? {};
  if (typeof tags !== "object" || Array.isArray(tags)) {
    errors.push(`${where}: "tags" must be an object like { "occasion": ["weeknight"] }`);
  } else {
    for (const [dim, vals] of Object.entries(tags)) {
      const spec = allowed.get(dim);
      if (!spec) { errors.push(`${where}: unknown tag dimension "${dim}"`); continue; }
      if (spec.computed) { errors.push(`${where}: "${dim}" is worked out automatically, so don't tag it`); continue; }
      if (!spec.sections.includes(r.category)) { errors.push(`${where}: "${dim}" isn't a ${r.category} filter`); continue; }
      if (!Array.isArray(vals)) { errors.push(`${where}: tags.${dim} must be a list`); continue; }
      for (const v of vals) {
        if (!spec.sets[r.category]?.has(v)) errors.push(`${where}: "${v}" isn't an allowed ${dim} value for ${r.category} (see recipes/vocabulary.json)`);
        else used.add(spec.perSection ? `${r.category} ${dim}: ${v}` : `${dim}: ${v}`);
      }
    }
    if (!(tags.ingredients || []).length) warnings.push(`${where}: no key ingredients tagged`);
  }

  const t = r.time || {};
  const total = t.total ?? ([t.prep, t.cook, t.chill, t.rest].some((x) => x != null)
    ? [t.prep, t.cook, t.chill, t.rest].reduce((a, b) => a + (b || 0), 0)
    : null);
  if (total == null) warnings.push(`${where}: no total time, so it can't be filtered by time`);

  const facets = { ...(Array.isArray(tags) ? {} : tags), time: timeFacet(total), kind: [r.kind || "dish"] };
  if (r.category === "cocktails") facets.strength = strengthFacet(r.standardDrinks);
  for (const k of Object.keys(facets)) if (!facets[k].length) delete facets[k];
  const tagWords = Object.entries(facets).flatMap(([dim, vals]) =>
    dim === "time" || dim === "kind" ? [] : vals.map((v) => labels.get(`${r.category} ${dim} ${v}`) || v));

  index.push({
    slug,
    title: r.title,
    category: r.category,
    kind: r.kind || "dish",
    description: r.description || "",
    yield: r.yield || "",
    image: r.image || "",
    icon: iconFor(r),
    added: r.added || "",
    facets,
    totalMinutes: total,
    // Lower-cased text the search box matches against.
    search: [r.title, r.description, r.category, r.kind, ...tagWords, ...ings.map(ingText), r.glass, r.garnish, r.origin]
      .filter(Boolean).join(" ").toLowerCase(),
  });
}

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

index.sort((a, b) => a.title.localeCompare(b.title));
writeFileSync(join(DIR, "index.json"), JSON.stringify(index, null, 2) + "\n");
console.log(`Wrote ${DIR}/index.json with ${index.length} recipe(s).`);
