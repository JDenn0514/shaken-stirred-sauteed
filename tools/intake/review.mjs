// The review screen's logic: from a draft (draftFromText or draftFromSchemaOrg)
// to the recipe to save. It works out what to ask the person, what to show for
// them to confirm and what to check, following docs/specs/intake-lineup-needs.md:
//
// - ask: a time for every step that waits (the planner's own `unknown`, so the
//   intake and the lineup never disagree), and how the dish is served;
// - confirm: the planning guesses (split steps, watch, prep, during, holds,
//   linked recipes);
// - fill in quietly: hands-on times and equipment, as the draft has them.
//
// A review is a plain object (`state`). Each change returns a new one, so the
// page can keep the last and redraw from `reviewOf(state)`. Steps and
// ingredients carry an `reviewId` while under review; `recipeToSave` takes it off.
import { planLineup } from "../../assets/planner.mjs";

const flatten = (l = []) => l.flatMap((e) => (e && Array.isArray(e.items) ? e.items : [e]));
const stepsOf = (r) => flatten(r.steps);

// A time the timers and the planner can read: "35 min", "1 1/2 to 2 hr", "45 sec"
// (the recipe checker's pattern, scripts/build-index.mjs).
const NUM = String.raw`\d+(?:\.\d+)?(?:\s+\d+\/\d+)?|\d+\/\d+`;
const TIME = new RegExp(`^(?:about |at least |up to )?(${NUM})\\s*(?:(?:to|-|–)\\s*(${NUM})\\s*)?(sec(?:ond)?s?|min(?:ute)?s?|hrs?|hours?)\\b`, "i");
export const isTime = (t) => typeof t === "string" && TIME.test(t.trim());

// What the planner doesn't know about the recipe, as the lineup page would ask.
function unknownOf(recipe) {
  try {
    return planLineup({ dishes: [{ slug: "draft" }] }, { draft: recipe }).unknown || [];
  } catch {
    return [];
  }
}

export function startReview(draft, flags = []) {
  const recipe = structuredClone(draft);
  let n = 0;
  for (const s of stepsOf(recipe)) if (s && typeof s === "object") s.reviewId = `s${++n}`;
  n = 0;
  for (const i of flatten(recipe.ingredients)) if (i && typeof i === "object") i.reviewId = `i${++n}`;
  const state = {
    recipe, flags: structuredClone(flags), waits: [], answered: {}, tried: {},
    serveGuess: { serve: recipe.serve, sits: recipe.sits },
    // The steps the reader marked as prep, or as done during another's wait:
    // shown to confirm, and still shown after being unmarked.
    prepSteps: stepsOf(recipe).filter((s) => s?.prep || s?.prepOnly).map((s) => s.reviewId),
    duringSteps: stepsOf(recipe).filter((s) => s?.during).map((s) => s.reviewId),
  };
  return withNewAsks(state);
}

// Adds the steps the planner can't time to the questions. A question stays
// once asked, answered or not, so the person can see and change the answer.
function withNewAsks(state) {
  const steps = stepsOf(state.recipe);
  const waits = [...state.waits];
  const suggest = { ...state.suggest };
  for (const u of unknownOf(state.recipe)) {
    const id = u.kind === "wait" && steps[u.step]?.reviewId;
    if (!id || waits.includes(id)) continue;
    waits.push(id);
    if (u.suggest && isTime(u.suggest)) suggest[id] = u.suggest;
  }
  // The intake's own "no time given" flags (a bake, rise, chill or cool). Most
  // are already asked above; one in a step that waits for something else ("Bake
  // until deep golden. Then let them cool, at least 15 minutes.") isn't, since
  // the step has a wait. That one asks about its sentence, and splits there.
  const sentences = { ...state.sentences };
  for (const f of state.flags.filter((x) => x.kind === "time")) {
    const step = steps.find((x) => x?.do?.includes(f.text));
    if (!step) continue;
    if (!step.wait) {
      if (!waits.includes(step.reviewId)) waits.push(step.reviewId);
      continue;
    }
    const id = `${step.reviewId}:${f.text}`;
    if (waits.includes(id) || waits.some((w) => sentences[w]?.text === f.text)) continue;
    waits.push(id);
    sentences[id] = { step: step.reviewId, text: f.text };
  }
  return { ...state, waits, suggest, sentences };
}

