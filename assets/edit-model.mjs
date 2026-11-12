// The editor's changes to a recipe (edit.html). Each function takes a recipe
// (its JSON) and returns a changed copy; the one given is never changed.
//
// Ingredients and steps are found by their place in the file, counting from 0
// across groups, as the recipe page's data-ing and data-step count them.
// Lists hold entries and { group, items } sections, as the recipe files do.
//
// Fields the editor has no control for are never touched, and the fields it
// does change keep their place in the file. A field emptied is taken out; a
// new one goes at the end.

import { minutes, timesIn } from "./planner.mjs";

const isGroup = (e) => !!e && Array.isArray(e.items);
const flat = (list = []) => list.flatMap((e) => (isGroup(e) ? e.items : [e]));
const lower = (s) => String(s ?? "").trim().toLowerCase();
const clean = (v) => (typeof v === "string" ? v.trim() : v);
const empty = (v) => v === undefined || v === null || v === "";

// Where the n-th entry is: its list, its place in that list, and its section's
// place in the top-level list (-1 when it isn't in a section).
function locate(list, n) {
  let k = 0;
  for (let t = 0; t < list.length; t++) {
    const e = list[t];
    if (isGroup(e)) {
      for (let i = 0; i < e.items.length; i++, k++) if (k === n) return { arr: e.items, i, top: t };
    } else if (k++ === n) return { arr: list, i: t, top: -1 };
  }
  return null;
}

// Sets or takes out one field, keeping its place.
function put(obj, key, value) {
  if (empty(value)) delete obj[key];
  else obj[key] = value;
}

// A plain-text step or ingredient as an object, so it can hold more fields.
const asStep = (s) => (typeof s === "string" ? { do: s } : s);
const asIngredient = (i) => (typeof i === "string" ? { item: i } : i);

function change(recipe, key, n, fn) {
  const r = structuredClone(recipe);
  r[key] ||= [];
  const at = locate(r[key], n);
  if (!at) throw new Error(`no ${key} entry ${n}`);
  at.arr[at.i] = fn(at.arr[at.i]) ?? at.arr[at.i];
  return r;
}

// One line put back as it was in `before` ("about", "ing:3" or "step:2"),
// keeping every other change: what Cancel does to the line that was open.
const KEYS = { ing: "ingredients", step: "steps", note: "notes", start: "beforeYouStart" };
export function putBack(recipe, before, target) {
  if (target === "about") return ["title", "description", "yield"].reduce((r, k) => setField(r, k, before[k]), recipe);
  if (target === "facts") {
    const r = setField(recipe, "yield", before.yield);
    for (const k of ["times", "time"]) {
      if (before[k] === undefined) delete r[k];
      else r[k] = structuredClone(before[k]);
    }
    return r;
  }
  const [kind, n] = target.split(":");
  const key = KEYS[kind];
  const back = change(recipe, key, Number(n), () => structuredClone(flat(before[key] || [])[Number(n)]));
  // An ingredient's old name goes back to the steps that use it, too.
  return key === "ingredients" ? carryUses(recipe, back, (k) => k) : back;
}

// --- The recipe's own fields --------------------------------------------------

const FIELDS = ["title", "description", "yield", "added", "kind", "icon", "serve", "sits", "source.name", "source.url"];

export function setField(recipe, key, value) {
  if (!FIELDS.includes(key)) throw new Error(`the editor doesn't set "${key}"`);
  const r = structuredClone(recipe);
  if (key.startsWith("source.")) {
    const source = { ...r.source };
    put(source, key.slice(7), clean(value));
    if (Object.keys(source).length) r.source = source;
    else delete r.source;
    return r;
  }
  put(r, key, clean(value));
  return r;
}

// time: { prep, cook, chill, rest, total }, each a number of minutes. An
// empty one is taken out, and with none left, the time field goes too.
const TIMES = ["prep", "cook", "chill", "rest", "total"];
export function setTime(recipe, key, value) {
  if (!TIMES.includes(key)) throw new Error(`the editor doesn't set a time called "${key}"`);
  const r = structuredClone(recipe);
  const t = r.time && typeof r.time === "object" ? r.time : {};
  const v = String(value ?? "").trim();
  put(t, key, v === "" || Number.isNaN(Number(v)) ? undefined : Number(v));
  if (Object.keys(t).length) r.time = t;
  else delete r.time;
  return r;
}

