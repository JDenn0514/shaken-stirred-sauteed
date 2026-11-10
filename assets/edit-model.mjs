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
export function putBack(recipe, before, target) {
  if (target === "about") return ["title", "description", "yield"].reduce((r, k) => setField(r, k, before[k]), recipe);
  const [kind, n] = target.split(":");
  const key = kind === "ing" ? "ingredients" : "steps";
  return change(recipe, key, Number(n), () => structuredClone(flat(before[key] || [])[Number(n)]));
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
export function updateIngredient(recipe, n, changes) {
  return change(recipe, "ingredients", n, (ing) => {
    if (typeof ing === "string" && "text" in changes) return clean(changes.text);
    const i = asIngredient(ing);
    for (const k of ["qty", "grams", "ml", "item", "note"]) {
      if (!(k in changes)) continue;
      const v = clean(changes[k]);
      put(i, k, (k === "grams" || k === "ml") && !empty(v) && !Number.isNaN(Number(v)) ? Number(v) : v);
    }
    return i;
  });
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

// Steps are split at a place in their text: the first part keeps what the step
// uses and its hands-on time; the second takes the wait, the cue and the
// equipment, which belong to the end of a step.
const SECOND = ["wait", "cue", "watch", "oven", "preheat", "burner", "grill", "microwave", "holds"];
export function splitStep(recipe, n, at) {
  const r = structuredClone(recipe);
  const where = locate(r.steps || [], n);
  if (!where) return r;
  const s = asStep(where.arr[where.i]);
  const text = s.do || "";
  const first = { ...s, do: text.slice(0, at).trim() };
  const second = { do: text.slice(at).trim() };
  for (const k of SECOND) if (k in s) { second[k] = s[k]; delete first[k]; }
  if (!first.do || !second.do) return r;
  where.arr.splice(where.i, 1, first, second);
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

const BLANK = { ingredients: () => ({ item: "" }), steps: () => ({ do: "" }) };

function dropEmptyGroups(r, key) {
  r[key] = r[key].filter((e) => !isGroup(e) || e.items.length);
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
export const removeIngredient = (recipe, n) => remove(recipe, "ingredients", n);
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

export const moveIngredient = (recipe, n, dir) => move(recipe, "ingredients", n, dir);
export const moveStep = (recipe, n, dir) => move(recipe, "steps", n, dir);

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
  return r;
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
    const { item, group, amount } = typeof u === "string" ? { item: u } : u || {};
    const hits = ings.map((x, k) => [x, k]).filter(([x]) => lower(x.name) === lower(item) && (group === undefined || lower(x.group) === lower(group)));
    if (hits.length === 1) picks.push({ ing: hits[0][1], amount: typeof amount === "string" ? amount : "" });
    else unmatched.push(item ?? "");
  }
  return { picks, unmatched };
}

// Writes a step's uses from picks: each by name, with its section's name only
// where two ingredients share the name, and its amount if it has one. Names
// that matched nothing are left out.
export function setUses(recipe, n, picks) {
  const ings = named(recipe);
  return change(recipe, "steps", n, (step) => {
    const s = asStep(step);
    const uses = picks.filter((p) => ings[p.ing]).map(({ ing, amount }) => {
      const { group, name } = ings[ing];
      const twice = ings.filter((x) => lower(x.name) === lower(name)).length > 1;
      const amt = clean(amount);
      if (!twice && !amt) return name;
      return { ...(twice && { group }), item: name, ...(amt && { amount: amt }) };
    });
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
