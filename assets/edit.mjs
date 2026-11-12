// The recipe editor (edit.html?r=<slug>). The recipe is shown as it will
// appear, its card and then its page, drawn by assets/recipe-view.js; each part
// of the page is a button that opens a field in place. "Details" holds what the
// page doesn't show: tags, source, date, kind, drawing, what each step uses, and
// the lineup's planning fields. The checks are assets/recipe-checks.js's, the
// same as the build's: errors turn Save off, warnings make a to-do list.
//
// Changes to the recipe are made by assets/edit-model.mjs, which keeps every
// field the editor has no control for. An unsaved draft is kept in the browser
// (sss:draft:<slug>) and offered back on return.
//
// A new recipe (edit.html?new) comes from the intake (intake.html), which reads
// it and asks its questions, then keeps the review in the browser (sss:intake).
// The editor opens that: the recipe, with the reader's guesses and checks on
// its steps and ingredients, and the original it was read from beside the
// preview (assets/import-view.mjs). Its file name is made from its title, and
// its first Save publishes it as a new file; from then on it's edited like any
// other recipe.
//
// The recipe is loaded from main through the Worker (GET /api/recipe/<slug>),
// with its file's version. Save sends it back with that version (POST
// /api/save), and the Worker publishes it, or refuses if the file changed since
// (docs/specs/recipe-editor-plan.md, slice 6). Delete asks you to type the
// recipe's name, and is off while another recipe links to it.
import * as M from "./edit-model.mjs";
import { explain } from "./edit-words.mjs";
import { numbering } from "./edit-numbers.mjs";
import { createHistory, changedLine } from "./edit-history.mjs";
import { factsForm, hintText, MINUTES } from "./edit-facts.mjs";
import { lineupFold as foldHTML } from "./edit-fold.mjs";
import { labelled, field, select, check, act, formButtons } from "./edit-html.mjs";
import { originalHTML, stepNotesHTML, ingredientNotesHTML, guessHTML, reviewAction, AMOUNTS } from "./import-view.mjs";
import { reviewOf, recipeToSave, slugOf, toKeep, fromKept } from "../tools/intake/review.mjs";

const { CATEGORIES, esc, getJSON, stepOrder, totalMinutes, signedIn: hinted } = window.SSS;
const { recipePageHTML, cardHTML } = window.SSSView;
const { checkRecipe, checkLinks, indexEntry, linkedFrom, patchIndex } = window.SSSChecks;
const ICONS = window.SSSIcons.KEYS;

const root = document.getElementById("editor");
const params = new URLSearchParams(location.search);
let slug = params.get("r") || "";
let fresh = !slug && params.has("new"); // a new recipe, from the intake, not saved yet
const draftKey = () => `sss:draft:${slug}`;
const KEPT_REVIEW = "sss:intake";      // the intake's review, which a new recipe is

let original = null;   // the recipe as it is on the site (loaded, or last saved)
let version = null;    // its file's version on main (git's blob SHA), sent with Save and Delete
let recipe = null;     // the recipe being edited
let vocab = null;      // recipes/vocabulary.json
let index = [];        // recipes/index.json
let editing = null;    // the part open for editing: "about", "ing:3", "step:2", "group:steps:0", "new-group:ingredients"
let opened = null;     // how it was when it opened, for Cancel: { before, added, back } (see openLine)
let prepFirst = true;  // which order the preview shows steps in, when the recipe has both
let ovenTemp = null;   // a step whose oven was just set to "At a temperature", before a temperature is typed
let detailsOpen = false;
let checksOpen = false; // the strip of to-dos and things to check
let lineupOpen = false; // the open step's "For the lineup" fold
let offer = null;      // an unsaved draft from before, offered back
let focusKey = null;   // what to focus after the next draw
let status = null;     // how the last save went: { saving }, { published }, or { error, problems, signIn }
let review = null;     // a new recipe's review from the intake (tools/intake/review.mjs), its recipe kept in `recipe`
let source = null;     // what a new recipe was read from: the original, shown beside the preview
let sourceOpen = false; // on a phone, whether the original is shown

const flat = (l = []) => l.flatMap((e) => (e && Array.isArray(e.items) ? e.items : [e]));
const ingName = (i) => (typeof i === "string" ? i : i?.item || "");
const stepText = (s) => (typeof s === "string" ? s : s?.do || "");
const short = (t, n = 60) => (t.length > n ? `${t.slice(0, n - 1)}…` : t);

// --- Signed in? ---------------------------------------------------------------------------

function gate(title, text) {
  document.title = `${title} · Shaken, Stirred & Sautéed`;
  root.innerHTML = `<h1>${esc(title)}</h1><p class="lede">${esc(text)}</p>`;
}

async function signedIn() {
  // The readable hint cookie says a sign-in happened; /api/me says whether it still holds.
  if (!hinted) return "out";
  try {
    const res = await fetch("/api/me", { cache: "no-store", credentials: "same-origin" });
    if (!res.ok) return "stale";
    // /api/me: { name, canEdit }, canEdit being push access to the site's repo.
    const me = await res.json().catch(() => ({}));
    return me.canEdit === false ? "no-access" : "in";
  } catch {
    return "stale";
  }
}

const signInHere = () => `/api/signin?return=${encodeURIComponent(location.pathname + location.search)}`;
const KEPT = "Your changes are kept in this browser.";

// --- Drafts ----------------------------------------------------------------------------

const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
function readDraft() {
  try { return JSON.parse(localStorage.getItem(draftKey())); } catch { return null; }
}
function keepDraft() {
  try {
    // A new recipe is the intake's review, kept as the intake keeps it.
    if (fresh) localStorage.setItem(KEPT_REVIEW, JSON.stringify(toKeep(withReview(), { original: source })));
    else if (same(recipe, original)) localStorage.removeItem(draftKey());
    // base: the version of the recipe the draft was made from, so a draft made
    // before a newer save (on another device or tab) can say so.
    else localStorage.setItem(draftKey(), JSON.stringify({ recipe, at: new Date().toISOString(), base: version }));
  } catch {}
}

// A new recipe's review, with the recipe as it is now.
const withReview = () => ({ ...review, recipe });
// The file name: a new recipe's is made from its title.
const fileName = () => (fresh ? slugOf(recipe.title) : slug);

// --- Checks ----------------------------------------------------------------------------

// The checker's errors and warnings for this recipe, with its links checked
// against the site's other recipes (the index, with this recipe's entry in it).
function checks() {
  const name = fileName();
  if (fresh && !name) {
    const { errors, warnings } = checkRecipe("new-recipe", recipe, vocab);
    return { errors, warnings };
  }
  const { errors, warnings } = checkRecipe(name, recipe, vocab);
  const mine = `recipes/${name}.json: `;
  const links = checkLinks(patchIndex(index, name, indexEntry(name, recipe, vocab)))
    .filter((e) => e.startsWith(mine) || (e.startsWith("recipe links loop:") && e.split(/ → |: /).includes(name)))
    .map((e) => (e.startsWith(mine) ? e.slice(mine.length) : e));
  // A new recipe can't take the name of one already on the site.
  const taken = fresh && index.some((e) => e.slug === name)
    ? [`There's already a recipe called recipes/${name}.json: give this one another "title", or open that one in the editor to change it.`] : [];
  return { errors: [...taken, ...errors, ...links], warnings };
}

// Which part of the page a message is about: a step (by its number), an
// ingredient (by its name) or the title.
// --- Step numbers as the sheet shows them --------------------------------------------
// The checker counts steps in the file's order. The sheet numbers them in the
// order it shows them: prep first moves prep up, and as written hides an added
// prep step. Messages keep the checker's numbers inside (partOf places them by
// it) and say the sheet's numbers to the reader.
const showingPrepFirst = () => stepOrder(recipe, true).differs && prepFirst;
// Step numbers and names as the sheet shows them now (assets/edit-numbers.mjs).
const numbers = () => numbering(recipe, stepOrder(recipe, showingPrepFirst()).steps);
const shownNumbers = () => numbers().shown;
const say = (text) => numbers().say(text);
const namesHidden = (text) => numbers().namesHidden(text);
const showPrepButton = (text) => (namesHidden(text)
  ? ` <button class="btn" type="button" data-act="show-prep" data-key="show-prep-${esc(text.slice(0, 40))}">Show prep first</button>` : "");

// A checker message in a cook's words (assets/edit-words.mjs), its steps
// numbered as the sheet shows them. A message the table doesn't know is said
// as the checker wrote it.
const words = (message) => say(explain(message)?.text ?? message);