// The facts box: the yield, the times as the page prints them
// ([["Active", "15 min"], ["Rise", "1 to 2 hr"]]), and the minutes the time
// filter, the card and the lineup use. Rows are kept as typed (an empty one
// may be being written); none at all takes "times" out.
export function setFacts(recipe, { yield: y, times, time = {} }) {
  let r = setField(recipe, "yield", y);
  r = structuredClone(r);
  const rows = (times || []).map(([label, value]) => [clean(label ?? ""), clean(value ?? "")]);
  if (rows.length) r.times = rows;
  else delete r.times;
  for (const k of TIMES) if (k in time) r = setTime(r, k, time[k]);
  return r;
}
export function addTime(recipe) {
  const r = structuredClone(recipe);
  r.times = [...(r.times || []), ["", ""]];
  return { recipe: r, at: r.times.length - 1 };
}
export function removeTime(recipe, k) {
  const r = structuredClone(recipe);
  r.times = (r.times || []).filter((_, i) => i !== k);
  if (!r.times.length) delete r.times;
  return r;
}
export function moveTime(recipe, k, dir) {
  const j = k + dir, rows = recipe.times || [];
  if (j < 0 || j >= rows.length) return recipe;
  const r = structuredClone(recipe);
  [r.times[k], r.times[j]] = [r.times[j], r.times[k]];
  return r;
}
// A total shorter than prep, cook, chill and rest add up to, worth a word:
// { total, parts }, or null. (A longer one may count time the parts don't.)
export function minutesHint(time) {
  if (!time || time.total == null) return null;
  const parts = ["prep", "cook", "chill", "rest"].reduce((sum, k) => sum + (Number(time[k]) || 0), 0);
  return time.total < parts ? { total: time.total, parts } : null;
}

// tags: { dimension: [values] }. No values takes the dimension out.
export function setTags(recipe, dimension, values) {
  const r = structuredClone(recipe);
  const tags = r.tags && typeof r.tags === "object" && !Array.isArray(r.tags) ? r.tags : {};
  if (values.length) tags[dimension] = [...values];
  else delete tags[dimension];
  r.tags = tags;
  return r;
}

// --- Ingredients ----------------------------------------------------------------

// changes: { qty, grams, ml, item, note } for an ingredient object, or { text }
// for a plain-text one.
// A rename carries through to the steps that use the ingredient (carryUses).
export function updateIngredient(recipe, n, changes) {
  return carryUses(recipe, change(recipe, "ingredients", n, (ing) => {
    if (typeof ing === "string" && "text" in changes) return clean(changes.text);
    const i = asIngredient(ing);
    for (const k of ["qty", "grams", "ml", "item", "note"]) {
      if (!(k in changes)) continue;
      const v = clean(changes[k]);
      put(i, k, (k === "grams" || k === "ml") && !empty(v) && !Number.isNaN(Number(v)) ? Number(v) : v);
    }
    return i;
  }), (k) => k);
}

// Lineup fields on an ingredient: recipe (the linked recipe's slug), optional
// and alreadyMade. Only a required, linked ingredient can start on Already made.
const INGREDIENT_FIELDS = ["recipe", "optional", "alreadyMade"];
export function setIngredientField(recipe, n, key, value) {
  if (!INGREDIENT_FIELDS.includes(key)) throw new Error(`the editor doesn't set an ingredient's "${key}"`);
  return change(recipe, "ingredients", n, (ing) => {
    const i = asIngredient(ing);
    // false takes optional and alreadyMade out, as an empty recipe takes the link out.
    put(i, key, value === false ? undefined : clean(value));
    if (!i.recipe || i.optional) delete i.alreadyMade;
    return i;
  });
}

// --- Steps ------------------------------------------------------------------------

