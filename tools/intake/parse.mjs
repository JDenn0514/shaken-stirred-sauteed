// Reads a recipe from plain text: a cookbook page copied with Apple Live Text,
// a screenshot or recipe app's text, or anything laid out the usual way (a
// title, ingredients, then the method). Returns a draft in the site's recipe
// format (README "Recipe fields") and the things a person must check. No
// language model: every rule is a pattern, listed in tools/intake/README.md.

// 1. OCR slips that are safe to repair.
export function repair(text) {
  return text
    .replace(/ /g, " ")
    .replace(/º/g, "°") // "105ºF": the masculine ordinal, read for a degree sign
    .replace(/(\d)\s*0z\b/g, "$1 oz") // "4 0z"
    .replace(/(\d)\(/g, "$1 (") // "1(0.25 oz"
    .replace(/\b(\d)([1-7]\/[2348])\b/g, (m, whole, frac) => (+frac[0] < +frac.at(-1) ? `${whole} ${frac}` : m)) // "11/2" is 1 1/2
    .replace(/[①-⑨®]/g, "") // footnote markers
    .replace(/([.!?])[ \t]+[a-z1-9][ \t]+(?=[A-Z])/g, "$1 ") // a footnote marker read as a letter: "braid them. a Then"
    .replace(/[ \t]+/g, " ");
}

// Pages in order. A page that breaks off with "(continues)" carries on at the
// top of the next one, so the two halves join into one line.
function joinPages(pages) {
  const lines = (p) => p.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const out = [], tails = [];
  pages.forEach((page, n) => {
    const ls = lines(page);
    if (n > 0 && /\(continues\)\s*$/.test(out.at(-1) ?? "")) out[out.length - 1] = `${out.at(-1).replace(/\s*\(continues\)\s*$/, "")} ${ls.shift() ?? ""}`;
    const cut = ls.findIndex((l) => /\(continues\)\s*$/.test(l));
    if (cut >= 0 && n < pages.length - 1) { out.push(...ls.slice(0, cut + 1)); tails.push(...ls.slice(cut + 1)); } else out.push(...ls);
  });
  return [...out, ...tails];
}

// A line that wrapped: a weight on its own line, or a line that carries on
// from one ending in a comma or starting in lower case.
function joinWrapped(lines) {
  const out = [];
  for (const l of lines) {
    const prev = out.at(-1);
    const cont = prev != null && !BULLET.test(l) && (/^\([^)]*\b\d+(?:\.\d+)?\s*(?:g|ml|oz)\b[^)]*\)$/i.test(l) || prev.endsWith(",") || /^[a-z]/.test(l));
    if (cont) out[out.length - 1] = `${prev} ${l}`;
    else out.push(l);
  }
  return out;
}

