// The menu page (menu.html): the recipes you're cooking together. Three views:
// empty (an invitation and a search), searching (results to add) and the menu
// card (each dish, its choices, and Start cooking). Cooking itself is in
// menu-cook.mjs, opened at menu.html#cook. See docs/specs/meal-planner-design.md.
import { planLineup } from "./planner.mjs";
import { openCook } from "./menu-cook.mjs";

const { CATEGORIES, esc, fmtMinutes, totalMinutes, getJSON, toGroups } = window.SSS;
const Menu = window.SSSMenu;
const $ = (id) => document.getElementById(id);
const top = $("menu-top"), body = $("menu-body"), searchBox = $("menu-search"), search = $("search");

// ===== Recipes =====
let index = [];
const bySlug = (slug) => index.find((r) => r.slug === slug);
const cache = new Map();
const fetchRecipe = (slug) => {
  if (!cache.has(slug)) cache.set(slug, getJSON(`recipes/${slug}.json`).catch(() => null));
  return cache.get(slug);
};
const ingredientsOf = (r) => toGroups(r.ingredients).flatMap((g) => g.items).filter((i) => i && typeof i === "object");
// The recipes on the menu, and every recipe they link to, as { slug: recipe }.
async function loadRecipes(slugs) {
  const out = {};
  const visit = async (slug) => {
    if (slug in out) return;
    out[slug] = null;
    const r = await fetchRecipe(slug);
    out[slug] = r;
    if (r) await Promise.all(ingredientsOf(r).filter((i) => typeof i.recipe === "string").map((i) => visit(i.recipe)));
  };
  await Promise.all(slugs.map(visit));
  return out;
}

// What the cook told us a recipe doesn't say ("sss:answers:<slug>"), written
// into a copy of the recipe as if it said it.
const SERVE = { hot: { serve: "hot" }, soon: { serve: "soon", sits: "30 min" }, keeps: { serve: "keeps" } };
function withAnswers(r, slug) {
  const a = Menu.answers(slug);
  if (!r || (!a.waits && !a.serve)) return r;
  let n = 0;
  const steps = (r.steps || []).map((g) => {
    const fix = (s) => {
      const k = n++, wait = a.waits?.[k];
      return wait ? { ...(typeof s === "string" ? { do: s } : s), wait } : s;
    };
    return g && Array.isArray(g.items) ? { ...g, items: g.items.map(fix) } : fix(g);
  });
  return { ...r, steps, ...SERVE[a.serve] };
}

// ===== Planning =====
// The lineup the planner takes, from what's saved.
export function lineupOf(menu, recipes, prepFirst = Menu.prepFirst()) {
  return {
    dishes: menu.dishes.filter((d) => recipes[d.slug]).map((d) => ({ slug: d.slug, made: madeOf(d, recipes), ...(d.course && { course: d.course }) })),
    ahead: menu.ahead || {},
    prepFirst,
  };
}
// A dish's nested recipes marked "Already made": its saved choice, or what the
// recipe says (an ingredient's `alreadyMade`).
function madeOf(dish, recipes) {
  if (Array.isArray(dish.made)) return dish.made;
  const made = [];
  const walk = (slug, seen) => {
    for (const i of ingredientsOf(recipes[slug] || {})) {
      if (typeof i.recipe !== "string" || i.optional || seen.has(i.recipe)) continue;
      if (i.alreadyMade) made.push(i.recipe);
      else walk(i.recipe, new Set([...seen, i.recipe]));
    }
  };
  walk(dish.slug, new Set([dish.slug]));
  return made;
}
export async function planMenu(menu, prepFirst) {
  const raw = await loadRecipes(menu.dishes.map((d) => d.slug));
  const recipes = Object.fromEntries(Object.entries(raw).filter(([, r]) => r).map(([slug, r]) => [slug, withAnswers(r, slug)]));
  return { recipes, lineup: lineupOf(menu, recipes, prepFirst) };
}
// The day's length: when the last course is served.
const dayLength = (plan) => (plan.courses ? Math.max(...Object.values(plan.courses)) : plan.minutes);
const about = (min) => `about ${fmtMinutes(Math.max(1, Math.round(min)))}`;

// ===== Views =====
const params = () => new URLSearchParams(location.search);
const searching = () => params().has("q");
let state = { q: "", cat: "all" };

function render() {
  if (location.hash === "#cook") return;
  const menu = Menu.load();
  if (searching()) {
    const p = params();
    state = { q: p.get("q") || "", cat: p.get("cat") || "all" };
    return renderSearch(menu);
  }
  if (!menu.dishes.length) return renderEmpty();
  return renderCard(menu);
}

