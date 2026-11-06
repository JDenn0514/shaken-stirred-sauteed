// The recipe editor (edit.html?r=<slug>). The recipe is shown as it will
// appear, its card and then its page, drawn by assets/recipe-view.js; each part
// of the page is a button that opens a field in place. "Details" holds what the
// page doesn't show: tags, source, date, kind, drawing, what each step uses, and
// the lineup's planning fields. The checks are assets/recipe-checks.js's, the
// same as the build's: errors turn Save off, warnings make a to-do list.
//
// Changes to the recipe are made by assets/edit-model.mjs, which keeps every
// field the editor has no control for. An unsaved draft is kept in the browser
// (sss:draft:<slug>) and offered back on return. Saving comes in a later step:
// docs/specs/recipe-editor-plan.md.
import * as M from "./edit-model.mjs";

const { esc, getJSON, stepOrder, signedIn: hinted } = window.SSS;
const { recipePageHTML, cardHTML } = window.SSSView;
const { checkRecipe, checkLinks, indexEntry, patchIndex } = window.SSSChecks;
const ICONS = window.SSSIcons.KEYS;

const root = document.getElementById("editor");
const slug = new URLSearchParams(location.search).get("r") || "";
const DRAFT = `sss:draft:${slug}`;

let original = null;   // the recipe as loaded
let recipe = null;     // the recipe being edited
let vocab = null;      // recipes/vocabulary.json
let index = [];        // recipes/index.json
let editing = null;    // the part open for editing: "about", "ing:3", "step:2", "group:steps:0", "new-group:ingredients"
let prepFirst = true;  // which order the preview shows steps in, when the recipe has both
let ovenTemp = null;   // a step whose oven was just set to "At a temperature", before a temperature is typed
let detailsOpen = false;
let offer = null;      // an unsaved draft from before, offered back
let focusKey = null;   // what to focus after the next draw
let status = "";       // a message beside Save

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

// --- Drafts ----------------------------------------------------------------------------

const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
function readDraft() {
  try { return JSON.parse(localStorage.getItem(DRAFT)); } catch { return null; }
}
function keepDraft() {
  try {
    if (same(recipe, original)) localStorage.removeItem(DRAFT);
    else localStorage.setItem(DRAFT, JSON.stringify({ recipe, at: new Date().toISOString() }));
  } catch {}
}

// --- Checks ----------------------------------------------------------------------------

// The checker's errors and warnings for this recipe, with its links checked
// against the site's other recipes (the index, with this recipe's entry in it).
function checks() {
  const { errors, warnings } = checkRecipe(slug, recipe, vocab);
  const mine = `recipes/${slug}.json: `;
  const links = checkLinks(patchIndex(index, slug, indexEntry(slug, recipe, vocab)))
    .filter((e) => e.startsWith(mine) || (e.startsWith("recipe links loop:") && e.split(/ → |: /).includes(slug)))
    .map((e) => (e.startsWith(mine) ? e.slice(mine.length) : e));
  return { errors: [...errors, ...links], warnings };
}

// Which part of the page a message is about: a step (by its number), an
// ingredient (by its name) or the title.
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
  const [, field, what] = EQUIPMENT.find(([re]) => re.test(m[2])) || [null, "oven", "the oven"];
  return { step: Number(m[1]) - 1, field, what };
};

// --- Drawing -------------------------------------------------------------------------------

