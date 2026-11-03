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

// A step's "uses" lists the ingredients it needs (shown in cook mode): each is the
// ingredient's item (or its whole text, for a plain-string ingredient), or
// { item, group, amount }. "group" picks between ingredients with the same name;
// "amount" is the step's own share. Each must match exactly one ingredient.
const lower = (s) => String(s ?? "").trim().toLowerCase();
function checkUses(r, steps) {
  const problems = [];
  const named = (r.ingredients || []).flatMap((e) => (e && Array.isArray(e.items) ? e.items.map((i) => [e.group, i]) : [["", e]]))
    .map(([group, i]) => ({ group: lower(group), item: lower(typeof i === "string" ? i : i?.item) }));
  steps.forEach((s, n) => {
    if (s?.uses === undefined) return;
    const step = `step ${n + 1}`;
    if (!Array.isArray(s.uses)) return problems.push(`${step}: "uses" must be a list`);
    for (const u of s.uses) {
      const { item, group, amount } = typeof u === "string" ? { item: u } : u || {};
      if (!item) { problems.push(`${step}: every entry in "uses" needs an "item"`); continue; }
      if (amount !== undefined && typeof amount !== "string") problems.push(`${step}: "amount" must be text, like "100 g" or "the rest"`);
      const hits = named.filter((i) => i.item === lower(item) && (group === undefined || i.group === lower(group)));
      const what = group === undefined ? `"${item}"` : `"${item}" from "${group}"`;
      if (!hits.length) problems.push(`${step} uses ${what}, which isn't one of the ingredients`);
      else if (hits.length > 1) problems.push(`${step} uses ${what}, which matches ${hits.length} ingredients: add its "group"`);
    }
  });
  return problems;
}

// Planning data for the lineup planner (assets/planner.mjs); see the README's
// "Planning a lineup". A time is what the planner can read: "10 min", "45 sec",
// "1 1/2 hr", "7 to 8 min" (the same pattern as the planner's).
const NUM = String.raw`\d+(?:\.\d+)?(?:\s+\d+\/\d+)?|\d+\/\d+`;
const TIME = new RegExp(`(${NUM})\\s*(?:(?:to|-|–)\\s*(${NUM})\\s*)?(sec(?:ond)?s?|min(?:ute)?s?|hrs?|hours?)\\b`, "i");
const isTime = (x) => typeof x === "string" && TIME.test(x);
// Oven settings: a temperature with its unit ("200C", "400F"), "broil" or "off".
// false says a step that mentions the oven doesn't use it.
const isSetting = (x) => typeof x === "string" && (/^\d+[CF]$/.test(x) || x === "broil" || x === "off");
const SERVES = ["hot", "soon", "keeps"];
const FLAGS = ["watch", "burner", "grill", "microwave", "prepOnly", "holds"];
const EQUIPMENT = ["oven", "preheat", "burner", "grill", "microwave"];
// Words in a step that mean it needs equipment. A step that has one but doesn't
// use it (pressing dough into a pan) says so with "burner": false.
const MENTIONS = /\b(oven|broil\w*|skillet|(?:sauce|frying |sheet )?pan|grill\w*|microwave\w*)\b/i;