function renderEmpty() {
  top.innerHTML = `<p class="eyebrow">Your menu</p>
    <h1 class="menu-title">Let's make something</h1>
    <p class="lede">Pick the recipes you're making together: a whole dinner, or one dessert made from a few recipes. You get one order to make them in.</p>`;
  searchBox.hidden = false;
  search.value = "";
  body.innerHTML = `<p><a class="menu-browse" href="recipes.html">Or browse all recipes →</a></p>
    <ol class="menu-how">
      <li><b>Add recipes</b> here, or with "Add to menu" on any recipe.</li>
      <li><b>Make your choices:</b> courses, what you're making and what you already have.</li>
      <li><b>Start cooking.</b> One step at a time, across everything.</li>
    </ol>`;
}

function renderSearch(menu) {
  const n = menu.dishes.length;
  top.innerHTML = `<div class="menu-toprow"><a class="back" href="menu.html">← Back to your menu${n ? ` · ${n}` : ""}</a></div>`;
  searchBox.hidden = false;
  if (search.value !== state.q) search.value = state.q;
  const words = state.q.toLowerCase().split(/\s+/).filter(Boolean);
  const pool = index.filter((r) => words.every((w) => (r.search || r.title.toLowerCase()).includes(w)));
  const shown = pool.filter((r) => state.cat === "all" || r.category === state.cat);
  const tabs = [["all", "All", pool.length], ...Object.entries(CATEGORIES).map(([k, c]) => [k, c.label, pool.filter((r) => r.category === k).length])];
  const icon = (r) => (window.SSSIcons ? window.SSSIcons.iconFor(r) : r.icon);
  body.innerHTML = `<nav class="tabs menu-tabs" aria-label="Sections">${tabs.map(([k, label, c]) =>
      `<button class="tab" type="button" data-cat="${k}" aria-pressed="${state.cat === k}">${label}<span class="n">${c}</span></button>`).join("")}</nav>
    ${shown.length ? `<ul class="menu-results">${shown.map((r) => `<li class="fam-${esc(r.category)}"${icon(r) ? ` data-icon="${esc(icon(r))}"` : ""}>
        <span class="card-icon" aria-hidden="true"></span>
        <a class="menu-result" href="recipe.html?r=${encodeURIComponent(r.slug)}"><b>${esc(r.title)}</b>${r.description ? `<span>${esc(r.description)}</span>` : ""}</a>
        ${menu.dishes.some((d) => d.slug === r.slug) ? `<span class="menu-added">✓ Added</span>`
          : `<button class="btn menu-add" type="button" data-add="${esc(r.slug)}" aria-label="+ Add ${esc(r.title)}">+ Add</button>`}
      </li>`).join("")}</ul>` : `<p class="muted">No recipes match “${esc(state.q)}”.</p>`}`;
  // The button's own text is "+ Add"; its name says which recipe for screen readers.
  body.querySelectorAll(".menu-add").forEach((b) => b.removeAttribute("aria-label"));
}
// The search lives in the URL (?q=lemon&cat=baking) so Back from a recipe
// restores it.
function setSearch(next, push = false) {
  state = { ...state, ...next };
  const p = new URLSearchParams();
  p.set("q", state.q);
  if (state.cat !== "all") p.set("cat", state.cat);
  history[push ? "pushState" : "replaceState"](null, "", `?${p.toString()}`);
  render();
}

// ===== The menu card =====
let planned = null;     // { plan, other, recipes, error } for the menu as it was last drawn
let openPop = null;     // the dish or make-ahead menu that's open: its button's data key

async function renderCard(menu) {
  searchBox.hidden = true;
  top.innerHTML = `<div class="menu-toprow"><a class="back" href="recipes.html">← Recipes</a></div>`;
  const { recipes, lineup } = await planMenu(menu);
  let plan = null, other = null, error = null;
  try {
    plan = planLineup(lineup, recipes);
    other = planLineup({ ...lineup, prepFirst: !lineup.prepFirst }, recipes);
  } catch (e) {
    error = e;
  }
  planned = { plan, other, recipes, lineup, error };
  drawCard(menu);
}