// A button to where a message's fix is: its line, opened at the field, or the
// field in Details.
function goLabel(go) {
  if (go.label) return go.label;
  if (go.open === "step") return say(`Go to step ${go.n + 1}`);
  if (go.open === "ing") return `Go to ${go.name}`;
  if (go.open === "about") return "Go to the title";
  if (go.open === "facts") return "Go to the times";
  if (go.empty) return go.empty === "ing" ? "Go to the empty ingredient" : "Go to the empty step";
  if (go.field === "add-ingredients") return "Go to Ingredients";
  if (go.field === "add-steps") return "Go to Steps";
  return "Show in Details";
}
function goButton(message) {
  const go = explain(message)?.go;
  if (!go) return "";
  return ` <button class="btn" type="button" data-act="go" data-go="${esc(JSON.stringify(go))}" data-key="go-${esc(message.slice(0, 60))}">${esc(goLabel(go))}</button>`;
}
function goTo(go) {
  const ings = flat(recipe.ingredients), steps = flat(recipe.steps);
  const held = steps.findIndex((x) => x?.holds);
  const line = go.open === "step" ? `step:${go.n}`
    : go.holds ? `step:${held}`
    : go.open === "ing" ? `ing:${ings.findIndex((i) => ingName(i) === go.name)}`
    : go.open === "about" ? "about"
    : go.open === "facts" ? "facts"
    : go.empty === "ing" ? `ing:${ings.findIndex((i) => !ingName(i))}`
    : go.empty === "step" ? `step:${steps.findIndex((x) => !stepText(x))}` : null;
  const keys = go.holds ? [`d-holds-${held}`] : go.ingField ? [`d-${go.ingField}-${ings.findIndex((i) => ingName(i) === go.name)}`] : [go.field, go.or].filter(Boolean);
  if (line && !line.endsWith(":-1")) {
    const [kind, n] = line.split(":");
    // A step the sheet isn't showing (an added prep step, as written) is shown first.
    if (kind === "step" && !shownNumbers().has(Number(n))) prepFirst = true;
    openLine(line);
    // A step's lineup settings are in its fold.
    if (keys.some((k) => k.startsWith("d-"))) lineupOpen = true;
    if (!keys.length) {
      focusKey = kind === "about" ? "edit-title" : FIRST_FIELD[kind];
      if (kind === "ing" && typeof ings[Number(n)] === "string") focusKey = "edit-text";
      return draw();
    }
  } else {
    if (keys.some((k) => k.startsWith("d-")) || go.ingField) detailsOpen = true;
    editing = null;
  }
  draw();
  // By its key, the first whose key starts so for a key ending in "*", or
  // else the fallback, or else Details.
  const find = (k) => root.querySelector(k.endsWith("*") ? `[data-key^="${CSS.escape(k.slice(0, -1))}"]` : `[data-key="${CSS.escape(k)}"]`);
  const el = keys.map(find).find(Boolean) || (editing ? null : root.querySelector('[data-key="details"]'));
  el?.focus();
  el?.scrollIntoView({ block: "center" });
}

function partOf(message) {
  const step = /^step (\d+)\b/.exec(message);
  if (step) return { step: Number(step[1]) - 1 };
  const ing = /^"(.+?)"/.exec(message);
  if (ing) {
    const n = flat(recipe.ingredients).findIndex((i) => ingName(i) === ing[1]);
    if (n >= 0) return { ing: n };
  }
  if (/"title"/.test(message)) return { title: true };
  return {};
}

// Equipment a step mentions, from the checker's warning, and the field that says it.
const EQUIPMENT = [[/^(oven|broil)/i, "oven", "the oven"], [/grill/i, "grill", "the grill"], [/microwave/i, "microwave", "the microwave"],
  [/skillet|pan/i, "burner", "the burner"]];
const mentions = (w) => {
  const m = /^step (\d+) mentions "(.+?)"/.exec(w);
  if (!m) return null;
  const [, fieldName, what] = EQUIPMENT.find(([re]) => re.test(m[2])) || [null, "oven", "the oven"];
  return { step: Number(m[1]) - 1, field: fieldName, what };
};

// --- Drawing -------------------------------------------------------------------------------

function draw() {
  const active = document.activeElement;
  const key = focusKey || active?.dataset?.key;
  // The field being typed in keeps what's in it and where the cursor is: a
  // typed field only saves when you leave it, so the recipe may not have it yet.
  const live = !focusKey && active && ["INPUT", "TEXTAREA"].includes(active.tagName) && !["checkbox", "radio"].includes(active.type)
    ? { value: active.value, start: active.selectionStart, end: active.selectionEnd } : null;
  focusKey = null;
  const { errors, warnings } = checks();
  problemCount = errors.length;
  const name = fileName();
  const entry = indexEntry(name || "new-recipe", recipe, vocab);
  document.title = `${fresh ? "New recipe" : "Edit"}${recipe.title ? `: ${recipe.title}` : fresh ? "" : " a recipe"} · Shaken, Stirred & Sautéed`;
  const imported = fresh && review ? reviewOf(withReview()) : null;
  const unplaced = imported ? imported.checks.filter((c) => !c.step && !c.ingredient && c.kind !== "amounts") : [];
  root.classList.toggle("edit-wide", !!(fresh && source));
  const hasOrders = stepOrder(recipe, true).differs;
  const showPrepFirst = hasOrders && prepFirst;

  root.innerHTML = `<div class="with-original${fresh && source ? " has-original" : ""}">
    ${fresh ? originalHTML(source, sourceOpen) : ""}
    <div class="with-original-main">
    ${offer ? `<section class="edit-note" aria-labelledby="draft-h">
      <h2 id="draft-h">Unsaved changes</h2>
      <p>You changed this recipe on ${esc(new Date(offer.at).toLocaleString())} and didn't save. Editing it now starts from the recipe as it is on the site.</p>
      ${offer.base && offer.base !== version ? `<p><strong>The recipe has been saved since you made these changes</strong>, on another device or in another tab. If you bring them back, Save will stop and say so rather than replace what was saved.</p>` : ""}
      <div class="edit-row">
        <button class="btn edit-primary" type="button" data-act="restore" data-key="restore">Bring back my changes</button>
        <button class="btn" type="button" data-act="discard" data-key="discard">Discard them</button>
      </div>
    </section>` : ""}
    <div class="edit-bar" role="region" aria-label="Editing">
      <div class="edit-name">
        <p class="edit-title">${esc(recipe.title || (fresh ? "New recipe" : slug))}</p>
        <p class="edit-kicker">${fresh ? `New recipe · ${name ? `will be saved as <code>recipes/${esc(name)}.json</code>` : "give it a title, and its file name is made from it"}`
          : `Editing · ${esc(CATEGORIES[recipe.category]?.label || recipe.category || "")}`}</p>
      </div>
      <p class="edit-changes" id="edit-changes">${changesText()}</p>
      <div class="edit-row edit-history">
        <button class="btn" type="button" data-act="undo" data-key="undo"${canUndo() ? "" : " disabled"}>Undo</button>
        <button class="btn" type="button" data-act="redo" data-key="redo"${undoHistory.canRedo() ? "" : " disabled"}>Redo</button>
      </div>
      <button class="btn edit-primary" type="button" data-act="save" data-key="save"${errors.length || status?.saving ? ` disabled aria-describedby="save-why"` : !unsaved() ? ` disabled aria-describedby="edit-changes"` : ""}>Save</button>
      <p data-status-slot></p>
      ${status?.error ? `<div class="edit-save-error" role="alert">${failureHTML(status)}</div>` : ""}
    </div>
    ${errors.length ? `<section class="edit-problems" aria-labelledby="problems-h">
      <h2 id="problems-h">Problems to fix</h2>
      <ul>${errors.map((e) => `<li>${esc(words(e))}${showPrepButton(e)}${goButton(e)}</li>`).join("")}</ul>
    </section>` : ""}
    ${warnings.length + unplaced.length ? `<details class="edit-checks"${checksOpen ? " open" : ""} aria-label="${checkCount(warnings.length + unplaced.length)}">
    <summary data-key="checks">${checkCount(warnings.length + unplaced.length)}</summary>
    ${unplaced.length ? `<section class="edit-todo" aria-labelledby="import-checks-h">
      <h2 id="import-checks-h">Things to check</h2>
      <p class="muted">From reading the recipe in. The rest sit beside the step or ingredient they're about.</p>
      <ul>${unplaced.map((c) => `<li>${c.text ? `<b>${esc(c.text)}</b>: ` : ""}${esc(c.why)}</li>`).join("")}</ul>
    </section>` : ""}
    ${warnings.length ? `<section class="edit-todo" aria-labelledby="todo-h">
      <h2 id="todo-h">To do</h2>
      <p class="muted">These help the lineup plan a meal. They don't stop you saving.</p>
      <ul>${warnings.map(todoHTML).join("")}</ul>
    </section>` : ""}
    </details>` : ""}
    <section class="edit-card" aria-label="Card preview">
      <ul class="grid">${cardHTML(entry)}</ul>
    </section>
    <section class="recipe edit-preview" aria-label="Recipe preview"${entry.icon ? ` data-icon="${esc(entry.icon)}"` : ""}>
      ${recipePageHTML(recipe, vocab, { prepFirst: showPrepFirst })}
    </section>
    <details class="edit-details"${detailsOpen ? " open" : ""}>
      <summary data-key="details">Details</summary>
      ${detailsHTML()}
    </details>
    ${fresh ? "" : deleteHTML()}
    </div></div>`;

  // The status line is one element for the life of the page, moved into each
  // new bar, so screen readers read out what it says as it changes.
  root.querySelector("[data-status-slot]").replaceWith(statusLine);
  const said = errors.length ? `Fix ${errors.length === 1 ? "the problem" : `the ${errors.length} problems`} below to save.`
    : status?.saving ? "Saving…"
    : status?.published ? `Published. The site updates in a minute or two. <a href="recipe.html?r=${encodeURIComponent(slug)}">See ${esc(status.published)} on the site</a>`
    : note ? esc(note)
    : !unsaved() ? ""
    : fresh ? "Fix what was read wrong, check the guesses against the original, then save it to the site." : "";
  if (statusLine.innerHTML !== said) statusLine.innerHTML = said;
  decorate(root.querySelector(".edit-preview"), errors, showPrepFirst);
  root.querySelectorAll(".edit-card a[href]").forEach((a) => { a.tabIndex = -1; a.setAttribute("aria-disabled", "true"); });
  if (imported) importNotes(root.querySelector(".edit-preview"), imported);
  const back = key && root.querySelector(`[data-key="${CSS.escape(key)}"]`);
  if (back) back.focus();
  // A redraw can drop focus without a focusout, so check where it is now.
  typingInLine(inLineField(document.activeElement));
  measureBars();
  // A step's text opens with the cursor at the end, ready to add to it, and
  // so "Split here" splits nothing until the cursor is put somewhere.
  if (back && !live && back.matches("textarea[name=do], textarea[name=line]")) back.setSelectionRange(back.value.length, back.value.length);
  if (back && live && "value" in back) {
    back.value = live.value;
    // Some fields (type="url") have no cursor position to set.
    try { if (live.start != null) back.setSelectionRange(live.start, live.end); } catch {}
  }
}