// changes: { do, wait, cue }. Watch needs a wait, so it goes when the wait does.
export function updateStep(recipe, n, changes) {
  return change(recipe, "steps", n, (step) => {
    const plain = typeof step === "string";
    const s = asStep(step);
    // `wait: false` (checked: it doesn't wait) shows as an empty box, and
    // stays false until a time is given.
    const notWaiting = s.wait === false;
    for (const k of ["do", "wait", "cue"]) if (k in changes) put(s, k, clean(changes[k]));
    if (notWaiting && empty(s.wait)) s.wait = false;
    if (!s.wait) delete s.watch;
    return plain && Object.keys(s).length === 1 && "do" in s ? s.do : s;
  });
}

// Lineup fields on a step. hands: a time; watch, burner, grill, microwave:
// true or false; oven and preheat: a setting ("200C", "broil", "off") or false;
// prep: true or "just before". Holds has its own function, since only one step
// has it.
const STEP_FIELDS = ["hands", "watch", "oven", "preheat", "burner", "grill", "microwave", "prep"];
export function setStepField(recipe, n, key, value) {
  if (!STEP_FIELDS.includes(key)) throw new Error(`the editor doesn't set a step's "${key}"`);
  return change(recipe, "steps", n, (step) => {
    const s = asStep(step);
    put(s, key, clean(value));
    return s;
  });
}

export function setHolds(recipe, n) {
  const r = structuredClone(recipe);
  r.steps ||= [];
  flat(r.steps).forEach((s, k) => {
    if (s && typeof s === "object" && k !== n) delete s.holds;
  });
  if (n !== null && n !== undefined) {
    const at = locate(r.steps, n);
    at.arr[at.i] = asStep(at.arr[at.i]);
    at.arr[at.i].holds = true;
  }
  return r;
}

// Times in a step's text that say how long it takes: not a checkpoint ("check
// it at 10 minutes"), how long it keeps ("up to 2 hours") or how often.
const stepTimes = (text) => timesIn(text).filter((t) => !/\b(at|up to|within|keeps?|every|after)\s*$/i.test(text.slice(Math.max(0, t.start - 14), t.start)));
const OVEN = /\b(oven|preheat|broil)/i;

// A step cut into parts, one per text. The first keeps what it uses, its
// hands-on time and the rest of what the step has. The wait goes with the part
// whose text says that time, or else the last; its cue, "needs you" and
// equipment go with it. Preheat goes with the part about the oven, or else
// the wait's; holds (the dish keeps after this) with the last.
const WITH_WAIT = ["wait", "cue", "watch", "oven", "burner", "grill", "microwave"];
function divide(s, texts) {
  const parts = texts.map((t) => ({ do: t }));
  parts[0] = { ...s, do: texts[0] };
  for (const k of [...WITH_WAIT, "preheat", "holds"]) delete parts[0][k];
  const last = parts.length - 1;
  const has = (k) => k in s && s[k] !== undefined;
  const said = typeof s.wait === "string" && minutes(s.wait)
    ? texts.flatMap((t, k) => (stepTimes(t).some((x) => Math.abs(x.minutes - minutes(s.wait)) < 0.5) ? [k] : [])) : [];
  const w = said.length === 1 ? said[0] : last;
  for (const k of WITH_WAIT) if (has(k)) parts[w][k] = s[k];
  if (has("preheat")) {
    const about = texts.flatMap((t, k) => (OVEN.test(t) ? [k] : []));
    parts[about.length === 1 ? about[0] : w].preheat = s.preheat;
  }
  if (has("holds")) parts[last].holds = s.holds;
  return parts;
}

// Splits step n at a place in its text. Nothing happens when either side
// would be empty.
export function splitStep(recipe, n, at) {
  const r = structuredClone(recipe);
  const where = locate(r.steps || [], n);
  if (!where) return r;
  const s = asStep(where.arr[where.i]);
  const text = s.do || "";
  const texts = [text.slice(0, at).trim(), text.slice(at).trim()];
  if (!texts[0] || !texts[1]) return r;
  where.arr.splice(where.i, 1, ...divide(s, texts));
  return r;
}