function draw() {
  const key = focusKey || document.activeElement?.dataset?.key;
  focusKey = null;
  const { errors, warnings } = checks();
  const entry = indexEntry(slug, recipe, vocab);
  document.title = `Edit ${recipe.title || "a recipe"} · Shaken, Stirred & Sautéed`;
  const hasOrders = stepOrder(recipe, true).differs;
  const showPrepFirst = hasOrders && prepFirst;

  root.innerHTML = `
    ${offer ? `<section class="edit-note" aria-labelledby="draft-h">
      <h2 id="draft-h">Unsaved changes</h2>
      <p>You changed this recipe on ${esc(new Date(offer.at).toLocaleString())} and didn't save. Editing it now starts from the recipe as it is on the site.</p>
      <div class="edit-row">
        <button class="btn edit-primary" type="button" data-act="restore" data-key="restore">Bring back my changes</button>
        <button class="btn" type="button" data-act="discard" data-key="discard">Discard them</button>
      </div>
    </section>` : ""}
    <div class="edit-bar">
      <p class="edit-kicker">Editing <code>recipes/${esc(slug)}.json</code></p>
      <button class="btn edit-primary" type="button" data-act="save" data-key="save"${errors.length ? ` disabled aria-describedby="save-why"` : ""}>Save</button>
      <p class="edit-status" id="save-why" role="status">${errors.length ? `Fix ${errors.length === 1 ? "the problem" : `the ${errors.length} problems`} below to save.` : esc(status)}</p>
    </div>
    ${errors.length ? `<section class="edit-problems" aria-labelledby="problems-h">
      <h2 id="problems-h">Problems to fix</h2>
      <ul>${errors.map((e) => `<li>${esc(e)}</li>`).join("")}</ul>
    </section>` : ""}
    ${warnings.length ? `<section class="edit-todo" aria-labelledby="todo-h">
      <h2 id="todo-h">To do</h2>
      <p class="muted">These help the lineup plan a meal. They don't stop you saving.</p>
      <ul>${warnings.map(todoHTML).join("")}</ul>
    </section>` : ""}
    <section class="edit-card" aria-label="Card preview">
      <ul class="grid">${cardHTML(entry)}</ul>
    </section>
    <section class="recipe edit-preview" aria-label="Recipe preview"${entry.icon ? ` data-icon="${esc(entry.icon)}"` : ""}>
      ${recipePageHTML(recipe, vocab, { prepFirst: showPrepFirst })}
    </section>
    <details class="edit-details"${detailsOpen ? " open" : ""}>
      <summary data-key="details">Details</summary>
      ${detailsHTML()}
    </details>`;

  decorate(root.querySelector(".edit-preview"), errors, showPrepFirst);
  const back = key && root.querySelector(`[data-key="${CSS.escape(key)}"]`);
  if (back) back.focus();
}

function todoHTML(w) {
  const m = mentions(w);
  const optional = /^"(.+?)" says it's optional/.exec(w);
  const ing = optional && flat(recipe.ingredients).findIndex((i) => ingName(i) === optional[1]);
  return `<li>${esc(w)}
    ${m ? `<span class="edit-row">
      <button class="btn" type="button" data-act="no-equipment" data-step="${m.step}" data-field="${m.field}" data-key="todo-no-${m.step}">Step ${m.step + 1} doesn't use ${esc(m.what)}</button>
      <button class="btn" type="button" data-act="set-equipment" data-step="${m.step}" data-field="${m.field}" data-key="todo-set-${m.step}">Set step ${m.step + 1}'s equipment</button>
    </span>` : ""}
    ${optional && ing >= 0 ? `<span class="edit-row"><button class="btn" type="button" data-act="mark-optional" data-ing="${ing}" data-key="todo-opt-${ing}">Mark it optional</button></span>` : ""}
  </li>`;
}

// --- The preview, made editable -------------------------------------------------------

const part = (target, key, inner) =>
  `<button class="edit-part" type="button" data-act="edit" data-target="${target}" data-key="${key}">${inner}</button>`;
// A field with its label beside it, joined by id. (A label wrapped round a
// field would make the field's own text part of its name.)
function labelled(label, control, cls = "") {
  const id = `f-${/data-key="([^"]+)"/.exec(control)[1]}`;
  return `<div class="edit-field${cls}"><label for="${esc(id)}">${esc(label)}</label>${control.replace(/^<(\w+)/, `<$1 id="${esc(id)}"`)}</div>`;
}
const field = (label, name, value, extra = "") =>
  labelled(label, `<input name="${name}" value="${esc(value ?? "")}" data-key="edit-${name}"${extra}>`);
const formButtons = (more = "") => `<div class="edit-row">
  <button class="btn edit-primary" type="submit" data-key="edit-done">Done</button>${more}</div>`;
const act = (name, label) => `<button class="btn" type="button" data-act="${name}" data-key="edit-act-${name}">${label}</button>`;

function aboutForm() {
  return `<form class="edit-form" data-form="about">
    ${field("Title", "title", recipe.title)}
    ${labelled("Description", `<textarea name="description" rows="3" data-key="edit-description">${esc(recipe.description || "")}</textarea>`)}
    ${field("Yield", "yield", recipe.yield, ` placeholder="Serves 4 · Makes 12 cups"`)}
    ${formButtons()}
  </form>`;
}

