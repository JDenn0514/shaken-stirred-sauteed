// The recipe intake (intake.html): where a new recipe comes in. Pasted text (or
// a website or a PDF, through intake-import.mjs) is read into a draft
// (tools/intake/intake.mjs); the review (tools/intake/review.mjs) works out
// what to ask. This page asks it, beside the original, and shows the recipe as
// read. Then, signed in to an account that can edit the site, "Continue in the
// editor" opens it in the editor as a new recipe (edit.html?new), with the
// reader's guesses and checks, to finish and save there. Otherwise, or
// instead, it's copied, to add to recipes/ by hand.
//
// The review is kept in the browser (sss:intake) as it changes, with the text
// it was read from: that's what the editor opens, and what's offered back here
// on return. The editor's Save clears it.
import { draftFromText } from "../tools/intake/intake.mjs";
import { startImport } from "./intake-import.mjs";
import { originalHTML, AMOUNTS } from "./import-view.mjs";
import { startReview, reviewOf, answerWait, answerServe, recipeToSave, slugOf, toKeep, fromKept } from "../tools/intake/review.mjs";

const { esc, stepOrder, me } = window.SSS;
const { recipePageHTML } = window.SSSView;
const $ = (id) => document.getElementById(id);
const out = $("review");

let state = null;      // the review (tools/intake/review.mjs)
let copied = null;     // the recipe file, once "Copy recipe" has been pressed
let titles = {};       // recipe slugs -> titles, to link ingredients to the recipes that make them
let account = null;    // who's signed in ({ name, canEdit }), from the footer's /api/me
let prepFirst = true;  // which order the preview shows steps in, when the recipe has both
let original = null;   // what the recipe was read from: { kind: "text" | "pdf", pages, name } or { kind: "page", url }
let originalOpen = false; // on a phone, whether the original is shown
let offer = null;      // an unfinished review from before, offered back

me.then((m) => { account = m; draw(); });

fetch("recipes/index.json", { cache: "no-cache" })
  .then((r) => (r.ok ? r.json() : []))
  .then((index) => { titles = Object.fromEntries(index.map((r) => [r.slug, r.title])); })
  .catch(() => {});

// --- Keeping the review --------------------------------------------------------

const KEEP = "sss:intake";
function keep() {
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
    $("preview-h")?.focus();
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
  originalOpen = false;
  copied = null;
  draw();
}

// --- From a recipe website or a PDF (assets/intake-import.mjs) ---------------

startImport({ show, titles: () => titles });

// --- Drawing the review -------------------------------------------------------

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

// The recipe as read, as its page will show it. It's fixed in the editor.
function previewHTML() {
  const r = state.recipe;
  return `<section class="section intake-preview" aria-labelledby="preview-h">
    <h2 id="preview-h" tabindex="-1">Preview</h2>
    <p class="muted">The recipe as it was read, as its page will show it.${account?.canEdit ? " Fix anything read wrong in the editor." : ""}</p>
    <div class="recipe intake-page">${recipePageHTML(r, null, { prepFirst: prepFirst && stepOrder(r, true).differs })}</div>
  </section>`;
}