function checkPlanning(r, steps, ings) {
  const problems = [], notes = [];
  if (r.serve !== undefined && !SERVES.includes(r.serve)) problems.push(`"serve" must be one of ${SERVES.join(", ")}`);
  if (r.sits !== undefined && !isTime(r.sits)) problems.push(`"sits" must be a time, like "10 min"`);
  steps.forEach((s, n) => {
    if (!s || typeof s !== "object") return;
    const step = `step ${n + 1}`;
    if (s.hands !== undefined && !isTime(s.hands)) problems.push(`${step}: "hands" must be a time, like "10 min"`);
    for (const k of ["oven", "preheat"]) {
      if (s[k] !== undefined && s[k] !== false && !isSetting(s[k])) problems.push(`${step}: oven setting "${s[k]}" isn't one of "200C", "400F", "broil" or "off"`);
    }
    if (s.preheat === "off") problems.push(`${step}: "preheat" can't be "off"; use "oven": "off" to turn it off`);
    if (s.watch && !s.wait) problems.push(`${step}: "watch" needs a "wait" to watch`);
    if (s.prep !== undefined && s.prep !== true && s.prep !== "just before") problems.push(`${step}: "prep" must be true or "just before"`);
    for (const k of FLAGS) if (s[k] !== undefined && typeof s[k] !== "boolean") problems.push(`${step}: "${k}" must be true or false`);
    const said = MENTIONS.exec(s.do || "");
    if (said && !EQUIPMENT.some((k) => k in s)) notes.push(`${step} mentions "${said[1]}" but has no equipment field (oven, preheat, burner, grill or microwave)`);
  });
  if (steps.filter((s) => s?.holds).length > 1) problems.push(`more than one step with "holds"; only the last one counts`);
  const usedItems = new Set(steps.flatMap((s) => (Array.isArray(s?.uses) ? s.uses : [])).map((u) => lower(typeof u === "string" ? u : u?.item)));
  for (const i of ings) {
    const name = typeof i === "string" ? i : i?.item;
    if (i?.optional !== undefined && typeof i.optional !== "boolean") problems.push(`"${name}": "optional" must be true or false`);
    if (i?.alreadyMade !== undefined) {
      if (typeof i.alreadyMade !== "boolean") problems.push(`"${name}": "alreadyMade" must be true or false`);
      else if (i.recipe === undefined) problems.push(`"${name}": "alreadyMade" needs a "recipe" to start on Already made`);
      else if (i.optional) problems.push(`"${name}": "alreadyMade" is only for required ingredients; an optional one is made only when you add it`);
    }
    if (i?.recipe !== undefined && typeof i.recipe !== "string") problems.push(`"${name}": "recipe" must be one recipe's file name, like "garlic-paste" (the planner takes one for now)`);
    if (typeof i?.recipe === "string" && !usedItems.has(lower(name))) notes.push(`"${name}" links to a recipe but no step uses it, so the lineup has it ready before step 1`);
    const says = typeof i === "string" ? i : [i?.qty, i?.item, i?.note].join(" ");
    if (/\boptional\b/i.test(says) && i?.optional !== true) notes.push(`"${name}" says it's optional but isn't marked "optional": true`);
  }
  return { problems, notes };
}

// Ingredient links between recipes, slug -> [{ item, to }], checked once every
// recipe is read: each must exist, and they mustn't loop.
const links = new Map();

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
  errors.push(...checkUses(r, steps).map((e) => `${where}: ${e}`));
  const planning = checkPlanning(r, steps, ings);
  errors.push(...planning.problems.map((e) => `${where}: ${e}`));
  warnings.push(...planning.notes.map((w) => `${where}: ${w}`));
  links.set(slug, ings.filter((i) => typeof i?.recipe === "string").map((i) => ({ item: i.item, to: i.recipe })));
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

  // Tags that aren't lists were reported above; leave them out here rather than crash.
  const listTags = Array.isArray(tags) || typeof tags !== "object" ? {} : Object.fromEntries(Object.entries(tags).filter(([, v]) => Array.isArray(v)));
  const facets = { ...listTags, time: timeFacet(total), kind: [r.kind || "dish"] };
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

// Every linked recipe exists, and following the links never comes back round.
{
  for (const [slug, out] of links) for (const { item, to } of out) {
    if (!links.has(to)) errors.push(`${DIR}/${slug}.json: "${item}" links to recipe "${to}", which doesn't exist`);
  }
  const finished = new Set(), loops = new Set();
  const visit = (slug, path) => {
    if (path.includes(slug)) return loops.add([...path.slice(path.indexOf(slug)), slug].join(" → "));
    if (finished.has(slug) || !links.has(slug)) return;
    for (const { to } of links.get(slug)) visit(to, [...path, slug]);
    finished.add(slug);
  };
  for (const slug of links.keys()) visit(slug, []);
  for (const loop of loops) errors.push(`recipe links loop: ${loop}`);
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
