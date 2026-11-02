(() => {
  const { CATEGORIES, esc, fmtMinutes, getJSON } = window.SSS;

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

  // Filter state lives in the URL (?cat=cooking&cuisine=thai,mexican&q=&sort=) so Back and shared links work.
  const params = new URLSearchParams(location.search);
  const state = {
    cat: params.get("cat") || "all",
    q: params.get("q") || "",
    sort: params.get("sort") || "az",
    sel: {},             // dimension key -> Set of value keys
  };

  // Which filters a section shows: its own plus the shared ones; "All" shows only the shared ones.
  const dimsFor = (cat) => dims.filter((d) => (cat === "all" ? d.shared : d.sections.includes(cat)));
  // A dimension's options for a section, as [{ label, values }] groups.
  const groupsFor = (d, cat) => {
    if (d.valuesBySection) return cat === "all" ? [] : [{ label: "", values: d.valuesBySection[cat] || [] }];
    return d.groups || [{ label: "", values: d.values || [] }];
  };
  const labelOf = (d, key) => {
    for (const g of groupsFor(d, state.cat)) for (const v of g.values) if (v.key === key) return v.label;
    return key;
  };

  // Drop selections that don't apply to the current section.
  function prune() {
    const visible = new Map(dimsFor(state.cat).map((d) => [d.key, d]));
    for (const key of Object.keys(state.sel)) {
      const d = visible.get(key);
      const ok = d ? new Set(groupsFor(d, state.cat).flatMap((g) => g.values.map((v) => v.key))) : new Set();
      for (const v of state.sel[key]) if (!ok.has(v)) state.sel[key].delete(v);
      if (!state.sel[key].size) delete state.sel[key];
    }
  }

  function syncURL() {
    const p = new URLSearchParams();
    if (state.cat !== "all") p.set("cat", state.cat);
    for (const d of dims) if (state.sel[d.key]?.size) p.set(d.key, [...state.sel[d.key]].join(","));
    if (state.q) p.set("q", state.q);
    if (state.sort !== "az") p.set("sort", state.sort);
    const qs = p.toString().replace(/%2C/g, ",");
    history.replaceState(null, "", qs ? `?${qs}` : location.pathname);
  }

  const matchesText = (r) => {
    if (!state.q) return true;
    const words = state.q.toLowerCase().split(/\s+/).filter(Boolean);
    return words.every((w) => r.search.includes(w));
  };
  const inSection = (r) => state.cat === "all" || r.category === state.cat;
  // OR within a filter, AND across filters. `skip` leaves one filter out (for its own counts).
  const matchesFilters = (r, skip) => Object.entries(state.sel).every(([key, vals]) =>
    key === skip || !vals.size || (r.facets?.[key] || []).some((v) => vals.has(v)));
  const matches = (r, skip) => inSection(r) && matchesText(r) && matchesFilters(r, skip);

  function counts(d) {
    const n = new Map();
    for (const r of recipes) if (matches(r, d.key)) for (const v of r.facets?.[d.key] || []) n.set(v, (n.get(v) || 0) + 1);
    return n;
  }

  function renderTabs() {
    const pool = recipes.filter(matchesText);
    const tabs = [["all", "All", "📖", pool.length]].concat(
      Object.entries(CATEGORIES).map(([k, c]) => [k, c.label, c.emoji, pool.filter((r) => r.category === k).length])
    );
    els.tabs.innerHTML = tabs.map(([k, label, emoji, n]) =>
      `<button class="tab" data-cat="${k}" aria-pressed="${state.cat === k}">
        <span aria-hidden="true">${emoji}</span>${label}<span class="n">${n}</span>
      </button>`).join("");
  }

  function renderFilters() {
    // Hide filters no recipe in this section uses (e.g. Diet on cocktails today).
    const section = recipes.filter(inSection);
    const shown = dimsFor(state.cat).filter((d) => section.some((r) => (r.facets?.[d.key] || []).length));
    els.filters.innerHTML = shown.map((d) => {
      const n = state.sel[d.key]?.size || 0;
      return `<button class="filter-btn" data-dim="${esc(d.key)}" aria-expanded="${openDim === d.key}"
        aria-haspopup="dialog"${n ? ` data-on="true"` : ""}>${esc(d.label)}${n ? `<span class="n">${n}</span>` : ""}<span class="caret" aria-hidden="true">▾</span></button>`;
    }).join("");

    const chips = [];
    for (const d of dims) for (const v of state.sel[d.key] || []) {
      chips.push(`<button class="chip" data-remove="${esc(d.key)}" data-value="${esc(v)}" aria-pressed="true"
        aria-label="Remove ${esc(d.label)}: ${esc(labelOf(d, v))}">${esc(labelOf(d, v))} <span aria-hidden="true">×</span></button>`);
    }
    els.active.innerHTML = chips.length ? chips.join("") + `<button class="clear" id="clear">Clear all</button>` : "";
  }

  function renderSheet() {
    const d = dims.find((x) => x.key === openDim);
    if (!d) return;
    const n = counts(d);
    const sel = state.sel[d.key] || new Set();
    els.sheetTitle.textContent = d.label;
    els.sheetBody.innerHTML = groupsFor(d, state.cat).map((g) => {
      const opts = g.values.map((v) => {
        const c = n.get(v.key) || 0, on = sel.has(v.key);
        return `<button class="opt" data-value="${esc(v.key)}" aria-pressed="${on}"${!c && !on ? " disabled" : ""}>
          ${esc(v.label)}<span class="n">${c}</span></button>`;
      }).join("");
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

  function sortList(list) {
    const byTitle = (a, b) => a.title.localeCompare(b.title);
    if (state.sort === "new") return list.sort((a, b) => (b.added || "").localeCompare(a.added || "") || byTitle(a, b));
    if (state.sort === "quick") return list.sort((a, b) => (a.totalMinutes ?? 1e9) - (b.totalMinutes ?? 1e9) || byTitle(a, b));
    return list.sort(byTitle);
  }

  function card(r) {
    const c = CATEGORIES[r.category] || { label: r.category };
    const meta = [
      r.totalMinutes != null ? `⏱ ${fmtMinutes(r.totalMinutes)}` : "",
      r.yield ? `🍽 ${esc(r.yield)}` : "",
    ].filter(Boolean).map((m) => `<span>${m}</span>`).join("");
    const icon = r.icon ? ` data-icon="${esc(r.icon)}"` : "";
    return `<li><a class="card" href="recipe.html?r=${encodeURIComponent(r.slug)}"${icon}>
      ${r.image ? `<img class="card-img" src="${esc(r.image)}" alt="" loading="lazy">` : ""}
      <div class="card-body">
        ${r.icon ? `<span class="card-icon" aria-hidden="true"></span>` : ""}
        <div class="badges">
          <span class="badge ${esc(r.category)}">${esc(c.label)}</span>
          ${r.kind === "component" ? `<span class="badge component">Component</span>` : ""}
        </div>
        <h2>${esc(r.title)}</h2>
        ${r.description ? `<p>${esc(r.description)}</p>` : ""}
        ${meta ? `<div class="card-meta">${meta}</div>` : ""}
      </div>
    </a></li>`;
  }

  function render() {
    renderTabs();
    renderFilters();
    renderSheet();
    const list = sortList(recipes.filter((r) => matches(r)));
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
    state.cat = b.dataset.cat;
    prune();
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
    const set = state.sel[openDim] || (state.sel[openDim] = new Set());
    set.has(b.dataset.value) ? set.delete(b.dataset.value) : set.add(b.dataset.value);
    if (!set.size) delete state.sel[openDim];
    render();
    placeSheet();
  });
  els.active.addEventListener("click", (e) => {
    if (e.target.closest("#clear")) { state.sel = {}; return render(); }
    const b = e.target.closest("[data-remove]");
    if (!b) return;
    state.sel[b.dataset.remove]?.delete(b.dataset.value);
    if (!state.sel[b.dataset.remove]?.size) delete state.sel[b.dataset.remove];
    render();
  });
  els.sheetDone.addEventListener("click", closeSheet);
  els.backdrop.addEventListener("click", closeSheet);
  document.addEventListener("keydown", (e) => { if (e.key === "Escape") closeSheet(); });
  window.addEventListener("resize", () => openDim && placeSheet());
  els.search.addEventListener("input", () => { state.q = els.search.value.trim(); render(); });
  els.sort.addEventListener("change", () => { state.sort = els.sort.value; render(); });

  els.search.value = state.q;
  els.sort.value = state.sort;

  Promise.all([getJSON("recipes/index.json"), getJSON("recipes/vocabulary.json")])
    .then(([data, vocab]) => {
      recipes = data;
      dims = vocab.dimensions;
      for (const d of dims) {
        const v = params.get(d.key);
        if (v) state.sel[d.key] = new Set(v.split(",").filter(Boolean));
      }
      prune();
      render();
    })
    .catch((err) => {
      els.empty.hidden = false;
      els.empty.textContent = `Couldn't load recipes (${err.message}).`;
    });
})();