// Why a save or delete didn't happen: the Worker's words, its list of
// problems, and a way to sign in again when that's what's needed.
function failureHTML({ error, problems, signIn }) {
  return `<p>${esc(error)}</p>
    ${problems?.length ? `<ul>${problems.map((p) => `<li>${esc(p)}</li>`).join("")}</ul>` : ""}
    ${signIn ? `<p><a href="${esc(signInHere())}">Sign in again</a></p>` : ""}`;
}

const checkCount = (n) => `${n} thing${n === 1 ? "" : "s"} to check`;

function todoHTML(w) {
  const m = mentions(w);
  const optional = /^"(.+?)" says it's optional/.exec(w);
  const ing = optional && flat(recipe.ingredients).findIndex((i) => ingName(i) === optional[1]);
  return `<li>${esc(words(w))}${showPrepButton(w)}${m || optional ? "" : goButton(w)}
    ${m ? `<span class="edit-row">
      <button class="btn" type="button" data-act="no-equipment" data-step="${m.step}" data-field="${m.field}" data-key="todo-no-${m.step}">${esc(say(`Step ${m.step + 1}`))} doesn't use ${esc(m.what)}</button>
      <button class="btn" type="button" data-act="set-equipment" data-step="${m.step}" data-field="${m.field}" data-key="todo-set-${m.step}">${esc(say(`Set step ${m.step + 1}`))}'s equipment</button>
    </span>` : ""}
    ${optional && ing >= 0 ? `<span class="edit-row"><button class="btn" type="button" data-act="mark-optional" data-ing="${ing}" data-key="todo-opt-${ing}">Mark it optional</button></span>` : ""}
  </li>`;
}

// --- The preview, made editable -------------------------------------------------------

const part = (target, key, inner) =>
  `<button class="edit-part" type="button" data-act="edit" data-target="${target}" data-key="${key}">${inner}</button>`;
// A visible way in, beside a line that can be edited: a pencil and "Edit"
// (only the pencil where space is tight). Its name says which line it opens.
const editButton = (target, key, name) =>
  `<button class="edit-open" type="button" data-act="edit" data-target="${target}" data-key="${key}" aria-label="${esc(name)}"><span class="edit-pencil" aria-hidden="true">✎</span><span class="edit-word" aria-hidden="true">Edit</span></button>`;
function aboutForm() {
  return `<form class="edit-form" data-form="about">
    ${field("Title", "title", recipe.title)}
    ${labelled("Description", `<textarea name="description" rows="3" data-key="edit-description">${esc(recipe.description || "")}</textarea>`)}
    ${formButtons()}
  </form>`;
}

function ingredientForm(n) {
  const i = flat(recipe.ingredients)[n];
  const moves = act("add-after", "Add an ingredient after this") + moveControls("ing", n) + act("remove", "Remove");
  if (typeof i === "string") {
    return `<form class="edit-form" data-form="ing" data-n="${n}">${field("Ingredient", "text", i)}${formButtons(moves)}</form>`;
  }
  return `<form class="edit-form" data-form="ing" data-n="${n}">
    <div class="edit-fields">
      ${field("Amount", "qty", i.qty)}
      ${field("Grams", "grams", i.grams, ` inputmode="decimal"`)}
      ${i.ml != null || recipe.category === "cocktails" ? field("Millilitres", "ml", i.ml, ` inputmode="decimal"`) : ""}
    </div>
    ${field("Ingredient", "item", i.item)}
    ${field("Note", "note", i.note)}
    ${formButtons(moves)}
  </form>`;
}

// Moving the open line: Move up and Move down (off where there's nowhere to
// go), and Move to, a list of every place under the group names. In
// prep-first order the sheet doesn't show the file's order, so a step can't be
// moved there: a button switches to As written instead.
const lineText = (kind, e) => (kind === "ing" ? ingName(e) || (typeof e === "string" ? e : "") : kind === "step" ? stepText(e) : e) || "";
function moveControls(kind, n) {
  if (kind === "step" && showingPrepFirst()) return act("as-written", "Switch to As written to reorder");
  const key = LIST[kind], items = flat(recipe[key]);
  const button = (name, label, on) => act(name, label).replace("<button ", `<button${on ? "" : " disabled"} `);
  const slots = M.moveSlots(recipe, key, n);
  if (slots.length < 2) return button("move-up", "Move up", false) + button("move-down", "Move down", false);
  const label = (s, k) => {
    if (s.here) return "Where it is now";
    if (s.before !== null) return `Before "${short(lineText(kind, items[s.before]), 40)}"`;
    if (s.group) return `At the end of ${s.group}`;
    const prev = slots[k - 1];
    return prev && prev.value.split(":")[0] === s.value.split(":")[0] && prev.before !== null ? `After "${short(lineText(kind, items[prev.before]), 40)}"` : "Here";
  };
  const option = (s, k) => `<option value="${s.value}"${s.here ? " selected" : ""}>${esc(label(s, k))}</option>`;
  const grouped = slots.some((s) => s.group);
  let options = "";
  if (!grouped) options = slots.map(option).join("");
  else {
    slots.forEach((s, k) => {
      const run = s.value.split(":")[0];
      if (!k || slots[k - 1].value.split(":")[0] !== run) options += `${k ? "</optgroup>" : ""}<optgroup label="${esc(s.group || "Not in a group")}">`;
      options += option(s, k);
    });
    options += "</optgroup>";
  }
  return button("move-up", "Move up", M.canMove(recipe, key, n, -1)) + button("move-down", "Move down", M.canMove(recipe, key, n, 1))
    + `<span class="edit-move-to">${labelled("Move to", `<select data-key="edit-move-to">${options}</select>`)}${act("move-to", "Move")}</span>`;
}

function stepForm(n) {
  const s = flat(recipe.steps)[n];
  const o = typeof s === "string" ? { do: s } : s || {};
  return `<form class="edit-form" data-form="step" data-n="${n}">
    ${labelled("Step", `<textarea name="do" rows="3" data-key="edit-do">${esc(o.do || "")}</textarea>`)}
    <div class="edit-fields">
      ${o.wait === false ? field("Wait", "wait", "", ` placeholder="Doesn't wait"`) : field("Wait", "wait", o.wait, ` placeholder="e.g. 20 min"`)}
      ${field("Cue", "cue", o.cue, ` placeholder="e.g. Golden at the edges"`)}
    </div>
    ${lineupFold(n)}
    ${formButtons(act("add-after", "Add a step after this") + moveControls("step", n) + act("split", "Split here")
      + (M.timedParts(o.do) > 1 ? act("split-times", "Split at each time") : "") + act("join", "Join with the next step") + act("remove", "Remove"))}
  </form>`;
}

// The lists a line belongs to, by the kind of line, and how each is changed.
const LIST = M.LISTS;
const KIND = Object.fromEntries(Object.entries(LIST).map(([k, v]) => [v, k]));
const FIRST_FIELD = { ing: "edit-item", step: "edit-do", note: "edit-line", start: "edit-line" };
function ops(kind) {
  if (kind === "ing") return { add: M.addIngredient, remove: M.removeIngredient, move: M.moveIngredient };
  if (kind === "step") return { add: M.addStep, remove: M.removeStep, move: M.moveStep };
  const key = LIST[kind];
  return { add: (r, where) => M.addLine(r, key, where), remove: (r, n) => M.removeLine(r, key, n), move: (r, n, dir) => M.moveLine(r, key, n, dir) };
}

// Notes and Before you start: plain lines, each opening in place. A section
// with nothing in it shows a ghost row that adds the first line. Notes may
// have groups; Before you start never does.
const LINES = {
  note: { heading: "Notes", label: "Note", one: "Add a note", group: "Add a group of notes", ghost: "No notes yet. Add one",
    after: "Add a note after this", empty: "Empty note: add what it says", name: (k) => `Edit note ${k + 1}` },
  start: { heading: "Before you start", label: "Before you start", one: "Add a line", ghost: "Nothing to do before you start. Add one",
    after: "Add a line after this", empty: "Empty line: add what to do first", name: (k) => `Edit Before you start, line ${k + 1}` },
};
function lineForm(kind, n) {
  const L = LINES[kind];
  return `<form class="edit-form" data-form="${kind}" data-n="${n}">
    ${labelled(L.label, `<textarea name="line" rows="2" data-key="edit-line">${esc(flat(recipe[LIST[kind]])[n] ?? "")}</textarea>`)}
    ${formButtons(act("add-after", L.after) + moveControls(kind, n) + act("remove", "Remove"))}
  </form>`;
}
function linesSection(kind) {
  const L = LINES[kind], list = LIST[kind];
  let n = 0;
  const line = (text) => {
    const k = n++;
    return `<li>${editing === `${kind}:${k}` ? lineForm(kind, k)
      : part(`${kind}:${k}`, `part-${kind}-${k}`, text ? esc(text) : L.empty) + editButton(`${kind}:${k}`, `edit-${kind}-${k}`, L.name(k))}</li>`;
  };
  // As the page groups them (toGroups), but keeping a line left empty, which is being written.
  const runs = [];
  for (const e of recipe[list] || []) {
    if (e && Array.isArray(e.items)) runs.push({ group: e.group || "", items: e.items });
    else if (runs.at(-1)?.plain) runs.at(-1).items.push(e);
    else runs.push({ group: "", items: [e], plain: true });
  }
  const body = runs.map((g) => `${g.group ? `<h3>${esc(g.group)}</h3>` : ""}<ul class="notes">${g.items.map(line).join("")}</ul>`).join("");
  const empty = !n;
  const ghost = empty ? `<button class="edit-ghost" type="button" data-act="add" data-list="${list}" data-key="add-${list}">${esc(L.ghost)}</button>` : "";
  const adds = [empty ? "" : `<button class="btn" type="button" data-act="add" data-list="${list}" data-key="add-${list}">${L.one}</button>`,
    !L.group ? "" : editing === `new-group:${list}` ? groupForm("new-group", "", list)
      : `<button class="btn" type="button" data-act="edit" data-target="new-group:${list}" data-key="add-group-${list}">${L.group}</button>`].join("");
  return `<section class="section${kind === "start" ? " before" : ""}"${kind === "note" ? ` id="notes"` : ""} aria-labelledby="${kind}-lines-h">
    <h2 id="${kind}-lines-h">${L.heading}</h2>${body}${ghost}${adds ? `<div class="edit-row edit-adds">${adds}</div>` : ""}</section>`;
}

