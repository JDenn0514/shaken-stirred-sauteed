(() => {
  const { CATEGORIES, esc, fmtMinutes, totalMinutes, getJSON, toGroups } = window.SSS;
  const root = document.getElementById("recipe");
  const slug = new URLSearchParams(location.search).get("r") || "";

  // Only allow ordinary web links (blocks javascript:, data:, etc.).
  const safeURL = (u) => {
    try {
      const url = new URL(u);
      return url.protocol === "https:" || url.protocol === "http:" ? url.href : "";
    } catch { return ""; }
  };

  const fail = (msg) => {
    root.innerHTML = `<a class="back" href="recipes.html">← All recipes</a><p class="error">${esc(msg)}</p>`;
  };

  if (!/^[a-z0-9-]+$/.test(slug)) return fail("Recipe not found.");

  // Progress (checked ingredients / finished steps) is remembered per recipe on this device.
  const KEY = `sss:progress:${slug}`;
  const load = () => { try { return JSON.parse(localStorage.getItem(KEY)) || {}; } catch { return {}; } };
  const save = (p) => { try { localStorage.setItem(KEY, JSON.stringify(p)); } catch {} };

  // An ingredient is a plain string, or { grams, qty, ml, item, note }.
  const ingredientHTML = (it) => {
    if (typeof it === "string") return esc(it);
    const amount = [it.grams != null && `${it.grams} g`, it.qty].filter(Boolean).join(" · ");
    return `${amount ? `<b class="qty">${esc(amount)}</b> ` : ""}${esc(it.item)}`
      + `${it.ml != null ? ` <span class="muted">${esc(it.ml)} ml</span>` : ""}`
      + `${it.note ? ` <span class="muted">${esc(it.note)}</span>` : ""}`;
  };

  // A step is a plain string, or { do, wait, cue }.
  const stepHTML = (s) => typeof s === "string" ? esc(s) : esc(s.do)
    + (s.wait ? `<span class="step-wait">⏱ ${esc(s.wait)}</span>` : "")
    + (s.cue ? `<span class="step-cue">✓ ${esc(s.cue)}</span>` : "");

  // The recipe's filter tags as links that open its section with that filter on.
  const tagGroupsHTML = (r, vocab) => {
    if (!vocab || !r.tags || typeof r.tags !== "object") return "";
    const rows = vocab.dimensions.filter((d) => !d.computed && (r.tags[d.key] || []).length).map((d) => {
      const all = d.valuesBySection ? d.valuesBySection[r.category] || []
        : d.values || (d.groups || []).flatMap((g) => g.values);
      const label = (k) => (all.find((v) => v.key === k) || { label: k }).label;
      const links = r.tags[d.key].map((v) =>
        `<a class="chip" href="recipes.html?cat=${encodeURIComponent(r.category)}&amp;${encodeURIComponent(d.key)}=${encodeURIComponent(v)}">${esc(label(v))}</a>`).join("");
      return `<div><dt>${esc(d.label)}</dt><dd>${links}</dd></div>`;
    });
    return rows.length ? `<dl class="tag-groups">${rows.join("")}</dl>` : "";
  };

  function render(r, vocab) {
    const cat = CATEGORIES[r.category] || { label: r.category };
    document.title = `${r.title} · Shaken, Stirred & Sautéed`;
    const t = r.time || {};
    const total = totalMinutes(t);

    // Cards list their times as printed ("times"); older recipes use minutes ("time").
    const timeFacts = r.times ? r.times : [
      ["Prep", t.prep != null && fmtMinutes(t.prep)],
      ["Cook", t.cook != null && fmtMinutes(t.cook)],
      ["Chill", t.chill != null && fmtMinutes(t.chill)],
      ["Total", total != null && fmtMinutes(total)],
    ];
    // "Serves 6 · Makes about 12 cups" -> [Serves, 6], [Makes, about 12 cups]
    const yieldFacts = (r.yield || "").split(" · ").filter(Boolean).map((y) => {
      const m = /^(makes|serves)\s+(.+)$/i.exec(y);
      return m ? [m[1][0].toUpperCase() + m[1].slice(1).toLowerCase(), m[2]] : ["Makes", y];
    });
    const facts = [
      ...yieldFacts,
      ...timeFacts,
      ["Pan", r.pan],
      [r.heatLabel || "Heat", r.heat],
      ["ABV", r.abv],
      ["Std drinks", r.standardDrinks],
      ["Keeps", r.keeps],
      ["Glass", r.glass],
      ["Ice", r.ice],
      ["Method", r.method],
      ["Garnish", r.garnish],
      ["Nutrition", r.nutrition],
      ["Origin", r.origin],
    ].filter(([, v]) => v != null && v !== false && v !== "");

    let ingIdx = 0, stepIdx = 0;
    const ingHTML = toGroups(r.ingredients).map((g) => `
      ${g.group ? `<h3>${esc(g.group)}</h3>` : ""}
      <ul class="ingredients">${g.items.map((it) => `
        <li><label><input type="checkbox" data-ing="${ingIdx++}"><span>${ingredientHTML(it)}</span></label></li>`).join("")}
      </ul>`).join("");
    const stepsHTML = toGroups(r.steps).map((g) => `
      ${g.group ? `<h3>${esc(g.group)}</h3>` : ""}
      <ol class="steps" data-start="${stepIdx}">${g.items.map((s) => `
        <li data-step="${stepIdx++}" tabindex="0">${stepHTML(s)}</li>`).join("")}
      </ol>`).join("");
    const notesHTML = toGroups(r.notes).map((g) => `
      ${g.group ? `<h3>${esc(g.group)}</h3>` : ""}
      <ul class="notes">${g.items.map((n) => `<li>${esc(n)}</li>`).join("")}</ul>`).join("");

    // The recipe's drawing (assets/recipe-icons.js), shown by the stylesheet.
    const icon = window.SSSIcons ? window.SSSIcons.iconFor(Object.assign({ slug }, r)) : null;
    if (icon) root.dataset.icon = icon; else delete root.dataset.icon;

    root.innerHTML = `
      <div class="recipe-toprow">
        <a class="back" href="recipes.html?cat=${encodeURIComponent(r.category)}">← ${esc(cat.label)}</a>
        ${window.SSSMenu ? `<a class="menu-link" href="menu.html">${esc(window.SSSMenu.linkText())}</a>` : ""}
      </div>
      ${r.image ? `<img class="recipe-hero" src="${esc(r.image)}" alt="">` : ""}
      ${r.kind === "component" ? `<span class="badge component">Component</span>` : ""}
      ${icon ? `<span class="recipe-icon" aria-hidden="true"></span>` : ""}
      <h1>${esc(r.title)}</h1>
      ${r.description ? `<p class="lede">${esc(r.description)}</p>` : ""}
      ${facts.length ? `<dl class="facts">${facts.map(([k, v]) =>
        `<div class="fact"><dt>${esc(k)}</dt><dd>${esc(v)}</dd></div>`).join("")}</dl>` : ""}

      <div class="start-row">
        ${window.SSSCook ? `<button class="btn cook-start" id="cook-start" type="button">${esc(window.SSSCook.startLabel(r))}</button>` : ""}
        ${window.SSSMenu ? `<span class="menu-anchor" id="on-menu"></span>` : ""}
      </div>
      <div class="toolbar">
        <button class="btn" id="wake" aria-pressed="false" hidden>☀️ Keep screen on</button>
        <button class="btn" id="reset">↺ Reset checkmarks</button>
        <button class="btn" id="print">🖨 Print</button>
      </div>

      ${r.beforeYouStart && r.beforeYouStart.length ? `<section class="section before"><h2>Before you start</h2>
        <ul class="notes">${r.beforeYouStart.map((n) => `<li>${esc(n)}</li>`).join("")}</ul></section>` : ""}
      <section class="section"><h2>${r.category === "cocktails" ? "Spec" : "Ingredients"}</h2>${ingHTML}</section>
      <section class="section"><h2>${r.category === "cocktails" ? "Method" : "Steps"}</h2>${stepsHTML}</section>
      ${notesHTML ? `<section class="section"><h2>Notes</h2>${notesHTML}</section>` : ""}
      ${tagGroupsHTML(r, vocab)}
      ${r.source && (r.source.name || r.source.url) ? `<p class="source">Source: ${safeURL(r.source.url)
        ? `<a href="${esc(safeURL(r.source.url))}" rel="noopener noreferrer" target="_blank">${esc(r.source.name || r.source.url)}</a>`
        : esc(r.source.name || r.source.url)}</p>` : ""}
    `;
    wire(r);
  }

  function wire(r) {
    // Numbering continues across step groups (set here, not inline, so the
    // page's Content-Security-Policy can forbid inline styles).
    root.querySelectorAll("ol.steps[data-start]").forEach((ol) => {
      ol.style.counterReset = `step ${ol.dataset.start}`;
    });
    document.getElementById("print").addEventListener("click", () => window.print());

    // Progress is saved by position, so it's only kept while the recipe's
    // ingredients and steps are the same shape as when it was saved
    // (SSSCook.progressFor, shared with the menu's cook mode).
    const progress = window.SSSCook ? window.SSSCook.progressFor(r, slug).progress : Object.assign({ ing: [], steps: [] }, load());
    const links = window.SSSCook ? window.SSSCook.linkIngredients(r) : null;
    const boxes = [...root.querySelectorAll("[data-ing]")];
    const steps = [...root.querySelectorAll("[data-step]")];

    const paint = () => {
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
      if (!e.target.matches("[data-ing]")) return;
      if (window.SSSCook) window.SSSCook.tickIngredient(progress, links, +e.target.dataset.ing, e.target.checked);
      else toggle(progress.ing, +e.target.dataset.ing);
      save(progress); paint();
    });
    steps.forEach((s) => {
      const flip = () => { toggle(progress.steps, +s.dataset.step); save(progress); paint(); };
      s.addEventListener("click", flip);
      s.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); flip(); } });
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
      root.querySelector(".menu-link").textContent = Menu.linkText();
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
