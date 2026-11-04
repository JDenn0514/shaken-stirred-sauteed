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

// What a cook needs to plan ahead, which recipes often leave out:
// - how to keep something saved for later ("saving the 4 yolks for lemon curd"),
//   and how to store a dish that keeps once it's done (the make-ahead plan ends
//   there);
// - an amount for each ingredient that's bought (berries "to taste"), apart from
//   salt, pepper, water and the like.
const STORE = /\b(refrigerat|fridge|freez|airtight|cover|wrap|store|room temperature|jar|container)\w*/i;
const BASICS = /^(salt|pepper|kosher salt|sea salt|flaky salt|black pepper|salt and (?:freshly ground )?(?:black )?pepper|water|ice|cooking spray|nonstick spray)\b/i;
const FOR_THE_PAN = /\bfor (?:the )?(?:pan|bowl|dish|tray|sheet|greasing|dusting|kneading|the work surface)\b/i;
export function planningChecks(recipe) {
  const flags = [];
  const flatList = (l = []) => l.flatMap((e) => (e && Array.isArray(e.items) ? e.items : [e]));
  const steps = flatList(recipe.steps).map((s) => (typeof s === "string" ? s : s.do));
  for (const step of steps) {
    for (const sentence of step.split(/(?<=[.!?])\s+/)) {
      // Saved for another recipe or another day ("saving the 4 yolks for lemon
      // curd"), not for the garnish later in this one, nor part of a mixture
      // held back for a later step ("Hold back roughly half for later").
      const heldBack = /\b(?:hold|keep)(?:ing)? back\b/i.test(sentence);
      const saved = !heldBack && (/\b(?:sav(?:e|ing)|reserv(?:e|ing)|set(?:ting)? aside)\b[^.]*\bfor (?!(?:the )?(?:garnish|top|topping|serving|finish|basting|sauce)\b)\w/i.test(sentence) || /\bfor (?:later|tomorrow|another day)\b/i.test(sentence));
      if (saved && !STORE.test(sentence)) {
        flags.push({ kind: "storage", text: sentence, why: "something is saved for later: say how to keep it (covered, in the fridge) and for how long" });
      }
    }
  }
  const notes = flatList(recipe.notes).map((n) => (typeof n === "string" ? n : n.do || ""));
  // A recipe meant to be made ahead (a "Do ahead" note), not one whose notes
  // say how to keep leftovers.
  const keeps = (recipe.notes || []).some((g) => /^(do|make) ahead$/i.test(g.group || "")) || [...notes, ...steps].some((t) => /\b(?:make|do) (?:it |this )?ahead\b/i.test(t));
  const last = steps.at(-1);
  // Storing it can come before the finishing touches (the pavlova's shell).
  // Covering dough to rise or softening butter isn't storing the dish.
  const stores = (t) => t.split(/(?<=[.!?])\s+/).some((x) => STORE.test(x) && !/\b(?:rise|rises|proof|double[ds]?|expand(?:s|ed)?|warm (?:place|spot)|come to room temperature)\b/i.test(x));
  if (keeps && last && !steps.some(stores)) {
    flags.push({ kind: "storage", text: last, why: "the recipe says it keeps, but no step says how to store it: add one, so a make-ahead plan can end there" });
  }
  for (const i of flatList(recipe.ingredients)) {
    if (typeof i !== "object" || i.grams || i.ml || /\d|[½⅓⅔¼¾⅛]|^(pinch|dash|handful)/i.test(i.qty || "")) continue;
    if (/^(?:juice|zest) of\b|^pinch\b|\d|[½⅓⅔¼¾⅛]/i.test(i.item)) continue; // "Juice of ½ lemon"
    if (BASICS.test(i.item) || FOR_THE_PAN.test(`${i.item}, ${i.note || ""}`)) continue;
    flags.push({ kind: "no-amount", text: i.item, why: "no amount: add one so you know how much to buy, and so a shopping list can add it up" });
  }
  return flags;
}

// Adds planning data (tools/restructure) and drops its bookkeeping.
function finish(recipe, flags, { category, titles = {} } = {}) {
  flags.push(...planningChecks(recipe));
  if (CATEGORIES.includes(category)) recipe.category = category;
  else flags.push({ kind: "category", text: "", why: "choose Baking, Cooking or Cocktails" });
  const { recipe: out, notes } = restructure({ category: recipe.category || "cooking", ...recipe }, titles, null);
  if (!recipe.category) delete out.category;
  // Mark what the restructuring changed, so a person can undo it: steps split
  // out of one written step, and an alternative ("No blender? …") joined to
  // the step before it. Each flag carries the original text.
  const flatSteps = (l) => l.flatMap((e) => (e && Array.isArray(e.items) ? e.items : [e]));
  const before = flatSteps(recipe.steps), after = flatSteps(out.steps);
  const parts = new Map();
  for (const s of after) if (!s.added && s.x_from != null) parts.set(s.x_from, [...(parts.get(s.x_from) || []), s]);
  for (const [i, list] of parts) {
    if (list.length < 2) continue;
    for (const s of list) s.review = "split";
    flags.push({ kind: "split", text: before[i].do, parts: list.map((s) => s.do), why: `split into ${list.length} steps, so each has at most one wait and one place on the stove or in the oven; join them back if it reads better as one` });
  }
  for (const s of after) {
    if (!s.x_merged) continue;
    s.review = "joined";
    flags.push({ kind: "joined", text: s.do, parts: [s.x_from, ...s.x_merged].map((i) => before[i].do), why: "another way to do the step before, joined to it; split it back out if you'd rather" });
  }
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

// The draft as it's saved: the review marks are for the form, not the recipe.
export function forSaving(recipe) {
  const out = structuredClone(recipe);
  const strip = (s) => { delete s.review; return s; };
  out.steps = out.steps.map((e) => (e && Array.isArray(e.items) ? { ...e, items: e.items.map(strip) } : strip(e)));
  return out;
}
