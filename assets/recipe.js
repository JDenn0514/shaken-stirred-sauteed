(() => {
  const { esc, getJSON } = window.SSS;
  // The page's HTML is drawn by assets/recipe-view.js; this file wires it up.
  const { recipePageHTML, stepsHTML } = window.SSSView;
  const root = document.getElementById("recipe");
  const slug = new URLSearchParams(location.search).get("r") || "";

  const fail = (msg) => {
    root.innerHTML = `<a class="back" href="recipes.html">← All recipes</a><p class="error">${esc(msg)}</p>`;
  };

  if (!/^[a-z0-9-]+$/.test(slug)) return fail("Recipe not found.");

  // Progress (checked ingredients / finished steps) is remembered per recipe on this device.
  const KEY = `sss:progress:${slug}`;
  const load = () => { try { return JSON.parse(localStorage.getItem(KEY)) || {}; } catch { return {}; } };
  const save = (p) => { try { localStorage.setItem(KEY, JSON.stringify(p)); } catch {} };

  // Which order the steps are shown in, when a recipe has both. One saved
  // choice covers this and the menu's "Prep everything first".
  const prepFirst = () => (window.SSSMenu ? window.SSSMenu.prepFirst() : true);

  function render(r, vocab) {
    document.title = `${r.title} · Shaken, Stirred & Sautéed`;
    // The recipe's drawing (assets/recipe-icons.js), shown by the stylesheet.
    const icon = window.SSSIcons ? window.SSSIcons.iconFor(r) : null;
    if (icon) root.dataset.icon = icon; else delete root.dataset.icon;
    root.innerHTML = recipePageHTML(r, vocab, {
      prepFirst: prepFirst(),
      cookLabel: window.SSSCook ? window.SSSCook.startLabel(r) : "",
      menu: !!window.SSSMenu,
    });
    // Signed in (the readable hint cookie), the recipe can be opened in the editor.
    if (window.SSS.signedIn) {
      root.querySelector(".recipe-toprow")?.insertAdjacentHTML("beforeend", `<a class="recipe-edit" data-signed-in href="edit.html?r=${encodeURIComponent(slug)}">Edit</a>`);
    }
    wire(r);
  }

  function wire(r) {
    // Numbering continues across step groups (set here, not inline, so the
    // page's Content-Security-Policy can forbid inline styles).
    const list = document.getElementById("steps");
    const number = () => list.querySelectorAll("ol.steps[data-start]").forEach((ol) => {
      ol.style.counterReset = `step ${ol.dataset.start}`;
    });
    number();
    document.getElementById("print").addEventListener("click", () => window.print());

    // Progress is saved by position, so it's only kept while the recipe's
    // ingredients and steps are the same shape as when it was saved
    // (SSSCook.progressFor, shared with the menu's cook mode).
    const progress = window.SSSCook ? window.SSSCook.progressFor(r, slug).progress : Object.assign({ ing: [], steps: [] }, load());
    const links = window.SSSCook ? window.SSSCook.linkIngredients(r) : null;
    const boxes = [...root.querySelectorAll("[data-ing]")];

    // Where you are is the first step not done, in the order shown.
    const paint = () => {
      const steps = [...list.querySelectorAll("[data-step]")];
      boxes.forEach((b) => { b.checked = progress.ing.includes(+b.dataset.ing); });
      const firstOpen = steps.find((s) => !progress.steps.includes(+s.dataset.step));
      steps.forEach((s) => {
        s.classList.toggle("done", progress.steps.includes(+s.dataset.step));
        const isCurrent = s === firstOpen && progress.steps.length > 0;
        s.classList.toggle("current", isCurrent);
        if (isCurrent) s.setAttribute("aria-current", "step"); else s.removeAttribute("aria-current");
      });
    };
    const toggle = (arr, i) => { const k = arr.indexOf(i); k >= 0 ? arr.splice(k, 1) : arr.push(i); };

    root.addEventListener("change", (e) => {
      if (e.target.id === "prep-first") {
        window.SSSMenu?.setPrepFirst(e.target.checked);
        list.querySelectorAll(":scope > h3, :scope > ol.steps").forEach((n) => n.remove());
        list.insertAdjacentHTML("beforeend", stepsHTML(r, prepFirst()));
        number();
        return paint();
      }
      if (!e.target.matches("[data-ing]")) return;
      if (window.SSSCook) window.SSSCook.tickIngredient(progress, links, +e.target.dataset.ing, e.target.checked);
      else toggle(progress.ing, +e.target.dataset.ing);
      save(progress); paint();
    });
    const flip = (s) => { toggle(progress.steps, +s.dataset.step); save(progress); paint(); };
    list.addEventListener("click", (e) => { const s = e.target.closest("[data-step]"); if (s) flip(s); });
    list.addEventListener("keydown", (e) => {
      const s = e.target.closest("[data-step]");
      if (s && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); flip(s); }
    });
    document.getElementById("reset").addEventListener("click", () => {
      progress.ing = []; progress.steps = []; progress.uses = []; progress.started = false; save(progress); paint();
    });
    paint();
    wireMenu();

    // Cook mode is open while the URL ends in #cook, so the phone's back
    // gesture closes it and a reload keeps it open.
    if (window.SSSCook) {
      let cook = null;
      const sync = () => {
        if (location.hash === "#cook" && !cook) {
          cook = window.SSSCook.open({ recipe: r, slug, progress, save, onChange: paint, onClose: close });
        } else if (location.hash !== "#cook" && cook) {
          cook.close(); cook = null;
        }
      };
      const close = () => {
        if (history.state && history.state.cook) return history.back();
        history.replaceState(null, "", location.pathname + location.search);
        sync();
      };
      document.getElementById("cook-start").addEventListener("click", () => {
        history.pushState({ cook: true }, "", "#cook");
        sync();
        window.scrollTo(0, 0);
      });
      window.addEventListener("popstate", sync);
      sync();
    }

    // Keep the phone screen awake while cooking (where the browser supports it).
    const wakeBtn = document.getElementById("wake");
    if ("wakeLock" in navigator) {
      let lock = null;
      wakeBtn.hidden = false;
      const set = (on) => wakeBtn.setAttribute("aria-pressed", String(on));
      wakeBtn.addEventListener("click", async () => {
        if (lock) { await lock.release(); lock = null; return set(false); }
        try {
          lock = await navigator.wakeLock.request("screen");
          set(true);
          lock.addEventListener("release", () => { lock = null; set(false); });
        } catch { set(false); }
      });
    }
  }

  // "+ Add to menu" beside Start, which becomes "✓ On your menu ▾" with a small
  // menu (Remove from menu, Go to your menu). The top of the page stays the
  // same either way, and Start always cooks just this recipe.
  function wireMenu() {
    const Menu = window.SSSMenu, box = document.getElementById("on-menu");
    if (!Menu || !box) return;
    let open = false;
    const draw = (focus) => {
      const on = Menu.has(slug);
      box.innerHTML = on
        ? `<button class="btn menu-on" type="button" aria-haspopup="menu" aria-expanded="${open}">✓ On your menu <span aria-hidden="true">▾</span></button>
           ${open ? `<span class="menu-pop" role="menu">
             <button type="button" role="menuitem" class="menu-danger" data-remove>Remove from menu</button>
             <a role="menuitem" href="menu.html">Go to your menu</a></span>` : ""}`
        : `<button class="btn menu-on" type="button">+ Add to menu</button>`;
      if (focus === "button") box.querySelector(".menu-on").focus();
      if (focus === "first") box.querySelector("[role=menuitem]")?.focus();
    };
    box.addEventListener("click", (e) => {
      const b = e.target.closest("button");
      if (!b) return;
      if (b.hasAttribute("data-remove")) { Menu.remove(slug); open = false; return draw("button"); }
      if (!Menu.has(slug)) { Menu.add(slug); return draw("button"); }
      open = !open;
      draw(open ? "first" : "button");
    });
    box.addEventListener("keydown", (e) => {
      if (!open) return;
      if (e.key === "Escape") { e.preventDefault(); open = false; return draw("button"); }
      const items = [...box.querySelectorAll("[role=menuitem]")], i = items.indexOf(document.activeElement);
      if (i >= 0 && (e.key === "ArrowDown" || e.key === "ArrowUp")) {
        e.preventDefault();
        items[(i + (e.key === "ArrowDown" ? 1 : items.length - 1)) % items.length].focus();
      }
    });
    document.addEventListener("click", (e) => { if (open && !e.composedPath().includes(box)) { open = false; draw(); } });
    // Another tab may change the menu.
    window.addEventListener("storage", (e) => { if (e.key === "sss:lineup") draw(); });
    draw();
  }

  // The tag list only adds the tag links, so the recipe still shows if it fails to load.
  Promise.all([getJSON(`recipes/${slug}.json`), getJSON("recipes/vocabulary.json").catch(() => null)])
    .then(([r, vocab]) => render(r, vocab))
    .catch(() => fail("Recipe not found."));
})();