// Splits a step after `sentence`: the first part gets `wait`, the rest keeps
// the step's own wait.
function splitAfter(recipe, step, sentence, wait) {
  const at = step.do.indexOf(sentence) + sentence.length;
  const rest = step.do.slice(at).trim();
  const first = { ...step, do: step.do.slice(0, at).trim(), wait };
  if (!rest) return Object.assign(step, first);
  const second = { do: rest, wait: step.wait, reviewId: `${step.reviewId}b` };
  const replace = (list) => list.flatMap((e) => (e === step ? [first, second] : e && Array.isArray(e.items) ? [{ ...e, items: replace(e.items) }] : [e]));
  recipe.steps = replace(recipe.steps);
}

const stepById = (recipe, id) => stepsOf(recipe).find((s) => s?.reviewId === id);

export function answerWait(state, id, time) {
  const next = structuredClone(state);
  const part = next.sentences?.[id];
  if (part) {
    const step = stepById(next.recipe, part.step);
    if (!step) return state;
    if (time !== null && !isTime(time)) {
      next.answered[id] = false;
      next.tried[id] = time;
      return next;
    }
    delete next.tried[id];
    next.answered[id] = true;
    if (time === null) return next;
    if (part.split) step.wait = time.trim();
    else {
      splitAfter(next.recipe, step, part.text, time.trim());
      part.split = true;
    }
    return next;
  }
  const step = stepById(next.recipe, id);
  if (!step) return state;
  if (time === null) {
    delete step.wait;
    next.answered[id] = true;
    delete next.tried[id];
  } else if (isTime(time)) {
    step.wait = time.trim();
    next.answered[id] = true;
    delete next.tried[id];
  } else {
    next.answered[id] = false;
    next.tried[id] = time;
  }
  return next;
}

// How the dish is served matters most for cooking dishes: without it a steak
// that should be eaten within 5 minutes may be planned to sit 10. Components,
// baking and cocktails have safe defaults, so those are shown to confirm.
const asksServe = (r) => r.category === "cooking" && r.kind !== "component";
export const SERVES = ["hot", "soon", "keeps"];

export function answerServe(state, serve, sits) {
  if (!SERVES.includes(serve)) return state;
  const next = structuredClone(state);
  next.recipe.serve = serve;
  if (serve === "keeps") delete next.recipe.sits;
  else if (isTime(sits)) next.recipe.sits = sits.trim();
  next.answered.serve = serve === "keeps" || isTime(sits);
  return next;
}

// Replaces the steps in `old` (a list of steps, in order) with `made` where the
// first of them was, keeping groups.
function replaceSteps(recipe, old, made) {
  const go = (list) => list.flatMap((e) => {
    if (e && Array.isArray(e.items)) return [{ ...e, items: go(e.items) }];
    if (e === old[0]) return made;
    return old.includes(e) ? [] : [e];
  });
  recipe.steps = go(recipe.steps).filter((e) => !(e && Array.isArray(e.items) && !e.items.length));
}

// The steps a split or joined flag is about, in the recipe as it is now.
function flagSteps(recipe, f) {
  const steps = stepsOf(recipe);
  if (f.kind === "split") return steps.filter((s) => s?.review === "split" && f.parts.includes(s.do));
  if (f.kind === "joined") return steps.filter((s) => s?.review === "joined" && s.do === f.text);
  return [];
}

// Planning fields a joined-back step takes from its parts: any part's wait,
// equipment or watching applies to the whole.
const PLANNING = ["wait", "watch", "oven", "preheat", "burner", "grill", "microwave", "during"];
export function joinBack(state, id) {
  const next = structuredClone(state);
  const f = next.flags[Number(id.split(":")[1])];
  const parts = f && flagSteps(next.recipe, f);
  if (!parts?.length) return state;
  const one = { ...parts[0], do: f.text };
  delete one.review;
  for (const p of parts.slice(1)) for (const k of PLANNING) if (p[k] !== undefined && one[k] === undefined) one[k] = p[k];
  replaceSteps(next.recipe, parts, [one]);
  f.done = true;
  return withNewAsks(next);
}