const groupForm = (form, value, list, g = "") => `<form class="edit-form" data-form="${form}" data-list="${list}" data-g="${g}">
  ${field("Group name", "group", value)}${formButtons()}</form>`;

// Named sections of a list, in order: the headings on the page.
const namedGroups = (list) => (recipe[list] || []).filter((e) => e && Array.isArray(e.items) && e.group).map((e) => e.group);

function decorate(page, errors, showPrepFirst) {
  // Links in the preview go nowhere here: following one would leave the
  // editor. They keep their href, which the section colours are read from.
  page.querySelectorAll("a[href]").forEach((a) => { a.tabIndex = -1; a.setAttribute("aria-disabled", "true"); });
  page.querySelectorAll(".start-row, .toolbar").forEach((n) => n.remove());

  // The title and description: one form for both.
  const h1 = page.querySelector("h1"), lede = page.querySelector(".lede");
  const factsBox = page.querySelector("dl.facts");
  if (editing === "about") {
    h1.insertAdjacentHTML("beforebegin", aboutForm());
    h1.remove();
    lede?.remove();
  } else {
    h1.innerHTML = part("about", "part-title", esc(recipe.title || "Add a title"));
    if (lede) lede.innerHTML = part("about", "part-description", esc(recipe.description));
  }
  // The facts box: its yield and times open the facts form, at the field
  // that was tapped (its key, after "-f-").
  if (editing === "facts") {
    if (factsBox) factsBox.outerHTML = factsForm(recipe);
    else (lede || page.querySelector("h1, form[data-form=about]")).insertAdjacentHTML("afterend", factsForm(recipe));
  } else if (factsBox) {
    const yields = (recipe.yield || "").split(" · ").filter(Boolean).length;
    const t = recipe.time || {};
    const timed = recipe.times ? recipe.times.flatMap(([, v], i) => (v != null && v !== "" ? [`edit-tv-${i}`] : []))
      : ["prep", "cook", "chill"].filter((k) => t[k] != null).map((k) => `edit-time-${k}`).concat(totalMinutes(t) != null ? ["edit-time-total"] : []);
    // Then the section's own facts, in the order the page prints them.
    const more = ["pan", "heat", "abv", "standardDrinks", "keeps", "glass", "ice", "method", "garnish"]
      .filter((k) => recipe[k] != null && recipe[k] !== false && recipe[k] !== "").map((k) => `edit-x-${k}`);
    const fields = [...Array(yields).fill("edit-yield"), ...timed, ...more];
    [...factsBox.querySelectorAll(".fact dd")].slice(0, fields.length).forEach((dd, k) => { dd.innerHTML = part("facts", `part-facts-${k}-f-${fields[k]}`, dd.innerHTML); });
  }
  if (editing !== "about" && editing !== "facts") {
    const adds = [!recipe.description && part("about", "part-add-description", "Add a description"),
      !recipe.yield && part("facts", "part-facts-add-f-edit-yield", "Add a yield")].filter(Boolean);
    if (adds.length) (lede || h1).insertAdjacentHTML("afterend", `<p class="edit-add-line">${adds.join(" ")}</p>`);
  }

  // Ingredients.
  const ings = flat(recipe.ingredients);
  page.querySelectorAll("input[data-ing]").forEach((box) => {
    const n = Number(box.dataset.ing);
    const li = box.closest("li");
    li.dataset.ingRow = n;
    if (editing === `ing:${n}`) li.innerHTML = ingredientForm(n);
    else {
      const text = box.nextElementSibling.innerHTML;
      li.innerHTML = part(`ing:${n}`, `part-ing-${n}`, ingName(ings[n]) ? text : "Empty ingredient: add its name")
        + editButton(`ing:${n}`, `edit-ing-${n}`, ingName(ings[n]) ? `Edit ${ingName(ings[n])}` : "Edit the empty ingredient");
    }
  });
  const ingSection = page.querySelector("ul.ingredients")?.closest("section") || page.querySelectorAll("section.section")[page.querySelector(".before") ? 1 : 0];
  editableGroups(ingSection, "ingredients", true);
  ingSection.insertAdjacentHTML("beforeend", addButtons("ingredients", "Add ingredient", "Add a group of ingredients"));

  // Steps.
  const steps = flat(recipe.steps);
  page.querySelectorAll("li[data-step]").forEach((li, shown) => {
    const n = Number(li.dataset.step);
    li.removeAttribute("tabindex");
    if (editing === `step:${n}`) li.innerHTML = stepForm(n);
    else li.innerHTML = part(`step:${n}`, `part-step-${n}`, stepText(steps[n]) ? li.innerHTML : "Empty step: add what to do")
      + editButton(`step:${n}`, `edit-step-${n}`, `Edit step ${shown + 1}`);
  });
  // Numbering carries on across step groups, as on the recipe page (set here,
  // not inline, so the Content-Security-Policy can forbid inline styles).
  page.querySelectorAll("ol.steps[data-start]").forEach((ol) => { ol.style.counterReset = `step ${ol.dataset.start}`; });
  const stepSection = page.querySelector("#steps");
  // In prep-first order the headings are the order's own ("Prep", "Cooking"), not the recipe's groups.
  editableGroups(stepSection, "steps", !showPrepFirst);
  stepSection.insertAdjacentHTML("beforeend", addButtons("steps", "Add step", "Add a group of steps"));
  stepSection.querySelector("#prep-first")?.setAttribute("data-key", "prep-first");

  // Before you start, then Notes, drawn here with every line, empty ones too.
  const before = page.querySelector("section.before");
  if (before) before.outerHTML = linesSection("start");
  else ingSection.insertAdjacentHTML("beforebegin", linesSection("start"));
  page.querySelector("#notes")?.remove();
  stepSection.insertAdjacentHTML("afterend", linesSection("note"));
  editableGroups(page.querySelector("#notes"), "notes", true);

  // Errors beside what they're about.
  const notes = new Map();
  errors.forEach((e, k) => {
    const p = partOf(e);
    const at = p.step !== undefined ? page.querySelector(`li[data-step="${p.step}"]`)
      : p.ing !== undefined ? page.querySelector(`li[data-ing-row="${p.ing}"]`)
      : p.title ? page.querySelector("h1, form[data-form=about]") : null;
    if (!at) return;
    const id = `error-${k}`;
    if (at.matches("h1, form")) at.insertAdjacentHTML("afterend", `<p class="edit-error" id="${id}">${esc(words(e))}</p>`);
    else at.insertAdjacentHTML("beforeend", `<p class="edit-error" id="${id}">${esc(words(e))}</p>`);
    const button = at.querySelector(".edit-part") || at.querySelector(".edit-part, button");
    if (button) notes.set(button, [...(notes.get(button) || []), id]);
  });
  for (const [button, ids] of notes) button.setAttribute("aria-describedby", ids.join(" "));
}

// A new recipe's guesses and checks from the intake, on the step or
// ingredient they're about (not while it's open for editing).
function importNotes(page, imported) {
  const titles = Object.fromEntries(index.map((e) => [e.slug, e.title]));
  const steps = flat(recipe.steps), ings = flat(recipe.ingredients);
  page.querySelectorAll("li[data-step]").forEach((li) => {
    const n = Number(li.dataset.step);
    if (editing !== `step:${n}`) li.insertAdjacentHTML("beforeend", stepNotesHTML(steps[n], imported));
  });
  page.querySelectorAll("li[data-ing-row]").forEach((li) => {
    const n = Number(li.dataset.ingRow);
    if (editing !== `ing:${n}`) li.insertAdjacentHTML("beforeend", ingredientNotesHTML(ings[n], imported, titles));
  });
  if (imported.checks.some((c) => c.kind === "amounts")) {
    const ingHead = (page.querySelector("ul.ingredients")?.closest("section") || page.querySelector("section.section"))?.querySelector("h2");
    ingHead?.insertAdjacentHTML("afterend", `<p class="import-check">${esc(AMOUNTS)}</p>`);
  }
}

// Group headings as buttons that rename them (when they're the recipe's own),
// and the form for a group being renamed.
function editableGroups(section, list, own) {
  const names = namedGroups(list);
  const heads = [...section.querySelectorAll(":scope > h3")];
  if (!own || heads.length !== names.length) return;
  heads.forEach((h3, g) => {
    if (editing === `group:${list}:${g}`) {
      h3.insertAdjacentHTML("beforebegin", groupForm("group", names[g], list, g));
      h3.remove();
    } else h3.innerHTML = part(`group:${list}:${g}`, `part-group-${list}-${g}`, esc(names[g]));
  });
}

