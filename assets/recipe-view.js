// Draws a recipe page and a recipe card as HTML, so the recipe page, the
// recipes page and the editor's preview all show exactly the same thing.
// Needs assets/common.js (window.SSS) and, for the page's drawing,
// assets/recipe-icons.js. Only draws: what the buttons do, saved progress, cook
// mode and the menu are wired up by the page that uses it (recipe.js, home.js).
//
//   SSSView.recipePageHTML(recipe, vocab, options) → the recipe page's HTML
//   SSSView.stepsHTML(recipe, prepFirst)            → just the steps, in that order
//   SSSView.cardHTML(entry, options)                 → a card for recipes/index.json's entry
window.SSSView = (() => {
  const { CATEGORIES, esc, fmtMinutes, totalMinutes, toGroups, stepOrder } = window.SSS;

  // Only allow ordinary web links (blocks javascript:, data:, etc.).
  const safeURL = (u) => {
    try {
      const url = new URL(u);
      return url.protocol === "https:" || url.protocol === "http:" ? url.href : "";
    } catch { return ""; }
  };

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

  // The steps in the order shown (prep first or as written: SSS.stepOrder),
  // a list per group. Each step keeps its place in the file (data-step), which
  // progress is saved by; the numbers count in the order shown.
  function stepsHTML(r, prepFirst) {
    const all = toGroups(r.steps).flatMap((g) => g.items);
    const runs = [];
    stepOrder(r, prepFirst).steps.forEach(({ i, group }, n) => {
      const last = runs[runs.length - 1];
      if (last && last.group === group) last.items.push(i);
      else runs.push({ group, start: n, items: [i] });
    });
    return runs.map((g) => `
      ${g.group ? `<h3>${esc(g.group)}</h3>` : ""}
      <ol class="steps" data-start="${g.start}">${g.items.map((i) => `
        <li data-step="${i}" tabindex="0">${stepHTML(all[i])}</li>`).join("")}
      </ol>`).join("");
  }

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

  // The recipe page, inside its <main>. vocab (recipes/vocabulary.json) adds the
  // tag links; without it they're left out. Options:
  //   prepFirst  which order to show the steps in when the recipe has both (default true)
  //   cookLabel  the Start button's text (SSSCook.startLabel); no button without it
  //   menu       leave room for the "+ Add to menu" button
  function recipePageHTML(r, vocab, { prepFirst = true, cookLabel = "", menu = false } = {}) {
    const cat = CATEGORIES[r.category] || { label: r.category };
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

    let ingIdx = 0;
    const ingHTML = toGroups(r.ingredients).map((g) => `
      ${g.group ? `<h3>${esc(g.group)}</h3>` : ""}
      <ul class="ingredients">${g.items.map((it) => `
        <li><label><input type="checkbox" data-ing="${ingIdx++}"><span>${ingredientHTML(it)}</span></label></li>`).join("")}
      </ul>`).join("");
    const notesHTML = toGroups(r.notes).map((g) => `
      ${g.group ? `<h3>${esc(g.group)}</h3>` : ""}
      <ul class="notes">${g.items.map((n) => `<li>${esc(n)}</li>`).join("")}</ul>`).join("");

    // The recipe's drawing (assets/recipe-icons.js), shown by the stylesheet
    // once the page's <main> has data-icon set.
    const icon = window.SSSIcons ? window.SSSIcons.iconFor(r) : null;

    return `
      <div class="recipe-toprow">
        <a class="back" href="recipes.html?cat=${encodeURIComponent(r.category)}">← ${esc(cat.label)}</a>
      </div>
      ${r.image ? `<img class="recipe-hero" src="${esc(r.image)}" alt="">` : ""}
      ${r.kind === "component" ? `<span class="badge component">Component</span>` : ""}
      ${icon ? `<span class="recipe-icon" aria-hidden="true"></span>` : ""}
      <h1>${esc(r.title)}</h1>
      ${r.description ? `<p class="lede">${esc(r.description)}</p>` : ""}
      ${facts.length ? `<dl class="facts">${facts.map(([k, v]) =>
        `<div class="fact"><dt>${esc(k)}</dt><dd>${esc(v)}</dd></div>`).join("")}</dl>` : ""}

      <div class="start-row">
        ${cookLabel ? `<button class="btn cook-start" id="cook-start" type="button">${esc(cookLabel)}</button>` : ""}
        ${menu ? `<span class="menu-anchor" id="on-menu"></span>` : ""}
      </div>
      <div class="toolbar">
        <button class="btn" id="wake" aria-pressed="false" hidden>☀️ Keep screen on</button>
        <button class="btn" id="reset">↺ Reset checkmarks</button>
        <button class="btn" id="print">🖨 Print</button>
      </div>

      ${r.beforeYouStart && r.beforeYouStart.length ? `<section class="section before"><h2>Before you start</h2>
        <ul class="notes">${r.beforeYouStart.map((n) => `<li>${esc(n)}</li>`).join("")}</ul></section>` : ""}
      <section class="section"><h2>${r.category === "cocktails" ? "Spec" : "Ingredients"}</h2>${ingHTML}</section>
      <section class="section" id="steps"><h2>${r.category === "cocktails" ? "Method" : "Steps"}</h2>
        ${stepOrder(r, true).differs ? `<label class="menu-switch prep-switch"><input type="checkbox" role="switch" id="prep-first"${prepFirst ? " checked" : ""}> Prep first</label>` : ""}
        ${stepsHTML(r, prepFirst)}
      </section>
      ${notesHTML ? `<section class="section"><h2>Notes</h2>${notesHTML}</section>` : ""}
      ${tagGroupsHTML(r, vocab)}
      ${r.source && (r.source.name || r.source.url) ? `<p class="source">Source: ${safeURL(r.source.url)
        ? `<a href="${esc(safeURL(r.source.url))}" rel="noopener noreferrer" target="_blank">${esc(r.source.name || r.source.url)}</a>`
        : esc(r.source.name || r.source.url)}</p>` : ""}
    `;
  }

  // A recipe's card on the recipes page, from its recipes/index.json entry.
  // onMenu: it's on your menu, so it gets lime tape reading "On your menu".
  function cardHTML(r, { onMenu = false } = {}) {
    const c = CATEGORIES[r.category] || { label: r.category };
    const meta = [
      r.totalMinutes != null ? `⏱ ${fmtMinutes(r.totalMinutes)}` : "",
      r.yield ? `🍽 ${esc(r.yield)}` : "",
    ].filter(Boolean).map((m) => `<span>${m}</span>`).join("");
    const icon = r.icon ? ` data-icon="${esc(r.icon)}"` : "";
    return `<li>${onMenu ? `<span class="menu-tape">On your menu</span>` : ""}<a class="card" href="recipe.html?r=${encodeURIComponent(r.slug)}"${icon}>
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

  return { recipePageHTML, stepsHTML, cardHTML };
})();