export function splitBack(state, id) {
  const next = structuredClone(state);
  const f = next.flags[Number(id.split(":")[1])];
  const [step] = (f && flagSteps(next.recipe, f)) || [];
  if (!step) return state;
  const first = { ...step, do: f.parts[0] };
  delete first.review;
  const rest = f.parts.slice(1).map((t, n) => ({ do: t, reviewId: `${step.reviewId}-${n + 1}` }));
  replaceSteps(next.recipe, [step], [first, ...rest]);
  f.done = true;
  return withNewAsks(next);
}

// Confirming a guess on a step: `watch` and `during` are true or false; `prep`
// is true (done ahead), "just before", or false (not prep).
export function setPlanning(state, id, field, value) {
  if (!["watch", "prep", "during"].includes(field)) return state;
  const next = structuredClone(state);
  const step = stepById(next.recipe, id);
  if (!step) return state;
  if (value === true || value === "just before") step[field] = value;
  else delete step[field];
  return next;
}

// The step after which the dish keeps as long as you like (one, or none).
export function setHolds(state, id) {
  const next = structuredClone(state);
  for (const s of stepsOf(next.recipe)) if (s && typeof s === "object") {
    if (s.reviewId === id) s.holds = true;
    else delete s.holds;
  }
  return next;
}

// An ingredient made by another recipe: `recipe` (a slug, or null to unlink),
// and for a required one, `alreadyMade` (usually bought or on hand).
export function setLink(state, id, { recipe, alreadyMade } = {}) {
  const next = structuredClone(state);
  const ing = flatten(next.recipe.ingredients).find((i) => i?.reviewId === id);
  if (!ing) return state;
  if (recipe === null) {
    delete ing.recipe;
    delete ing.alreadyMade;
    return next;
  }
  if (recipe) ing.recipe = recipe;
  if (alreadyMade === true && ing.recipe && !ing.optional) ing.alreadyMade = true;
  else if (alreadyMade === false) delete ing.alreadyMade;
  return next;
}

// Editing an ingredient: an empty field is removed.
export function updateIngredient(state, id, changes) {
  const next = structuredClone(state);
  const ing = flatten(next.recipe.ingredients).find((i) => i?.reviewId === id);
  if (!ing) return state;
  for (const [k, v] of Object.entries(changes)) {
    if (!["qty", "item", "note"].includes(k)) continue;
    const t = String(v ?? "").trim();
    if (t) ing[k] = t;
    else delete ing[k];
  }
  // Grams and millilitres were read with the old amount; they go with it.
  if ("qty" in changes) { delete ing.grams; delete ing.ml; }
  next.edited = { ...next.edited, [id]: true };
  return next;
}

// Editing a step's text (and its wait, which must be a time or empty). New
// text can make a new question (a bake with no time).
export function updateStep(state, id, { do: text, wait } = {}) {
  const next = structuredClone(state);
  const step = stepById(next.recipe, id);
  if (!step) return state;
  if (text !== undefined && String(text).trim()) step.do = String(text).trim();
  if (wait !== undefined) {
    if (!String(wait).trim()) delete step.wait;
    else if (isTime(wait)) step.wait = String(wait).trim();
  }
  return withNewAsks(next);
}

export function setField(state, key, value) {
  if (!["title", "yield", "description"].includes(key)) return state;
  const next = structuredClone(state);
  const t = String(value ?? "").trim();
  if (t) next.recipe[key] = t;
  else delete next.recipe[key];
  return next;
}

// New entries go at the end of the last list (or group).
const lastList = (list) => {
  const last = list.at(-1);
  return last && Array.isArray(last.items) ? last.items : list;
};
const newId = (state, prefix) => {
  state.made = (state.made || 0) + 1;
  return `${prefix}${state.made}`;
};

