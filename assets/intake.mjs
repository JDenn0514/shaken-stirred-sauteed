// The recipe intake's review screen (intake.html). Pasted text (or a website
// or a PDF, through intake-import.mjs) is read into a draft
// (tools/intake/intake.mjs); the review (tools/intake/review.mjs) says
// what to ask, confirm and check. This file only draws it and passes on what
// the person does. Saving comes with the editor's sign-in; until then the
// finished recipe is copied, to add to recipes/ by hand.
import { draftFromText } from "../tools/intake/intake.mjs";
import { startImport } from "./intake-import.mjs";
import {
  startReview, reviewOf, answerWait, answerServe, joinBack, splitBack, setPlanning, setHolds, setLink,
  updateIngredient, updateStep, setField, addIngredient, removeIngredient, addStep, removeStep,
  recipeToSave, slugOf, isTime,
} from "../tools/intake/review.mjs";

const { esc, toGroups, CATEGORIES } = window.SSS;
const $ = (id) => document.getElementById(id);
const out = $("review");

let state = null;      // the review (tools/intake/review.mjs)
let editing = null;    // the part of the preview open for editing: "title", or a step or ingredient id
let copied = null;     // the recipe file, once "Copy recipe" has been pressed
let titles = {};       // recipe slugs -> titles, to link ingredients to the recipes that make them

fetch("recipes/index.json", { cache: "no-cache" })
  .then((r) => (r.ok ? r.json() : []))
  .then((index) => { titles = Object.fromEntries(index.map((r) => [r.slug, r.title])); })
  .catch(() => {});

// --- Reading the text -------------------------------------------------------

let pages = 1;
$("add-page").addEventListener("click", () => {
  pages += 1;
  const label = document.createElement("label");
  label.className = "intake-field";
  label.append(`Recipe text, page ${pages}`);
  const area = document.createElement("textarea");
  area.id = `page-${pages}`;
  area.rows = 8;
  label.append(area);
  $("pages").append(label);
  area.focus();
});

$("read").addEventListener("submit", (e) => {
  e.preventDefault();
  const texts = [...$("pages").querySelectorAll("textarea")].map((t) => t.value).filter((t) => t.trim());
  const category = new FormData(e.target).get("category");
  const problem = !texts.length ? "Paste the recipe's text first." : !category ? "Choose Baking, Cooking or Cocktails." : "";
  $("read-problem").hidden = !problem;
  $("read-problem").textContent = problem;
  if (problem) return;
  show(draftFromText(texts, { category, titles: { ...titles } }));
});

function show({ recipe, flags }) {
  state = startReview(recipe, flags);
  editing = null;
  copied = null;
  draw();
  out.querySelector("h2")?.scrollIntoView({ block: "start" });
}

// --- From a recipe website or a PDF (assets/intake-import.mjs) ---------------

startImport({ show, titles: () => titles });

// --- Drawing the review -------------------------------------------------------

const flatten = (l = []) => l.flatMap((e) => (e && Array.isArray(e.items) ? e.items : [e]));
const SERVING = {
  hot: "Hot (eat within a few minutes)",
  soon: "Soon (fine for half an hour)",
  keeps: "Keeps (made ahead, or eaten at room temperature)",
};
const sitsFor = (serve, guess) => (guess?.serve === serve && guess.sits) || (serve === "hot" ? "10 min" : "30 min");
const ingredientText = (i) => [i.grams != null && `${i.grams} g`, i.qty].filter(Boolean).join(" · ") + (i.qty || i.grams != null ? " " : "")
  + (i.item || "New ingredient") + (i.note ? `, ${i.note}` : "");