function ingredientForm(n) {
  const i = flat(recipe.ingredients)[n];
  const moves = act("move-up", "Move up") + act("move-down", "Move down") + act("remove", "Remove");
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

function stepForm(n) {
  const s = flat(recipe.steps)[n];
  const o = typeof s === "string" ? { do: s } : s || {};
  return `<form class="edit-form" data-form="step" data-n="${n}">
    ${labelled("Step", `<textarea name="do" rows="3" data-key="edit-do">${esc(o.do || "")}</textarea>`)}
    <div class="edit-fields">
      ${field("Wait", "wait", o.wait, ` placeholder="e.g. 20 min"`)}
      ${field("Cue", "cue", o.cue, ` placeholder="e.g. Golden at the edges"`)}
    </div>
    ${formButtons(act("move-up", "Move up") + act("move-down", "Move down") + act("split", "Split here")
      + act("join", "Join with the next step") + act("remove", "Remove"))}
  </form>`;
}

const groupForm = (form, value, list, g = "") => `<form class="edit-form" data-form="${form}" data-list="${list}" data-g="${g}">
  ${field("Group name", "group", value)}${formButtons()}</form>`;

// Named sections of a list, in order: the headings on the page.
const namedGroups = (list) => (recipe[list] || []).filter((e) => e && Array.isArray(e.items) && e.group).map((e) => e.group);

function decorate(page, errors, showPrepFirst) {
  page.querySelectorAll(".start-row, .toolbar").forEach((n) => n.remove());

  // The title, description and yield: one form for all three.
  const h1 = page.querySelector("h1"), lede = page.querySelector(".lede");
  if (editing === "about") {
    h1.insertAdjacentHTML("beforebegin", aboutForm());
    h1.remove();
    lede?.remove();
  } else {
    h1.innerHTML = part("about", "part-title", esc(recipe.title || "Add a title"));
    if (lede) lede.innerHTML = part("about", "part-description", esc(recipe.description));
    const yields = (recipe.yield || "").split(" · ").filter(Boolean).length;
    [...page.querySelectorAll(".facts .fact dd")].slice(0, yields).forEach((dd, k) => { dd.innerHTML = part("about", `part-yield-${k}`, dd.innerHTML); });
    const missing = [!recipe.description && "a description", !recipe.yield && "a yield"].filter(Boolean);
    if (missing.length) {
      (lede || h1).insertAdjacentHTML("afterend", `<p class="edit-add-line">${part("about", "part-add-about", `Add ${missing.join(" and ")}`)}</p>`);
    }
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
      li.innerHTML = part(`ing:${n}`, `part-ing-${n}`, ingName(ings[n]) ? text : "Empty ingredient: add its name");
    }
  });
  const ingSection = page.querySelector("ul.ingredients")?.closest("section") || page.querySelectorAll("section.section")[page.querySelector(".before") ? 1 : 0];
  editableGroups(ingSection, "ingredients", true);
  ingSection.insertAdjacentHTML("beforeend", addButtons("ingredients", "Add ingredient", "Add a group of ingredients"));

  // Steps.
  const steps = flat(recipe.steps);
  page.querySelectorAll("li[data-step]").forEach((li) => {
    const n = Number(li.dataset.step);
    li.removeAttribute("tabindex");
    if (editing === `step:${n}`) li.innerHTML = stepForm(n);
    else li.innerHTML = part(`step:${n}`, `part-step-${n}`, stepText(steps[n]) ? li.innerHTML : "Empty step: add what to do");
  });
  const stepSection = page.querySelector("#steps");
  // In prep-first order the headings are the order's own ("Prep", "Cooking"), not the recipe's groups.
  editableGroups(stepSection, "steps", !showPrepFirst);
  stepSection.insertAdjacentHTML("beforeend", addButtons("steps", "Add step", "Add a group of steps"));
  stepSection.querySelector("#prep-first")?.setAttribute("data-key", "prep-first");

  // Errors beside what they're about.
  const notes = new Map();
  errors.forEach((e, k) => {
    const p = partOf(e);
    const at = p.step !== undefined ? page.querySelector(`li[data-step="${p.step}"]`)
      : p.ing !== undefined ? page.querySelector(`li[data-ing-row="${p.ing}"]`)
      : p.title ? page.querySelector("h1, form[data-form=about]") : null;
    if (!at) return;
    const id = `error-${k}`;
    if (at.matches("h1, form")) at.insertAdjacentHTML("afterend", `<p class="edit-error" id="${id}">${esc(e)}</p>`);
    else at.insertAdjacentHTML("beforeend", `<p class="edit-error" id="${id}">${esc(e)}</p>`);
    const button = at.querySelector(".edit-part") || at.querySelector(".edit-part, button");
    if (button) notes.set(button, [...(notes.get(button) || []), id]);
  });
  for (const [button, ids] of notes) button.setAttribute("aria-describedby", ids.join(" "));
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

