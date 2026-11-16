// A step's settings for the lineup in the editor (edit.html), folded under the
// open step: what it uses and how much, hands-on time and prep, needing you
// through its wait, not waiting at all, being done during an earlier step's
// wait, the equipment, and whether the dish keeps after it. Where "during"
// isn't offered, it says why. The fold opens by itself when one of them has a
// problem or a to-do (edit.mjs decides that), and its label counts them. On a new recipe, the intake's own guesses
// ("Needs you there", "Done while an earlier step waits") stand in for the
// editor's while they're still to confirm; edit.mjs passes them in drawn.
//
// The fold takes, besides the recipe and the step's place in it (from 0):
//   open        whether it starts open
//   toCheck     how many problems and to-dos are about it, for its label
//   nameOf      names another step as the sheet does, "step 3"
//   named       the step as the sheet names it, "step 3" or "the added prep step"
//   ovenTemp    a step whose oven was just set to "At a temperature", before
//               a temperature is typed
//   watchGuess, duringGuess   the intake's guesses, drawn, or ""

import * as M from "./edit-model.mjs";
import { esc, labelled, select, check } from "./edit-html.mjs";

const flat = (l = []) => l.flatMap((e) => (e && Array.isArray(e.items) ? e.items : [e]));
const ingName = (i) => (typeof i === "string" ? i : i?.item || "");
const asObject = (s) => (typeof s === "string" ? { do: s } : s || {});

const TRI = [["", "Not set"], ["true", "Uses it"], ["false", "Doesn't use it"]];
const tri = (v) => (v === true ? "true" : v === false ? "false" : "");

// Why "Done during an earlier step's wait" isn't offered on step n, and how to
// make it fit when there's a way, or "" where it's offered. nameOf(k) names
// step k as the sheet does. It follows M.canRunDuring: the nearest earlier step
// that isn't itself during (or an added prep step) needs a wait nobody watches.
export function whyNotDuring(recipe, n, nameOf = (k) => `step ${k + 1}`) {
  const steps = flat(recipe.steps);
  const o = asObject(steps[n]);
  if (o.during || M.canRunDuring(recipe, n)) return "";
  const NOT = "Done during an earlier step's wait isn't offered";
  if (o.prepOnly) return `${NOT} on an added prep step: prep is planned on its own.`;
  const at = steps.slice(0, n).findLastIndex((x) => x && !x.during && !x.prepOnly);
  if (at < 0) return `${NOT}: no earlier step waits.`;
  const before = asObject(steps[at]);
  if (before.wait) return `${NOT}: ${nameOf(at)}'s wait needs you there the whole time.`;
  const said = `${NOT}: ${nameOf(at)}${at === n - 1 ? ", just before it," : ""} doesn't wait.`;
  if (!M.canRunDuring(recipe, at)) return said;
  const waits = steps.slice(0, at).findLastIndex((x) => x && !x.during && !x.prepOnly);
  return `${said} If ${nameOf(at)} happens while ${nameOf(waits)} waits, tick it there first, and this one can be too.`;
}

// Whether a step's text names an ingredient: its name (without an amount in
// front or a note after a comma), or the name's last word ("salt" for
// "Kosher salt"), as whole words, ignoring capitals and a plural "s". Only
// used to put likely chips first, so a loose match does no harm.
const AMOUNT = /^[\d\s½¼¾⅓⅔⅛/.-]+(?:(?:cups?|tbsp|tsp|oz|lbs?|g|kg|ml|l|cloves?|large|medium|small|cans?|pinch|bunch)\s+)?/i;
const words = (s) => (s.toLowerCase().match(/\p{L}+/gu) || []).map((w) => (w.length > 3 && w.endsWith("s") ? w.slice(0, -1) : w));
export function mentions(text, name) {
  const want = words(String(name || "").split(",")[0].replace(AMOUNT, ""));
  const said = words(String(text || ""));
  if (!want.length || !said.length) return false;
  const whole = said.some((_, k) => want.every((w, j) => said[k + j] === w));
  return whole || said.includes(want.at(-1));
}

// The step's Uses, for its chips: [{ group, items: [{ ing, name, ticked,
// amount, mentioned }] }], one entry per run of ingredients in the recipe
// (a named group, or ungrouped ones in a row), in the recipe's order. In each,
// ticked ones come first, then ones the step's text mentions, then the rest.
export function usesByGroup(recipe, n) {
  const text = asObject(flat(recipe.steps)[n]).do || "";
  const picked = new Map(M.usesOf(recipe, n).picks.map((p) => [p.ing, p.amount]));
  const groups = [];
  let k = 0;
  for (const e of recipe.ingredients || []) {
    const grouped = e && Array.isArray(e.items);
    const into = grouped || !groups.length || groups.at(-1).named ? null : groups.at(-1);
    const g = into || (groups.push({ group: grouped ? e.group || "" : "", named: grouped, items: [] }), groups.at(-1));
    for (const i of grouped ? e.items : [e]) {
      const name = ingName(i);
      g.items.push({ ing: k++, name, ticked: picked.has(k - 1), amount: picked.get(k - 1) || "", mentioned: !picked.has(k - 1) && mentions(text, name) });
    }
  }
  const rank = (i) => (i.ticked ? 0 : i.mentioned ? 1 : 2);
  return groups.map(({ group, items }) => ({ group, items: items.map((i, at) => [i, at]).sort(([a, x], [b, y]) => rank(a) - rank(b) || x - y).map(([i]) => i) }));
}