function addButtons(list, one, group) {
  return `<div class="edit-row edit-adds">
    <button class="btn" type="button" data-act="add" data-list="${list}" data-key="add-${list}">${one}</button>
    ${editing === `new-group:${list}` ? groupForm("new-group", "", list)
      : `<button class="btn" type="button" data-act="edit" data-target="new-group:${list}" data-key="add-group-${list}">${group}</button>`}
  </div>`;
}

// --- Details --------------------------------------------------------------------------------

const SERVE = { hot: "Hot: eat within a few minutes", soon: "Soon: fine for half an hour", keeps: "Keeps: made ahead, or eaten at room temperature" };

function detailsHTML() {
  const r = recipe;
  const fallback = M.servingFallback(r);
  const auto = window.SSSIcons.iconFor({ ...r, icon: undefined });
  return `<div class="edit-details-body">
    <fieldset class="edit-set"><legend>About</legend>
      ${select("Kind", "kind", [["", "Dish"], ["component", "Component (used in other recipes)"]], r.kind === "component" ? "component" : "", ` data-act="field" data-field="kind" data-key="d-kind"`)}
      ${select("Drawing", "icon", [["", `Picked for you (${auto || "none"})`], ...ICONS.map((k) => [k, k])], r.icon || "", ` data-act="field" data-field="icon" data-key="d-icon"`)}
      ${labelled("Date added", `<input type="date" value="${esc(r.added || "")}" data-act="field" data-field="added" data-key="d-added">`)}
      ${labelled("Source", `<input value="${esc(r.source?.name || "")}" data-act="field" data-field="source.name" data-key="d-source-name" placeholder="A book, a site or a person">`)}
      ${labelled("Source link", `<input type="url" value="${esc(r.source?.url || "")}" data-act="field" data-field="source.url" data-key="d-source-url" placeholder="https://…">`)}
    </fieldset>
    <fieldset class="edit-set"><legend>Serving</legend>
      ${select("How it's served", "serve", [["", `Not set: ${SERVE[fallback.serve].split(":")[0].toLowerCase()}${fallback.sits ? `, up to ${fallback.sits}` : ""}`], ...Object.entries(SERVE)], r.serve || "", ` data-act="field" data-field="serve" data-key="d-serve"`)}
      ${(r.serve || fallback.serve) !== "keeps" ? `${labelled("Can sit for", `<input value="${esc(r.sits || "")}" placeholder="${esc(fallback.sits)}" data-act="field" data-field="sits" data-key="d-sits">`)}` : ""}
    </fieldset>
    ${tagsHTML()}
    <fieldset class="edit-set"><legend>Ingredients</legend>
      ${flat(r.ingredients).map(ingredientDetails).join("")}
    </fieldset>
    <fieldset class="edit-set"><legend>Steps</legend>
      <p class="muted">Each step's settings for the lineup are on the step: open it, then "For the lineup".</p>
      <div class="edit-row"><button class="btn" type="button" data-act="add-prep" data-key="d-add-prep">Add a prep step</button></div>
      <p class="muted">A prep step is prep hidden in an ingredient line ("minced garlic"). It shows only when steps are in prep-first order.</p>
    </fieldset>
  </div>`;
}

function tagsHTML() {
  const cat = recipe.category;
  const tags = recipe.tags && typeof recipe.tags === "object" && !Array.isArray(recipe.tags) ? recipe.tags : {};
  const dims = vocab.dimensions.filter((d) => !d.computed && d.sections.includes(cat));
  return `<fieldset class="edit-set"><legend>Tags</legend>
    ${dims.map((d) => {
      const groups = d.valuesBySection ? [{ label: "", values: d.valuesBySection[cat] || [] }] : d.groups || [{ label: "", values: d.values || [] }];
      const on = new Set(tags[d.key] || []);
      return `<fieldset class="edit-tags"><legend>${esc(d.label)}</legend>
        ${groups.map((g) => `${g.label ? `<p class="edit-subhead">${esc(g.label)}</p>` : ""}<div class="edit-chips">
          ${g.values.map((v) => check(v.label, ` data-act="tag" data-dim="${esc(d.key)}" value="${esc(v.key)}" data-key="d-tag-${esc(d.key)}-${esc(v.key)}"`, on.has(v.key))).join("")}
        </div>`).join("")}
      </fieldset>`;
    }).join("")}
  </fieldset>`;
}

function ingredientDetails(i, n) {
  const o = typeof i === "string" ? {} : i || {};
  const others = index.filter((e) => e.slug !== slug);
  const options = [["", "Not made by a recipe"], ...others.map((e) => [e.slug, e.title])];
  if (o.recipe && !others.some((e) => e.slug === o.recipe)) options.push([o.recipe, `${o.recipe} (not on the site)`]);
  return `<fieldset class="edit-ing"><legend>${esc(ingName(i) || `Ingredient ${n + 1}`)}</legend>
    ${select("Made by another recipe", "recipe", options, o.recipe || "", ` data-act="ing-field" data-n="${n}" data-field="recipe" data-key="d-recipe-${n}"`)}
    ${check("Optional", ` data-act="ing-check" data-n="${n}" data-field="optional" data-key="d-optional-${n}"`, o.optional === true)}
    ${o.recipe && !o.optional ? check("Usually already made or bought", ` data-act="ing-check" data-n="${n}" data-field="alreadyMade" data-key="d-made-${n}"`, o.alreadyMade === true) : ""}
  </fieldset>`;
}

// A step's settings for the lineup, folded under the open step
// (assets/edit-fold.mjs). It opens by itself when one of them has a problem or
// a to-do. On a new recipe, the intake's own guesses ("Needs you there",
// "Done while an earlier step waits") stand in for the editor's while they're
// still to confirm.
function lineupFold(n) {
  const s = flat(recipe.steps)[n];
  const o = typeof s === "string" ? { do: s } : s || {};
  const { errors, warnings } = checks();
  const flagged = [...errors, ...warnings].some((m) => partOf(m).step === n && (mentions(m) || (explain(m)?.go?.field || "").startsWith("d-")));
  const imported = fresh && review && o.reviewId ? reviewOf(withReview()) : null;
  const guess = (kind) => imported?.confirms.find((c) => c.kind === kind && c.step === o.reviewId);
  const watch = guess("watch"), during = guess("during");
  return foldHTML(recipe, n, {
    open: lineupOpen || flagged,
    named: shownNumbers().has(n) ? `step ${shownNumbers().get(n)}` : "the added prep step",
    ovenTemp,
    watchGuess: watch ? guessHTML("watch", o.reviewId, watch.value) : "",
    duringGuess: during ? guessHTML("during", o.reviewId, during.value) : "",
  });
}

// --- Deleting --------------------------------------------------------------------------------

// The recipes that link to this one, from the site's index: while there are
// any, it can't be deleted.
const usedBy = () => linkedFrom(index, slug).filter((l) => l.slug !== slug);
const usesSaid = (users) => users.map((l) => `${l.title} uses this recipe for its "${l.item}"`).join("; ");

function deleteHTML() {
  const users = usedBy();
  return `<section class="edit-delete" aria-label="Delete">
    <button class="btn edit-danger" type="button" data-act="delete" data-key="delete"${users.length ? ` disabled aria-describedby="delete-why"` : ""}>Delete this recipe</button>
    ${users.length ? `<p class="muted" id="delete-why">${esc(usesSaid(users))}. Take ${users.length === 1 ? "that link" : "those links"} out to delete it.</p>` : ""}
  </section>`;
}

// The confirmation: a dialog outside the editor's drawing, so redrawing never closes it.
const dialog = document.createElement("dialog");
dialog.className = "edit-dialog";
dialog.setAttribute("aria-labelledby", "delete-title");
document.body.append(dialog);

function openDelete() {
  const name = original.title || slug;
  dialog.innerHTML = `<div class="edit-dialog-body">
    <h2 id="delete-title">Delete ${esc(name)}?</h2>
    <p>This takes it off the site for good. To be sure, type its name: <strong>${esc(name)}</strong></p>
    <div class="edit-field"><label for="delete-name">Recipe name</label><input id="delete-name" autocomplete="off" spellcheck="false"></div>
    <div class="edit-save-error" role="alert" id="delete-problem"></div>
    <div class="edit-row">
      <button class="btn edit-danger" type="button" data-act="confirm-delete" disabled>Delete</button>
      <button class="btn" type="button" data-act="cancel-delete">Cancel</button>
    </div>
  </div>`;
  dialog.showModal();
  dialog.querySelector("#delete-name").focus();
}

const typedRight = () => dialog.querySelector("#delete-name").value.trim().toLowerCase() === (original.title || slug).trim().toLowerCase();
dialog.addEventListener("input", () => {
  dialog.querySelector("[data-act=confirm-delete]").disabled = !typedRight();
});
dialog.addEventListener("keydown", (e) => {
  if (e.key === "Enter" && e.target.id === "delete-name" && typedRight()) dialog.querySelector("[data-act=confirm-delete]").click();
});
// Closed by Cancel or Escape: back to the Delete button.
dialog.addEventListener("close", () => {
  if (root.isConnected) root.querySelector('[data-key="delete"]')?.focus();
});
dialog.addEventListener("click", async (e) => {
  const b = e.target.closest("button[data-act]");
  if (b?.dataset.act === "cancel-delete") return dialog.close();
  if (b?.dataset.act !== "confirm-delete" || !typedRight()) return;
  const problem = dialog.querySelector("#delete-problem");
  b.disabled = true;
  problem.innerHTML = "";
  const done = await send("/api/delete", { slug, baseSha: version });
  if (done.error) {
    b.disabled = false;
    problem.innerHTML = failureHTML(done);
    return;
  }
  try { localStorage.removeItem(draftKey()); } catch {}
  const title = original.title || slug;
  dialog.remove();
  gate(`Deleted ${title}`, "The site updates in a minute or two.");
  root.insertAdjacentHTML("beforeend", `<p><a href="recipes.html">All recipes</a></p>`);
  const h1 = root.querySelector("h1");
  h1.tabIndex = -1;
  h1.focus();
});

