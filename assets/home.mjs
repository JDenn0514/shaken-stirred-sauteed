// The recipes page (recipes.html): draws the list, its tabs, filters and
// chips, and turns clicks into changes. What to show, and the URL, come from
// assets/recipe-list.mjs.
import * as L from "./recipe-list.mjs";

{
  const { CATEGORIES, esc, getJSON } = window.SSS;

  const $ = (id) => document.getElementById(id);
  const els = {
    search: $("search"), tabs: $("tabs"), filters: $("filters"), active: $("active"),
    sort: $("sort"), count: $("count"), grid: $("grid"), empty: $("empty"),
    sheet: $("sheet"), sheetTitle: $("sheet-title"), sheetBody: $("sheet-body"), sheetDone: $("sheet-done"),
    backdrop: $("backdrop"),
  };

  let recipes = [];
  let dims = [];         // vocabulary dimensions, in display order
  let openDim = null;    // dimension whose option panel is open

  // The section, search, sort and filter picks live in the URL
  // (?cat=cooking&cuisine=thai,mexican&q=&sort=) so Back and shared links work.
  // Filter picks are read once the vocabulary has loaded.
  let state = L.readState(new URLSearchParams(location.search), []);

  function syncURL() {
    const qs = L.toQuery(state, dims);
    history.replaceState(null, "", qs ? `?${qs}` : location.pathname);
  }

  function renderTabs() {
    const counts = L.sectionCounts(recipes, dims, state);
    const tabs = [["all", "All", "📖", counts.all]].concat(
      Object.entries(CATEGORIES).map(([k, c]) => [k, c.label, c.emoji, counts[k] || 0])
    );
    els.tabs.innerHTML = tabs.map(([k, label, emoji, n]) =>
      `<button class="tab" data-cat="${k}" aria-pressed="${state.cat === k}">
        <span aria-hidden="true">${emoji}</span>${label}<span class="n">${n}</span>
      </button>`).join("");
  }

  function renderFilters() {
    els.filters.innerHTML = L.filters(recipes, dims, state).map((d) => {
      const n = d.picked;
      return `<button class="filter-btn" data-dim="${esc(d.key)}" aria-expanded="${openDim === d.key}"
        aria-haspopup="dialog"${n ? ` data-on="true"` : ""}>${esc(d.label)}${n ? `<span class="n">${n}</span>` : ""}<span class="caret" aria-hidden="true">▾</span></button>`;
    }).join("");

    const chips = L.chips(dims, state).map((c) =>
      `<button class="chip" data-remove="${esc(c.dim)}" data-value="${esc(c.value)}" aria-pressed="true"
        aria-label="Remove ${esc(c.dimLabel)}: ${esc(c.label)}">${esc(c.label)} <span aria-hidden="true">×</span></button>`);
    els.active.innerHTML = chips.length ? chips.join("") + `<button class="clear" id="clear">Clear all</button>` : "";
  }

  function renderSheet() {
    const d = L.filters(recipes, dims, state).find((x) => x.key === openDim);
    if (!d) return;
    els.sheetTitle.textContent = d.label;
    els.sheetBody.innerHTML = d.groups.map((g) => {
      const opts = g.options.map((o) =>
        `<button class="opt" data-value="${esc(o.key)}" aria-pressed="${o.on}"${o.disabled ? " disabled" : ""}>
          ${esc(o.label)}<span class="n">${o.count}</span></button>`).join("");
      return `${g.label ? `<h3>${esc(g.label)}</h3>` : ""}<div class="opts">${opts}</div>`;
    }).join("");
  }

  function placeSheet() {
    // On wide screens the panel drops down under its button; on phones CSS pins it to the bottom.
    const btn = els.filters.querySelector(`[data-dim="${CSS.escape(openDim)}"]`);
    if (!btn || !matchMedia("(min-width: 720px)").matches) { els.sheet.style.left = els.sheet.style.top = ""; return; }
    const host = els.sheet.offsetParent.getBoundingClientRect(), b = btn.getBoundingClientRect();
    const left = Math.max(0, Math.min(b.left - host.left, host.width - els.sheet.offsetWidth));
    els.sheet.style.left = `${left}px`;
    els.sheet.style.top = `${b.bottom - host.top + 6}px`;
  }

  function openSheet(key) {
    openDim = key;
    els.sheet.hidden = els.backdrop.hidden = false;
    document.body.classList.add("sheet-open");
    render();
    placeSheet();
    els.sheetDone.focus({ preventScroll: true });
  }
  function closeSheet() {
    if (!openDim) return;
    const key = openDim;
    openDim = null;
    els.sheet.hidden = els.backdrop.hidden = true;
    document.body.classList.remove("sheet-open");
    render();
    els.filters.querySelector(`[data-dim="${CSS.escape(key)}"]`)?.focus({ preventScroll: true });
  }

  // Cards are drawn by assets/recipe-view.js.
  const card = (r) => window.SSSView.cardHTML(r, { onMenu: !!(window.SSSMenu && window.SSSMenu.has(r.slug)) });

  function render() {
    renderTabs();
    renderFilters();
    renderSheet();
    const list = L.results(recipes, state);
    els.grid.innerHTML = list.map(card).join("");
    els.count.textContent = `${list.length} recipe${list.length === 1 ? "" : "s"}`;

    if (recipes.length === 0) {
      els.empty.innerHTML = `<span class="big">🧑‍🍳</span>No recipes yet. Add one to the <code>recipes/</code> folder to get started.`;
    } else if (list.length === 0) {
      els.empty.innerHTML = `<span class="big">🔍</span>Nothing matches that. <a href="recipes.html">Clear filters</a>`;
    }
    els.empty.hidden = list.length > 0;
    syncURL();
  }

  els.tabs.addEventListener("click", (e) => {
    const b = e.target.closest("[data-cat]");
    if (!b) return;
    state = L.pickSection(state, dims, b.dataset.cat);
    render();
  });
  els.filters.addEventListener("click", (e) => {
    const b = e.target.closest("[data-dim]");
    if (!b) return;
    if (openDim === b.dataset.dim) closeSheet(); else openSheet(b.dataset.dim);
  });
  els.sheetBody.addEventListener("click", (e) => {
    const b = e.target.closest("[data-value]");
    if (!b || !openDim) return;
    state = L.toggle(state, openDim, b.dataset.value);
    render();
    placeSheet();
  });
  els.active.addEventListener("click", (e) => {
    if (e.target.closest("#clear")) { state = L.clearAll(state); return render(); }
    const b = e.target.closest("[data-remove]");
    if (!b) return;
    state = L.toggle(state, b.dataset.remove, b.dataset.value);
    render();
  });
  els.sheetDone.addEventListener("click", closeSheet);
  els.backdrop.addEventListener("click", closeSheet);
  document.addEventListener("keydown", (e) => { if (e.key === "Escape") closeSheet(); });
  window.addEventListener("resize", () => openDim && placeSheet());
  els.search.addEventListener("input", () => { state = { ...state, q: els.search.value.trim() }; render(); });
  els.sort.addEventListener("change", () => { state = { ...state, sort: els.sort.value }; render(); });

  els.search.value = state.q;
  els.sort.value = state.sort;

  Promise.all([getJSON("recipes/index.json"), getJSON("recipes/vocabulary.json")])
    .then(([data, vocab]) => {
      recipes = data;
      dims = vocab.dimensions;
      state = L.readState(new URLSearchParams(location.search), dims);
      render();
      // Your menu, beside the recipes (or behind a button on a phone).
      if (window.SSSMenuPeek) window.SSSMenuPeek.render($("menu-peek-host"), recipes);
    })
    .catch((err) => {
      els.empty.hidden = false;
      els.empty.textContent = `Couldn't load recipes (${err.message}).`;
    });
}