// Where a step's text splits at each time it says: after each time but the
// last, at the end of its sentence or clause, or else just after the time.
function timedTexts(text) {
  const times = stepTimes(text);
  const cuts = times.slice(0, -1).map((t, k) => {
    const end = /[.!?,;](?=\s)/.exec(text.slice(t.end, times[k + 1].start));
    return end ? t.end + end.index + 1 : t.end;
  });
  const texts = [0, ...cuts].map((from, k) => text.slice(from, cuts[k] ?? text.length).trim());
  // Each part reads as a sentence of its own.
  return texts.map((t, k) => {
    let out = k ? t.replace(/^\p{Ll}/u, (c) => c.toUpperCase()) : t;
    if (k < texts.length - 1) out = out.replace(/[\s,;]+$/, "").replace(/([^.!?…])$/, "$1.");
    return out;
  });
}
// How many parts "Split at each time" would make of a step's text: 0 or 1
// when it says fewer than two times.
export const timedParts = (text) => stepTimes(String(text || "")).length;

// Splits step n at each time its text says. Each part waits the time it says
// (the step's own wait, written as the step wrote it, goes where divide puts it).
const short = (time) => time.replace(/\bminutes?\b/i, "min").replace(/\bseconds?\b/i, "sec").replace(/\bhours?\b/i, "hr");
export function splitAtTimes(recipe, n) {
  const r = structuredClone(recipe);
  const where = locate(r.steps || [], n);
  if (!where) return r;
  const s = asStep(where.arr[where.i]);
  if (timedParts(s.do) < 2) return r;
  const texts = timedTexts(s.do);
  const parts = divide(s, texts);
  parts.forEach((p, k) => { if (!("wait" in p)) p.wait = short(stepTimes(texts[k])[0].text); });
  where.arr.splice(where.i, 1, ...parts);
  return r;
}

// Joins a step with the one after it: the texts run on, the uses are combined,
// and the second's other fields fill in where the first has none.
export function mergeSteps(recipe, n) {
  const r = structuredClone(recipe);
  const a = locate(r.steps || [], n), b = locate(r.steps || [], n + 1);
  if (!a || !b) return r;
  const first = asStep(a.arr[a.i]), second = asStep(b.arr[b.i]);
  const joined = { ...first, do: [first.do, second.do].filter(Boolean).join(" ") };
  if (first.uses || second.uses) {
    const seen = new Set();
    joined.uses = [...(first.uses || []), ...(second.uses || [])].filter((u) => {
      const key = JSON.stringify(typeof u === "string" ? lower(u) : { ...u, item: lower(u?.item) });
      return !seen.has(key) && seen.add(key);
    });
  }
  for (const [k, v] of Object.entries(second)) if (!(k in joined)) joined[k] = v;
  a.arr[a.i] = joined;
  b.arr.splice(b.i, 1);
  dropEmptyGroups(r, "steps");
  return r;
}

// "Add a prep step": prep hidden in an ingredient line ("minced garlic"),
// shown only when steps are in prep-first order. It goes first.
export function addPrepStep(recipe) {
  const r = structuredClone(recipe);
  r.steps ||= [];
  const first = isGroup(r.steps[0]) ? r.steps[0].items : r.steps;
  first.unshift({ do: "", prep: true, prepOnly: true });
  return { recipe: r, at: 0 };
}

// --- Lists: add, remove, move, groups ---------------------------------------------

const BLANK = { ingredients: () => ({ item: "" }), steps: () => ({ do: "" }), notes: () => "", beforeYouStart: () => "" };

// Sections left empty go, and so do notes and Before you start when nothing
// is left in them (a recipe without them leaves them out).
function dropEmptyGroups(r, key) {
  r[key] = r[key].filter((e) => !isGroup(e) || e.items.length);
  if (!r[key].length && (key === "notes" || key === "beforeYouStart")) delete r[key];
}

