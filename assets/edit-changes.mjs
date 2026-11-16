// "What's changed" in the editor (edit.html): the differences between the
// recipe as it is on the site and as edited, in a cook's words, as
// [{ text, number }]. `number` marks an amount, a time or a temperature: Save
// shows the list before saving only when one of those changed (decision 7 in
// docs/specs/editor-redesign.md), and they come first.
//
// changes(before, after, { vocab, stepName, sections })
//   vocab      recipes/vocabulary.json, for the tags' names
//   stepName   step i of `after` (from 0, in the file) as the sheet names it,
//              "step 3" (edit-numbers.mjs); the file's numbers if not given
//
// Lines and steps are matched by what they say. One edited in place (a new
// amount, a new name, new words) is matched to its old self when they still
// share something: an amount or note for an ingredient; a time, a cue, what
// it uses or its first word for a step. Otherwise it's an addition and a
// removal.

const flat = (l = []) => l.flatMap((e) => (e && Array.isArray(e.items) ? e.items.map((x) => [e.group || "", x]) : [["", e]]));
const nameOf = (i) => (typeof i === "string" ? i : i?.item || "");
const asStep = (s) => (typeof s === "string" ? { do: s } : s || {});
const asIng = (i) => (typeof i === "string" ? { item: i } : i || {});
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const has = (v) => v !== undefined && v !== null && v !== "";
const cap = (t) => t.charAt(0).toUpperCase() + t.slice(1);
const short = (t, n = 60) => (t.length > n ? `${t.slice(0, n - 1)}…` : t);
const q = (t) => `“${short(String(t))}”`;
const SECTIONS = { cooking: "Cooking", baking: "Baking", cocktails: "Cocktails" };
const TEMPERATURE = /^\d+\s*°?\s*[CF]$/i;

// Pairs of [before index, after index], and what's left on each side.
function match(was, now, key, alike) {
  const pairs = [], usedA = new Set(), usedB = new Set();
  // Lines that say the same thing pair up nearest place first, so of two
  // steps that both say "Stir.", each keeps its own twin.
  const exact = [];
  now.forEach((b, j) => was.forEach((a, i) => { if (key(a) === key(b)) exact.push([i, j]); }));
  exact.sort((x, y) => Math.abs(x[0] - x[1]) - Math.abs(y[0] - y[1]) || x[1] - y[1]);
  for (const [i, j] of exact) {
    if (usedA.has(i) || usedB.has(j)) continue;
    pairs.push([i, j]); usedA.add(i); usedB.add(j);
  }
  const leftA = was.map((_, i) => i).filter((i) => !usedA.has(i));
  const leftB = now.map((_, j) => j).filter((j) => !usedB.has(j));
  // Edited in place: the k-th leftover on each side, when they're alike.
  const restA = [], restB = [];
  for (let k = 0; k < Math.max(leftA.length, leftB.length); k++) {
    const i = leftA[k], j = leftB[k];
    if (i !== undefined && j !== undefined && alike(was[i], now[j])) pairs.push([i, j]);
    else { if (i !== undefined) restA.push(i); if (j !== undefined) restB.push(j); }
  }
  pairs.sort((x, y) => x[1] - y[1]);
  const reordered = pairs.some((p, k) => k > 0 && p[0] < pairs[k - 1][0]);
  return { pairs, removed: restA, added: restB, reordered };
}

// "a → b", "b" when it's new, "not set" when it's gone.
const fromTo = (a, b, show = (x) => x) => (!has(a) ? show(b) : !has(b) ? "not set" : `${show(a)} → ${show(b)}`);