export function addIngredient(state) {
  const next = structuredClone(state);
  next.recipe.ingredients ||= [];
  lastList(next.recipe.ingredients).push({ item: "", reviewId: newId(next, "new-i") });
  return next;
}

export function addStep(state) {
  const next = structuredClone(state);
  next.recipe.steps ||= [];
  lastList(next.recipe.steps).push({ do: "", reviewId: newId(next, "new-s") });
  return next;
}

const without = (list, id) => list.flatMap((e) => {
  if (e && Array.isArray(e.items)) {
    const items = without(e.items, id);
    return items.length ? [{ ...e, items }] : [];
  }
  return e?.reviewId === id ? [] : [e];
});
export function removeIngredient(state, id) {
  const next = structuredClone(state);
  next.recipe.ingredients = without(next.recipe.ingredients || [], id);
  return next;
}
export function removeStep(state, id) {
  const next = structuredClone(state);
  next.recipe.steps = without(next.recipe.steps || [], id);
  next.waits = next.waits.filter((w) => w !== id && next.sentences?.[w]?.step !== id);
  return withNewAsks(next);
}

// An unfinished review, kept in the browser so a reload or an accidental back
// doesn't lose it (the editor keeps its drafts the same way). It holds the
// review and the text it was read from: pasted text, a PDF's text, or a web
// page's address. Never the PDF itself or the page's HTML
// (docs/specs/recipe-editor-design.md, "Originals").
const KEPT = 1;
function keptOriginal(o) {
  if (!o || typeof o !== "object") return null;
  if (o.kind === "page" && typeof o.url === "string") return { kind: "page", url: o.url };
  if ((o.kind === "text" || o.kind === "pdf") && Array.isArray(o.pages) && o.pages.every((p) => typeof p === "string")) {
    return { kind: o.kind, pages: [...o.pages], ...(typeof o.name === "string" && { name: o.name }) };
  }
  return null;
}
export function toKeep(state, { original, at } = {}) {
  return { v: KEPT, at: at || new Date().toISOString(), state: structuredClone(state), original: keptOriginal(original) };
}
// What toKeep made, read back: { state, original, at, title }, or null for
// anything that isn't a review this version can carry on with.
export function fromKept(kept) {
  if (!kept || typeof kept !== "object" || kept.v !== KEPT) return null;
  const s = kept.state;
  const isObject = (x) => !!x && typeof x === "object" && !Array.isArray(x);
  if (!isObject(s) || !isObject(s.recipe) || !Array.isArray(s.flags) || !Array.isArray(s.waits) || !isObject(s.answered) || !isObject(s.tried)) return null;
  return { state: s, original: keptOriginal(kept.original), at: typeof kept.at === "string" ? kept.at : "", title: s.recipe.title || "" };
}

// The recipe to save: the review's marks (`reviewId`, the reader's `review`) and
// empty new entries taken off, and dated today if it has no date.
export function recipeToSave(state, { today } = {}) {
  const out = structuredClone(state.recipe);
  const clean = (list = []) => list.flatMap((e) => {
    if (e && Array.isArray(e.items)) {
      const items = clean(e.items);
      return items.length ? [{ ...e, items }] : [];
    }
    if (e && typeof e === "object") {
      delete e.reviewId;
      delete e.review;
      if (("item" in e && !e.item) || ("do" in e && !e.do)) return [];
    }
    return [e];
  });
  out.ingredients = clean(out.ingredients);
  out.steps = clean(out.steps);
  if (!out.added && today) out.added = today;
  return out;
}

// The recipe's file name: lowercase letters, numbers and dashes (README).
export const slugOf = (title) => String(title || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "")
  .toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");