function draw() {
  if (!state) return;
  const key = document.activeElement?.dataset?.key || (document.activeElement?.id === "prep-first" ? "prep-first" : null);
  const review = reviewOf(state);
  const left = review.asks.filter((a) => !a.answered).length;
  const slug = slugOf(state.recipe.title);
  const checks = review.checks.filter((c) => c.kind !== "amounts");
  out.innerHTML = `<div class="with-original${original ? " has-original" : ""}">
    ${originalHTML(original, originalOpen)}
    <div class="with-original-main">
    ${review.asks.length ? `<section class="section intake-questions" aria-labelledby="questions-h">
      <h2 id="questions-h">Questions</h2>
      <p class="muted">What a menu needs to plan this recipe, and the text doesn't say.</p>
      ${review.asks.map(askHTML).join("")}
    </section>` : ""}
    ${previewHTML()}
    ${checks.length || review.checks.some((c) => c.kind === "amounts") ? `<section class="section intake-checks" aria-labelledby="checks-h">
      <h2 id="checks-h">Things to check</h2>
      <ul class="notes">
        ${review.checks.some((c) => c.kind === "amounts") ? `<li>${esc(AMOUNTS)}</li>` : ""}
        ${checks.map((c) => `<li>${c.text ? `<b>${esc(c.text)}</b>: ` : ""}${esc(c.why)}</li>`).join("")}
      </ul>
    </section>` : ""}
    <section class="section intake-finish" aria-labelledby="finish-h">
      <h2 id="finish-h">Finish</h2>
      ${finishHTML(review, left)}
      ${copied ? `<p>Save it as <code>recipes/${esc(copied.slug)}.json</code>, then run <code>node scripts/build-index.mjs</code> and commit. <span role="status">${esc(copied.status)}</span></p>
        <label class="intake-field">Recipe file <textarea readonly rows="12">${esc(copied.json)}</textarea></label>` : ""}
      ${!copied && slug ? `<p class="muted">It'll be saved as <code>recipes/${esc(slug)}.json</code>.</p>` : ""}
    </section>
    </div>
  </div>`;
  out.querySelectorAll(".intake-page .start-row, .intake-page .toolbar").forEach((n) => n.remove());
  out.querySelectorAll(".intake-page li[data-step]").forEach((li) => li.removeAttribute("tabindex"));
  out.querySelectorAll(".intake-page input[data-ing]").forEach((box) => box.closest("label").replaceWith(...box.closest("label").querySelector("span").childNodes));
  const notes = [...out.querySelectorAll(".intake-page > section.section")].find((x) => x.querySelector(":scope > h2")?.textContent === "Notes");
  if (notes) {
    notes.querySelector(":scope > h2").id = "notes-h";
    notes.setAttribute("aria-labelledby", "notes-h");
  }
  const back = key && (key === "prep-first" ? $("prep-first") : out.querySelector(`[data-key="${CSS.escape(key)}"]`));
  if (back) back.focus();
}

// Signed in to an account that can edit: on to the editor, once the questions
// are answered. Anyone else: copy the recipe file.
function finishHTML(review, left) {
  if (account?.canEdit) {
    return `${left ? `<p class="intake-problem">Still needed: ${left === 1 ? "1 question to answer" : `${left} questions to answer`}</p>` : ""}
      <div class="intake-row">
        ${left ? `<button class="btn intake-primary" type="button" disabled>Continue in the editor</button>`
          : `<a class="btn intake-primary" href="edit.html?new" data-key="continue">Continue in the editor</a>`}
        <button class="btn" type="button" data-act="copy"${review.ready ? "" : " disabled"}>Copy instead</button>
      </div>
      <p class="muted">The editor is where you fix what was read wrong, add tags, and save it to the site.</p>`;
  }
  return `${review.ready ? "" : `<p class="intake-problem">Still needed: ${esc(review.missing.join(", "))}</p>`}
    <button class="btn intake-primary" type="button" data-act="copy"${review.ready ? "" : " disabled"}>Copy recipe</button>
    ${account?.canEdit === false ? `<p class="muted">This account can't edit this site, so it can't save here. Copy the recipe to add it by hand.</p>` : ""}`;
}

function update(next) {
  state = next;
  copied = null;
  keep();
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
  else if (act === "original") {
    originalOpen = !originalOpen;
    draw();
  } else if (act === "copy") await copy();
});

out.addEventListener("change", (e) => {
  const t = e.target;
  const serving = t.closest("[data-serving]");
  if (t.id === "prep-first") { prepFirst = t.checked; draw(); }
  else if (serving && (t.name === "serve" || t.name === "sits")) {
    const serve = serving.querySelector("input[name=serve]:checked")?.value;
    const sits = serving.querySelector("input[name=sits]")?.value;
    if (serve) update(answerServe(state, serve, sits || sitsFor(serve, reviewOf(state).asks.find((a) => a.kind === "serve")?.guess)));
  }
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
