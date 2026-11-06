// The recipe intake's review screen (intake.html). Pasted text (or a website
// or a PDF, through intake-import.mjs) is read into a draft
// (tools/intake/intake.mjs); the review (tools/intake/review.mjs) says
// what to ask, confirm and check. This file only draws it and passes on what
// the person does. The preview is the recipe page itself, drawn by
// assets/recipe-view.js as the editor's is, with the review's questions,
// guesses and checks added on its steps and ingredients. The original (the
// text read, or the web page's address) sits beside it.
//
// An unfinished review is kept in the browser (sss:intake), with the text it was
// read from, and offered back on return; Save clears it. Signed in to an account
// that can edit the site, the finished recipe is saved straight to the site
// (see "Saving" below); otherwise, or instead, it's copied, to add to recipes/
// by hand.
import { draftFromText } from "../tools/intake/intake.mjs";
import { startImport } from "./intake-import.mjs";
import {
  startReview, reviewOf, answerWait, answerServe, joinBack, splitBack, setPlanning, setHolds, setLink,
  updateIngredient, updateStep, setField, addIngredient, removeIngredient, addStep, removeStep, moveStep, moveIngredient,
  recipeToSave, slugOf, isTime, toKeep, fromKept,
} from "../tools/intake/review.mjs";

const { esc, toGroups, stepOrder, me } = window.SSS;
const { recipePageHTML } = window.SSSView;
const $ = (id) => document.getElementById(id);
const out = $("review");

let state = null;      // the review (tools/intake/review.mjs)
let editing = null;    // the part of the preview open for editing: "title", or a step or ingredient id
let copied = null;     // the recipe file, once "Copy recipe" has been pressed
let titles = {};       // recipe slugs -> titles, to link ingredients to the recipes that make them
let account = null;    // who's signed in ({ name, canEdit }), from the footer's /api/me
let saving = null;     // the last Save: { busy }, { published: { slug, title } }, or { error, problems, signIn }
let prepFirst = true;  // which order the preview shows steps in, when the recipe has both
let original = null;   // what the recipe was read from: { kind: "text" | "pdf", pages, name } or { kind: "page", url }
let originalOpen = false; // on a phone, whether the original is shown
let offer = null;      // an unfinished review from before, offered back
let published = false; // saved to the site, so there's nothing left to keep

me.then((m) => { account = m; draw(); });

fetch("recipes/index.json", { cache: "no-cache" })
  .then((r) => (r.ok ? r.json() : []))
  .then((index) => { titles = Object.fromEntries(index.map((r) => [r.slug, r.title])); })
  .catch(() => {});

// --- Keeping an unfinished review -----------------------------------------------

const KEEP = "sss:intake";
function keep() {
  if (published) return;
  try { localStorage.setItem(KEEP, JSON.stringify(toKeep(state, { original }))); } catch {}
}
function forget() {
  try { localStorage.removeItem(KEEP); } catch {}
}
function kept() {
  try { return fromKept(JSON.parse(localStorage.getItem(KEEP))); } catch { return null; }
}

function drawOffer() {
  const at = offer?.at && new Date(offer.at);
  $("kept").innerHTML = offer ? `<section class="intake-kept" aria-labelledby="kept-h">
    <h2 id="kept-h">Carry on with ${esc(offer.title || "the recipe you were adding")}?</h2>
    <p>You were adding it${at && !Number.isNaN(at.getTime()) ? ` on ${esc(at.toLocaleString())}` : ""} and didn't save it.</p>
    <div class="intake-row">
      <button class="btn intake-primary" type="button" data-act="carry-on">Carry on</button>
      <button class="btn" type="button" data-act="start-over">Start over</button>
    </div>
  </section>` : "";
}

$("kept").addEventListener("click", (e) => {
  const act = e.target.closest("button[data-act]")?.dataset.act;
  if (act === "carry-on") {
    const back = offer;
    offer = null;
    drawOffer();
    begin(back.state, back.original);
    out.querySelector('[data-key="part-title"]')?.focus();
  } else if (act === "start-over") {
    offer = null;
    forget();
    drawOffer();
    $("intake-h").focus();
  }
});

offer = kept();
drawOffer();

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
  show(draftFromText(texts, { category, titles: { ...titles } }), { kind: "text", pages: texts });
});

