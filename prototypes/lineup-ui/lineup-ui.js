// PROTOTYPE, throwaway. Three layouts for the Lineup, each shown on the same
// eight screens, switched from the bar at the bottom or the URL hash (#a-ready).
// Static: nothing behind the buttons works. Real recipe titles, descriptions,
// icons and times come from recipes/index.json; the example times are made up.
(() => {
  const { esc, fmtMinutes } = window.SSS;
  const app = document.getElementById("app");
  const cook = document.getElementById("cook");
  const slot = document.getElementById("header-slot");
  const bar = document.getElementById("switcher");

  const VARIANTS = [
    { key: "a", name: "One long page" },
    { key: "b", name: "Step by step" },
    { key: "c", name: "Menu card" },
  ];
  const SCREENS = [
    { key: "empty", name: "Lineup: empty" },
    { key: "search", name: "Lineup: searching" },
    { key: "ready", name: "Lineup: ready to cook" },
    { key: "add", name: "Recipe page: not added yet" },
    { key: "recipe", name: "Recipe page: in your lineup" },
    { key: "cards", name: "Recipes page: browsing" },
    { key: "cook", name: "Cooking: a step" },
    { key: "gap", name: "Cooking: a gap" },
  ];

  // The example lineup.
  const MAIN = ["pan-seared-ribeye", "lemon-butter-parmesan-asparagus", "microwave-applesauce", "hasselback-potatoes"];
  const DESSERT = ["pavlova"];
  const IN = new Set([...MAIN, ...DESSERT]);
  const SUBS = {
    "hasselback-potatoes": [{ label: "Garlic paste", options: ["I have some", "Make it"], pick: 0 }],
    pavlova: [
      { label: "Lemon curd", options: ["Make it", "I have some", "Leave it out"], pick: 0 },
      { label: "Whipped cream", options: ["Blueberry whipped cream", "Whipped cream", "I have some"], pick: 0,
        then: { label: "Blueberry syrup", options: ["Make it", "I have some"], pick: 0 } },
    ],
  };
  const QUERY = "lemon";

  let R = {};
  const fam = (r) => `fam-${r.category}`;
  const short = (slug) => ({ "pan-seared-ribeye": "Ribeye", "lemon-butter-parmesan-asparagus": "Asparagus", "microwave-applesauce": "Applesauce", "hasselback-potatoes": "Potatoes", pavlova: "Pavlova" }[slug] || R[slug].title);

  // The site's own recipe card (assets/home.js), with optional extras.
  function card(r, { badge = "", corner = "", spine = "" } = {}) {
    const meta = [r.totalMinutes != null ? `⏱ ${fmtMinutes(r.totalMinutes)}` : "", r.yield ? `🍽 ${esc(r.yield)}` : ""]
      .filter(Boolean).map((m) => `<span>${m}</span>`).join("");
    const cat = { baking: "Baking", cooking: "Cooking", cocktails: "Cocktails" }[r.category];
    return `<li class="lu-cardwrap${spine ? " lu-spined" : ""}"${spine ? ` data-spine="${esc(spine)}"` : ""}><a class="card" href="#" ${r.icon ? `data-icon="${esc(r.icon)}"` : ""}>
      <div class="card-body">
        ${r.icon ? `<span class="card-icon" aria-hidden="true"></span>` : ""}
        <div class="badges"><span class="badge ${esc(r.category)}">${cat}</span>${r.kind === "component" ? `<span class="badge component">Component</span>` : ""}${badge}</div>
        <h2>${esc(r.title)}</h2>
        ${r.description ? `<p>${esc(r.description)}</p>` : ""}
        ${meta ? `<div class="card-meta">${meta}</div>` : ""}
      </div></a>${corner}</li>`;
  }
  const searchBox = (value = "", placeholder = "Search recipes to add…") => `
    <label class="search"><span class="visually-hidden">Search recipes</span>
      <svg aria-hidden="true" viewBox="0 0 24 24" width="18" height="18"><circle cx="11" cy="11" r="7" fill="none" stroke="currentColor" stroke-width="2"/><path d="m20 20-4-4" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>
      <input type="search" value="${esc(value)}" placeholder="${esc(placeholder)}" autocomplete="off"></label>`;
  const results = () => Object.values(R).filter((r) => `${r.title} ${r.description}`.toLowerCase().includes(QUERY)).slice(0, 5);
  const seg = (opts, pick, cls = "") => `<span class="lu-seg ${cls}" role="radiogroup">${opts.map((o, i) =>
    `<button type="button" role="radio" aria-checked="${i === pick}">${esc(o)}</button>`).join("")}</span>`;
  const subLines = (slug, render) => (SUBS[slug] || []).map((s) => render(s) + (s.then ? render(s.then, true) : "")).join("");

  // The recipe page's top, as recipe.js draws it.
  function recipeTop(r, { back, extra = "", label = "" }) {
    return `<div class="recipe" data-icon="${esc(r.icon)}">
      ${back}
      ${r.icon ? `<span class="recipe-icon" aria-hidden="true"></span>` : ""}
      <h1>${esc(r.title)}</h1>
      <p class="lede">${esc(r.description)}</p>
      <dl class="facts"><div class="fact"><dt>Serves</dt><dd>4</dd></div><div class="fact"><dt>Prep</dt><dd>15 min</dd></div>
        <div class="fact"><dt>Bake</dt><dd>55–60 min</dd></div><div class="fact"><dt>Origin</dt><dd>Sweden</dd></div>${label}</dl>
      ${extra}
      <div class="toolbar"><button class="btn">↺ Reset checkmarks</button><button class="btn">🖨 Print</button></div>
      <section class="section"><h2>Ingredients</h2><p class="muted">…the rest of the recipe page, unchanged.</p></section>
    </div>`;
  }
  const backPill = (text) => `<a class="back" href="#">← ${esc(text)}</a>`;

  // Cook mode pieces, as cook.js draws them.
  const TIMERS = [
    { slug: "hasselback-potatoes", time: "23:10", what: "Potatoes, bake", then: "then baste them" },
    { slug: "microwave-applesauce", time: "4:02", what: "Applesauce, microwave", then: "then stir and microwave again" },
  ];
  const timerStrip = (withThen = false) => TIMERS.map((t) => `<div class="cook-timer running ${fam(R[t.slug])}" role="timer">
      <span class="cook-timer-time">${t.time}</span>
      <span class="cook-timer-what">${esc(t.what)}${withThen ? ` · <em>${esc(t.then)}</em>` : ""}</span>
      <span class="cook-timer-actions"><button class="btn">Pause</button><button class="btn cook-timer-cancel" aria-label="Cancel timer">✕</button></span></div>`).join("");
  const STEP = {
    slug: "lemon-butter-parmesan-asparagus",
    do: "Squeeze the juice of half the lemon over the asparagus. Lay the lemon rings across the top third of the spears, then scatter the butter pats over the center.",
    ings: [["½", "lemon, juiced"], ["½", "lemon, cut into thin rings"], ["3 tbsp", "unsalted butter, cut into small pats"]],
  };
  const stepBody = () => `<p class="cook-do">${esc(STEP.do)}</p>
    <ul class="cook-ings">${STEP.ings.map(([a, n]) => `<li><label><input type="checkbox"><span><b>${esc(a)}</b> <span>${esc(n)}</span></span></label></li>`).join("")}</ul>`;
  const GAP_NEXT = { slug: "pan-seared-ribeye", do: "Heat the oil in the skillet over medium-high heat until it just starts to smoke." };
  const upNext = (slug, text) => `<button class="cook-upnext" type="button" aria-expanded="false"><span class="cook-upnext-label">Up next</span> <span class="cook-upnext-text"><b>${esc(short(slug))}:</b> ${esc(text)}</span></button>`;
  const cookTop = (label, close = "Close cook mode") => `<div class="cook-top"><span class="cook-label">${label}</span><button class="cook-close" type="button" aria-label="${close}">✕</button></div>`;
  const nav = (go = "Done") => `<div class="cook-nav"><button class="btn cook-back">Back</button><button class="btn cook-go">${go}</button></div>`;
  const lineupBar = () => `<div class="cook-bar lu-multibar" aria-hidden="true">${[...MAIN].map((s, k) =>
    `<i class="${fam(R[s])} lu-w${[8, 6, 5, 8][k]} ${k < 1 ? "done" : k === 1 ? "now" : ""}"></i>`).join("")}</div>`;

  // ===== Variant A: one long page =====
  const A = {
    header: (n) => n ? `<a class="lu-pill" href="#">Lineup · ${n}</a>` : "",
    empty: () => `<div class="lu-a">
      <p class="lu-eyebrow">Your lineup</p>
      <h1 class="lu-h1">Let's cook a meal</h1>
      <p class="lede">Pick the recipes you're making together. They can be a whole dinner, or one dessert made from a few recipes. You get one order to cook them in.</p>
      ${searchBox()}
      <p><a class="lu-link" href="#">Or browse all recipes →</a></p>
      <ol class="lu-how"><li><b>Add recipes</b> with + here, or "Add to lineup" on any recipe.</li><li><b>Make your choices:</b> courses, sub-recipes, prep first.</li><li><b>Start cooking.</b> One step at a time, across everything.</li></ol>
    </div>`,
    search: () => `<div class="lu-a">
      <h1 class="lu-h1 lu-small">Your lineup <span class="lu-count">5 dishes</span></h1>
      ${searchBox(QUERY)}
      <p class="lu-eyebrow">${results().length} recipes match</p>
      <ul class="grid">${results().map((r) => card(r, { corner: IN.has(r.slug)
        ? `<span class="lu-plus lu-added" aria-label="In your lineup">✓</span>` : `<button class="lu-plus" aria-label="Add ${esc(r.title)} to your lineup">+</button>` })).join("")}</ul>
    </div>`,
    ready: () => {
      const dish = (slug) => { const r = R[slug]; return `<li class="lu-dish ${fam(r)}" data-icon="${esc(r.icon)}">
        <span class="card-icon lu-dish-icon" aria-hidden="true"></span>
        <div class="lu-dish-main"><a class="lu-dish-title" href="#">${esc(r.title)}</a>
          <div class="lu-dish-row"><select aria-label="Course"><option${DESSERT.includes(slug) ? "" : " selected"}>Main</option><option${DESSERT.includes(slug) ? " selected" : ""}>Dessert</option></select>
          <button class="lu-x" aria-label="Remove ${esc(r.title)}">Remove</button></div>
          ${subLines(slug, (s, nested) => `<div class="lu-sub${nested ? " lu-nested" : ""}"><span>${esc(s.label)}</span>${seg(s.options, s.pick)}</div>`)}
        </div></li>`; };
      return `<div class="lu-a">
        <h1 class="lu-h1 lu-small">Your lineup <span class="lu-count">5 dishes</span></h1>
        ${searchBox()}
        <section class="section"><h2>Main</h2><ul class="lu-dishes">${MAIN.map(dish).join("")}</ul></section>
        <section class="section"><h2>Dessert</h2><p class="lu-note">Served about 45 min after the main.</p><ul class="lu-dishes">${DESSERT.map(dish).join("")}</ul></section>
        <section class="section"><h2>Before you start</h2>
          <div class="lu-q"><p><b>The pavlova's meringue keeps the oven for about 3½ hours.</b> Make it ahead, or do it all today?</p>${seg(["Make it ahead", "All today"], 0)}</div>
          <div class="lu-q"><p><b>How to plan it</b></p>${seg(["Prep everything first · 1 hr 45 min", "Fastest · 1 hr 30 min"], 0, "lu-stack")}</div>
        </section>
        <div class="lu-sticky"><span><b>Takes about 1 hr 45 min</b><br><span class="muted">Plus the meringue, made ahead</span></span><button class="btn cook-start fam-cooking">Start cooking</button></div>
      </div>`;
    },
    add: () => recipeTop(R["hasselback-potatoes"], { back: backPill("Cooking"),
      extra: `<div class="lu-btnrow"><button class="btn cook-start">Start cooking</button><button class="btn lu-addbtn">+ Add to lineup</button></div>` }),
    recipe: () => recipeTop(R["hasselback-potatoes"], { back: backPill("Your lineup"),
      extra: `<div class="lu-btnrow"><button class="btn cook-start">Start cooking</button><button class="btn lu-addbtn" aria-pressed="true">✓ In your lineup</button></div>
        <p class="lu-inline">In your lineup with 4 other dishes · <a href="#">Cook the lineup →</a></p>` }),
    cards: () => `<div class="lu-a">${searchBox("", "Search by name, ingredient, or tag…")}<ul class="grid">${["hasselback-potatoes", "israeli-salad", "lemon-curd", "pavlova"].map((s) =>
      card(R[s], { badge: IN.has(s) ? `<span class="badge lu-inbadge">✓ In your lineup</span>` : "" })).join("")}</ul></div>`,
    cook: () => `${cookTop(`<span class="lu-chip ${fam(R[STEP.slug])}">${esc(short(STEP.slug))}</span> Step 2 of 6`, "Close")}
      ${lineupBar()}<div class="cook-timers">${timerStrip()}</div>
      <div class="cook-body">${stepBody()}</div>${upNext("hasselback-potatoes", "Pull the tray out and baste with the reserved garlic butter.")}${nav("Done")}`,
    gap: () => `${cookTop("Your lineup")}${lineupBar()}<div class="cook-timers">${timerStrip()}</div>
      <div class="cook-body lu-gap"><p class="lu-eyebrow">Nothing to do for about</p><p class="lu-big">12 min</p>
        <p class="muted">Then:</p><p class="cook-do lu-dim"><span class="lu-chip ${fam(R[GAP_NEXT.slug])}">${esc(short(GAP_NEXT.slug))}</span> ${esc(GAP_NEXT.do)}</p>
        <button class="btn lu-addbtn">Start it now</button></div>${nav("Done")}`,
  };

  // ===== Variant B: step by step, with a dish rail in cook mode =====
  const rail = (current) => `<div class="lu-rail" role="list">${[
    ...(current ? [["lemon-butter-parmesan-asparagus", "Now"]] : [["pan-seared-ribeye", "Next, in 12 min"]]),
    ["hasselback-potatoes", "In the oven · 23 min"], ["microwave-applesauce", "Microwave · 4 min"],
    ...(current ? [["pan-seared-ribeye", "Later"]] : [["lemon-butter-parmesan-asparagus", "Waiting for the oven"]]), ["pavlova", "Made ahead ✓"],
  ].map(([s, st]) => `<span class="lu-railitem ${fam(R[s])}${st === "Now" || st.startsWith("Next") ? " lu-now" : ""}" role="listitem" data-icon="${esc(R[s].icon)}"><span class="card-icon" aria-hidden="true"></span><b>${esc(short(s))}</b><small>${esc(st)}</small></span>`).join("")}</div>`;
  const stepper = (at) => `<ol class="lu-stepper">${["Dishes", "Choices", "Ready"].map((s, i) => `<li class="${i < at ? "done" : i === at ? "now" : ""}"><span>${i < at ? "✓" : i + 1}</span>${s}</li>`).join("")}</ol>`;
  const B = {
    header: (n) => n ? `<a class="lu-iconbtn" href="#" aria-label="Your lineup, ${n} dishes"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16M4 12h16M4 17h10" stroke="currentColor" stroke-width="2" stroke-linecap="round" fill="none"/></svg><span class="lu-badgecount">${n}</span></a>` : "",
    empty: () => `<div class="lu-b lu-center">
      <div class="lu-plates" aria-hidden="true"><span class="fam-cooking"></span><span class="fam-baking"></span><span class="fam-cocktails"></span></div>
      <h1 class="lu-h1">Let's cook a meal</h1>
      <p class="lede">Choose a few recipes and we'll work out the order: what to start first, what fits into the waits, and how to have it all ready together.</p>
      <button class="btn cook-start fam-cooking lu-wide">Find recipes</button>
      <a class="btn lu-wide" href="#">Browse all recipes</a>
    </div>`,
    search: () => `<div class="lu-b">${stepper(0)}<h1 class="lu-h1 lu-small">Dishes</h1><p class="muted">5 dishes so far.</p></div>
      <div class="backdrop lu-backdrop"></div>
      <div class="sheet lu-sheet" role="dialog" aria-label="Add recipes">
        <div class="sheet-head"><h2>Add recipes</h2><button class="btn">Done · 5</button></div>
        <div class="sheet-body">${searchBox(QUERY)}
          <ul class="lu-rows">${results().map((r) => `<li class="${fam(r)}" data-icon="${esc(r.icon)}"><span class="card-icon" aria-hidden="true"></span>
            <a href="#" class="lu-rowtext"><b>${esc(r.title)}</b><span>${esc(r.description)}</span></a>
            ${IN.has(r.slug) ? `<span class="lu-plus lu-added" aria-label="Added">✓</span>` : `<button class="lu-plus" aria-label="Add ${esc(r.title)}">+</button>`}</li>`).join("")}</ul>
        </div></div>`,
    ready: () => `<div class="lu-b">${stepper(2)}
      <h1 class="lu-h1 lu-small">Ready to cook</h1>
      <ol class="lu-plan">
        <li><span class="lu-eyebrow">Ahead of time</span><b>Pavlova</b> meringue, about 3 hr 45 min with cooling. <a href="#">Change</a></li>
        <li><span class="lu-eyebrow">Main</span><b>Ribeye, Asparagus, Applesauce, Potatoes</b></li>
        <li><span class="lu-eyebrow">Dessert · 45 min later</span><b>Pavlova</b> with lemon curd and blueberry whipped cream</li>
      </ol>
      <details class="lu-details" open><summary>Your choices (5)</summary><dl class="lu-answers">
        <div><dt>Garlic paste, for the potatoes</dt><dd>I have some ▾</dd></div><div><dt>Lemon curd, for the pavlova</dt><dd>Make it ▾</dd></div>
        <div><dt>Whipped cream, for the pavlova</dt><dd>Blueberry whipped cream ▾</dd></div><div><dt>Blueberry syrup, for the cream</dt><dd>Make it ▾</dd></div>
        <div><dt>Pavlova's meringue</dt><dd>Make it ahead ▾</dd></div></dl></details>
      <fieldset class="lu-cards"><legend>How to plan it</legend>
        <label class="lu-radiocard" aria-checked="true"><input type="radio" name="p" checked><span><b>Prep everything first</b><small>Chop and measure everything, then cook. Calmer.</small></span><em>1 hr 45 min</em></label>
        <label class="lu-radiocard"><input type="radio" name="p"><span><b>Fastest</b><small>Prep fits into the waits.</small></span><em>1 hr 30 min</em></label></fieldset>
      <button class="btn cook-start fam-cooking lu-wide">Start cooking</button></div>`,
    add: () => recipeTop(R["hasselback-potatoes"], { back: backPill("Cooking"),
      extra: `<div class="lu-btnrow"><button class="btn cook-start">Start cooking</button><button class="btn lu-square" aria-label="Add to lineup">+</button></div>` }),
    recipe: () => `<a class="lu-banner fam-cooking" href="#">← Back to your lineup <span>5 dishes</span></a>` + recipeTop(R["hasselback-potatoes"], { back: backPill("Cooking"),
      extra: `<div class="lu-btnrow"><button class="btn cook-start">Start cooking</button><button class="btn lu-square" aria-pressed="true" aria-label="In your lineup">✓</button></div>` }),
    cards: () => `<div class="lu-b">${searchBox("", "Search by name, ingredient, or tag…")}<ul class="grid">${["hasselback-potatoes", "israeli-salad", "lemon-curd", "pavlova"].map((s) =>
      card(R[s], { corner: IN.has(s) ? `<span class="lu-tape">In your lineup</span>` : "" })).join("")}</ul></div>`,
    cook: () => `${cookTop("Asparagus · step 2 of 6", "Close")}${rail(true)}
      <div class="cook-body">${stepBody()}</div>${upNext("hasselback-potatoes", "Pull the tray out and baste with the reserved garlic butter.")}${nav("Done")}`,
    gap: () => `${cookTop("Your lineup")}${rail(false)}
      <div class="cook-body lu-gap lu-centertext"><div class="lu-ring"><span>12</span><small>min</small></div><p class="cook-do">Nothing to do yet.</p>
        <p class="muted">Next: <b>Ribeye</b>. ${esc(GAP_NEXT.do)}</p><button class="btn lu-addbtn">Start it now</button></div>${nav("Done")}`,
  };

  // ===== Variant C: a menu card, and "Now / Meanwhile" in cook mode =====
  const leader = (slug, extra = "") => { const r = R[slug]; return `<li class="${fam(r)}"><span class="lu-menuname">${esc(r.title)}</span><span class="lu-dots"></span><span class="lu-menutime">${fmtMinutes(r.totalMinutes)}</span>${extra}</li>`; };
  const C = {
    header: () => "",
    empty: () => `<div class="lu-c">${searchBox()}
      <div class="lu-menu"><p class="lu-menuhead">Lineup</p><h1 class="lu-h1">Let's cook a meal</h1>
        <h2 class="lu-course">Main</h2><a class="lu-slot" href="#">+ Add a dish</a>
        <h2 class="lu-course">Dessert</h2><a class="lu-slot" href="#">+ Add a dish</a>
        <p class="lu-menufoot">Or <a href="#">browse all recipes</a>.</p></div></div>`,
    search: () => `<div class="lu-c">${searchBox(QUERY)}
      <nav class="tabs lu-tabs"><button class="tab" data-cat="all" aria-pressed="true">All</button><button class="tab" data-cat="baking">Baking</button><button class="tab" data-cat="cooking">Cooking</button><button class="tab" data-cat="cocktails">Cocktails</button></nav>
      <ul class="lu-rows lu-rows-c">${results().map((r) => `<li class="${fam(r)}" data-icon="${esc(r.icon)}"><span class="card-icon" aria-hidden="true"></span>
        <a href="#" class="lu-rowtext"><b>${esc(r.title)}</b><span>${esc(r.description)}</span></a>
        ${IN.has(r.slug) ? `<span class="lu-textbtn lu-added">✓ Added</span>` : `<button class="btn lu-textbtn">+ Add</button>`}</li>`).join("")}</ul>
      <p class="lu-menufoot"><a href="#">← Back to your lineup (5)</a></p></div>`,
    ready: () => `<div class="lu-c"><div class="lu-menu">
      <p class="lu-menuhead">Lineup · Tonight</p>
      <h2 class="lu-course">Main</h2><ul class="lu-menulist">${MAIN.map((s) => leader(s, subLines(s, (x) => `<div class="lu-with">with ${esc(x.label.toLowerCase())}: <button class="lu-choice">${esc(x.options[x.pick])} ▾</button></div>`))).join("")}</ul>
      <h2 class="lu-course">Dessert <small>45 min later</small></h2><ul class="lu-menulist">${DESSERT.map((s) => leader(s, subLines(s, (x, nested) => `<div class="lu-with${nested ? " lu-nested" : ""}">with ${esc(x.label.toLowerCase())}: <button class="lu-choice">${esc(x.options[x.pick])} ▾</button></div>`) + `<div class="lu-with lu-ahead">Meringue made ahead (it holds the oven 3½ hr) <button class="lu-choice">Change ▾</button></div>`)).join("")}</ul>
      <a class="lu-slot" href="#">+ Add a dish</a>
      <div class="lu-menufoot lu-switch"><label><input type="checkbox" role="switch" checked> Prep everything first</label><span class="muted">Fastest would be 1 hr 30 min</span></div>
      </div>
      <button class="btn cook-start fam-cooking lu-wide">Start cooking · about 1 hr 45 min</button></div>`,
    add: () => recipeTop(R["hasselback-potatoes"], { back: backPill("Cooking"),
      label: `<div class="fact lu-labelrow"><dt>Lineup</dt><dd><button class="btn lu-addbtn">+ Add to lineup</button></dd></div>`,
      extra: `<button class="btn cook-start">Start cooking</button>` }),
    recipe: () => recipeTop(R["hasselback-potatoes"], { back: backPill("Your lineup"),
      label: `<div class="fact lu-labelrow"><dt>Lineup</dt><dd>✓ In your lineup · <a href="#">View all 5</a></dd></div>`,
      extra: `<button class="btn cook-start">Start cooking</button>` }),
    cards: () => `<div class="lu-c">${searchBox("", "Search by name, ingredient, or tag…")}<ul class="grid">${["hasselback-potatoes", "israeli-salad", "lemon-curd", "pavlova"].map((s) =>
      card(R[s], { spine: IN.has(s) ? "✓ In lineup" : "" })).join("")}</ul></div>`,
    cook: () => `${cookTop("Now", "Close")}
      <div class="cook-body"><p class="lu-chipline"><span class="lu-chip ${fam(R[STEP.slug])}">${esc(R[STEP.slug].title)}</span></p>${stepBody()}
        <div class="lu-meanwhile"><p class="lu-eyebrow">Meanwhile</p><div class="cook-timers">${timerStrip(true)}</div></div></div>
      ${upNext("hasselback-potatoes", "Pull the tray out and baste with the reserved garlic butter.")}${nav("Done")}`,
    gap: () => `${cookTop("Meanwhile", "Close")}
      <div class="cook-body"><p class="cook-do">Nothing needs you for about <b class="lu-mono">12 min</b>.</p>
        <div class="cook-timers">${timerStrip(true)}</div>
        <div class="lu-nextcard ${fam(R[GAP_NEXT.slug])}"><p class="lu-eyebrow">Then</p><p><b>${esc(R[GAP_NEXT.slug].title)}</b>: ${esc(GAP_NEXT.do)}</p><button class="btn lu-addbtn">Start it now</button></div></div>
      ${nav("Done")}`,
  };
  const IMPL = { a: A, b: B, c: C };

  // ===== Switcher and render =====
  let v = "a", s = "empty";
  const readHash = () => {
    const m = /^#([abc])-([a-z]+)$/.exec(location.hash);
    if (m && SCREENS.some((x) => x.key === m[2])) { v = m[1]; s = m[2]; }
  };
  const go = (nv, ns) => { v = nv; s = ns; history.replaceState(null, "", `#${v}-${s}`); render(); };

  function render() {
    const impl = IMPL[v];
    const cooking = s === "cook" || s === "gap";
    document.body.classList.toggle("cooking", cooking);
    cook.hidden = !cooking;
    slot.innerHTML = impl.header(s === "empty" ? 0 : 5);
    if (cooking) {
      cook.className = `cook ${fam(R[s === "cook" ? STEP.slug : GAP_NEXT.slug])}`;
      cook.innerHTML = impl[s]();
      app.innerHTML = "";
    } else {
      cook.innerHTML = "";
      app.innerHTML = impl[s]();
    }
    if (s === "add" || s === "recipe") document.body.classList.add("fam-cooking"); else document.body.classList.remove("fam-cooking");
    const vi = VARIANTS.findIndex((x) => x.key === v);
    bar.innerHTML = `<div class="lu-sw-row">
        <button type="button" data-v="-1" aria-label="Previous layout">‹</button>
        <span class="lu-sw-label"><b>${v.toUpperCase()}</b> ${esc(VARIANTS[vi].name)}</span>
        <button type="button" data-v="1" aria-label="Next layout">›</button></div>
      <label class="lu-sw-screen"><span class="visually-hidden">Screen</span><select id="lu-screen">${SCREENS.map((x) =>
        `<option value="${x.key}"${x.key === s ? " selected" : ""}>${esc(x.name)}</option>`).join("")}</select></label>`;
    window.scrollTo(0, 0);
  }
  bar.addEventListener("click", (e) => {
    const b = e.target.closest("[data-v]");
    if (!b) return;
    const i = VARIANTS.findIndex((x) => x.key === v);
    go(VARIANTS[(i + +b.dataset.v + VARIANTS.length) % VARIANTS.length].key, s);
  });
  bar.addEventListener("change", (e) => { if (e.target.id === "lu-screen") go(v, e.target.value); });
  document.addEventListener("keydown", (e) => {
    if (e.target.closest("input, textarea, select, [contenteditable]")) return;
    if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
    const i = VARIANTS.findIndex((x) => x.key === v);
    go(VARIANTS[(i + (e.key === "ArrowRight" ? 1 : -1) + VARIANTS.length) % VARIANTS.length].key, s);
  });
  // Nothing in the mockups goes anywhere.
  document.addEventListener("click", (e) => { const a = e.target.closest("main a, .cook a, .site-header .lu-header-slot a"); if (a) e.preventDefault(); });
  window.addEventListener("hashchange", () => { readHash(); render(); });

  fetch("recipes/index.json").then((res) => res.json()).then((list) => {
    R = Object.fromEntries(list.map((r) => [r.slug, r]));
    readHash();
    render();
  });
})();