function drawCard(menu) {
  const { plan, other, recipes, lineup, error } = planned;
  const title = (slug) => recipes[slug]?.title || bySlug(slug)?.title || slug;
  const fam = (slug) => `fam-${esc(recipes[slug]?.category || bySlug(slug)?.category || "cooking")}`;
  const time = (slug) => { const m = bySlug(slug)?.totalMinutes ?? totalMinutes(recipes[slug]?.time); return m ? fmtMinutes(m) : ""; };
  const courseOf = (d) => d.course || (recipes[d.slug]?.category === "baking" ? "Dessert" : "Main");
  const courses = ["Main", "Dessert"].map((c) => [c, lineup.dishes.filter((d) => courseOf(d) === c)]).filter(([, ds]) => ds.length);
  const ahead = plan?.makeAhead || [];

  // Nested recipes: required ingredients with their own recipe, under their dish.
  const nested = (dish, slug, seen) => {
    const items = ingredientsOf(recipes[slug] || {}).filter((i) => typeof i.recipe === "string" && !i.optional && !seen.has(i.recipe) && recipes[i.recipe]);
    if (!items.length) return "";
    return `<ul class="menu-nest">${items.map((i) => {
      const made = dish.made.includes(i.recipe), name = `made-${dish.slug}-${i.recipe}`;
      return `<li class="${fam(i.recipe)}">
        <span class="menu-name">${esc(title(i.recipe))}</span><span class="menu-dots" aria-hidden="true"></span><span class="menu-time">${time(i.recipe)}</span>
        <span class="menu-seg" role="radiogroup" aria-label="${esc(title(i.recipe))}">
          <label><input type="radio" name="${esc(name)}" value="make" data-dish="${esc(dish.slug)}" data-nested="${esc(i.recipe)}"${made ? "" : " checked"}><span>Make it</span></label>
          <label><input type="radio" name="${esc(name)}" value="made" data-dish="${esc(dish.slug)}" data-nested="${esc(i.recipe)}"${made ? " checked" : ""}><span>Already made</span></label>
        </span>
        ${made ? "" : nested(dish, i.recipe, new Set([...seen, i.recipe]))}
      </li>`;
    }).join("")}</ul>`;
  };
  const aheadLine = (slug) => {
    const q = ahead.find((x) => x.slug === slug);
    if (!q) return "";
    const key = `ahead:${slug}`;
    return `<div class="menu-with">${q.ahead ? `Made ahead · saves ${about(q.saves)} today` : `All today · ${about(q.saves)} longer than making it ahead`}
      <span class="menu-anchor"><button class="menu-choice" type="button" aria-haspopup="menu" aria-expanded="${openPop === key}" data-pop="${esc(key)}">Change ▾</button>
      ${openPop === key ? `<span class="menu-pop" role="menu">
        <button type="button" role="menuitem" data-ahead="${esc(slug)}" data-value="true">Make it ahead</button>
        <button type="button" role="menuitem" data-ahead="${esc(slug)}" data-value="false">Make it all today</button></span>` : ""}</span></div>`;
  };
  const dishLine = (d, course) => {
    const key = `dish:${d.slug}`;
    return `<li class="${fam(d.slug)}">
      <span class="menu-anchor"><button class="menu-dish" type="button" aria-haspopup="menu" aria-expanded="${openPop === key}" data-pop="${esc(key)}">${esc(title(d.slug))}</button>
      ${openPop === key ? `<span class="menu-pop" role="menu">
        <a role="menuitem" href="recipe.html?r=${encodeURIComponent(d.slug)}">Open the recipe</a>
        <button type="button" role="menuitem" data-move="${esc(d.slug)}" data-course="${course === "Main" ? "Dessert" : "Main"}">Move to ${course === "Main" ? "Dessert" : "Main"}</button>
        <button type="button" role="menuitem" class="menu-danger" data-remove="${esc(d.slug)}">Remove from menu</button></span>` : ""}</span>
      <span class="menu-dots" aria-hidden="true"></span><span class="menu-time">${time(d.slug)}</span>
      ${aheadLine(d.slug)}${nested(d, d.slug, new Set([d.slug]))}</li>`;
  };

  // A dish that will sit longer than it can, by more than a few minutes.
  const late = (plan?.serving || []).flatMap((c) => Object.entries(c.sitting).filter(([, s]) => s.over > 5).map(([slug, s]) =>
    `<p class="menu-warn" role="note"><b>${esc(title(slug))} will be ready about ${fmtMinutes(Math.round(s.waits))} before serving,</b> longer than it can wait (${fmtMinutes(s.limit)}). No order gets it closer.</p>`)).join("");

  // The part made ahead of time, with its own start.
  const aheadSlugs = ahead.filter((q) => q.ahead).map((q) => q.slug);
  const aheadDone = aheadSlugs.length && aheadSlugs.every((s) => menu.aheadDone?.[s]);
  const aheadBox = plan?.aheadOfTime && aheadSlugs.length ? `<section class="menu-ahead" aria-labelledby="ahead-h">
      <h2 id="ahead-h">Ahead of time</h2>
      ${aheadDone ? `<p class="menu-done">✓ ${esc(aheadSlugs.map(title).join(" and "))}: made ahead.</p>`
        : `<p>The part of ${esc(aheadSlugs.map(title).join(" and "))} that keeps: ${about(plan.aheadOfTime.minutes)}. Make it the day before, or earlier today.</p>
           <button class="btn menu-ahead-start" type="button" data-start="ahead">Start ${esc(aheadSlugs.map(title).join(" and "))} · ${about(plan.aheadOfTime.minutes)}</button>`}
    </section>` : "";

  // What the recipes don't say: asked here, saved to the recipe on this device.
  const unknown = plan?.unknown || [];
  const steps = (slug) => toGroups(recipes[slug]?.steps).flatMap((g) => g.items);
  const asks = unknown.length ? `<section class="menu-asks" aria-labelledby="asks-h">
      <h2 id="asks-h">${unknown.length === 1 ? "One thing" : `${unknown.length} things`} the recipes don't say</h2>
      <p class="muted">The plan guesses until you say. Your answers are saved to the recipe on this device.</p>
      ${unknown.map((u) => u.kind === "wait" ? `<form class="menu-ask fam-${esc(recipes[u.slug]?.category)}" data-wait="${esc(u.slug)}" data-step="${u.step}">
          <p><b>${esc(title(u.slug))}</b>, step ${u.step + 1}:</p>
          <blockquote>${esc(typeof steps(u.slug)[u.step] === "string" ? steps(u.slug)[u.step] : steps(u.slug)[u.step]?.do)}</blockquote>
          <label>How long, in minutes? <input type="text" inputmode="decimal" name="minutes" value="${esc(u.suggest ? Math.round(minutesIn(u.suggest)) : "")}" size="4" required></label>
          <button class="btn" type="submit">Save</button>
        </form>` : `<div class="menu-ask fam-${esc(recipes[u.slug]?.category)}">
          <p><b>${esc(title(u.slug))}</b>: how is it served? Until you say, it's planned ${esc(u.assumed)}.</p>
          <span class="menu-seg menu-seg-stack" role="radiogroup" aria-label="How ${esc(title(u.slug))} is served">
            ${[["hot", "Hot · eat within a few minutes"], ["soon", "Soon · fine for half an hour"], ["keeps", "Keeps"]].map(([v, l]) =>
              `<label><input type="radio" name="serve-${esc(u.slug)}" value="${v}" data-serve="${esc(u.slug)}"><span>${l}</span></label>`).join("")}
          </span></div>`).join("")}
    </section>` : "";

  const prep = lineup.prepFirst;
  const cooking = menu.cooking && menu.cooking.part !== "ahead";
  body.innerHTML = `${aheadBox}
    <section class="menu-card" aria-labelledby="menu-h">
      <h1 class="menu-head" id="menu-h">Your menu</h1>
      ${courses.map(([c, ds]) => `<h2 class="menu-course">${c}${c === "Dessert" && courses.length > 1 ? ` <small>45 min later</small>` : ""}</h2>
        <ul class="menu-list" aria-label="${c}">${ds.map((d) => dishLine(d, c)).join("")}</ul>`).join("")}
      <a class="menu-slot" href="?q=">+ Add a dish</a>
      ${late}
      <div class="menu-foot">
        <label class="menu-switch"><input type="checkbox" role="switch" id="prep-first"${prep ? " checked" : ""}> Prep everything first</label>
        ${other ? `<span class="muted">${prep ? "Fastest" : "Prep first"} would be ${about(dayLength(other))}</span>` : ""}
      </div>
    </section>
    ${asks}
    ${error ? `<div class="menu-error" role="alert"><h2>These can't be planned together</h2>
        <p>No order gets every dish made: one needs another that needs it back, or nothing can go on. Try removing a dish, or switching off Prep everything first.</p></div>`
      : plan ? `<button class="btn cook-start menu-start" type="button" data-start="day">${cooking ? "Back to cooking" : `Start cooking · ${about(dayLength(plan))}`}</button>` : ""}`;
}
// Minutes in "25 minutes", "1 1/2 hr".
function minutesIn(text) {
  const m = /(\d+(?:\.\d+)?)\s*(?:(?:to|-|–)\s*\d+(?:\.\d+)?\s*)?(sec|min|hr|hour)/i.exec(text || "");
  if (!m) return "";
  return +m[1] * ({ sec: 1 / 60, min: 1, hr: 60, hour: 60 }[m[2].toLowerCase()]);
}

