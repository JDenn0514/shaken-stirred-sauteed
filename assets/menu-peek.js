// Your menu in view while you choose recipes (the recipes page, and the menu
// page's search). On a wide screen it's a panel beside the recipes; on a phone
// a "Your menu ▾" button that opens the same list. It's for reading: the names
// link to their recipes, and removing a dish stays on the recipe page and the
// menu card.
window.SSSMenuPeek = (() => {
  const { esc, fmtMinutes } = window.SSS;
  const Menu = window.SSSMenu;
  const SHOWN = 5;

  // host: an element to draw into; recipes: the index (titles and times).
  function render(host, recipes) {
    if (!host || !Menu) return;
    const open = host.querySelector(".menu-peek-toggle")?.getAttribute("aria-expanded") === "true";
    const dishes = Menu.load().dishes.map((d) => recipes.find((r) => r.slug === d.slug) || { slug: d.slug, title: d.slug });
    const row = (r) => `<li class="fam-${esc(r.category || "cooking")}">
        <a href="recipe.html?r=${encodeURIComponent(r.slug)}">${esc(r.title)}</a><span class="menu-dots" aria-hidden="true"></span>
        <span class="menu-time">${r.totalMinutes ? fmtMinutes(r.totalMinutes) : ""}</span></li>`;
    host.innerHTML = `<section class="menu-peek${dishes.length ? "" : " empty"}" aria-labelledby="peek-h">
        <h2 class="menu-peek-head" id="peek-h">Your menu</h2>
        <button class="menu-peek-toggle" type="button" aria-expanded="${open}" aria-controls="peek-body">Your menu<span aria-hidden="true">${open ? " ▴" : " ▾"}</span></button>
        <div class="menu-peek-body" id="peek-body"${open ? "" : " hidden"}>
          ${dishes.length ? `<ul class="menu-peek-list">${dishes.slice(0, SHOWN).map(row).join("")}</ul>
            ${dishes.length > SHOWN ? `<p class="muted">+${dishes.length - SHOWN} more</p>` : ""}
            <a class="menu-peek-go" href="menu.html">Your menu →</a>`
          : `<p class="muted">Nothing on your menu yet. Open a recipe and tap + Add to menu.</p>`}
        </div>
      </section>`;
  }
  document.addEventListener("click", (e) => {
    const b = e.target.closest(".menu-peek-toggle");
    if (!b) return;
    const open = b.getAttribute("aria-expanded") !== "true";
    b.setAttribute("aria-expanded", String(open));
    b.lastElementChild.textContent = open ? " ▴" : " ▾";
    document.getElementById(b.getAttribute("aria-controls")).hidden = !open;
  });
  return { render };
})();
