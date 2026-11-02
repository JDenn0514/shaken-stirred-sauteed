// Welcome page: fills in the recipe counts on the section doors and the
// "Browse all" button. The links and search work without it.
(() => {
  const { getJSON } = window.SSS;
  getJSON("recipes/index.json").then((recipes) => {
    const n = { all: recipes.length };
    for (const r of recipes) n[r.category] = (n[r.category] || 0) + 1;
    for (const el of document.querySelectorAll("[data-count]")) {
      const c = n[el.dataset.count] || 0;
      el.textContent = el.dataset.count === "all" ? `all ${c}` : `${c} recipe${c === 1 ? "" : "s"}`;
    }
  }).catch(() => {});
})();