// ===== Wiring =====
function changeMenu(fn) {
  const m = Menu.load();
  fn(m);
  Menu.save(m);
  openPop = null;
  render();
}
function closePop(focus) {
  if (!openPop) return;
  const key = openPop;
  openPop = null;
  drawCard(Menu.load());
  if (focus) body.querySelector(`[data-pop="${CSS.escape(key)}"]`)?.focus();
}

body.addEventListener("click", (e) => {
  const t = e.target.closest("button, a");
  if (!t) { closePop(); return; }
  const d = t.dataset;
  if (t.matches(".tab")) return setSearch({ cat: d.cat });
  if (d.add) { Menu.add(d.add); return render(); }
  if (t.matches(".menu-slot")) { e.preventDefault(); setSearch({ q: "", cat: "all" }, true); search.focus(); return; }
  if (d.pop) {
    openPop = openPop === d.pop ? null : d.pop;
    drawCard(Menu.load());
    body.querySelector(".menu-pop [role=menuitem]")?.focus();
    return;
  }
  if (d.move) return changeMenu((m) => { m.dishes.find((x) => x.slug === d.move).course = d.course; });
  if (d.remove) return changeMenu((m) => { m.dishes = m.dishes.filter((x) => x.slug !== d.remove); });
  if (d.ahead) return changeMenu((m) => { m.ahead = { ...m.ahead, [d.ahead]: d.value === "true" }; });
  if (d.start) return startCooking(d.start);
  if (!t.closest(".menu-pop")) closePop();
});
body.addEventListener("change", (e) => {
  const t = e.target;
  if (t.id === "prep-first") { Menu.setPrepFirst(t.checked); return render(); }
  if (t.dataset.nested) {
    return changeMenu((m) => {
      const dish = m.dishes.find((x) => x.slug === t.dataset.dish);
      const made = new Set(madeOf(dish, planned.recipes));
      if (t.value === "made") made.add(t.dataset.nested); else made.delete(t.dataset.nested);
      dish.made = [...made];
    });
  }
  if (t.dataset.serve) {
    Menu.setAnswers(t.dataset.serve, { ...Menu.answers(t.dataset.serve), serve: t.value });
    return render();
  }
});
body.addEventListener("submit", (e) => {
  e.preventDefault();
  const f = e.target, n = parseFloat(f.elements.minutes.value);
  if (!(n > 0)) return f.elements.minutes.focus();
  const a = Menu.answers(f.dataset.wait);
  Menu.setAnswers(f.dataset.wait, { ...a, waits: { ...a.waits, [f.dataset.step]: `${n} min` } });
  render();
});
// A dish's menu: arrows move through it, Escape closes it.
body.addEventListener("keydown", (e) => {
  if (!openPop) return;
  if (e.key === "Escape") { e.preventDefault(); return closePop(true); }
  const items = [...body.querySelectorAll(".menu-pop [role=menuitem]")];
  const i = items.indexOf(document.activeElement);
  if (i < 0) return;
  if (e.key === "ArrowDown" || e.key === "ArrowUp") {
    e.preventDefault();
    items[(i + (e.key === "ArrowDown" ? 1 : items.length - 1)) % items.length].focus();
  }
});
// A click anywhere else closes an open menu. (The path, not the target: the
// button clicked may already have been redrawn.)
document.addEventListener("click", (e) => { if (openPop && !e.composedPath().includes(body)) closePop(); });

