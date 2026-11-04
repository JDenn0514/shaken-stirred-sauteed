// The recipe intake's pipeline: text or a web page's recipe data in, a draft
// recipe with planning data out, plus the things a person must check.
//
//   draftFromText(pages, { category, titles })     text copied from photos or screenshots
//   draftFromSchemaOrg(htmlOrData, { category, url, titles })   a recipe web page
//
// `category` is "baking", "cooking" or "cocktails" (asked for when missing);
// `titles` maps existing recipe slugs to titles, so ingredients can link to
// the recipes that make them. See tools/intake/README.md.
import { parseRecipeText, parseIngredient } from "./parse.mjs";
import { restructure } from "../restructure/restructure.mjs";

const CATEGORIES = ["baking", "cooking", "cocktails"];

// Adds planning data (tools/restructure) and drops its bookkeeping.
function finish(recipe, flags, { category, titles = {} } = {}) {
  if (CATEGORIES.includes(category)) recipe.category = category;
  else flags.push({ kind: "category", text: "", why: "choose Baking, Cooking or Cocktails" });
  const { recipe: out, notes } = restructure({ category: recipe.category || "cooking", ...recipe }, titles, null);
  if (!recipe.category) delete out.category;
  const clean = (s) => { delete s.x_from; delete s.x_merged; delete s.added; return s; };
  out.steps = out.steps.map((e) => (e && Array.isArray(e.items) ? { ...e, items: e.items.map(clean) } : clean(e)));
  // Timers and the lineup planner read waits written the site's way, "1 1/2 hr".
  const ascii = (w) => w.replace(/(\d)\s*([½⅓⅔¼¾])/g, "$1 $2").replace(/[½⅓⅔¼¾]/g, (c) => ({ "½": "1/2", "⅓": "1/3", "⅔": "2/3", "¼": "1/4", "¾": "3/4" })[c]);
  for (const e of out.steps) for (const s of e.items || [e]) if (s.wait) s.wait = ascii(s.wait);
  for (const n of notes) flags.push({ kind: "planning", text: n, why: "worked out from the text; check it" });
  return { recipe: out, flags };
}

export function draftFromText(pages, opts = {}) {
  const { recipe, flags } = parseRecipeText(pages);
  return finish(recipe, flags, opts);
}

// Recipe pages describe the recipe for search engines (schema.org "Recipe",
// in a <script type="application/ld+json">). That's exact text, so nothing
// needs reading from a picture.
export function findSchemaOrgRecipe(input) {
  const blocks = typeof input === "string"
    ? [...input.matchAll(/<script[^>]*application\/ld\+json[^>]*>([\s\S]*?)<\/script>/gi)].map((m) => { try { return JSON.parse(m[1]); } catch { return null; } })
    : [input];
  const all = blocks.filter(Boolean).flatMap((b) => (Array.isArray(b) ? b : b["@graph"] || [b]));
  return all.find((x) => [].concat(x?.["@type"]).includes("Recipe")) || null;
}

const iso = (d) => {
  const m = /^P(?:\d+D)?T?(?:(\d+)H)?(?:(\d+)M)?/.exec(d || "");
  return m && (m[1] || m[2]) ? (+m[1] || 0) * 60 + (+m[2] || 0) : null;
};
const asText = (min) => (min >= 60 ? `${Math.floor(min / 60)} hr${min % 60 ? ` ${min % 60} min` : ""}` : `${min} min`);
const plain = (s) => String(s ?? "").replace(/<[^>]+>/g, "").replace(/&amp;/g, "&").replace(/&#39;|&apos;/g, "'").replace(/&quot;/g, '"').replace(/\s+/g, " ").trim();

export function draftFromSchemaOrg(input, opts = {}) {
  const r = findSchemaOrgRecipe(input);
  if (!r) return { recipe: null, flags: [{ kind: "source", text: "", why: "no recipe data on this page; copy the text instead" }] };
  const steps = [];
  const step = (s) => ({ do: plain(typeof s === "string" ? s : s.text || s.name) });
  for (const s of [].concat(r.recipeInstructions || [])) {
    if (s?.itemListElement) steps.push({ group: plain(s.name), items: [].concat(s.itemListElement).map(step) });
    else steps.push(...String(typeof s === "string" ? s : "").split(/\n+/).filter(Boolean).map((t) => step(t)), ...(typeof s === "string" ? [] : [step(s)]));
  }
  const times = [["Prep", iso(r.prepTime)], ["Cook", iso(r.cookTime)], ["Total", iso(r.totalTime)]].filter(([, v]) => v);
  const author = [].concat(r.author || [])[0];
  const recipe = {
    title: plain(r.name),
    ...(r.description && { description: plain(r.description) }),
    ...(r.recipeYield && { yield: plain([].concat(r.recipeYield)[0]) }),
    ...(times.length && { times: times.map(([k, v]) => [k, asText(v)]), time: Object.fromEntries(times.map(([k, v]) => [k.toLowerCase(), v])) }),
    ingredients: [].concat(r.recipeIngredient || []).map((i) => parseIngredient(plain(i))),
    steps,
    source: { name: plain(author?.name || ""), url: opts.url || r.url || "" },
  };
  const flags = [];
  const flat = (l) => l.flatMap((e) => (e && Array.isArray(e.items) ? e.items : [e]));
  if (!flat(recipe.steps).length) flags.push({ kind: "steps", text: "", why: "the page's recipe data has no steps; copy them from the page" });
  return finish(recipe, flags, opts);
}