export function changes(before, after, { vocab, stepName = (i) => `step ${i + 1}` } = {}) {
  const out = [];
  const say = (text, number = false) => out.push({ text, number });
  const field = (label, a, b, number = false, show) => { if (!same(a, b)) say(`${label}: ${fromTo(a, b, show)}`, number); };

  // --- The recipe's own fields.
  field("Title", before.title, after.title, false, q);
  if (!same(before.description, after.description)) say(!has(before.description) ? "Description added" : !has(after.description) ? "Description taken out" : "Description reworded");
  field("Section", before.category, after.category, false, (c) => SECTIONS[c] || c);
  if ((before.kind || "dish") !== (after.kind || "dish")) say(`Kind: ${cap(before.kind || "dish")} → ${cap(after.kind || "dish")}`);
  field("Yield", before.yield, after.yield, true);
  const rows = (t) => (Array.isArray(t) && t.length ? t.map((r) => (Array.isArray(r) ? r.join(" ") : String(r))).join(", ") : "");
  if (!same(before.times, after.times)) say(`Times: ${fromTo(rows(before.times), rows(after.times))}`, true);
  for (const [k, label] of [["total", "Total time"], ["prep", "Prep time"], ["cook", "Cook time"], ["chill", "Chill time"], ["rest", "Rest time"]]) {
    field(label, before.time?.[k], after.time?.[k], true, (m) => `${m} min`);
  }
  for (const [k, label, number] of [["pan", "Equipment"], ["heat", "Oven heat", true], ["heatLabel", "Oven heat, as printed"], ["glass", "Glass"], ["ice", "Ice"],
    ["garnish", "Garnish"], ["method", "Method"], ["keeps", "Keeps"], ["abv", "ABV", true], ["standardDrinks", "Standard drinks", true]]) {
    field(label, before[k], after[k], !!number);
  }
  field("Can sit for", before.sits, after.sits, true);
  field("How it's served", before.serve, after.serve);

  // --- Ingredients.
  const ingsA = flat(before.ingredients), ingsB = flat(after.ingredients);
  const repeated = (list) => { const seen = {}; for (const [, i] of list) seen[nameOf(i).toLowerCase()] = (seen[nameOf(i).toLowerCase()] || 0) + 1; return (n) => seen[n.toLowerCase()] > 1; };
  const twiceB = repeated(ingsB), twiceA = repeated(ingsA);
  const called = ([g, i], twice) => `${nameOf(i)}${twice(nameOf(i)) && g ? ` (${g})` : ""}`;
  const amount = (i) => [asIng(i).qty, has(asIng(i).grams) ? `${asIng(i).grams} g` : "", has(asIng(i).ml) ? `${asIng(i).ml} ml` : ""].filter(has)[0] || "";
  const ings = match(ingsA, ingsB, ([g, i]) => `${g}\n${nameOf(i)}`.toLowerCase(), ([, a], [, b]) => {
    const x = asIng(a), y = asIng(b);
    return ["qty", "grams", "ml", "note"].some((k) => has(x[k]) && same(x[k], y[k]));
  });
  const renamed = new Map();
  for (const [i, j] of ings.pairs) {
    const a = asIng(ingsA[i][1]), b = asIng(ingsB[j][1]);
    if (nameOf(a) !== nameOf(b)) renamed.set(nameOf(a), nameOf(b));
    const name = called(ingsB[j], twiceB);
    if (nameOf(a) !== nameOf(b)) say(`${nameOf(a)} → ${nameOf(b)}`);
    for (const [k, unit] of [["qty", ""], ["grams", " g"], ["ml", " ml"]]) {
      if (same(a[k], b[k])) continue;
      say(`${name}: ${!has(a[k]) ? `${b[k]}${unit} added` : !has(b[k]) ? `${a[k]}${unit} taken out` : `${a[k]}${unit} → ${b[k]}${unit}`}`, true);
    }
    if (!same(a.note, b.note)) say(`${name}: note ${!has(a.note) ? `${q(b.note)} added` : !has(b.note) ? `${q(a.note)} taken out` : `${q(a.note)} → ${q(b.note)}`}`);
    if (!same(a.recipe, b.recipe)) say(`${name}: ${b.recipe ? `made by ${b.recipe}` : "no longer made by another recipe"}`);
    if (!!a.optional !== !!b.optional) say(`${name}: ${b.optional ? "optional" : "no longer optional"}`);
    if (!!a.alreadyMade !== !!b.alreadyMade) say(`${name}: ${b.alreadyMade ? "already made" : "no longer already made"}`);
  }
  for (const j of ings.added) say(`Added: ${[amount(ingsB[j][1]), nameOf(ingsB[j][1])].filter(has).join(" ")}`, true);
  for (const i of ings.removed) say(`Removed: ${[amount(ingsA[i][1]), called(ingsA[i], twiceA)].filter(has).join(" ")}`, true);
  if (ings.reordered) say("Ingredients: the order changed");

  // --- Steps.
  const stepsA = flat(before.steps).map(([, s]) => asStep(s)), stepsB = flat(after.steps).map(([, s]) => asStep(s));
  const firstWord = (t) => (String(t || "").toLowerCase().match(/\p{L}+/u) || [""])[0];
  const steps = match(stepsA, stepsB, (s) => s.do || "", (a, b) =>
    ["wait", "hands", "cue", "uses"].some((k) => has(a[k]) && a[k] !== false && same(a[k], b[k])) || (firstWord(a.do) && firstWord(a.do) === firstWord(b.do)));
  const useName = (u) => (typeof u === "string" ? u : `${u?.item || ""}${u?.group ? ` (${u.group})` : ""}`);
  // A step's old uses, under the ingredients' new names: a rename carries
  // through to the steps, which isn't a change of its own.
  const wasUse = (u) => (typeof u === "string" ? renamed.get(u) ?? u : { ...u, item: renamed.get(u?.item) ?? u?.item });
  const time = (w) => (w === false ? "doesn't wait" : w);
  for (const [i, j] of steps.pairs) {
    const a = stepsA[i], b = stepsB[j];
    const Name = cap(stepName(j));
    if (a.do !== b.do) say(`${Name} reworded: ${q(b.do || "")}`);
    if (!same(a.wait, b.wait)) say(`${Name} wait: ${fromTo(time(a.wait), time(b.wait))}`, true);
    if (!same(a.hands, b.hands)) say(`${Name} hands-on: ${fromTo(a.hands, b.hands)}`, true);
    for (const [k, label] of [["oven", "oven"], ["preheat", "heats the oven"]]) {
      if (same(a[k], b[k])) continue;
      const show = (v) => (v === false ? "not used" : v);
      say(`${Name} ${label}: ${fromTo(show(a[k]), show(b[k]))}`, [a[k], b[k]].some((v) => typeof v === "string" && TEMPERATURE.test(v)));
    }
    if (!same(a.cue, b.cue)) say(`${Name} cue: ${!has(a.cue) ? `${q(b.cue)} added` : !has(b.cue) ? `${q(a.cue)} taken out` : `${q(a.cue)} → ${q(b.cue)}`}`);
    const flags = [
      ["watch", "needs you there the whole wait", "no longer needs you there"],
      ["during", "done during an earlier step's wait", "no longer done during another wait"],
      ["burner", "uses the burner", "doesn't use the burner", "burner not set"],
      ["grill", "uses the grill", "doesn't use the grill", "grill not set"],
      ["microwave", "uses the microwave", "doesn't use the microwave", "microwave not set"],
      ["holds", "keeps as long as you like after this", "no longer keeps after this"],
    ];
    for (const [k, on, off, unset = off] of flags) if (!same(a[k], b[k])) say(`${Name}: ${b[k] === true ? on : b[k] === false ? off : unset}`);
    if (!same(a.prep, b.prep)) say(`${Name}: ${b.prep === true ? "can be done ahead" : b.prep === "just before" ? "prep, just before" : "not prep"}`);
    if (!same((a.uses || []).map(wasUse), b.uses || [])) {
      const was = new Map((a.uses || []).map(wasUse).map((u) => [useName(u), u?.amount])), now = new Map((b.uses || []).map((u) => [useName(u), u?.amount]));
      const parts = [...[...now.keys()].filter((n) => !was.has(n)).map((n) => `+ ${n}`), ...[...was.keys()].filter((n) => !now.has(n)).map((n) => `− ${n}`)];
      const amounts = [...now.keys()].filter((n) => was.has(n) && !same(was.get(n), now.get(n))).map((n) => `${n} ${fromTo(was.get(n), now.get(n))}`);
      if (parts.length) say(`${Name} uses: ${parts.join(", ")}`);
      if (amounts.length) say(`${Name} uses: ${amounts.join(", ")}`, true);
    }
  }
  for (const j of steps.added) say(`Added ${stepName(j)}: ${q(stepsB[j].do || "")}${has(stepsB[j].wait) && stepsB[j].wait !== false ? ` (${stepsB[j].wait})` : ""}`, has(stepsB[j].wait) && stepsB[j].wait !== false);
  for (const i of steps.removed) say(`Removed step: ${q(stepsA[i].do || "")}`, has(stepsA[i].wait) && stepsA[i].wait !== false);
  if (steps.reordered) say("Steps: the order changed");

  // --- Notes and Before you start.
  for (const [k, label] of [["notes", "Notes"], ["beforeYouStart", "Before you start"]]) {
    const a = flat(before[k]).map(([, t]) => String(t)), b = flat(after[k]).map(([, t]) => String(t));
    const m = match(a, b, (t) => t, () => true);
    const parts = [
      ...m.pairs.filter(([i, j]) => a[i] !== b[j]).map(([, j]) => q(b[j])),
      ...m.added.map((j) => `+ ${q(b[j])}`),
      ...m.removed.map((i) => `− ${q(a[i])}`),
    ];
    if (parts.length) say(`${label}: ${parts.join(", ")}`);
  }

  // --- Tags, by their names on the site.
  const dimOf = (d) => vocab?.dimensions?.find((x) => x.key === d);
  const valueLabel = (d, v) => {
    const dim = dimOf(d);
    const all = dim ? [...(dim.values || []), ...(dim.groups || []).flatMap((g) => g.values), ...Object.values(dim.valuesBySection || {}).flat()] : [];
    return all.find((x) => x.key === v)?.label || v;
  };
  const tagsA = before.tags && typeof before.tags === "object" ? before.tags : {}, tagsB = after.tags && typeof after.tags === "object" ? after.tags : {};
  const tagParts = [];
  for (const d of new Set([...Object.keys(tagsA), ...Object.keys(tagsB)])) {
    const a = Array.isArray(tagsA[d]) ? tagsA[d] : [], b = Array.isArray(tagsB[d]) ? tagsB[d] : [];
    const label = dimOf(d)?.label || d;
    for (const v of a) if (!b.includes(v)) tagParts.push(`− ${label}: ${valueLabel(d, v)}`);
    for (const v of b) if (!a.includes(v)) tagParts.push(`+ ${label}: ${valueLabel(d, v)}`);
  }
  if (tagParts.length) say(`Tags: ${tagParts.join(", ")}`);

  // --- Details.
  field("Source", before.source?.name, after.source?.name);
  field("Source link", before.source?.url, after.source?.url);
  field("Date added", before.added, after.added);
  field("Drawing", before.icon, after.icon);

  // Amounts, times and temperatures first, each kind in the order found.
  return [...out.filter((c) => c.number), ...out.filter((c) => !c.number)];
}