search.addEventListener("input", () => {
  if (!searching()) {
    setSearch({ q: search.value, cat: "all" });
    search.focus();
  } else setSearch({ q: search.value });
});

// ===== Cooking =====
let cook = null;
function startCooking(part) {
  const m = Menu.load();
  if (!m.cooking || m.cooking.part !== part) {
    m.cooking = { part, started: Date.now(), done: [] };
    Menu.save(m);
  }
  history.pushState({ cook: true }, "", "#cook");
  sync();
  window.scrollTo(0, 0);
}
// Cook mode is open while the URL ends in #cook, so the phone's back gesture
// closes it and a reload keeps it open.
function sync() {
  if (location.hash === "#cook" && !cook && Menu.load().cooking) {
    cook = openCook({ planMenu, onClose: closeCook });
  } else if (location.hash !== "#cook" && cook) {
    cook.close();
    cook = null;
    render();
  } else if (location.hash === "#cook" && !Menu.load().cooking) {
    history.replaceState(null, "", location.pathname + location.search);
    render();
  }
}
function closeCook() {
  if (history.state && history.state.cook) return history.back();
  history.replaceState(null, "", location.pathname + location.search);
  sync();
}
window.addEventListener("popstate", () => { sync(); render(); });

getJSON("recipes/index.json").then((list) => { index = list; }).catch(() => {}).finally(() => { render(); sync(); });