// --- Saving --------------------------------------------------------------------------------

// Sends a save or delete to the Worker. The answer's JSON, or { error, problems, signIn }.
async function send(path, body) {
  let res;
  try {
    res = await fetch(path, { method: "POST", headers: { "Content-Type": "application/json" }, credentials: "same-origin", body: JSON.stringify(body) });
  } catch {
    return { error: `Couldn't reach the site. Check your connection and try again. ${KEPT}` };
  }
  const answer = await res.json().catch(() => ({}));
  if (res.ok) return answer;
  if (res.status === 401) return { error: `Your sign-in has run out. ${KEPT}`, signIn: true };
  return { error: answer.error || `Something went wrong (${res.status}). ${KEPT}`, problems: answer.problems };
}

// What's saved leaves out note and Before you start lines left empty; an open
// one that's taken out closes.
function tidyLines() {
  const tidy = M.withoutEmptyLines(recipe);
  if (same(tidy, recipe)) return;
  recipe = tidy;
  editing = null;
  opened = null;
}
async function save() {
  tidyLines();
  if (fresh) return saveNew();
  status = { saving: true };
  draw();
  const done = await send("/api/save", { slug, recipe, baseSha: version });
  if (done.error) status = done;
  else {
    original = structuredClone(recipe);
    version = done.sha;
    keepDraft();
    forgetHistory();
    status = { published: recipe.title || slug };
  }
  focusKey = "save";
  draw();
}

// A new recipe's first Save: published under a name made from its title, with
// the review's marks taken off. From then on it's that recipe, edited as any
// other, and the intake has nothing left to offer back.
async function saveNew() {
  const name = fileName();
  const saved = recipeToSave(withReview(), { today: new Date().toLocaleDateString("en-CA") });
  status = { saving: true };
  draw();
  const done = await send("/api/save", { slug: name, recipe: saved });
  if (done.error) status = done;
  else {
    try { localStorage.removeItem(KEPT_REVIEW); } catch {}
    fresh = false;
    slug = name;
    recipe = saved;
    original = structuredClone(saved);
    version = done.sha;
    review = null;
    source = null;
    history.replaceState(null, "", `edit.html?r=${encodeURIComponent(slug)}`);
    forgetHistory();
    status = { published: saved.title || slug };
  }
  focusKey = "save";
  draw();
}

// --- What the person does ----------------------------------------------------------------------

// What to focus for a part once its form closes: its line on the page.
function partKey(target) {
  if (target === "about") return "part-title";
  if (target === "facts") return "part-facts-0-f-edit-yield";
  const [kind, a, b] = target.split(":");
  return kind === "group" ? `part-group-${a}-${b}` : kind === "new-group" ? `add-group-${a}` : `part-${kind}-${a}`;
}

// Opens a part for editing, remembering the recipe as it was for Cancel.
// added: the line was just added, so Cancel takes it out again. back: what
// to focus after Cancel (the part's own line, unless it was just added).
function openLine(target, { added = false, back = partKey(target), before = recipe } = {}) {
  commit(); // what was typed in the line being left is one step
  if (target !== editing) lineupOpen = false;
  editing = target;
  opened = { before, added, back };
}

// Cancel (or Escape): the open part goes back as it was, and a line that was
// just added comes out again. Changes made elsewhere meanwhile are kept.
function cancel() {
  const was = editing;
  const { before, added, back } = opened || { back: partKey(was) };
  editing = null;
  opened = null;
  focusKey = back;
  const [kind, n] = was.split(":");
  if (added && kind in LIST) return update(ops(kind).remove(recipe, Number(n)), () => { focusKey = back; });
  if (before && (was === "about" || was === "facts" || kind in LIST)) return update(M.putBack(recipe, before, was), () => { focusKey = back; });
  draw();
}

// --- Undo and redo ----------------------------------------------------------------------------
// Each change that lands is a step back; what's typed in an open line becomes
// one step when the line closes or another opens (assets/edit-history.mjs).
// A new recipe's steps keep its review too. Up to 50, cleared on Save.
const undoHistory = createHistory();
const snapshot = () => ({ recipe: structuredClone(recipe), review: review && structuredClone(review) });
const commit = () => undoHistory.commit(snapshot());
const forgetHistory = () => undoHistory.reset(snapshot());
const canUndo = () => undoHistory.canUndo(snapshot());
function travel(go, said) {
  // A typed Details field still waiting to land lands first, so it's what
  // Undo takes back.
  finishPending();
  const target = go(snapshot());
  if (!target) return;
  editing = null;
  opened = null;
  const was = recipe;
  recipe = target.recipe;
  review = target.review;
  offer = null;
  status = null;
  note = said;
  keepDraft();
  focusKey = changedLine(was, recipe);
  draw();
}
const undo = () => travel(undoHistory.undo, "Undone.");
const redo = () => travel(undoHistory.redo, "Redone.");

function update(next, after) {
  recipe = next;
  offer = null;
  status = null;
  note = null;
  commit();
  keepDraft();
  if (after) after();
  draw();
}

// The values in the open form, applied to the recipe.
function applyForm(form) {
  const data = Object.fromEntries(new FormData(form));
  const n = Number(form.dataset.n);
  if (form.dataset.form === "about") {
    return ["title", "description"].reduce((r, k) => M.setField(r, k, data[k]), recipe);
  }
  if (form.dataset.form === "facts") {
    const times = [];
    for (let k = 0; `tl-${k}` in data; k++) times.push([data[`tl-${k}`], data[`tv-${k}`]]);
    const more = Object.fromEntries(M.factFields(recipe).filter((k) => `x-${k}` in data).map((k) => [k, data[`x-${k}`]]));
    return M.setFacts(recipe, { yield: data.yield, times, time: Object.fromEntries(MINUTES.map(([k]) => [k, data[`m-${k}`]])), more });
  }
  if (form.dataset.form === "ing") return M.updateIngredient(recipe, n, data);
  if (form.dataset.form === "step") return M.updateStep(recipe, n, data);
  if (form.dataset.form === "note" || form.dataset.form === "start") return M.setLine(recipe, LIST[form.dataset.form], n, data.line);
  return recipe;
}

root.addEventListener("submit", (e) => {
  e.preventDefault();
  const f = e.target;
  const was = editing;
  // What the line was when it opened: a rename carries through to the steps as it's typed.
  const base = (f.dataset.form === "ing" && opened?.before) || recipe;
  let next = applyForm(f);
  if (f.dataset.form === "group") next = M.renameGroup(next, f.dataset.list, Number(f.dataset.g), new FormData(f).get("group"));
  const touched = f.dataset.form === "ing" || (f.dataset.form === "group" && f.dataset.list === "ingredients") ? stepsTouched(base, next) : null;
  if (f.dataset.form === "new-group") {
    const name = String(new FormData(f).get("group") || "").trim();
    if (!name) { editing = null; focusKey = `add-group-${f.dataset.list}`; return draw(); }
    const { recipe: made, at } = M.addGroup(next, f.dataset.list, name);
    const kind = KIND[f.dataset.list];
    return update(made, () => { openLine(`${kind}:${at}`, { added: true, back: `add-group-${f.dataset.list}`, before: made }); focusKey = FIRST_FIELD[kind]; });
  }
  // A note or Before you start line left empty comes out: nothing is written until you type.
  if ((f.dataset.form === "note" || f.dataset.form === "start") && !String(new FormData(f).get("line") || "").trim()) {
    const kind = f.dataset.form, n = Number(f.dataset.n), list = LIST[kind];
    const back = opened?.added ? opened.back : null;
    editing = null;
    opened = null;
    next = ops(kind).remove(next, n);
    const left = flat(next[list]).length;
    return update(next, () => { focusKey = back || (left ? `part-${kind}-${Math.min(n, left - 1)}` : `add-${list}`); });
  }
  const back = opened?.back;
  if (was === "facts") next = M.withoutEmptyLines(next);
  editing = null;
  opened = null;
  update(next, () => {
    focusKey = was === "facts" ? back : was ? partKey(was) : null;
    if (touched) note = `Also updated ${touched}, which ${touched.startsWith("steps") ? "use" : "uses"} ${f.dataset.form === "group" ? "that group" : "it"}.`;
  });
});

// The bar sticks under the site header, whose height changes with the screen,
// and what sticks below the bar needs the bar's height: both are measured into
// CSS properties (set from here, as the page's CSP allows no inline styles).
const siteHeader = document.querySelector(".site-header");
function measureBars() {
  const css = document.documentElement.style;
  css.setProperty("--header-h", `${siteHeader?.offsetHeight || 0}px`);
  css.setProperty("--edit-bar-h", `${root.querySelector(".edit-bar")?.offsetHeight || 0}px`);
}
if (window.ResizeObserver && siteHeader) new ResizeObserver(measureBars).observe(siteHeader);