// A new, empty entry: right after entry `after`, in the same group, or else at
// the end of the last list (or section). Returns where it is.
function add(recipe, key, { after } = {}) {
  const r = structuredClone(recipe);
  r[key] ||= [];
  const at = after === undefined ? null : locate(r[key], after);
  if (at) {
    at.arr.splice(at.i + 1, 0, BLANK[key]());
    return { recipe: r, at: after + 1 };
  }
  const last = r[key].at(-1);
  (isGroup(last) ? last.items : r[key]).push(BLANK[key]());
  return { recipe: r, at: flat(r[key]).length - 1 };
}
export const addIngredient = (recipe, where) => add(recipe, "ingredients", where);
export const addStep = (recipe, where) => add(recipe, "steps", where);

function remove(recipe, key, n) {
  const r = structuredClone(recipe);
  const at = locate(r[key] || [], n);
  if (!at) return r;
  at.arr.splice(at.i, 1);
  dropEmptyGroups(r, key);
  return r;
}
export const removeIngredient = (recipe, n) =>
  carryUses(recipe, remove(recipe, "ingredients", n), (k) => (k === n ? null : k > n ? k - 1 : k));
export const removeStep = (recipe, n) => remove(recipe, "steps", n);

// Moves an entry one place up (-1) or down (1). Crossing into or out of a
// section counts as a move, so an entry can be moved into any section.
function move(recipe, key, n, dir) {
  const r = structuredClone(recipe);
  const list = r[key] || [];
  const at = locate(list, n);
  if (!at) return r;
  const entry = at.arr[at.i];
  const j = at.i + dir;
  if (j >= 0 && j < at.arr.length) {
    // Within its list: a plain entry next to a section goes into it.
    const next = at.arr[j];
    if (at.top === -1 && isGroup(next)) {
      at.arr.splice(at.i, 1);
      if (dir < 0) next.items.push(entry); else next.items.unshift(entry);
    } else {
      at.arr[at.i] = next;
      at.arr[j] = entry;
    }
  } else if (at.top !== -1) {
    // Out of the end of its section: into the top-level list beside it.
    at.arr.splice(at.i, 1);
    list.splice(dir < 0 ? at.top : at.top + 1, 0, entry);
  } else return r;
  dropEmptyGroups(r, key);
  return r;
}
// Where entry n is after move(): one place on, or the same place when the move
// only takes it into or out of a section (or it can't go further).
export function movedTo(recipe, key, n, dir) {
  const at = locate(recipe[key] || [], n);
  if (!at) return n;
  const j = at.i + dir;
  if (j < 0 || j >= at.arr.length) return n;
  return at.top === -1 && isGroup(at.arr[j]) ? n : n + dir;
}

// Whether a move up (-1) or down (1) changes anything: Move up is off on the
// first line, Move down on the last.
export const canMove = (recipe, key, n, dir) => JSON.stringify(move(recipe, key, n, dir)) !== JSON.stringify(recipe);

// A list cut into runs, as the page shows them: each named section, and each
// run of entries outside a section. Entries are their places in the list.
function runs(list = []) {
  const out = [];
  let k = 0;
  list.forEach((e) => {
    if (isGroup(e)) out.push({ group: e.group || "", ns: e.items.map(() => k++) });
    else if (out.at(-1)?.plain) out.at(-1).ns.push(k++);
    else out.push({ group: "", plain: true, ns: [k++] });
  });
  return out;
}

// Every place entry n can be moved to ("Move to…"), run by run: before each
// other entry (by its place now), or at the end of the run (before: null).
// `here` is where it is now; `value` is what moveTo takes.
export function moveSlots(recipe, key, n) {
  return runs(recipe[key]).flatMap((run, r) => {
    const others = run.ns.filter((k) => k !== n);
    const now = run.ns.includes(n) ? run.ns.indexOf(n) : -1;
    return [...others, null].map((before, i) => ({ group: run.group, before, here: i === now, value: `${r}:${i}` }));
  });
}