const BULLET = /^\s*(?:[•·▪◦*▢☐□-]|\d+[.)])\s+/;
const META = /^(season|active time|prep(?:aration)? time|cook(?:ing)? time|total time|difficulty|serves|makes|yield|servings)\b/i;
const NOTES_HEADING = /^(do ahead|make ahead|notes?|variations?|tips?|storage|substitutions?)$/i;
const ING_HEADING = /^(ingredients?)$/i;
const METHOD_HEADING = /^(directions|instructions|method|steps|preparation)$/i;
const NAMED_STEP = /^([A-Z][A-Za-z ,'’&/-]{2,40}):\s+(\S.*)$/;
const CAPS_HEADING = (l) => /^[A-Z][A-Z &,'’/-]{2,40}$/.test(l) && l.split(" ").length <= 5;
const sentenceCase = (s) => s.charAt(0).toUpperCase() + s.slice(1).toLowerCase();

// 2. One ingredient line -> { qty, grams, ml, item, note }.
const FRACTION = "(?:\\d+\\s*[½⅓⅔¼¾⅛]|[½⅓⅔¼¾⅛]|\\d+\\s+\\d+\\/\\d+|\\d+\\/\\d+|\\d+(?:\\.\\d+)?)";
const AMOUNT = new RegExp(`^(${FRACTION}(?:\\s*(?:to|-|–)\\s*${FRACTION})?)\\s*`);
const UNITS = "cups?|tablespoons?|teaspoons?|tbsps?|tsps?|ounces?|oz|pounds?|lbs?|grams?|g|kg|ml|liters?|litres?|l|sticks?|envelopes?|packets?|packages?|cans?|jars?|cloves?|bunch(?:es)?|heads?|sprigs?|slices?|pieces?|quarts?|pints?|pinch(?:es)?|dash(?:es)?";
const UNIT = new RegExp(`^(${UNITS})\\.?\\s+`, "i");
const WEIGHT = /^\(([^)]*\b\d+(?:\.\d+)?\s*(?:g|ml)\b[^)]*)\)\s*/i;

export function parseIngredient(line) {
  let rest = line.replace(BULLET, "").replace(/\s+/g, " ").trim();
  const out = {};
  const weigh = (w) => {
    const g = /(\d+(?:\.\d+)?)\s*g\b/i.exec(w), ml = /(\d+(?:\.\d+)?)\s*ml\b/i.exec(w);
    if (g) out.grams = +g[1];
    if (ml) out.ml = +ml[1];
  };
  const word = /^(pinch|dash|a pinch|a dash|handful|a handful)(?: of)?\s+/i.exec(rest);
  if (word) { out.qty = word[1].replace(/^a /i, "").replace(/^\w/, (c) => c.toUpperCase()); rest = rest.slice(word[0].length); }
  else {
    const a = AMOUNT.exec(rest);
    if (a) {
      let qty = a[1].trim();
      rest = rest.slice(a[0].length);
      let w = WEIGHT.exec(rest);
      if (w) { weigh(w[1]); rest = rest.slice(w[0].length); }
      const size = /^\(([^)]+)\)\s*/.exec(rest); // a can's size: "1 (28 ounce) can"
      if (size && !w) { qty += ` (${size[1]})`; rest = rest.slice(size[0].length); }
      const u = UNIT.exec(rest);
      if (u) { qty += ` ${u[1]}`; rest = rest.slice(u[0].length); }
      w = WEIGHT.exec(rest);
      if (w) { weigh(w[1]); rest = rest.slice(w[0].length); }
      out.qty = qty;
    }
  }
  // A weight after the item: "whole milk (4 oz / 113g)".
  rest = rest.replace(/\s*\(([^)]*\b\d+(?:\.\d+)?\s*(?:g|ml)\b[^)]*)\)/i, (m, w) => { weigh(w); return ""; });
  const comma = rest.indexOf(",");
  let item = comma < 0 ? rest : rest.slice(0, comma), note = comma < 0 ? "" : rest.slice(comma + 1).trim();
  const paren = /^(.*?)\s*\(([^)]*)\)$/.exec(item);
  if (paren && paren[1]) { item = paren[1]; note = [paren[2], note].filter(Boolean).join(", "); }
  out.item = item.trim();
  if (note) out.note = note;
  return out;
}

// Times as written -> minutes, for the recipe's "time".
const minutesOf = (t) => {
  const h = /(\d+(?:\.\d+)?)\s*(?:hours?|hrs?)\b/i.exec(t), m = /(\d+)\s*min/i.exec(t);
  return h || m ? Math.round((h ? +h[1] * 60 : 0) + (m ? +m[1] : 0)) : null;
};
const TIME_IN = /\b\d+(?:\s+\d+\/\d+|\s*[½¼¾])?\s*(?:(?:to|-|–)\s*\d+(?:\s+\d+\/\d+|\s*[½¼¾])?\s*)?(?:sec|seconds?|min|minutes?|hrs?|hours?)\b/i;
const NEEDS_TIME = /\b(bake|baking|roast|rise|chill|refrigerate|cool|rest|proof|simmer)\w*\b/i;
const UNREADABLE = /^(?:[%¥{}]|Y%|y,)\s*|(?:^|\s)[%¥{}]\s*(?:cups?|tablespoons?|teaspoons?|tbsp|tsp)\b/i;