// A new draft, read from `from` (see `original` above).
function show({ recipe, flags }, from = null) {
  offer = null;
  drawOffer();
  begin(startReview(recipe, flags), from);
  keep();
  out.scrollIntoView({ block: "start" });
}

function begin(review, from) {
  state = review;
  original = from;
  published = false;
  originalOpen = false;
  editing = null;
  copied = null;
  saving = null;
  draw();
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

// An ingredient in the preview: the recipe page's own text for it (`shown`),
// as a button that opens it for editing, with its checks and linked recipe.
function ingredientHTML(i, review, shown) {
  const id = i.reviewId;
  const checks = review.checks.filter((c) => c.ingredient === id);
  const link = review.confirms.find((c) => c.kind === "link" && c.ingredient === id);
  if (editing === id) {
    return `<form class="intake-edit" data-form="ingredient" data-id="${esc(id)}">
      <label class="intake-field">Amount <input name="qty" value="${esc(i.qty || "")}" data-key="edit-qty"></label>
      <label class="intake-field">Ingredient <input name="item" value="${esc(i.item || "")}" data-key="edit-item"></label>
      <label class="intake-field">Note <input name="note" value="${esc(i.note || "")}" data-key="edit-note"></label>
      ${formButtons(id, "remove-ingredient")}
    </form>`;
  }
  return `<button class="intake-part" type="button" data-act="edit" data-id="${esc(id)}" data-key="part-${esc(id)}">${i.item ? shown : "New ingredient"}</button>
    ${checks.map((c) => `<p class="intake-flag">${esc(c.why)}</p>`).join("")}
    ${link ? `<div class="intake-guess">Made by <a href="recipe.html?r=${encodeURIComponent(link.recipe)}">${esc(titles[link.recipe] || link.recipe)}</a>
      ${link.required ? `<label><input type="checkbox" data-act="already-made" data-id="${esc(id)}"${link.alreadyMade ? " checked" : ""}> Usually already made or bought</label>` : ""}
      <button class="btn" type="button" data-act="unlink" data-id="${esc(id)}">Unlink</button></div>` : ""}`;
}

// Done, then moving and removing, as the editor's forms have them. Moving keeps
// what's typed, and the form stays open on the entry where it now is.
const formButtons = (id, remove) => `<div class="intake-row"><button class="btn intake-primary" type="submit" data-key="edit-done">Done</button>
  <button class="btn" type="button" data-act="move-up" data-id="${esc(id)}" data-key="edit-move-up">Move up</button>
  <button class="btn" type="button" data-act="move-down" data-id="${esc(id)}" data-key="edit-move-down">Move down</button>
  <button class="btn" type="button" data-act="${remove}" data-id="${esc(id)}" data-key="edit-remove">Remove</button></div>`;

function stepHTML(s, review) {
  const id = s.reviewId;
  if (editing === id) {
    return `<form class="intake-edit" data-form="step" data-id="${esc(id)}">
      <label class="intake-field">Step <textarea name="do" rows="3" data-key="edit-do">${esc(s.do || "")}</textarea></label>
      <label class="intake-field">Wait <input name="wait" value="${esc(s.wait || "")}" placeholder="e.g. 35 min, or leave empty" data-key="edit-wait"></label>
      ${formButtons(id, "remove-step")}
    </form>`;
  }
  const mine = (kind) => review.confirms.find((c) => c.kind === kind && c.step === id);
  const watch = mine("watch"), prep = mine("prep"), during = mine("during");
  const split = review.confirms.find((c) => c.kind === "split" && c.steps[0] === id);
  const joined = review.confirms.find((c) => c.kind === "joined" && c.steps[0] === id);
  const checks = review.checks.filter((c) => c.step === id);
  return `<button class="intake-part" type="button" data-act="edit" data-id="${esc(id)}" data-key="part-${esc(id)}">${esc(s.do || "New step")}</button>
    ${s.wait ? `<span class="step-wait">⏱ ${esc(s.wait)}</span>` : ""}
    ${s.cue ? `<span class="step-cue">✓ ${esc(s.cue)}</span>` : ""}
    ${s.prepOnly ? `<p class="intake-guess">Added: prep from the ingredient list. It shows only when steps are in prep-first order.</p>` : ""}
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
    ${checks.map((c) => `<p class="intake-flag">${esc(c.why)}</p>`).join("")}`;
}

const showsPrepFirst = (r) => prepFirst && stepOrder(r, true).differs;

function previewHTML() {
  return `<section class="section intake-preview" aria-labelledby="preview-h">
    <h2 id="preview-h">Preview</h2>
    <p class="muted">The recipe as it was read, as its page will show it. Tap any part to fix it.</p>
    <div class="recipe intake-page">${recipePageHTML(state.recipe, null, { prepFirst: showsPrepFirst(state.recipe) })}</div>
  </section>`;
}

// The recipe page, made editable, with the review's questions, guesses and
// checks on the parts they're about (as the editor decorates its preview).
function decorate(page, review) {
  const r = state.recipe;
  page.querySelectorAll(".start-row, .toolbar").forEach((n) => n.remove());

  // The title, description and yield: one form for all three.
  const h1 = page.querySelector("h1"), lede = page.querySelector(".lede");
  if (editing === "title") {
    h1.insertAdjacentHTML("beforebegin", `<form class="intake-edit" data-form="title">
      <label class="intake-field">Title <input name="title" value="${esc(r.title || "")}" data-key="edit-title"></label>
      <label class="intake-field">Description <textarea name="description" rows="3" data-key="edit-description">${esc(r.description || "")}</textarea></label>
      <label class="intake-field">Yield <input name="yield" value="${esc(r.yield || "")}" placeholder="Serves 4 · Makes 12 cups" data-key="edit-yield"></label>
      <div class="intake-row"><button class="btn intake-primary" type="submit" data-key="edit-done">Done</button></div></form>`);
    h1.remove();
    lede?.remove();
  } else {
    const part = (key, inner) => `<button class="intake-part" type="button" data-act="edit" data-id="title" data-key="${key}">${inner}</button>`;
    h1.innerHTML = part("part-title", esc(r.title || "Add a title"));
    if (lede) lede.innerHTML = part("part-description", esc(r.description));
    const yields = (r.yield || "").split(" · ").filter(Boolean).length;
    [...page.querySelectorAll(".facts .fact dd")].slice(0, yields).forEach((dd, k) => { dd.innerHTML = part(`part-yield-${k}`, dd.innerHTML); });
  }

  // How it's served, to confirm (baking, cocktails and components).
  const serving = review.confirms.find((c) => c.kind === "serve");
  const sections = page.querySelectorAll(":scope > section.section");
  const ingSection = page.querySelector("ul.ingredients")?.closest("section") || sections[page.querySelector(".before") ? 1 : 0];
  if (serving) ingSection.insertAdjacentHTML("beforebegin", servingHTML(serving.value, null, true, false));

  // Ingredients.
  const ings = toGroups(r.ingredients).flatMap((g) => g.items);
  page.querySelectorAll("input[data-ing]").forEach((box) => {
    const i = ings[Number(box.dataset.ing)];
    const li = box.closest("li");
    const shown = box.nextElementSibling.innerHTML;
    if (i && typeof i === "object") {
      li.innerHTML = ingredientHTML(i, review, shown);
      if (editing === i.reviewId) li.className = "intake-editing";
    } else li.innerHTML = shown;
  });
  if (review.checks.some((c) => c.kind === "amounts")) {
    ingSection.querySelector("h2").insertAdjacentHTML("afterend", `<p class="intake-flag">Check every amount against the original: fractions are where reading goes wrong.</p>`);
  }
  ingSection.insertAdjacentHTML("beforeend", `<button class="btn" type="button" data-act="add-ingredient" data-key="add-ingredient">Add ingredient</button>`);

  // Steps.
  const steps = toGroups(r.steps).flatMap((g) => g.items);
  page.querySelectorAll("li[data-step]").forEach((li) => {
    const s = steps[Number(li.dataset.step)];
    li.removeAttribute("tabindex");
    if (s && typeof s === "object") {
      li.innerHTML = stepHTML(s, review);
      if (editing === s.reviewId) li.className = "intake-editing";
    }
  });
  const stepSection = page.querySelector("#steps");
  stepSection.querySelector("#prep-first")?.setAttribute("data-key", "prep-first");
  const all = flatten(r.steps).filter((s) => s && typeof s === "object");
  const holds = review.confirms.find((c) => c.kind === "holds");
  stepSection.insertAdjacentHTML("beforeend", `<button class="btn" type="button" data-act="add-step" data-key="add-step">Add step</button>
    <label class="intake-field intake-holds">Keeps as long as you like after
      <select data-act="holds" data-key="holds">
        <option value="">Nowhere: it's made in one go</option>
        ${all.map((s, k) => `<option value="${esc(s.reviewId)}"${holds?.value === s.reviewId ? " selected" : ""}>Step ${k + 1}: ${esc((s.do || "").slice(0, 50))}${(s.do || "").length > 50 ? "…" : ""}</option>`).join("")}
      </select></label>`);

  // Notes, as a region of their own.
  const notes = [...sections].find((x) => x.querySelector(":scope > h2")?.textContent === "Notes");
  if (notes) {
    notes.querySelector(":scope > h2").id = "notes-h";
    notes.setAttribute("aria-labelledby", "notes-h");
  }
}

// What the recipe was read from, beside the preview (one tap away on a phone).
// Only shown here, never put in the recipe.
function originalHTML() {
  if (!original) return "";
  const o = original;
  const safe = o.kind === "page" && /^https?:\/\//i.test(o.url || "");
  const body = o.kind === "page"
    ? `<p>Read from the web page ${safe ? `<a href="${esc(o.url)}" rel="noopener noreferrer" target="_blank">${esc(o.url)}</a>` : esc(o.url)}. Open it to check the preview against it.</p>`
    : `${o.kind === "pdf" ? `<p class="muted">The text read from ${esc(o.name || "the PDF")}.</p>` : ""}
      ${o.pages.map((t, k) => `${o.pages.length > 1 ? `<h3>Page ${k + 1}</h3>` : ""}<pre class="intake-original-text">${esc(t)}</pre>`).join("")}`;
  return `<section class="intake-original${originalOpen ? " open" : ""}" aria-labelledby="original-h">
    <h2 id="original-h">The original</h2>
    <button class="btn intake-original-toggle" type="button" data-act="original" aria-expanded="${originalOpen}" aria-controls="original-body" data-key="original">${originalOpen ? "Hide" : "Show"} the original</button>
    <div class="intake-original-body" id="original-body" tabindex="0">${body}</div>
  </section>`;
}

function draw() {
  if (!state) return;
  const key = document.activeElement?.dataset?.key;
  const review = reviewOf(state);
  const listed = review.checks.filter((c) => !c.ingredient && !c.step && c.kind !== "amounts");
  const slug = slugOf(state.recipe.title);
  out.innerHTML = `<div class="intake-review${original ? " has-original" : ""}">
    ${originalHTML()}
    <div class="intake-main">
    ${review.asks.length ? `<section class="section intake-questions" aria-labelledby="questions-h">
      <h2 id="questions-h">Questions</h2>
      <p class="muted">What a menu needs to plan this recipe, and the text doesn't say.</p>
      ${review.asks.map(askHTML).join("")}
    </section>` : ""}
    ${previewHTML()}
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
      ${account?.canEdit ? saveHTML(review) : `<button class="btn intake-primary" type="button" data-act="copy"${review.ready ? "" : " disabled"}>Copy recipe</button>
        ${account?.canEdit === false ? `<p class="muted">This account can't edit this site, so it can't save here. Copy the recipe to add it by hand.</p>` : ""}`}
      ${copied ? `<p>Save it as <code>recipes/${esc(copied.slug)}.json</code>, then run <code>node scripts/build-index.mjs</code> and commit. <span role="status">${esc(copied.status)}</span></p>
        <label class="intake-field">Recipe file <textarea readonly rows="12">${esc(copied.json)}</textarea></label>` : ""}
      ${!copied && slug ? `<p class="muted">It'll be saved as <code>recipes/${esc(slug)}.json</code>.</p>` : ""}
    </section>
    </div>
  </div>`;
  decorate(out.querySelector(".intake-page"), review);
  const back = key && out.querySelector(`[data-key="${CSS.escape(key)}"]`);
  if (back) back.focus();
}

function update(next) {
  state = next;
  copied = null;
  saving = null;
  keep();
  draw();
}

// --- What the person does ----------------------------------------------------

// The values in an open form, applied to the review; null when they can't be
// (a wait the timer can't read, which the form then says).
function applyForm(f) {
  const data = Object.fromEntries(new FormData(f));
  if (f.dataset.form === "title") return ["title", "description", "yield"].reduce((s, k) => setField(s, k, data[k]), state);
  if (f.dataset.form === "ingredient") return updateIngredient(state, f.dataset.id, data);
  if (f.dataset.form === "step") {
    if (data.wait.trim() && !isTime(data.wait)) {
      f.querySelector("input[name=wait]").setCustomValidity('Give a time the timer can read, like "35 min", or leave it empty');
      f.reportValidity();
      return null;
    }
    return updateStep(state, f.dataset.id, data);
  }
  return state;
}

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
  else if (act === "move-up" || act === "move-down") {
    const form = b.closest("form");
    const next = applyForm(form);
    if (!next) return;
    update((form.dataset.form === "step" ? moveStep : moveIngredient)(next, id, act === "move-up" ? -1 : 1));
  } else if (act === "remove-ingredient") { editing = null; update(removeIngredient(state, id)); }
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
  } else if (act === "original") {
    originalOpen = !originalOpen;
    draw();
  } else if (act === "copy") await copy();
  else if (act === "save") await save();
});

out.addEventListener("submit", (e) => {
  e.preventDefault();
  const f = e.target;
  const next = applyForm(f);
  if (!next) return;
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
  if (t.id === "prep-first") { prepFirst = t.checked; draw(); }
  else if (serving && (t.name === "serve" || t.name === "sits")) {
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

// --- Saving ------------------------------------------------------------------
// Signed in to an account that can edit the site, Save publishes the new
// recipe through the Worker (POST /api/save, docs/specs/recipe-editor-plan.md,
// slice 6). Its file name comes from the title, and a name that's taken is
// refused. Copying stays, as "Copy instead".

function saveHTML(review) {
  const done = saving?.published;
  return `${done ? "" : `<div class="intake-row">
      <button class="btn intake-primary" type="button" data-act="save"${review.ready && !saving?.busy ? "" : " disabled"}>Save</button>
      <button class="btn" type="button" data-act="copy"${review.ready ? "" : " disabled"}>Copy instead</button>
    </div>`}
    <p class="intake-status" role="status">${saving?.busy ? "Saving…"
      : done ? `Published. The site updates in a minute or two. <a href="recipe.html?r=${encodeURIComponent(done.slug)}">See ${esc(done.title)} on the site</a>` : ""}</p>
    ${done ? `<p><a href="edit.html?r=${encodeURIComponent(done.slug)}">Keep editing it in the editor</a></p>` : ""}
    ${saving?.error ? `<div class="intake-problem" role="alert"><p>${esc(saving.error)}</p>
      ${saving.problems?.length ? `<ul>${saving.problems.map((p) => `<li>${esc(p)}</li>`).join("")}</ul>` : ""}
      ${saving.signIn ? `<p><a href="/api/signin?return=${encodeURIComponent(location.pathname)}">Sign in again</a></p>` : ""}</div>` : ""}`;
}

async function save() {
  const recipe = recipeToSave(state, { today: new Date().toLocaleDateString("en-CA") });
  const slug = slugOf(recipe.title);
  if (!slug) {
    saving = { error: "Give the recipe a title first: its file name is made from it." };
    return draw();
  }
  saving = { busy: true };
  draw();
  let res;
  try {
    res = await fetch("/api/save", {
      method: "POST", headers: { "Content-Type": "application/json" }, credentials: "same-origin", body: JSON.stringify({ slug, recipe }),
    });
  } catch {
    saving = { error: "Couldn't reach the site. Check your connection and try again, or copy the recipe instead." };
    return finished();
  }
  const answer = await res.json().catch(() => ({}));
  if (res.ok) {
    saving = { published: { slug, title: recipe.title } };
    published = true;
    forget();
  }
  else if (res.status === 401) saving = { error: "Your sign-in has run out. Copy the recipe first: signing in again leaves this page.", signIn: true };
  else saving = { error: answer.error || `Something went wrong (${res.status}). Try again, or copy the recipe instead.`, problems: answer.problems };
  finished();
}

// After a save: focus on the link to the published recipe, or back on Save
// (a problem is an alert, so it's read out).
function finished() {
  draw();
  out.querySelector(".intake-finish [role=status] a, .intake-finish [data-act=save]")?.focus();
}