// On a phone, with the keyboard up, there's little room: while you type in an
// open line the site header steps aside (style.css), leaving the bar at the top.
const inLineField = (el) => !!el?.closest?.(".edit-form") && ["INPUT", "TEXTAREA", "SELECT"].includes(el.tagName);
function typingInLine(on) {
  if (document.body.classList.contains("edit-typing") === on) return;
  document.body.classList.toggle("edit-typing", on);
  measureBars();
}
// Leaving the line brings the header back, but not under a press: pressing on
// Done takes focus from the field before the release, and the page shifting
// down then would move Done out from under the pointer and lose the click. So
// the header waits for the release, and for the click that follows it (a tap
// moves focus only after the release, and clicks in the same task).
const settleTyping = () => setTimeout(() => { if (!pressing) typingInLine(inLineField(document.activeElement)); });
document.addEventListener("focusin", (e) => { if (inLineField(e.target)) typingInLine(true); else settleTyping(); });
document.addEventListener("focusout", (e) => { if (!inLineField(e.relatedTarget)) settleTyping(); });

// Whether there's anything to save: a new recipe always has, until it's saved.
let typing = false; // a typed Details field changed, but saves only when you leave it
const unsaved = () => fresh || typing || !same(recipe, original);
const changesText = () => (fresh ? "Not saved yet" : unsaved() ? "Unsaved changes" : "No changes");
const statusLine = Object.assign(document.createElement("p"), { className: "edit-status", id: "save-why" });
statusLine.setAttribute("role", "status");
let note = null; // what the last change also did, said on the status line until the next one
// What changed steps' uses, and what to check after a split, with steps
// named as the sheet shows them (assets/edit-numbers.mjs).
const stepsTouched = (a, b) => numbers().stepsTouched(a, b);
const usesNote = (before, n, parts) => numbers().usesNote(before, n, parts);
let problemCount = 0; // the checker's errors at the last draw
// Typing doesn't redraw the page, so the bar's words and Save follow along here.
function showChanges() {
  const el = root.querySelector(".edit-changes");
  if (el) el.textContent = changesText();
  const undoButton = root.querySelector('[data-act="undo"]');
  if (undoButton) undoButton.disabled = !canUndo();
  const button = root.querySelector('[data-act="save"]');
  if (!button || problemCount || status?.saving) return;
  // Off only for want of changes here: the bar's "No changes" says why.
  button.disabled = !unsaved();
  if (button.disabled) button.setAttribute("aria-describedby", "edit-changes"); else button.removeAttribute("aria-describedby");
}

// What's typed in an open line goes into the recipe (and its draft) as it's
// typed, so opening another line, Save or a reload never loses it. Done only
// closes the line; Cancel puts it back as it was.
root.addEventListener("input", (e) => {
  // A typed field in Details is saved when you leave it, but it's a change
  // now: Save has to be on for a click that comes straight after.
  if (e.target.dataset?.act && typed(e.target)) { typing = true; return showChanges(); }
  const form = e.target.closest(".edit-form");
  if (!form || !["about", "facts", "ing", "step", "note", "start"].includes(form.dataset.form)) return;
  recipe = applyForm(form);
  // The facts' hint follows the minutes as they're typed.
  const hint = form.querySelector("[data-hint]");
  if (hint) hint.textContent = hintText(recipe.time);
  offer = null;
  keepDraft();
  showChanges();
});

// Ctrl+S (Cmd+S on a Mac) saves, as Save does, and never opens the browser's
// own Save dialog. It does nothing while Save is off.
// Ctrl+Z (Cmd+Z) undoes and Shift+Ctrl+Z (or Ctrl+Y) redoes, except in a
// text field, where they're the field's own undo.
document.addEventListener("keydown", (e) => {
  if (!(e.ctrlKey || e.metaKey) || e.altKey || !recipe) return;
  const k = e.key.toLowerCase();
  if (k !== "z" && k !== "y") return;
  const t = e.target;
  if (t.isContentEditable || t.tagName === "TEXTAREA" || (t.tagName === "INPUT" && !["checkbox", "radio", "button", "submit"].includes(t.type))) return;
  e.preventDefault();
  if (k === "y" || e.shiftKey) redo(); else undo();
});

document.addEventListener("keydown", (e) => {
  if (!(e.ctrlKey || e.metaKey) || e.altKey || e.key.toLowerCase() !== "s" || !recipe) return;
  e.preventDefault();
  finishPending();
  // Typing doesn't redraw, so the problems are counted afresh.
  if (checks().errors.length || status?.saving || !unsaved()) return draw();
  editing = null;
  save();
});

root.addEventListener("keydown", (e) => {
  // Escape is Cancel: the open form closes without keeping its changes.
  if (e.key !== "Escape" || !e.target.closest(".edit-form") || !editing) return;
  cancel();
});

root.addEventListener("click", (e) => {
  finishPending();
  if (e.target.closest(".edit-preview a[href], .edit-card a[href]")) return e.preventDefault();
  const b = e.target.closest("button[data-act]");
  if (!b) return;
  const a = b.dataset.act;
  const form = b.closest(".edit-form");

  if (a.startsWith("r-")) return fromReview(b);
  if (a === "original") {
    sourceOpen = !sourceOpen;
    focusKey = "original";
    return draw();
  }
  if (a === "cancel") return cancel();
  if (a === "go") return goTo(JSON.parse(b.dataset.go));
  if (form?.dataset.form === "facts" && a.startsWith("time-")) return factsAction(a, form, Number(b.dataset.k));
  if (a === "undo") return undo();
  if (a === "show-prep") { prepFirst = true; focusKey = "prep-first"; return draw(); }
  if (a === "redo") return redo();
  if (a === "edit") {
    if (b.dataset.target === "facts") {
      openLine("facts", { back: b.dataset.key });
      focusKey = b.dataset.key.split("-f-")[1] || "edit-yield";
      return draw();
    }
    openLine(b.dataset.target);
    focusKey = editing === "about" ? (b.dataset.key === "part-add-description" || b.dataset.key === "part-description" ? "edit-description" : "edit-title")
      : editing.startsWith("ing:") ? (typeof flat(recipe.ingredients)[Number(editing.slice(4))] === "string" ? "edit-text"
        : e.target.closest(".qty") ? "edit-qty" : "edit-item")
      : editing.startsWith("step:") ? "edit-do" : /^(note|start):/.test(editing) ? "edit-line" : "edit-group";
    return draw();
  }
  if (a === "add") {
    const list = b.dataset.list, kind = KIND[list];
    const { recipe: next, at } = ops(kind).add(recipe);
    return update(next, () => { openLine(`${kind}:${at}`, { added: true, back: `add-${list}`, before: next }); focusKey = FIRST_FIELD[kind]; });
  }
  if (form && ["add-after", "move-up", "move-down", "move-to", "as-written", "split", "split-times", "join", "remove"].includes(a)) return formAction(a, form);
  if (a === "restore") {
    const draft = offer;
    // A draft made on an older version saves against that version, so the
    // Worker refuses it rather than quietly undoing the newer save.
    if (draft.base) version = draft.base;
    return update(draft.recipe, () => { focusKey = "part-title"; });
  }
  if (a === "discard") {
    offer = null;
    keepDraft();
    focusKey = "part-title";
    return draw();
  }
  // What's typed in an open line is already in the recipe; Save closes it.
  if (a === "save") { editing = null; return save(); }
  if (a === "delete") return openDelete();
  if (a === "no-equipment") {
    return update(M.setStepField(recipe, Number(b.dataset.step), b.dataset.field, false), () => { focusKey = "save"; });
  }
  if (a === "set-equipment") return goTo({ open: "step", n: Number(b.dataset.step), field: `d-${b.dataset.field}-${b.dataset.step}` });
  if (a === "mark-optional") return update(M.setIngredientField(recipe, Number(b.dataset.ing), "optional", true));
  if (a === "add-prep") {
    const { recipe: next, at } = M.addPrepStep(recipe);
    prepFirst = true;
    return update(next, () => { openLine(`step:${at}`, { added: true, back: "d-add-prep", before: next }); focusKey = "edit-do"; });
  }
  if (a === "use-drop") {
    const n = Number(b.dataset.n);
    const next = structuredClone(recipe);
    const step = flat(next.steps)[n];
    step.uses = step.uses.filter((u) => (typeof u === "string" ? u : u?.item) !== b.dataset.name);
    if (!step.uses.length) delete step.uses;
    return update(next, () => { focusKey = `d-hands-${n}`; });
  }
});

// A guess from the intake, confirmed or changed (assets/import-view.mjs).
function fromReview(el) {
  const next = reviewAction(withReview(), el);
  if (!next) return;
  const { recipe: changed, ...rest } = next;
  review = rest;
  update(changed, () => { focusKey = el.dataset.key; });
}

