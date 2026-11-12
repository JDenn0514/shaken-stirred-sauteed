// A step's settings for the lineup in the editor (edit.html), folded under the
// open step: what it uses and how much, hands-on time and prep, needing you
// through its wait, the equipment, and whether the dish keeps after it. The
// fold says what's set, and opens by itself when one of them has a problem or
// a to-do (edit.mjs decides that). On a new recipe, the intake's own guesses
// ("Needs you there", "Done while an earlier step waits") stand in for the
// editor's while they're still to confirm; edit.mjs passes them in drawn.
//
// The fold takes, besides the recipe and the step's place in it (from 0):
//   open        whether it starts open
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

// What's set on a step, for the fold's summary line, given how many
// ingredients it uses.
export function lineupSummary(o, uses) {
  const said = [];
  if (typeof o.oven === "string") said.push(o.oven === "off" ? "Oven off" : o.oven === "broil" ? "Broil" : `Oven ${o.oven}`);
  if (typeof o.preheat === "string") said.push(`Heats the oven to ${o.preheat}`);
  for (const [k, word] of [["burner", "Burner"], ["grill", "Grill"], ["microwave", "Microwave"]]) if (o[k] === true) said.push(word);
  if (o.hands) said.push(`${o.hands} hands-on`);
  if (o.prep) said.push(o.prep === true ? "Prep, ahead" : "Prep, just before");
  if (o.watch) said.push("Needs you");
  if (o.holds) said.push("Keeps after this");
  if (uses) said.push(`uses ${uses}`);
  return said.join(" · ") || "nothing set";
}

export function lineupFold(recipe, n, ctx) {
  const o = asObject(flat(recipe.steps)[n]);
  return `<details class="edit-lineup" aria-label="For the lineup"${ctx.open ? " open" : ""}>
    <summary data-key="edit-lineup">For the lineup: ${esc(lineupSummary(o, M.usesOf(recipe, n).picks.length))}</summary>
    ${stepLineup(recipe, n, ctx)}
  </details>`;
}

function stepLineup(recipe, n, { named, ovenTemp, watchGuess = "", duringGuess = "" }) {
  const o = asObject(flat(recipe.steps)[n]);
  const ings = flat(recipe.ingredients);
  const { picks, unmatched } = M.usesOf(recipe, n);
  const picked = new Map(picks.map((p) => [p.ing, p.amount]));
  const oven = o.oven === false ? "false" : o.oven === "broil" || o.oven === "off" ? o.oven : o.oven || ovenTemp === n ? "temp" : "";
  const sf = (attrs) => ` data-act="step-field" data-n="${n}"${attrs}`;
  return `<div class="edit-lineup-body">
    <div class="edit-uses" role="group" aria-label="Ingredients ${esc(named)} uses">
      <p class="edit-subhead">Uses</p>
      ${ings.map((i, k) => `<div class="edit-use">
        ${check(ingName(i) || `Ingredient ${k + 1}`, ` data-act="use" data-n="${n}" data-ing="${k}" data-key="d-use-${n}-${k}"`, picked.has(k))}
        ${picked.has(k) ? `${labelled("Amount for this step", `<input value="${esc(picked.get(k))}" placeholder="all of it" data-act="use-amount" data-n="${n}" data-ing="${k}" data-key="d-use-amt-${n}-${k}">`, " inline")}` : ""}
      </div>`).join("")}
      ${unmatched.map((u) => `<p class="edit-error">"${esc(u)}" isn't one of the ingredients.
        <button class="btn" type="button" data-act="use-drop" data-n="${n}" data-name="${esc(u)}" data-key="d-use-drop-${n}-${esc(u)}">Take out "${esc(u)}"</button></p>`).join("")}
    </div>
    <div class="edit-fields">
      ${labelled("Hands-on time", `<input value="${esc(o.hands || "")}" placeholder="e.g. 5 min"${sf(` data-field="hands" data-key="d-hands-${n}"`)}>`)}
      ${select("Prep", "prep", [["", "Not prep"], ["true", "Can be done ahead"], ["just before", "Just before"]], o.prep === true ? "true" : o.prep || "", sf(` data-field="prep" data-key="d-prep-${n}"`))}
    </div>
    ${watchGuess || (o.wait ? check("Needs you there the whole wait", sf(` data-field="watch" data-key="d-watch-${n}"`), o.watch === true) : "")}
    ${duringGuess}
    <div class="edit-fields">
      ${select("Oven", "oven", [["", "Not set"], ["false", "Doesn't use the oven"], ["temp", "At a temperature"], ["broil", "Broil"], ["off", "Turn it off"]], oven, sf(` data-field="oven" data-key="d-oven-${n}"`))}
      ${oven === "temp" ? labelled("Oven temperature", `<input value="${esc(typeof o.oven === "string" ? o.oven : "")}" placeholder="200C or 400F"${sf(` data-field="oven-temp" data-key="d-oven-temp-${n}"`)}>`) : ""}
      ${labelled("Heats the oven to", `<input value="${esc(typeof o.preheat === "string" ? o.preheat : "")}" placeholder="200C or 400F"${sf(` data-field="preheat" data-key="d-preheat-${n}"`)}>`)}
      ${select("Burner", "burner", TRI, tri(o.burner), sf(` data-field="burner" data-key="d-burner-${n}"`))}
      ${select("Grill", "grill", TRI, tri(o.grill), sf(` data-field="grill" data-key="d-grill-${n}"`))}
      ${select("Microwave", "microwave", TRI, tri(o.microwave), sf(` data-field="microwave" data-key="d-microwave-${n}"`))}
    </div>
    ${check("Keeps as long as you like after this step", ` value="${n}" data-act="holds" data-key="d-holds-${n}"`, !!o.holds)}
  </div>`;
}