function askHTML(a) {
  if (a.kind === "wait") {
    return `<fieldset class="intake-ask${a.answered ? " answered" : ""}" data-ask="${esc(a.id)}">
      <legend>${esc(a.text)}</legend>
      <p class="muted">This waits, but the recipe gives no time. Without one, a menu plans it as taking none.</p>
      <label class="intake-field inline">How long? <input name="wait" value="${esc(a.value)}" placeholder="e.g. 35 min, 1 to 2 hr" data-key="wait-${esc(a.id)}"></label>
      <button class="btn" type="button" data-act="wait" data-id="${esc(a.id)}">Use this time</button>
      <button class="btn" type="button" data-act="no-wait" data-id="${esc(a.id)}">It doesn't wait</button>
      ${a.problem ? `<p class="intake-problem" role="alert">${esc(a.problem)}</p>` : ""}
      ${a.answered ? `<p class="intake-done">✓ ${a.value ? esc(a.value) : "Doesn't wait"}</p>` : ""}
    </fieldset>`;
  }
  return servingHTML(a.value || {}, a.guess, a.answered, true);
}

// How it's served: asked for a cooking dish, shown to confirm for the others.
function servingHTML(value, guess, answered, asked) {
  const sits = value.sits || sitsFor(value.serve || guess?.serve, guess);
  return `<fieldset class="intake-ask${answered ? " answered" : ""}" data-serving>
    <legend>How is it served?</legend>
    ${asked && guess?.serve ? `<p class="muted">From the text, it looks ${esc(guess.serve)}${guess.sits ? `, sitting up to ${esc(guess.sits)}` : ""}. It's what a menu plans around, so check.</p>` : ""}
    ${Object.entries(SERVING).map(([k, label]) => `<label class="intake-option"><input type="radio" name="serve" value="${k}"${value.serve === k ? " checked" : ""} data-key="serve-${k}"> ${esc(label)}</label>`).join("")}
    ${value.serve && value.serve !== "keeps" || !value.serve ? `<label class="intake-field inline">Can sit for <input name="sits" value="${esc(sits)}" data-key="sits"></label>` : ""}
    ${answered && value.serve ? `<p class="intake-done">✓ ${esc(value.serve)}${value.sits ? `, up to ${esc(value.sits)}` : ""}</p>` : ""}
  </fieldset>`;
}

function ingredientHTML(i, review) {
  const id = i.reviewId;
  const checks = review.checks.filter((c) => c.ingredient === id);
  const link = review.confirms.find((c) => c.kind === "link" && c.ingredient === id);
  if (editing === id) {
    return `<li class="intake-editing"><form class="intake-edit" data-form="ingredient" data-id="${esc(id)}">
      <label class="intake-field">Amount <input name="qty" value="${esc(i.qty || "")}" data-key="edit-qty"></label>
      <label class="intake-field">Ingredient <input name="item" value="${esc(i.item || "")}" data-key="edit-item"></label>
      <label class="intake-field">Note <input name="note" value="${esc(i.note || "")}"></label>
      <div class="intake-row"><button class="btn intake-primary" type="submit">Done</button>
      <button class="btn" type="button" data-act="remove-ingredient" data-id="${esc(id)}">Remove</button></div>
    </form></li>`;
  }
  return `<li>
    <button class="intake-part" type="button" data-act="edit" data-id="${esc(id)}" data-key="part-${esc(id)}">${esc(ingredientText(i))}</button>
    ${checks.map((c) => `<p class="intake-flag">${esc(c.why)}</p>`).join("")}
    ${link ? `<div class="intake-guess">Made by <a href="recipe.html?r=${encodeURIComponent(link.recipe)}">${esc(titles[link.recipe] || link.recipe)}</a>
      ${link.required ? `<label><input type="checkbox" data-act="already-made" data-id="${esc(id)}"${link.alreadyMade ? " checked" : ""}> Usually already made or bought</label>` : ""}
      <button class="btn" type="button" data-act="unlink" data-id="${esc(id)}">Unlink</button></div>` : ""}
  </li>`;
}

function stepHTML(s, review) {
  const id = s.reviewId;
  if (editing === id) {
    return `<li class="intake-editing"><form class="intake-edit" data-form="step" data-id="${esc(id)}">
      <label class="intake-field">Step <textarea name="do" rows="3" data-key="edit-do">${esc(s.do || "")}</textarea></label>
      <label class="intake-field">Wait <input name="wait" value="${esc(s.wait || "")}" placeholder="e.g. 35 min, or leave empty"></label>
      <div class="intake-row"><button class="btn intake-primary" type="submit">Done</button>
      <button class="btn" type="button" data-act="remove-step" data-id="${esc(id)}">Remove</button></div>
    </form></li>`;
  }
  const mine = (kind) => review.confirms.find((c) => c.kind === kind && c.step === id);
  const watch = mine("watch"), prep = mine("prep"), during = mine("during");
  const split = review.confirms.find((c) => c.kind === "split" && c.steps[0] === id);
  const joined = review.confirms.find((c) => c.kind === "joined" && c.steps[0] === id);
  const checks = review.checks.filter((c) => c.step === id);
  return `<li>
    <button class="intake-part" type="button" data-act="edit" data-id="${esc(id)}" data-key="part-${esc(id)}">${esc(s.do || "New step")}</button>
    ${s.wait ? `<span class="step-wait">⏱ ${esc(s.wait)}</span>` : ""}
    ${s.prepOnly ? `<p class="intake-guess">Added: prep from the ingredient list. It shows when steps are in prep-first order.</p>` : ""}
    ${split ? `<p class="intake-guess">Split from one step in the recipe, so each part has one wait and one place to cook.
      <button class="btn" type="button" data-act="join" data-id="${esc(split.id)}">Join back</button></p>` : ""}
    ${joined ? `<p class="intake-guess">Joined: another way to do it, from the next line of the recipe.
      <button class="btn" type="button" data-act="split" data-id="${esc(joined.id)}">Split back out</button></p>` : ""}
    ${watch ? `<label class="intake-guess"><input type="checkbox" data-act="watch" data-id="${esc(id)}"${watch.value ? " checked" : ""}> Needs you there</label>` : ""}
    ${during ? `<label class="intake-guess"><input type="checkbox" data-act="during" data-id="${esc(id)}"${during.value ? " checked" : ""}> Done while an earlier step waits</label>` : ""}
    ${prep ? `<label class="intake-guess">Prep <select data-act="prep" data-id="${esc(id)}">
      <option value="ahead"${prep.value === true ? " selected" : ""}>Can be done ahead</option>
      <option value="just before"${prep.value === "just before" ? " selected" : ""}>Just before</option>
      <option value="no"${!prep.value ? " selected" : ""}>Not prep</option></select></label>` : ""}
    ${checks.map((c) => `<p class="intake-flag">${esc(c.why)}</p>`).join("")}
  </li>`;
}

function previewHTML(review) {
  const r = state.recipe;
  const cat = CATEGORIES[r.category] || { label: "" };
  const steps = flatten(r.steps).filter((s) => s && typeof s === "object");
  const holds = review.confirms.find((c) => c.kind === "holds");
  const serving = review.confirms.find((c) => c.kind === "serve");
  return `<section class="section intake-preview fam-${esc(r.category || "")}" aria-labelledby="preview-h">
    <h2 id="preview-h">Preview</h2>
    <p class="muted">The recipe as it was read. Tap any part to fix it.</p>
    <span class="badge ${esc(r.category || "")}">${esc(cat.label)}</span>
    ${editing === "title" ? `<form class="intake-edit" data-form="title">
        <label class="intake-field">Title <input name="title" value="${esc(r.title || "")}" data-key="edit-title"></label>
        <label class="intake-field">Yield <input name="yield" value="${esc(r.yield || "")}"></label>
        <div class="intake-row"><button class="btn intake-primary" type="submit">Done</button></div></form>`
      : `<h2 class="intake-title"><button class="intake-part" type="button" data-act="edit" data-id="title" data-key="part-title">${esc(r.title || "Add a title")}</button></h2>
        ${r.yield ? `<p class="lede">${esc(r.yield)}</p>` : ""}`}
    ${r.source?.name || r.source?.url ? `<p class="source">Source: ${(r.source.url || "").startsWith("https://")
      ? `<a href="${esc(r.source.url)}" rel="noopener noreferrer" target="_blank">${esc(r.source.name || r.source.url)}</a>`
      : esc(r.source.name || r.source.url)}</p>` : ""}
    ${serving ? servingHTML(serving.value, null, true, false) : ""}
    <section class="section"><h2>${r.category === "cocktails" ? "Spec" : "Ingredients"}</h2>
      ${review.checks.some((c) => c.kind === "amounts") ? `<p class="intake-flag">Check every amount against the original: fractions are where reading goes wrong.</p>` : ""}
      ${toGroups(r.ingredients).map((g) => `${g.group ? `<h3>${esc(g.group)}</h3>` : ""}
        <ul class="intake-ingredients">${g.items.map((i) => (typeof i === "object" ? ingredientHTML(i, review) : `<li>${esc(i)}</li>`)).join("")}</ul>`).join("")}
      <button class="btn" type="button" data-act="add-ingredient">Add ingredient</button>
    </section>
    <section class="section"><h2>${r.category === "cocktails" ? "Method" : "Steps"}</h2>
      ${toGroups(r.steps).map((g) => `${g.group ? `<h3>${esc(g.group)}</h3>` : ""}
        <ol class="steps intake-steps">${g.items.map((s) => (typeof s === "object" ? stepHTML(s, review) : `<li>${esc(s)}</li>`)).join("")}</ol>`).join("")}
      <button class="btn" type="button" data-act="add-step">Add step</button>
      <label class="intake-field intake-holds">Keeps as long as you like after
        <select data-act="holds">
          <option value="">Nowhere: it's made in one go</option>
          ${steps.map((s, i) => `<option value="${esc(s.reviewId)}"${holds?.value === s.reviewId ? " selected" : ""}>Step ${i + 1}: ${esc((s.do || "").slice(0, 50))}${(s.do || "").length > 50 ? "…" : ""}</option>`).join("")}
        </select></label>
    </section>
  </section>`;
}

function draw() {
  if (!state) return;
  const key = document.activeElement?.dataset?.key;
  const review = reviewOf(state);
  const listed = review.checks.filter((c) => !c.ingredient && !c.step && c.kind !== "amounts");
  const slug = slugOf(state.recipe.title);
  out.innerHTML = `
    ${review.asks.length ? `<section class="section intake-questions" aria-labelledby="questions-h">
      <h2 id="questions-h">Questions</h2>
      <p class="muted">What a menu needs to plan this recipe, and the text doesn't say.</p>
      ${review.asks.map(askHTML).join("")}
    </section>` : ""}
    ${previewHTML(review)}
    ${listed.length || review.checks.some((c) => c.kind === "amounts") ? `<section class="section intake-checks" aria-labelledby="checks-h">
      <h2 id="checks-h">Things to check</h2>
      <ul class="notes">
        ${review.checks.some((c) => c.kind === "amounts") ? "<li>Check every amount against the original: fractions are where reading goes wrong.</li>" : ""}
        ${listed.map((c) => `<li>${c.text ? `<b>${esc(c.text)}</b>: ` : ""}${esc(c.why)}</li>`).join("")}
      </ul>
    </section>` : ""}
    <section class="section intake-finish" aria-labelledby="finish-h">
      <h2 id="finish-h">Finish</h2>
      ${review.ready ? "" : `<p class="intake-problem">Still needed: ${esc(review.missing.join(", "))}</p>`}
      <button class="btn intake-primary" type="button" data-act="copy"${review.ready ? "" : " disabled"}>Copy recipe</button>
      ${copied ? `<p>Save it as <code>recipes/${esc(copied.slug)}.json</code>, then run <code>node scripts/build-index.mjs</code> and commit. <span role="status">${esc(copied.status)}</span></p>
        <label class="intake-field">Recipe file <textarea readonly rows="12">${esc(copied.json)}</textarea></label>` : ""}
      ${!copied && slug ? `<p class="muted">It'll be saved as <code>recipes/${esc(slug)}.json</code>.</p>` : ""}
    </section>`;
  const back = key && out.querySelector(`[data-key="${CSS.escape(key)}"]`);
  if (back) back.focus();
}

function update(next) {
  state = next;
  copied = null;
  draw();
}

// --- What the person does ----------------------------------------------------

out.addEventListener("click", async (e) => {
  const b = e.target.closest("button[data-act]");
  if (!b) return;
  const { act, id } = b.dataset;
  const ask = b.closest("[data-ask]");
  if (act === "wait") update(answerWait(state, id, ask.querySelector("input[name=wait]").value));
  else if (act === "no-wait") update(answerWait(state, id, null));
  else if (act === "join") update(joinBack(state, id));
  else if (act === "split") update(splitBack(state, id));
  else if (act === "unlink") update(setLink(state, id, { recipe: null }));
  else if (act === "edit") { editing = id; draw(); out.querySelector(".intake-edit input, .intake-edit textarea")?.focus(); }
  else if (act === "remove-ingredient") { editing = null; update(removeIngredient(state, id)); }
  else if (act === "remove-step") { editing = null; update(removeStep(state, id)); }
  else if (act === "add-ingredient") {
    const next = addIngredient(state);
    editing = flatten(next.recipe.ingredients).at(-1).reviewId;
    update(next);
    out.querySelector(".intake-edit input")?.focus();
  } else if (act === "add-step") {
    const next = addStep(state);
    editing = flatten(next.recipe.steps).at(-1).reviewId;
    update(next);
    out.querySelector(".intake-edit textarea")?.focus();
  } else if (act === "copy") await copy();
});

out.addEventListener("submit", (e) => {
  e.preventDefault();
  const f = e.target;
  const data = Object.fromEntries(new FormData(f));
  let next = state;
  if (f.dataset.form === "title") next = setField(setField(state, "title", data.title), "yield", data.yield);
  else if (f.dataset.form === "ingredient") next = updateIngredient(state, f.dataset.id, data);
  else if (f.dataset.form === "step") {
    if (data.wait.trim() && !isTime(data.wait)) {
      f.querySelector("input[name=wait]").setCustomValidity('Give a time the timer can read, like "35 min", or leave it empty');
      f.reportValidity();
      return;
    }
    next = updateStep(state, f.dataset.id, data);
  }
  const was = editing;
  editing = null;
  update(next);
  out.querySelector(`[data-key="part-${CSS.escape(was)}"]`)?.focus();
});

out.addEventListener("input", (e) => {
  if (e.target.name === "wait" && e.target.form) e.target.setCustomValidity("");
});

out.addEventListener("change", (e) => {
  const t = e.target;
  const { act, id } = t.dataset;
  const serving = t.closest("[data-serving]");
  if (serving && (t.name === "serve" || t.name === "sits")) {
    const serve = serving.querySelector("input[name=serve]:checked")?.value;
    const sits = serving.querySelector("input[name=sits]")?.value;
    if (serve) update(answerServe(state, serve, sits || sitsFor(serve, reviewOf(state).asks.find((a) => a.kind === "serve")?.guess)));
  } else if (act === "watch" || act === "during") update(setPlanning(state, id, act, t.checked));
  else if (act === "prep") update(setPlanning(state, id, "prep", t.value === "ahead" ? true : t.value === "just before" ? "just before" : false));
  else if (act === "holds") update(setHolds(state, t.value || null));
  else if (act === "already-made") update(setLink(state, id, { alreadyMade: t.checked }));
});

async function copy() {
  const recipe = recipeToSave(state, { today: new Date().toLocaleDateString("en-CA") });
  const json = `${JSON.stringify(recipe, null, 2)}\n`;
  let status = "Copied: paste it into the new file.";
  try {
    await navigator.clipboard.writeText(json);
  } catch {
    status = "Couldn't copy by itself: select the text below and copy it.";
  }
  copied = { json, slug: slugOf(recipe.title), status };
  draw();
}
