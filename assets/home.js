(() => {
  const { CATEGORIES, esc, fmtMinutes, getJSON } = window.SSS;

  const $ = (id) => document.getElementById(id);
  const els = {
    search: $("search"), tabs: $("tabs"), tags: $("tags"),
    sort: $("sort"), count: $("count"), grid: $("grid"), empty: $("empty"),
  };

  // Filter state lives in the URL (?cat=&tag=&q=&sort=) so Back and shared links work.
  const params = new URLSearchParams(location.search);
  const state = {
    cat: params.get("cat") || "all",
    tag: params.get("tag") || "",
    q: params.get("q") || "",
    sort: params.get("sort") || "az",
  };

  let recipes = [];

  function syncURL() {
    const p = new URLSearchParams();
    if (state.cat !== "all") p.set("cat", state.cat);
    if (state.tag) p.set("tag", state.tag);
    if (state.q) p.set("q", state.q);
    if (state.sort !== "az") p.set("sort", state.sort);
    const qs = p.toString();
    history.replaceState(null, "", qs ? `?${qs}` : location.pathname);
  }

  function matches(r, { ignoreCat = false, ignoreTag = false } = {}) {
    if (!ignoreCat && state.cat !== "all" && r.category !== state.cat) return false;
    if (!ignoreTag && state.tag && !(r.tags || []).includes(state.tag)) return false;
    if (state.q) {
      const words = state.q.toLowerCase().split(/\s+/).filter(Boolean);
      if (!words.every((w) => r.search.includes(w))) return false;
    }
    return true;
  }

  function renderTabs() {
    const pool = recipes.filter((r) => matches(r, { ignoreCat: true }));
    const tabs = [["all", "All", "📖", pool.length]].concat(
      Object.entries(CATEGORIES).map(([k, c]) => [k, c.label, c.emoji, pool.filter((r) => r.category === k).length])
    );
    els.tabs.innerHTML = tabs.map(([k, label, emoji, n]) =>
      `<button class="tab" data-cat="${k}" aria-pressed="${state.cat === k}">
        <span aria-hidden="true">${emoji}</span>${label}<span class="n">${n}</span>
      </button>`).join("");
  }

  function renderTags() {
    const pool = recipes.filter((r) => matches(r, { ignoreTag: true }));
    const counts = new Map();
    pool.forEach((r) => (r.tags || []).forEach((t) => counts.set(t, (counts.get(t) || 0) + 1)));
    if (state.tag && !counts.has(state.tag)) counts.set(state.tag, 0);
    const tags = [...counts.keys()].sort((a, b) => a.localeCompare(b));
    els.tags.innerHTML = tags.map((t) =>
      `<button class="chip" data-tag="${esc(t)}" aria-pressed="${state.tag === t}">#${esc(t)}</button>`).join("");
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
    return `<li><a class="card" href="recipe.html?r=${encodeURIComponent(r.slug)}">
      ${r.image ? `<img class="card-img" src="${esc(r.image)}" alt="" loading="lazy">` : ""}
      <div class="card-body">
        <span class="badge ${esc(r.category)}">${esc(c.label)}</span>
        <h2>${esc(r.title)}</h2>
        ${r.description ? `<p>${esc(r.description)}</p>` : ""}
        ${meta ? `<div class="card-meta">${meta}</div>` : ""}
      </div>
    </a></li>`;
  }

  function render() {
    renderTabs();
    renderTags();
    const list = sortList(recipes.filter((r) => matches(r)));
    els.grid.innerHTML = list.map(card).join("");
    els.count.textContent = `${list.length} recipe${list.length === 1 ? "" : "s"}`;

    if (recipes.length === 0) {
      els.empty.innerHTML = `<span class="big">🧑‍🍳</span>No recipes yet. Add one to the <code>recipes/</code> folder to get started.`;
    } else if (list.length === 0) {
      els.empty.innerHTML = `<span class="big">🔍</span>Nothing matches that. <a href="./">Clear filters</a>`;
    }
    els.empty.hidden = list.length > 0;
    syncURL();
  }

  els.tabs.addEventListener("click", (e) => {
    const b = e.target.closest("[data-cat]");
    if (!b) return;
    state.cat = b.dataset.cat;
    render();
  });
  els.tags.addEventListener("click", (e) => {
    const b = e.target.closest("[data-tag]");
    if (!b) return;
    state.tag = state.tag === b.dataset.tag ? "" : b.dataset.tag;
    render();
  });
  els.search.addEventListener("input", () => { state.q = els.search.value.trim(); render(); });
  els.sort.addEventListener("change", () => { state.sort = els.sort.value; render(); });

  els.search.value = state.q;
  els.sort.value = state.sort;

  getJSON("recipes/index.json")
    .then((data) => { recipes = data; render(); })
    .catch((err) => {
      els.empty.hidden = false;
      els.empty.textContent = `Couldn't load recipes (${err.message}).`;
    });
})();