export function lineupFold(recipe, n, ctx) {
  return `<details class="edit-lineup" aria-label="For the lineup"${ctx.open ? " open" : ""}>
    <summary data-key="edit-lineup">For the lineup${ctx.toCheck ? `: ${ctx.toCheck} to check` : ""}</summary>
    ${stepLineup(recipe, n, ctx)}
  </details>`;
}

function stepLineup(recipe, n, { named, ovenTemp, watchGuess = "", duringGuess = "", nameOf }) {
  const o = asObject(flat(recipe.steps)[n]);
  const { unmatched } = M.usesOf(recipe, n);
  const oven = o.oven === false ? "false" : o.oven === "broil" || o.oven === "off" ? o.oven : o.oven || ovenTemp === n ? "temp" : "";
  const sf = (attrs) => ` data-act="step-field" data-n="${n}"${attrs}`;
  const chip = (i) => `<div class="edit-use${i.ticked ? " picked" : ""}">
        ${check(i.name || `Ingredient ${i.ing + 1}`, ` data-act="use" data-n="${n}" data-ing="${i.ing}" data-key="d-use-${n}-${i.ing}"`, i.ticked).replace('class="edit-check"', 'class="edit-check edit-chip"')}
        ${i.ticked ? labelled("Amount for this step", `<input value="${esc(i.amount)}" placeholder="all of it" data-act="use-amount" data-n="${n}" data-ing="${i.ing}" data-key="d-use-amt-${n}-${i.ing}">`, " inline") : ""}
      </div>`;
  return `<div class="edit-lineup-body">
    <div class="edit-uses" role="group" aria-label="Ingredients ${esc(named)} uses">
      <p class="edit-subhead">Uses</p>
      ${usesByGroup(recipe, n).map((g) => g.group
        ? `<div class="edit-use-group" role="group" aria-label="${esc(g.group)}"><p class="edit-use-head" aria-hidden="true">${esc(g.group)}</p><div class="edit-use-chips">${g.items.map(chip).join("")}</div></div>`
        : `<div class="edit-use-group"><div class="edit-use-chips">${g.items.map(chip).join("")}</div></div>`).join("")}
      ${unmatched.map((u) => `<p class="edit-error">"${esc(u)}" isn't one of the ingredients.
        <button class="btn" type="button" data-act="use-drop" data-n="${n}" data-name="${esc(u)}" data-key="d-use-drop-${n}-${esc(u)}">Take out "${esc(u)}"</button></p>`).join("")}
    </div>
    <div class="edit-pair">
      ${labelled("Hands-on time", `<input value="${esc(o.hands || "")}" placeholder="e.g. 5 min"${sf(` data-field="hands" data-key="d-hands-${n}"`)}>`)}
      ${select("Prep", "prep", [["", "Not prep"], ["true", "Can be done ahead"], ["just before", "Just before"]], o.prep === true ? "true" : o.prep || "", sf(` data-field="prep" data-key="d-prep-${n}"`))}
    </div>
    ${o.wait ? "" : check("It doesn't wait", sf(` data-field="wait" data-key="d-wait-${n}"`), o.wait === false)}
    ${watchGuess || (o.wait ? check("Needs you there the whole wait", sf(` data-field="watch" data-key="d-watch-${n}"`), o.watch === true) : "")}
    ${duringGuess || (o.during || M.canRunDuring(recipe, n) ? check("Done during an earlier step's wait", sf(` data-field="during" data-key="d-during-${n}"`), o.during === true)
      : `<p class="edit-why muted">${esc(whyNotDuring(recipe, n, nameOf))}</p>`)}
    <div class="edit-equipment" role="group" aria-label="Equipment">
      <p class="edit-subhead">Equipment</p>
      ${select("Oven", "oven", [["", "Not set"], ["false", "Doesn't use the oven"], ["temp", "At a temperature"], ["broil", "Broil"], ["off", "Turn it off"]], oven, sf(` data-field="oven" data-key="d-oven-${n}"`))}
      ${oven === "temp" ? labelled("Oven temperature", `<input value="${esc(typeof o.oven === "string" ? o.oven : "")}" placeholder="200C or 400F"${sf(` data-field="oven-temp" data-key="d-oven-temp-${n}"`)}>`) : ""}
      ${select("Burner", "burner", TRI, tri(o.burner), sf(` data-field="burner" data-key="d-burner-${n}"`))}
      ${select("Grill", "grill", TRI, tri(o.grill), sf(` data-field="grill" data-key="d-grill-${n}"`))}
      ${select("Microwave", "microwave", TRI, tri(o.microwave), sf(` data-field="microwave" data-key="d-microwave-${n}"`))}
      ${labelled("Heats the oven to", `<input value="${esc(typeof o.preheat === "string" ? o.preheat : "")}" placeholder="200C or 400F"${sf(` data-field="preheat" data-key="d-preheat-${n}"`)}>`)}
    </div>
    ${check("Keeps as long as you like after this step", ` value="${n}" data-act="holds" data-key="d-holds-${n}"`, !!o.holds)}
  </div>`;
}
