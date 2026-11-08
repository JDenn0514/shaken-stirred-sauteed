// What a new recipe brings with it from the intake, drawn for the page that
// shows it: the original it was read from (intake.html and edit.html?new),
// and in the editor, the reader's guesses and checks on the steps and
// ingredients they're about. The guesses are changed through the review's own
// functions (tools/intake/review.mjs), which find steps and ingredients by the
// `reviewId` they carry until the recipe is saved.
import { joinBack, splitBack, setPlanning, setLink } from "../tools/intake/review.mjs";

const { esc } = window.SSS;

// The original, beside the preview; on a phone, under "Show the original".
// `original`: { kind: "text" | "pdf", pages, name } or { kind: "page", url }.
// Only shown, never put in the recipe.
export function originalHTML(original, open) {
  if (!original) return "";
  const o = original;
  const safe = o.kind === "page" && /^https?:\/\//i.test(o.url || "");
  const body = o.kind === "page"
    ? `<p>Read from the web page ${safe ? `<a href="${esc(o.url)}" rel="noopener noreferrer" target="_blank">${esc(o.url)}</a>` : esc(o.url)}. Open it to check the preview against it.</p>`
    : `${o.kind === "pdf" ? `<p class="muted">The text read from ${esc(o.name || "the PDF")}.</p>` : ""}
      ${(o.pages || []).map((t, k) => `${o.pages.length > 1 ? `<h3>Page ${k + 1}</h3>` : ""}<pre class="original-text">${esc(t)}</pre>`).join("")}`;
  return `<section class="original${open ? " open" : ""}" aria-labelledby="original-h">
    <h2 id="original-h">The original</h2>
    <button class="btn original-toggle" type="button" data-act="original" aria-expanded="${open}" aria-controls="original-body" data-key="original">${open ? "Hide" : "Show"} the original</button>
    <div class="original-body" id="original-body" tabindex="0">${body}</div>
  </section>`;
}

// The guesses and checks on a step (`review` is reviewOf(state)).
export function stepNotesHTML(s, review) {
  const id = s?.reviewId;
  if (!id) return "";
  const mine = (kind) => review.confirms.find((c) => c.kind === kind && c.step === id);
  const watch = mine("watch"), prep = mine("prep"), during = mine("during");
  const split = review.confirms.find((c) => c.kind === "split" && c.steps[0] === id);
  const joined = review.confirms.find((c) => c.kind === "joined" && c.steps[0] === id);
  const checks = review.checks.filter((c) => c.step === id);
  return `<div class="import-notes">
    ${s.prepOnly ? `<p class="import-guess">Added: prep from the ingredient list. It shows only when steps are in prep-first order.</p>` : ""}
    ${split ? `<p class="import-guess">Split from one step in the recipe, so each part has one wait and one place to cook.
      <button class="btn" type="button" data-act="r-join" data-id="${esc(split.id)}" data-key="r-join-${esc(id)}">Join back</button></p>` : ""}
    ${joined ? `<p class="import-guess">Joined: another way to do it, from the next line of the recipe.
      <button class="btn" type="button" data-act="r-split" data-id="${esc(joined.id)}" data-key="r-split-${esc(id)}">Split back out</button></p>` : ""}
    ${watch ? `<label class="import-guess"><input type="checkbox" data-act="r-watch" data-id="${esc(id)}" data-key="r-watch-${esc(id)}"${watch.value ? " checked" : ""}> Needs you there</label>` : ""}
    ${during ? `<label class="import-guess"><input type="checkbox" data-act="r-during" data-id="${esc(id)}" data-key="r-during-${esc(id)}"${during.value ? " checked" : ""}> Done while an earlier step waits</label>` : ""}
    ${prep ? `<label class="import-guess">Prep <select data-act="r-prep" data-id="${esc(id)}" data-key="r-prep-${esc(id)}">
      <option value="ahead"${prep.value === true ? " selected" : ""}>Can be done ahead</option>
      <option value="just before"${prep.value === "just before" ? " selected" : ""}>Just before</option>
      <option value="no"${!prep.value ? " selected" : ""}>Not prep</option></select></label>` : ""}
    ${checks.map((c) => `<p class="import-check">${esc(c.why)}</p>`).join("")}
  </div>`;
}

// The checks on an ingredient, and the recipe it's made by.
export function ingredientNotesHTML(i, review, titles = {}) {
  const id = i?.reviewId;
  if (!id) return "";
  const checks = review.checks.filter((c) => c.ingredient === id);
  const link = review.confirms.find((c) => c.kind === "link" && c.ingredient === id);
  if (!checks.length && !link) return "";
  return `<div class="import-notes">
    ${checks.map((c) => `<p class="import-check">${esc(c.why)}</p>`).join("")}
    ${link ? `<div class="import-guess">Made by <a href="recipe.html?r=${encodeURIComponent(link.recipe)}">${esc(titles[link.recipe] || link.recipe)}</a>
      ${link.required ? `<label><input type="checkbox" data-act="r-made" data-id="${esc(id)}" data-key="r-made-${esc(id)}"${link.alreadyMade ? " checked" : ""}> Usually already made or bought</label>` : ""}
      <button class="btn" type="button" data-act="r-unlink" data-id="${esc(id)}" data-key="r-unlink-${esc(id)}">Unlink</button></div>` : ""}
  </div>`;
}

export const AMOUNTS = "Check every amount against the original: fractions are where reading goes wrong.";

// What a guess's control does to the review: the next review, or null when
// `el` isn't one of them.
export function reviewAction(state, el) {
  const { act, id } = el.dataset;
  if (act === "r-join") return joinBack(state, id);
  if (act === "r-split") return splitBack(state, id);
  if (act === "r-unlink") return setLink(state, id, { recipe: null });
  if (act === "r-made") return setLink(state, id, { alreadyMade: el.checked });
  if (act === "r-watch" || act === "r-during") return setPlanning(state, id, act.slice(2), el.checked);
  if (act === "r-prep") return setPlanning(state, id, "prep", el.value === "ahead" ? true : el.value === "just before" ? "just before" : false);
  return null;
}