// Moves entry n to a place from moveSlots. Returns the recipe and where it is.
// An ingredient's steps keep pointing at it.
export function moveTo(recipe, key, n, value) {
  const [r, i] = String(value).split(":").map(Number);
  const run = runs(recipe[key])[r];
  const from = locate(recipe[key] || [], n);
  if (!run || !from || !(i >= 0)) return { recipe, at: n };
  const others = run.ns.filter((k) => k !== n);
  if (run.ns.indexOf(n) === i && run.ns.includes(n)) return { recipe, at: n };
  const out = structuredClone(recipe);
  const list = out[key];
  const GONE = {}, MOVED = {};
  const at0 = locate(list, n);
  const entry = at0.arr[at0.i];
  at0.arr[at0.i] = GONE;
  // Put a marker where it goes, before the entry now there, or after the run's
  // last entry (or into its section, if it's empty but for this one).
  if (i < others.length) { const to = locate(list, others[i]); to.arr.splice(to.i, 0, MOVED); }
  else if (others.length) { const to = locate(list, others.at(-1)); to.arr.splice(to.i + 1, 0, MOVED); }
  else if (!run.plain) list.find((e, t) => isGroup(e) && runs(list.slice(0, t + 1)).length - 1 === r).items.push(MOVED);
  else { const gone = locate(list, n); gone.arr.splice(gone.i, 0, MOVED); }
  // Take the old place out, and put the entry in the marker's.
  const strip = (arr) => { const g = arr.indexOf(GONE); if (g >= 0) arr.splice(g, 1); arr.forEach((e) => isGroup(e) && strip(e.items)); };
  strip(list);
  const where = flat(list).indexOf(MOVED);
  const m = locate(list, where);
  m.arr[m.i] = entry;
  dropEmptyGroups(out, key);
  if (key !== "ingredients") return { recipe: out, at: where };
  const place = (k) => (k === n ? where : n < where ? (k > n && k <= where ? k - 1 : k) : (k >= where && k < n ? k + 1 : k));
  return { recipe: carryUses(recipe, out, place), at: where };
}

export function moveIngredient(recipe, n, dir) {
  const to = movedTo(recipe, "ingredients", n, dir);
  return carryUses(recipe, move(recipe, "ingredients", n, dir), (k) => (k === n ? to : k === to ? n : k));
}
export const moveStep = (recipe, n, dir) => move(recipe, "steps", n, dir);

// Notes and Before you start: lists of plain lines. Notes may have groups;
// Before you start never does.
export const setLine = (recipe, key, n, text) => change(recipe, key, n, () => clean(text ?? ""));
export const addLine = (recipe, key, where) => add(recipe, key, where);
export const removeLine = (recipe, key, n) => remove(recipe, key, n);
export const moveLine = (recipe, key, n, dir) => move(recipe, key, n, dir);

// The recipe as it's saved: a note or Before you start line left empty is
// left out (an empty ingredient or step is a problem the checker names).
export function withoutEmptyLines(recipe) {
  const r = structuredClone(recipe);
  // A printed time with neither a label nor a time.
  if (Array.isArray(r.times)) {
    r.times = r.times.filter((row) => !Array.isArray(row) || row.some((x) => String(x ?? "").trim()));
    if (!r.times.length) delete r.times;
  }
  for (const key of ["notes", "beforeYouStart"]) {
    if (!Array.isArray(r[key])) continue;
    const kept = (e) => (isGroup(e) ? true : typeof e !== "string" || e.trim() !== "");
    r[key] = r[key].filter(kept).map((e) => (isGroup(e) ? { ...e, items: e.items.filter(kept) } : e));
    dropEmptyGroups(r, key);
  }
  return r;
}

// A new named section at the end, holding one empty entry. Returns where that is.
export function addGroup(recipe, key, name) {
  const r = structuredClone(recipe);
  r[key] ||= [];
  r[key].push({ group: clean(name), items: [BLANK[key]()] });
  return { recipe: r, at: flat(r[key]).length - 1 };
}

// g counts the named sections, in order (the ones with a heading on the page).
export function renameGroup(recipe, key, g, name) {
  const r = structuredClone(recipe);
  const sections = (r[key] || []).filter((e) => isGroup(e) && e.group);
  if (sections[g] && clean(name)) sections[g].group = clean(name);
  return key === "ingredients" ? carryUses(recipe, r, (k) => k) : r;
}