// 3. The whole text. `pages` is one string, or a list of pages in order.
export function parseRecipeText(pages) {
  const list = [].concat(pages).map(repair);
  const lines = joinWrapped(joinPages(list)).map(repair);
  const recipe = { title: "", ingredients: [], steps: [], notes: [] };
  const flags = [];
  const headnote = [], equipment = [], notes = new Map();
  let phase = "head", ingGroup = null, stepGroup = null, notesGroup = null;
  const addIng = (line) => {
    const i = parseIngredient(line);
    if (UNREADABLE.test(line.replace(BULLET, ""))) flags.push({ kind: "unreadable", text: line.replace(BULLET, "").trim(), why: "an amount that OCR couldn't read; fix it from the photo" });
    if (ingGroup) ingGroup.items.push(i); else recipe.ingredients.push(i);
  };
  const addStep = (text, group) => {
    const s = { do: text };
    if (group) {
      if (stepGroup?.group !== group) { stepGroup = { group, items: [] }; recipe.steps.push(stepGroup); }
      stepGroup.items.push(s);
    } else if (stepGroup) stepGroup.items.push(s);
    else recipe.steps.push(s);
  };
  const addNote = (group, text) => { if (!notes.has(group)) notes.set(group, []); notes.get(group).push(text); };

  for (const raw of lines) {
    const line = raw.replace(/\s+/g, " ").trim();
    const src = /^source:\s*(\S+)/i.exec(line);
    if (src) { recipe.source = { name: "", url: src[1] }; continue; }
    if (/^tags?:/i.test(line) || /^\d+ of \d+$/.test(line)) continue;
    if (META.test(line)) {
      for (const part of line.split(/\s[|I]\s/)) {
        const t = /^(active|prep(?:aration)?|cook(?:ing)?|total)(?: time)?:\s*(.+)$/i.exec(part.trim());
        if (t) (recipe.times ||= []).push([sentenceCase(t[1].replace(/aration|ing$/i, "")), t[2].trim()]);
        if (/^(serves|makes|yield)\b/i.test(part.trim())) recipe.yield = part.trim().replace(/^yield:\s*/i, "");
      }
      continue;
    }
    if (NOTES_HEADING.test(line)) { phase = "notes"; notesGroup = sentenceCase(line); continue; }
    if (/^special equipment:?$/i.test(line)) { phase = "equipment"; continue; }
    if (ING_HEADING.test(line.replace(/:$/, ""))) { phase = "ingredients"; continue; }
    if (METHOD_HEADING.test(line.replace(/:$/, ""))) { phase = "method"; stepGroup = null; continue; }
    if (phase === "head" && !recipe.title && !BULLET.test(line) && line.length <= 70 && !/[.:]$/.test(line)) { recipe.title = line; continue; }
    if (phase === "equipment") {
      if (CAPS_HEADING(line) || AMOUNT.test(line)) phase = "ingredients";
      else { equipment.push(line); continue; }
    }
    if (phase === "head") phase = "ingredients";
    if (phase === "ingredients" && CAPS_HEADING(line)) { ingGroup = { group: sentenceCase(line), items: [] }; recipe.ingredients.push(ingGroup); continue; }
    const named = NAMED_STEP.exec(line);
    const numbered = /^\d+[.)]\s+\S/.test(line);
    const footnote = /^[1-9]\s+[A-Z]/.test(line) && phase !== "ingredients";
    if (phase === "notes" && !named && !numbered) { addNote(footnote ? "Footnotes" : notesGroup, footnote ? line.replace(/^\d\s+/, "") : line); continue; }
    if (footnote && recipe.steps.some((s) => s.group)) { addNote("Footnotes", line.replace(/^\d\s+/, "")); continue; }
    if (phase === "ingredients" && !named && !numbered && !(line.length > 140 && /[.!?]$/.test(line))) { addIng(line); continue; }
    // The method. A long paragraph before the first step is the story that
    // opens the recipe, not a step.
    if (!named && !numbered && !recipe.steps.length && line.length > 140 && !/^(preheat|heat|in a|combine|whisk|mix|place|put|add|bring)\b/i.test(line)) { headnote.push(line); phase = "method"; continue; }
    phase = "method";
    if (named) addStep(named[2], named[1].trim());
    else addStep(line.replace(BULLET, ""));
  }

  if (headnote.length) recipe.headnote = headnote.join("\n\n");
  if (equipment.length) recipe.equipment = equipment;
  for (const group of ["Do ahead", "Make ahead", "Notes", "Note", "Tips", "Storage", "Variations", "Substitutions", "Footnotes"]) {
    if (notes.has(group)) recipe.notes.push({ group, items: notes.get(group) });
  }
  for (const [group, items] of notes) if (!recipe.notes.some((n) => n.group === group)) recipe.notes.push({ group, items });
  if (!recipe.notes.length) delete recipe.notes;
  if (recipe.times) {
    const get = (k) => recipe.times.find(([l]) => l === k)?.[1];
    const time = {};
    const prep = minutesOf(get("Active") || get("Prep") || ""), cook = minutesOf(get("Cook") || ""), total = minutesOf(get("Total") || "");
    if (prep != null) time.prep = prep;
    if (cook != null) time.cook = cook;
    if (total != null) time.total = total;
    if (Object.keys(time).length) recipe.time = time;
  }

  // What a person must check.
  const flat = (l) => l.flatMap((e) => (e && Array.isArray(e.items) ? e.items : [e]));
  for (const i of flat(recipe.ingredients)) if (i.qty) flags.push({ kind: "amount", text: `${i.qty} ${i.item}`, why: "check every amount against the original; fractions are where reading goes wrong" });
  for (const s of flat(recipe.steps)) {
    for (const sentence of s.do.split(/(?<=[.!?])\s+/)) {
      if (NEEDS_TIME.test(sentence) && !TIME_IN.test(sentence) && /^(bake|roast|chill|refrigerate|let|leave|cover|set|cool|rest|proof|simmer)/i.test(sentence)) {
        flags.push({ kind: "time", text: sentence, why: "no time given: add one so the timer and the lineup planner can count it" });
      }
    }
  }
  if (!recipe.title) flags.push({ kind: "title", text: "", why: "no title found" });
  if (!flat(recipe.ingredients).length) flags.push({ kind: "ingredients", text: "", why: "no ingredients found" });
  if (!flat(recipe.steps).length) flags.push({ kind: "steps", text: "", why: "no steps found" });
  return { recipe, flags };
}
