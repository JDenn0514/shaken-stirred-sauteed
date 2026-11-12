// The Facts form in the editor (edit.html): the yield, the times as the page
// prints them (a row each: its name and how long, to move or remove), the
// minutes the time filter, the card and the lineup use, with a word when
// Total is less than its parts, and the section's own facts. Typing in it is
// applied by edit.mjs, through edit-model.mjs's setFacts.

import * as M from "./edit-model.mjs";
import { esc, labelled, field, select, act, formButtons } from "./edit-html.mjs";

export const MINUTES = [["prep", "Prep"], ["cook", "Cook"], ["chill", "Chill"], ["rest", "Rest"], ["total", "Total"]];

// The word under the minutes when Total is less than its parts, or "".
export const hintText = (time) => {
  const hint = M.minutesHint(time);
  return hint ? `Total, ${hint.total} min, is less than prep, cook, chill and rest add up to, ${hint.parts} min.` : "";
};

export function factsForm(recipe) {
  const t = recipe.time || {}, rows = recipe.times || [];
  const rowButton = (name, label, k, on = true) =>
    `<button class="btn" type="button" data-act="time-${name}" data-k="${k}" data-key="edit-time-${name}-${k}"${on ? "" : " disabled"}>${label}</button>`;
  return `<form class="edit-form" data-form="facts" aria-label="Facts">
    ${field("Yield", "yield", recipe.yield, ` placeholder="Serves 4 · Makes 12 cups"`)}
    <fieldset class="edit-set"><legend>Times as printed</legend>
      ${rows.map(([name, long], k) => `<div class="edit-time-row" role="group" aria-label="Time ${k + 1}">
        <div class="edit-fields">
          ${labelled("Name", `<input name="tl-${k}" value="${esc(name ?? "")}" placeholder="e.g. Rise" data-key="edit-tl-${k}">`)}
          ${labelled("How long", `<input name="tv-${k}" value="${esc(long ?? "")}" placeholder="e.g. 1 to 2 hr" data-key="edit-tv-${k}">`)}
        </div>
        <div class="edit-row">${rowButton("up", "Move up", k, k > 0)}${rowButton("down", "Move down", k, k < rows.length - 1)}${rowButton("remove", "Remove", k)}</div>
      </div>`).join("")}
      <div class="edit-row">${act("time-add", "Add a time")}</div>
    </fieldset>
    <fieldset class="edit-set"><legend>For filters and the lineup, in minutes</legend>
      <div class="edit-fields">
        ${MINUTES.map(([k, label]) => labelled(label, `<input name="m-${k}" type="number" min="0" inputmode="numeric" value="${esc(t[k] ?? "")}" data-key="edit-time-${k}">`)).join("")}
      </div>
      <p class="edit-hint" data-hint aria-live="polite">${hintText(t)}</p>
      <p class="muted">Leave Total empty to add up the others.</p>
    </fieldset>
    ${moreFacts(recipe)}
    ${formButtons()}
  </form>`;
}

// The section's own facts: a baking recipe's pan and heat, a cocktail's
// glass, ice and the rest. Two say what else they change.
const FACT_LABELS = { pan: "Equipment", heat: "Heat", glass: "Glass", ice: "Ice", garnish: "Garnish", method: "Method", keeps: "Keeps", abv: "ABV", standardDrinks: "Standard drinks" };
const FACT_HINTS = { glass: "Sets the drawing", standardDrinks: "Sets the strength filter" };
function moreFacts(recipe) {
  const keys = M.factFields(recipe);
  if (!keys.length) return "";
  const one = (k) => {
    if (k === "heatLabel") {
      const options = recipe.heatLabel === "Heat" ? [["Heat", "Heat"], ["Oven", "Oven"]] : [["", "Heat"], ["Oven", "Oven"]];
      return select("Shown as", `x-${k}`, options, recipe.heatLabel || "", ` data-key="edit-x-${k}"`);
    }
    const hint = FACT_HINTS[k];
    const extra = k === "standardDrinks" ? ` type="number" min="0" step="0.1" inputmode="decimal"` : k === "pan" ? ` placeholder="e.g. 9 in tart pan, medium saucepan"` : "";
    const input = `<input name="x-${k}" value="${esc(recipe[k] ?? "")}"${extra}${hint ? ` aria-describedby="hint-${k}"` : ""} data-key="edit-x-${k}">`;
    return hint ? `<div class="edit-field-wrap">${labelled(FACT_LABELS[k], input)}<p class="muted edit-field-hint" id="hint-${k}">${hint}</p></div>` : labelled(FACT_LABELS[k], input);
  };
  const legend = { baking: "Baking", cocktails: "The drink" }[recipe.category] || "More facts";
  return `<fieldset class="edit-set"><legend>${legend}</legend><div class="edit-fields">${keys.map(one).join("")}</div></fieldset>`;
}