const select = (label, name, options, value, attrs = "") => labelled(label,
  `<select name="${name}"${attrs}>${options.map(([v, t]) => `<option value="${esc(v)}"${String(value) === String(v) ? " selected" : ""}>${esc(t)}</option>`).join("")}</select>`);
const check = (label, attrs, on) => `<label class="edit-check"><input type="checkbox"${attrs}${on ? " checked" : ""}> ${esc(label)}</label>`;
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
    ${timesHTML()}
    ${tagsHTML()}
    <fieldset class="edit-set"><legend>Ingredients</legend>
      ${flat(r.ingredients).map(ingredientDetails).join("")}
    </fieldset>
    <fieldset class="edit-set"><legend>Steps</legend>
      ${flat(r.steps).map(stepDetails).join("")}
      <label class="edit-check"><input type="radio" name="holds" value=""${flat(r.steps).some((s) => s?.holds) ? "" : " checked"} data-act="holds" data-key="d-holds-none"> Doesn't keep: it's made in one go</label>
      <div class="edit-row"><button class="btn" type="button" data-act="add-prep" data-key="d-add-prep">Add a prep step</button></div>
      <p class="muted">A prep step is prep hidden in an ingredient line ("minced garlic"). It shows only when steps are in prep-first order.</p>
    </fieldset>
  </div>`;
}

// The recipe's times in minutes: what the time filter and the card use.
// A recipe with "times" (as printed) shows those on its page instead.
const TIMES = [["prep", "Prep"], ["cook", "Cook"], ["chill", "Chill"], ["rest", "Rest"], ["total", "Total"]];
function timesHTML() {
  const t = recipe.time || {};
  return `<fieldset class="edit-set"><legend>Times, in minutes</legend>
    <div class="edit-fields">
      ${TIMES.map(([k, label]) => labelled(label, `<input type="number" min="0" inputmode="numeric" value="${esc(t[k] ?? "")}" data-act="time" data-field="${k}" data-key="d-time-${k}">`)).join("")}
    </div>
    <p class="muted">Leave Total empty to add up the others.${recipe.times ? " The recipe page shows its times as written; these are for the time filter and the card." : ""}</p>
  </fieldset>`;
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

const TRI = [["", "Not set"], ["true", "Uses it"], ["false", "Doesn't use it"]];
const tri = (v) => (v === true ? "true" : v === false ? "false" : "");

function stepDetails(s, n) {
  const o = typeof s === "string" ? { do: s } : s || {};
  const ings = flat(recipe.ingredients);
  const { picks, unmatched } = M.usesOf(recipe, n);
  const picked = new Map(picks.map((p) => [p.ing, p.amount]));
  const oven = o.oven === false ? "false" : o.oven === "broil" || o.oven === "off" ? o.oven : o.oven || ovenTemp === n ? "temp" : "";
  const sf = (attrs) => ` data-act="step-field" data-n="${n}"${attrs}`;
  return `<fieldset class="edit-step"><legend>Step ${n + 1}: ${esc(short(o.do || "(empty)"))}${o.prepOnly ? " (added prep)" : ""}</legend>
    <div class="edit-uses" role="group" aria-label="Ingredients step ${n + 1} uses">
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
    ${o.wait ? check("Needs you there the whole wait", sf(` data-field="watch" data-key="d-watch-${n}"`), o.watch === true) : ""}
    <div class="edit-fields">
      ${select("Oven", "oven", [["", "Not set"], ["false", "Doesn't use the oven"], ["temp", "At a temperature"], ["broil", "Broil"], ["off", "Turn it off"]], oven, sf(` data-field="oven" data-key="d-oven-${n}"`))}
      ${oven === "temp" ? labelled("Oven temperature", `<input value="${esc(typeof o.oven === "string" ? o.oven : "")}" placeholder="200C or 400F"${sf(` data-field="oven-temp" data-key="d-oven-temp-${n}"`)}>`) : ""}
      ${labelled("Heats the oven to", `<input value="${esc(typeof o.preheat === "string" ? o.preheat : "")}" placeholder="200C or 400F"${sf(` data-field="preheat" data-key="d-preheat-${n}"`)}>`)}
      ${select("Burner", "burner", TRI, tri(o.burner), sf(` data-field="burner" data-key="d-burner-${n}"`))}
      ${select("Grill", "grill", TRI, tri(o.grill), sf(` data-field="grill" data-key="d-grill-${n}"`))}
      ${select("Microwave", "microwave", TRI, tri(o.microwave), sf(` data-field="microwave" data-key="d-microwave-${n}"`))}
    </div>
    <label class="edit-check"><input type="radio" name="holds" value="${n}"${o.holds ? " checked" : ""} data-act="holds" data-key="d-holds-${n}"> Keeps as long as you like after this step</label>
  </fieldset>`;
}

// --- What the person does ----------------------------------------------------------------------

function update(next, after) {
  recipe = next;
  offer = null;
  status = "";
  keepDraft();
  if (after) after();
  draw();
}

// The values in the open form, applied to the recipe.
function applyForm(form) {
  const data = Object.fromEntries(new FormData(form));
  const n = Number(form.dataset.n);
  if (form.dataset.form === "about") {
    return ["title", "description", "yield"].reduce((r, k) => M.setField(r, k, data[k]), recipe);
  }
  if (form.dataset.form === "ing") return M.updateIngredient(recipe, n, data);
  if (form.dataset.form === "step") return M.updateStep(recipe, n, data);
  return recipe;
}

root.addEventListener("submit", (e) => {
  e.preventDefault();
  const f = e.target;
  const was = editing;
  let next = applyForm(f);
  if (f.dataset.form === "group") next = M.renameGroup(next, f.dataset.list, Number(f.dataset.g), new FormData(f).get("group"));
  if (f.dataset.form === "new-group") {
    const name = String(new FormData(f).get("group") || "").trim();
    if (!name) { editing = null; focusKey = `add-group-${f.dataset.list}`; return draw(); }
    const { recipe: made, at } = M.addGroup(next, f.dataset.list, name);
    const kind = f.dataset.list === "ingredients" ? "ing" : "step";
    return update(made, () => { editing = `${kind}:${at}`; focusKey = kind === "ing" ? "edit-item" : "edit-do"; });
  }
  editing = null;
  update(next, () => {
    focusKey = was === "about" ? "part-title" : was?.startsWith("ing:") ? `part-ing-${was.slice(4)}`
      : was?.startsWith("step:") ? `part-step-${was.slice(5)}` : was?.startsWith("group:") ? `part-group-${was.split(":")[1]}-${was.split(":")[2]}` : null;
  });
});

root.addEventListener("keydown", (e) => {
  // Escape closes an open form without keeping its changes.
  if (e.key !== "Escape" || !e.target.closest(".edit-form")) return;
  const was = editing;
  editing = null;
  focusKey = was === "about" ? "part-title" : was?.startsWith("ing:") ? `part-ing-${was.slice(4)}` : was?.startsWith("step:") ? `part-step-${was.slice(5)}` : null;
  draw();
});

root.addEventListener("click", (e) => {
  const b = e.target.closest("button[data-act]");
  if (!b) return;
  const a = b.dataset.act;
  const form = b.closest(".edit-form");

  if (a === "edit") {
    editing = b.dataset.target;
    focusKey = editing === "about" ? (b.dataset.key === "part-description" ? "edit-description" : b.dataset.key.startsWith("part-yield") ? "edit-yield" : "edit-title")
      : editing.startsWith("ing:") ? (typeof flat(recipe.ingredients)[Number(editing.slice(4))] === "string" ? "edit-text" : "edit-item")
      : editing.startsWith("step:") ? "edit-do" : "edit-group";
    return draw();
  }
  if (a === "add") {
    const list = b.dataset.list;
    const { recipe: next, at } = list === "ingredients" ? M.addIngredient(recipe) : M.addStep(recipe);
    return update(next, () => { editing = `${list === "ingredients" ? "ing" : "step"}:${at}`; focusKey = list === "ingredients" ? "edit-item" : "edit-do"; });
  }
  if (form && ["move-up", "move-down", "split", "join", "remove"].includes(a)) return formAction(a, form);
  if (a === "restore") {
    const draft = offer;
    return update(draft.recipe, () => { focusKey = "part-title"; });
  }
  if (a === "discard") {
    offer = null;
    keepDraft();
    focusKey = "part-title";
    return draw();
  }
  if (a === "save") {
    status = "Saving to the site isn't switched on yet. Your changes are kept in this browser.";
    return draw();
  }
  if (a === "no-equipment") {
    return update(M.setStepField(recipe, Number(b.dataset.step), b.dataset.field, false), () => { focusKey = "save"; });
  }
  if (a === "set-equipment") {
    detailsOpen = true;
    focusKey = `d-${b.dataset.field}-${b.dataset.step}`;
    draw();
    return root.querySelector(`[data-key="${focusKey}"]`)?.scrollIntoView({ block: "center" });
  }
  if (a === "mark-optional") return update(M.setIngredientField(recipe, Number(b.dataset.ing), "optional", true));
  if (a === "add-prep") {
    const { recipe: next, at } = M.addPrepStep(recipe);
    prepFirst = true;
    return update(next, () => { editing = `step:${at}`; focusKey = "edit-do"; });
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

// Buttons in an open ingredient or step form: they keep what's typed, then act.
function formAction(a, form) {
  const kind = form.dataset.form;
  const n = Number(form.dataset.n);
  const list = kind === "ing" ? "ingredients" : "steps";
  let next = applyForm(form);
  if (a === "move-up" || a === "move-down") {
    const dir = a === "move-up" ? -1 : 1;
    const to = M.movedTo(next, list, n, dir);
    next = kind === "ing" ? M.moveIngredient(next, n, dir) : M.moveStep(next, n, dir);
    return update(next, () => { editing = `${kind}:${to}`; focusKey = `edit-act-${a}`; });
  }
  if (a === "remove") {
    next = kind === "ing" ? M.removeIngredient(next, n) : M.removeStep(next, n);
    editing = null;
    const left = flat(next[list]).length;
    return update(next, () => { focusKey = left ? `part-${kind}-${Math.min(n, left - 1)}` : `add-${list}`; });
  }
  if (a === "split") {
    const area = form.querySelector("textarea[name=do]");
    const at = area.selectionStart - (area.value.length - area.value.trimStart().length);
    editing = null;
    return update(M.splitStep(next, n, at), () => { focusKey = `part-step-${n}`; });
  }
  if (a === "join") {
    editing = null;
    return update(M.mergeSteps(next, n), () => { focusKey = `part-step-${n}`; });
  }
}

root.addEventListener("change", (e) => {
  const t = e.target;
  const a = t.dataset.act;
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
  if (a === "holds") return update(M.setHolds(recipe, t.value === "" ? null : Number(t.value)));
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
});

root.addEventListener("toggle", (e) => {
  if (e.target.matches?.("details.edit-details")) detailsOpen = e.target.open;
}, true);

// --- Start --------------------------------------------------------------------------------------

(async () => {
  const who = await signedIn();
  if (who === "out") return gate("Sign in to edit", "Editing recipes is only for the site's owner, signed in.");
  if (who === "stale") return gate("Sign in again", "Your sign-in has run out. Sign in again to edit.");
  if (who === "no-access") return gate("This account can't edit this site", "Only the site's owner can edit its recipes.");
  if (!/^[a-z0-9-]+$/.test(slug)) return gate("Recipe not found", "There's no recipe to edit at this address.");
  try {
    [original, vocab, index] = await Promise.all([
      getJSON(`recipes/${slug}.json`), getJSON("recipes/vocabulary.json"), getJSON("recipes/index.json").catch(() => []),
    ]);
  } catch {
    return gate("Recipe not found", "There's no recipe to edit at this address.");
  }
  recipe = structuredClone(original);
  const draft = readDraft();
  if (draft?.recipe && !same(draft.recipe, original)) offer = draft;
  draw();
})();
