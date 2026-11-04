// Welcome page: fills in the recipe counts on the section doors and the
// "Browse all" button, and the count on the link to your menu. The links and search work without it.
(() => {
  const { getJSON } = window.SSS;
  // "Your menu · 2 →" once something's on it.
  const menuLink = document.getElementById("menu-link");
  if (menuLink && window.SSSMenu && window.SSSMenu.count()) menuLink.textContent = window.SSSMenu.linkText("Your menu");
  getJSON("recipes/index.json").then((recipes) => {
    const n = { all: recipes.length };
    for (const r of recipes) n[r.category] = (n[r.category] || 0) + 1;
    for (const el of document.querySelectorAll("[data-count]")) {
      const c = n[el.dataset.count] || 0;
      el.textContent = el.dataset.count === "all" ? `all ${c}` : `${c} recipe${c === 1 ? "" : "s"}`;
    }
  }).catch(() => {});
})();