// The intake's flags as things to check, beside what they're about. Split,
// joined and missing times are asked or confirmed instead.
const NOT_CHECKS = new Set(["time", "split", "joined", "category"]);
function checksOf(state) {
  const r = state.recipe;
  const checks = [];
  const ings = flatten(r.ingredients).filter((i) => i && typeof i === "object");
  const steps = stepsOf(r).filter((x) => x && typeof x === "object");
  if (state.flags.some((f) => f.kind === "amount")) {
    checks.push({ kind: "amounts", id: "amounts", text: "", why: "Check every amount against the original: fractions are where reading goes wrong." });
  }
  state.flags.forEach((f, n) => {
    if (NOT_CHECKS.has(f.kind) || f.kind === "amount") return;
    const c = { kind: f.kind, id: `check:${n}`, text: f.text, why: f.why };
    if (f.kind === "no-amount" || f.kind === "unreadable") {
      const ing = ings.find((i) => (f.kind === "no-amount" ? i.item === f.text : f.text.includes(i.item)));
      if (ing && (state.edited?.[ing.reviewId] || (f.kind === "no-amount" && (ing.qty || ing.grams || ing.ml)))) return;
      if (ing) c.ingredient = ing.reviewId;
    } else if (f.text) {
      const step = steps.find((x) => x.do.includes(f.text));
      if (step) c.step = step.reviewId;
    }
    checks.push(c);
  });
  return checks;
}

export function reviewOf(state) {
  const asks = [];
  for (const id of state.waits) {
    const part = state.sentences?.[id];
    const step = stepById(state.recipe, part ? part.step : id);
    if (!step) continue;
    const answered = !!state.answered[id];
    const given = part ? (part.split ? step.wait : "") : step.wait;
    const value = id in state.tried ? state.tried[id] : answered ? given || "" : state.suggest?.[id] || "";
    asks.push({
      kind: "wait", id, step: step.reviewId, text: part ? part.text : step.do, value, answered,
      ...(id in state.tried && { problem: 'Give a time the timer can read, like "35 min" or "1 to 2 hr"' }),
    });
  }
  const confirms = [];
  const r = state.recipe;
  const serving = { serve: r.serve, sits: r.sits };
  if (asksServe(r)) {
    const answered = !!state.answered.serve;
    asks.push({ kind: "serve", id: "serve", answered, guess: state.serveGuess, value: "serve" in state.answered ? serving : null });
  } else {
    confirms.push({ kind: "serve", id: "serve", value: serving });
  }
  const steps = stepsOf(r).filter((x) => x && typeof x === "object");
  for (const x of steps) {
    if (x.wait) confirms.push({ kind: "watch", id: `watch:${x.reviewId}`, step: x.reviewId, value: !!x.watch });
    if (state.prepSteps?.includes(x.reviewId)) confirms.push({ kind: "prep", id: `prep:${x.reviewId}`, step: x.reviewId, added: !!x.prepOnly, value: x.prep || false });
    if (state.duringSteps?.includes(x.reviewId)) confirms.push({ kind: "during", id: `during:${x.reviewId}`, step: x.reviewId, value: !!x.during });
  }
  confirms.push({ kind: "holds", id: "holds", value: steps.find((x) => x.holds)?.reviewId || null });
  for (const i of flatten(r.ingredients)) {
    if (i?.recipe) confirms.push({ kind: "link", id: `link:${i.reviewId}`, ingredient: i.reviewId, item: i.item, recipe: i.recipe, required: !i.optional, alreadyMade: !!i.alreadyMade });
  }
  state.flags.forEach((f, n) => {
    if (f.done || (f.kind !== "split" && f.kind !== "joined")) return;
    const made = flagSteps(r, f);
    if (made.length) confirms.push({ kind: f.kind, id: `${f.kind}:${n}`, steps: made.map((x) => x.reviewId), text: f.text, parts: f.parts });
  });
  const left = asks.filter((a) => !a.answered).length;
  const missing = [
    !r.title && "a title",
    !r.category && "a section (Baking, Cooking or Cocktails)",
    !flatten(r.ingredients).some((i) => i && (typeof i === "string" || i.item)) && "an ingredient",
    !steps.some((x) => x.do) && "a step",
    left && (left === 1 ? "1 question to answer" : `${left} questions to answer`),
  ].filter(Boolean);
  return { asks, confirms, checks: checksOf(state), ready: !missing.length, missing };
}