// --- What a step uses ----------------------------------------------------------------

// Every ingredient with its section's name and the name a step's "uses" calls
// it by (its item, or its whole text for a plain-text one).
function named(recipe) {
  return (recipe.ingredients || []).flatMap((e) => (isGroup(e) ? e.items.map((i) => [e.group || "", i]) : [["", e]]))
    .map(([group, i]) => ({ group, name: typeof i === "string" ? i : i?.item || "" }));
}

// The step's uses as { picks: [{ ing, amount }], unmatched: [names] }: picks
// are ingredient places; unmatched are names that match no ingredient, or
// more than one (the checker says which).
export function usesOf(recipe, n) {
  const at = locate(recipe.steps || [], n);
  const step = at && at.arr[at.i];
  const ings = named(recipe);
  const picks = [], unmatched = [];
  for (const u of (step && typeof step === "object" && Array.isArray(step.uses) ? step.uses : [])) {
    const { item, amount } = useParts(u);
    const k = resolve(ings, u);
    if (k >= 0) picks.push({ ing: k, amount: typeof amount === "string" ? amount : "" });
    else unmatched.push(item ?? "");
  }
  return { picks, unmatched };
}

const useParts = (u) => (typeof u === "string" ? { item: u } : u || {});
// The one ingredient a use names (by name, and by group when it gives one),
// or -1 when it names none or more than one.
function resolve(ings, u) {
  const { item, group } = useParts(u);
  const hits = ings.flatMap((x, k) => (lower(x.name) === lower(item) && (group === undefined || lower(x.group) === lower(group)) ? [k] : []));
  return hits.length === 1 ? hits[0] : -1;
}
// A use of ingredient k: by name, with its section's name only where two
// ingredients share the name, and its amount if it has one.
function useOf(ings, k, amount) {
  const { group, name } = ings[k];
  const twice = ings.filter((x) => lower(x.name) === lower(name)).length > 1;
  const amt = clean(amount);
  if (!twice && !amt) return name;
  return { ...(twice && { group }), item: name, ...(amt && { amount: amt }) };
}

// After an ingredient is renamed, removed, moved or regrouped (before ->
// after; place(k) is where ingredient k went, or null if it's gone), every
// step's uses still point at the same ingredients. A use that still finds its
// ingredient is kept as written; one that doesn't is written again, or taken
// out with its ingredient. Names that matched nothing before stay, for the
// checker to point out.
function carryUses(before, after, place) {
  const was = named(before), now = named(after);
  for (const step of flat(after.steps || [])) {
    if (!step || typeof step !== "object" || !Array.isArray(step.uses)) continue;
    let changed = false;
    const uses = step.uses.flatMap((u) => {
      const k = resolve(was, u);
      if (k < 0) return [u];
      const to = place(k);
      if (to === null) { changed = true; return []; }
      if (resolve(now, u) === to) return [u];
      changed = true;
      return [useOf(now, to, useParts(u).amount)];
    });
    if (changed) put(step, "uses", uses.length ? uses : undefined);
  }
  return after;
}

// Writes a step's uses from picks: each by name, with its section's name only
// where two ingredients share the name, and its amount if it has one. Names
// that matched nothing are left out.
export function setUses(recipe, n, picks) {
  const ings = named(recipe);
  return change(recipe, "steps", n, (step) => {
    const s = asStep(step);
    const uses = picks.filter((p) => ings[p.ing]).map(({ ing, amount }) => useOf(ings, ing, amount));
    put(s, "uses", uses.length ? uses : undefined);
    return s;
  });
}

// --- What the planner assumes ------------------------------------------------------------

// How a dish is served when its recipe doesn't say (assets/planner.mjs, sits()).
export function servingFallback(r) {
  const serve = r.kind === "component" || r.category === "baking" ? "keeps" : r.category === "cocktails" ? "soon" : "hot";
  return { serve, sits: serve === "keeps" ? "" : serve === "soon" && r.category === "cocktails" ? "5 min" : "10 min" };
}