// Buttons in an open ingredient or step form: they keep what's typed, then act.
function formAction(a, form) {
  const kind = form.dataset.form;
  const n = Number(form.dataset.n);
  const list = LIST[kind];
  let next = applyForm(form);
  if (a === "move-up" || a === "move-down") {
    const dir = a === "move-up" ? -1 : 1;
    const to = M.movedTo(next, list, n, dir);
    next = ops(kind).move(next, n, dir);
    // At the end, the button goes off: focus moves to the other one.
    const more = M.canMove(next, list, to, dir);
    return update(next, () => { openLine(`${kind}:${to}`, { before: next }); focusKey = more ? `edit-act-${a}` : `edit-act-${a === "move-up" ? "move-down" : "move-up"}`; });
  }
  if (a === "move-to") {
    const { recipe: moved, at } = M.moveTo(next, list, n, form.querySelector('[data-key="edit-move-to"]').value);
    return update(moved, () => { openLine(`${kind}:${at}`, { before: moved }); focusKey = "edit-act-move-to"; });
  }
  if (a === "as-written") {
    prepFirst = false;
    focusKey = "edit-act-move-up";
    return draw();
  }
  if (a === "add-after") {
    const { recipe: added, at } = ops(kind).add(next, { after: n });
    return update(added, () => { openLine(`${kind}:${at}`, { added: true, back: `part-${kind}-${n}`, before: added }); focusKey = FIRST_FIELD[kind]; });
  }
  if (a === "remove") {
    const kept = next;
    next = ops(kind).remove(next, n);
    editing = null;
    const left = flat(next[list]).length;
    const touched = kind === "ing" ? stepsTouched(kept, next) : null;
    return update(next, () => {
      focusKey = left ? `part-${kind}-${Math.min(n, left - 1)}` : `add-${list}`;
      if (touched) note = `Also updated ${touched}, which used it.`;
    });
  }
  if (a === "split") {
    const area = form.querySelector("textarea[name=do]");
    const at = area.selectionStart - (area.value.length - area.value.trimStart().length);
    const split = M.splitStep(next, n, at);
    // At either end of the text there's nothing to split off: say so, and go
    // back to the text to put the cursor somewhere.
    if (same(split, next)) { note = "Put the cursor where the new step starts."; focusKey = "edit-do"; return draw(); }
    editing = null;
    return update(split, () => { focusKey = `part-step-${n}`; note = usesNote(next, n, 2); });
  }
  if (a === "split-times") {
    const parts = M.timedParts(flat(next.steps)[n]?.do);
    editing = null;
    return update(M.splitAtTimes(next, n), () => { focusKey = `part-step-${n}`; note = usesNote(next, n, parts); });
  }
  if (a === "join") {
    editing = null;
    return update(M.mergeSteps(next, n), () => { focusKey = `part-step-${n}`; });
  }
}

// The facts form's time rows: add one, move one, take one out. The form stays
// open, and Cancel still puts the whole box back as it was when it opened.
function factsAction(a, form, k) {
  const next = applyForm(form);
  if (a === "time-add") {
    const { recipe: added, at } = M.addTime(next);
    return update(added, () => { focusKey = `edit-tl-${at}`; });
  }
  if (a === "time-up" || a === "time-down") {
    const dir = a === "time-up" ? -1 : 1, to = k + dir, rows = (next.times || []).length;
    const more = dir < 0 ? to > 0 : to < rows - 1;
    return update(M.moveTime(next, k, dir), () => { focusKey = more ? `edit-time-${a.slice(5)}-${to}` : `edit-time-${dir < 0 ? "down" : "up"}-${to}`; });
  }
  if (a === "time-remove") {
    const left = (next.times || []).length - 1;
    return update(M.removeTime(next, k), () => { focusKey = left ? `edit-tl-${Math.min(k, left - 1)}` : "edit-act-time-add"; });
  }
}

// A typed field saves when you leave it, but the change comes before focus
// lands on the next field: redrawing then would drop it. So the change waits
// until focus has moved, and the redraw puts focus where it went. Anything
// else you do first (Save, another button) finishes it before acting.
// While a button is being pressed, the redraw waits for its release too:
// replacing the button under the pointer would lose the click.
let pending = null;
let pressing = false;
function finishPending() {
  const run = pending;
  pending = null;
  typing = false;
  if (run) { clearTimeout(run.timer); run.fn(); }
}
const finishLater = () => setTimeout(() => { if (!pressing) finishPending(); });
document.addEventListener("pointerdown", () => { pressing = true; }, true);
document.addEventListener("pointerup", () => { pressing = false; settleTyping(); if (pending) pending.timer = finishLater(); }, true);
document.addEventListener("pointercancel", () => { pressing = false; settleTyping(); if (pending) pending.timer = finishLater(); }, true);
const typed = (t) => (t.tagName === "INPUT" && !["checkbox", "radio"].includes(t.type)) || t.tagName === "TEXTAREA";

root.addEventListener("change", (e) => {
  const t = e.target;
  // A checkbox or a list keeps focus where it is, so it can act at once.
  if (!typed(t) || !t.dataset.act) { finishPending(); return onChange(t); }
  // Focus is moving now, so an earlier field still waiting goes with this one.
  const earlier = pending;
  if (earlier) clearTimeout(earlier.timer);
  pending = { fn: () => { earlier?.fn(); onChange(t); }, timer: finishLater() };
});

function onChange(t) {
  const a = t.dataset.act;
  if (a?.startsWith("r-")) return fromReview(t);
  if (!a) {
    if (t.id === "prep-first") { prepFirst = t.checked; focusKey = "prep-first"; draw(); }
    return;
  }
  const n = Number(t.dataset.n);
  if (a === "field") return update(M.setField(recipe, t.dataset.field, t.value));
  if (a === "time") return update(M.setTime(recipe, t.dataset.field, t.value));
  if (a === "tag") {
    const values = [...root.querySelectorAll(`input[data-act="tag"][data-dim="${CSS.escape(t.dataset.dim)}"]:checked`)].map((x) => x.value);
    return update(M.setTags(recipe, t.dataset.dim, values));
  }
  if (a === "ing-field") return update(M.setIngredientField(recipe, n, t.dataset.field, t.value));
  if (a === "ing-check") return update(M.setIngredientField(recipe, n, t.dataset.field, t.checked));
  if (a === "holds") return update(M.setHolds(recipe, t.checked ? Number(t.value) : null));
  if (a === "use" || a === "use-amount") {
    const { picks, unmatched } = M.usesOf(recipe, n);
    const k = Number(t.dataset.ing);
    const next = a === "use"
      ? (t.checked ? [...picks, { ing: k, amount: "" }] : picks.filter((p) => p.ing !== k))
      : picks.map((p) => (p.ing === k ? { ...p, amount: t.value } : p));
    const r = M.setUses(recipe, n, next.sort((x, y) => x.ing - y.ing));
    // Names that match no ingredient stay, with the checker's error, until they're taken out.
    const stale = (flat(recipe.steps)[n].uses || []).filter((u) => unmatched.includes(typeof u === "string" ? u : u?.item));
    if (stale.length) {
      const step = flat(r.steps)[n];
      step.uses = [...(step.uses || []), ...stale];
    }
    return update(r);
  }
  if (a === "step-field") {
    const f = t.dataset.field;
    if (f === "oven") {
      ovenTemp = t.value === "temp" ? n : null;
      const v = t.value === "false" ? false : t.value === "temp" ? undefined : t.value;
      if (t.value === "temp") { focusKey = `d-oven-temp-${n}`; return draw(); }
      return update(M.setStepField(recipe, n, "oven", v));
    }
    if (f === "oven-temp") return update(M.setStepField(recipe, n, "oven", t.value), () => { ovenTemp = null; });
    if (f === "watch") return update(M.setStepField(recipe, n, "watch", t.checked || undefined));
    if (f === "prep") return update(M.setStepField(recipe, n, "prep", t.value === "true" ? true : t.value || undefined));
    if (["burner", "grill", "microwave"].includes(f)) return update(M.setStepField(recipe, n, f, t.value === "" ? undefined : t.value === "true"));
    return update(M.setStepField(recipe, n, f, t.value));
  }
}

root.addEventListener("toggle", (e) => {
  if (e.target.matches?.("details.edit-details")) detailsOpen = e.target.open;
  if (e.target.matches?.("details.edit-checks")) checksOpen = e.target.open;
  if (e.target.matches?.("details.edit-lineup")) lineupOpen = e.target.open;
}, true);

// --- Start --------------------------------------------------------------------------------------

(async () => {
  const who = await signedIn();
  if (who === "out") return gate("Sign in to edit", "Editing recipes is only for the site's owner, signed in.");
  if (who === "stale") return gate("Sign in again", "Your sign-in has run out. Sign in again to edit.");
  if (who === "no-access") return gate("This account can't edit this site", "Only the site's owner can edit its recipes.");
  if (fresh) return startNew();
  if (!/^[a-z0-9-]+$/.test(slug)) return gate("Recipe not found", "There's no recipe to edit at this address.");
  let loaded;
  try {
    // The recipe as it is on main now, which the site may not be showing yet.
    const res = await fetch(`/api/recipe/${slug}`, { cache: "no-store", credentials: "same-origin" });
    if (res.status === 401) return gate("Sign in again", "Your sign-in has run out. Sign in again to edit.");
    if (res.status === 404) return gate("Recipe not found", "There's no recipe to edit at this address.");
    if (!res.ok) throw new Error(res.status);
    [loaded, vocab, index] = await Promise.all([res.json(), getJSON("recipes/vocabulary.json"), getJSON("recipes/index.json").catch(() => [])]);
  } catch {
    return gate("Couldn't open the recipe", "The site couldn't reach GitHub. Check your connection, then reload to try again.");
  }
  ({ recipe: original, sha: version } = loaded);
  // (A new recipe starts in startNew, below.)
  recipe = structuredClone(original);
  forgetHistory();
  const draft = readDraft();
  if (draft?.recipe && !same(draft.recipe, original)) offer = draft;
  draw();
})();

// A new recipe: the review the intake keeps (sss:intake).
async function startNew() {
  let kept = null;
  try { kept = fromKept(JSON.parse(localStorage.getItem(KEPT_REVIEW))); } catch {}
  if (!kept) {
    gate("Nothing to finish", "A new recipe starts on Add a recipe: give it a recipe's text, web address or PDF, answer its questions, then continue here.");
    root.insertAdjacentHTML("beforeend", `<p><a class="btn edit-primary" href="intake.html">Add a recipe</a></p>`);
    return;
  }
  try {
    [vocab, index] = await Promise.all([getJSON("recipes/vocabulary.json"), getJSON("recipes/index.json").catch(() => [])]);
  } catch {
    return gate("Couldn't open the recipe", "Check your connection, then reload to try again.");
  }
  const { recipe: r, ...rest } = kept.state;
  recipe = r;
  review = rest;
  source = kept.original;
  forgetHistory();
  draw();
}
