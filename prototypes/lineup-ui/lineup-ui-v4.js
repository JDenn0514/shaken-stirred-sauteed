// PROTOTYPE, throwaway. Round 4 of the Lineup mockups: nested recipes (indented) vs connected recipes (same level), and "goes with" when adding: one combined layout
// from Jacob's picks, with options only where something is still open
// (sub-recipes on the menu card, removing from the lineup). Switch screens and
// options from the bar at the bottom, or the URL hash (#ready-2).
// Static apart from the gap screen's timer ring. Real recipe data comes from
// recipes/index.json; the example times are made up.
(() => {
  const { esc, fmtMinutes } = window.SSS;
  const app = document.getElementById("app");
  const cook = document.getElementById("cook");
  const bar = document.getElementById("switcher");

  const MAIN = ["pan-seared-ribeye", "lemon-butter-parmesan-asparagus", "microwave-applesauce", "hasselback-potatoes"];
  const QUERY = "lemon";
  let R = {};
  const fam = (r) => `fam-${r.category}`;
  const short = (slug) => ({ "pan-seared-ribeye": "Ribeye", "lemon-butter-parmesan-asparagus": "Asparagus", "microwave-applesauce": "Applesauce", "hasselback-potatoes": "Potatoes", pavlova: "Pavlova" }[slug] || R[slug].title);
  const IN = new Set([...MAIN, "pavlova", "lemon-curd", "blueberry-whipped-cream"]);

  // ===== Shared pieces =====
  const searchBox = (value = "", placeholder = "Search recipes to add…") => `
    <label class="search"><span class="visually-hidden">Search recipes</span>
      <svg aria-hidden="true" viewBox="0 0 24 24" width="18" height="18"><circle cx="11" cy="11" r="7" fill="none" stroke="currentColor" stroke-width="2"/><path d="m20 20-4-4" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>
      <input type="search" value="${esc(value)}" placeholder="${esc(placeholder)}" autocomplete="off"></label>`;
  const seg = (opts, pick, cls = "") => `<span class="lu-seg ${cls}" role="radiogroup">${opts.map((o, i) =>
    `<button type="button" role="radio" aria-checked="${i === pick}">${esc(o)}</button>`).join("")}</span>`;
  function card(r, corner = "") {
    const meta = [r.totalMinutes != null ? `⏱ ${fmtMinutes(r.totalMinutes)}` : "", r.yield ? `🍽 ${esc(r.yield)}` : ""].filter(Boolean).map((m) => `<span>${m}</span>`).join("");
    const cat = { baking: "Baking", cooking: "Cooking", cocktails: "Cocktails" }[r.category];
    return `<li class="lu-cardwrap"><a class="card" href="#" ${r.icon ? `data-icon="${esc(r.icon)}"` : ""}><div class="card-body">
      ${r.icon ? `<span class="card-icon" aria-hidden="true"></span>` : ""}
      <div class="badges"><span class="badge ${esc(r.category)}">${cat}</span>${r.kind === "component" ? `<span class="badge component">Component</span>` : ""}</div>
      <h2>${esc(r.title)}</h2>${r.description ? `<p>${esc(r.description)}</p>` : ""}${meta ? `<div class="card-meta">${meta}</div>` : ""}
    </div></a>${corner}</li>`;
  }
  const lineupLink = () => `<a class="lu-pill lu-rowpill" href="#">Lineup · 7 →</a>`;
  function recipePage(btns, after = "", slug = "hasselback-potatoes") {
    const r = R[slug];
    return `<div class="recipe" data-icon="${esc(r.icon)}">
      <div class="lu-toprow"><a class="back" href="#">← ${r.category === "baking" ? "Baking" : "Cooking"}</a>${lineupLink()}</div>
      <span class="recipe-icon" aria-hidden="true"></span>
      <h1>${esc(r.title)}</h1><p class="lede">${esc(r.description)}</p>
      <dl class="facts">${slug === "hasselback-potatoes" ? `<div class="fact"><dt>Serves</dt><dd>4</dd></div><div class="fact"><dt>Prep</dt><dd>15 min</dd></div>
        <div class="fact"><dt>Bake</dt><dd>55–60 min</dd></div><div class="fact"><dt>Origin</dt><dd>Sweden</dd></div>` : `<div class="fact"><dt>Serves</dt><dd>8–10</dd></div><div class="fact"><dt>Active</dt><dd>20 min</dd></div><div class="fact"><dt>Total</dt><dd>4 hr</dd></div><div class="fact"><dt>Oven</dt><dd>350°F, then 200°F</dd></div>`}</dl>
      <div class="lu-btnrow lu-anchor">${btns}${after}</div>
      <div class="toolbar"><button class="btn">↺ Reset checkmarks</button><button class="btn">🖨 Print</button></div>
      <section class="section"><h2>Ingredients</h2><p class="muted">…the rest of the recipe page, unchanged.</p></section></div>`;
  }
  const start = `<button class="btn cook-start">Start cooking</button>`;
  const inBtn = (open) => `<button class="btn lu-addbtn" aria-pressed="true" aria-expanded="${open}">✓ In your lineup ▾</button>`;

  // Cook mode
  const TIMERS = [{ slug: "hasselback-potatoes", time: "23:10", what: "Potatoes, bake" }, { slug: "microwave-applesauce", time: "4:02", what: "Applesauce, microwave" }];
  const timerStrip = () => `<div class="cook-timers">${TIMERS.map((t) => `<div class="cook-timer running ${fam(R[t.slug])}" role="timer">
      <span class="cook-timer-time">${t.time}</span><span class="cook-timer-what">${esc(t.what)}</span>
      <span class="cook-timer-actions"><button class="btn">Pause</button><button class="btn cook-timer-cancel" aria-label="Cancel timer">✕</button></span></div>`).join("")}</div>`;
  const cookTop = (label) => `<div class="cook-top"><span class="cook-label">${label}</span><button class="cook-close" type="button" aria-label="Close">✕</button></div>`;
  const lineupBar = (at) => `<div class="cook-bar" aria-hidden="true">${Array.from({ length: 24 }, (_, k) => `<i class="${k < at ? "done" : k === at ? "now" : ""}"></i>`).join("")}</div>`;
  const upNext = (slug, text) => `<button class="cook-upnext" type="button" aria-expanded="false"><span class="cook-upnext-label">Up next</span> <span class="cook-upnext-text"><b>${esc(short(slug))}:</b> ${esc(text)}</span></button>`;
  const nav = () => `<div class="cook-nav"><button class="btn cook-back">Back</button><button class="btn cook-go">Next step</button></div>`;
  const chip = (slug) => `<span class="lu-chip ${fam(R[slug])}">${esc(short(slug))}</span>`;
  const RING = 2 * Math.PI * 54;
  const ring = (running) => `<div class="lu-timering${running ? " lu-running" : ""}" role="timer" aria-label="12 minutes">
      <svg viewBox="0 0 120 120" aria-hidden="true"><circle class="lu-track" cx="60" cy="60" r="54"/><circle class="lu-left" cx="60" cy="60" r="54" stroke-dasharray="${RING.toFixed(1)}" stroke-dashoffset="0"/></svg>
      <span><b>${running ? "11:48" : "12"}</b><small>${running ? "left" : "min"}</small></span></div>`;

  // ===== The menu card: three ways to show pavlova's parts =====
  const line = (slug, { note = "", sub = "", cls = "", title = "" } = {}) => { const r = R[slug]; return `<li class="${fam(r)} ${cls}">
      <span class="lu-menuname">${esc(title || r.title)}</span><span class="lu-dots"></span><span class="lu-menutime">${fmtMinutes(r.totalMinutes)}</span>
      ${note ? `<div class="lu-with">${note}</div>` : ""}${sub}</li>`; };
  const makeHave = (pick = 0, skip = false) => `<div class="lu-mh">${seg(skip ? ["Make it", "I have it", "Skip"] : ["Make it", "I have it"], pick)}</div>`;
  const menuTop = (dessert) => `<div class="lu-toprow lu-menutop"><a class="back" href="#">← Recipes</a></div>
    <div class="lu-menu"><p class="lu-menuhead">Your lineup</p>
      <h2 class="lu-course">Main</h2><ul class="lu-menulist">${MAIN.map((s) => line(s, s === "hasselback-potatoes" ? { sub: nest([["garlic-paste", 1]]) } : {})).join("")}</ul>
      <h2 class="lu-course">Dessert <small>45 min later</small></h2>${dessert}
      <a class="lu-slot" href="#">+ Add a dish</a>
      <div class="lu-menufoot lu-switch"><label><input type="checkbox" role="switch" checked> Prep everything first</label><span class="muted">Fastest would be 1 hr 30 min</span></div>
    </div><button class="btn cook-start fam-cooking lu-wide">Start cooking · about 1 hr 45 min</button>`;
  const madeHave = (pick = 0) => `<div class="lu-mh">${seg(["Make it", "Already made"], pick)}</div>`;
  // Nested recipes: part of the dish above, indented under it, always included.
  const nest = (items) => `<ul class="lu-nest">${items.map(([slug, pick, title]) => { const r = R[slug]; return `<li class="${fam(r)}">
      <span class="lu-menuname">${esc(title || r.title)}</span><span class="lu-dots"></span><span class="lu-menutime">${fmtMinutes(r.totalMinutes)}</span>
      ${madeHave(pick)}</li>`; }).join("")}</ul>`;
  const readyConnected = () => menuTop(`<ul class="lu-menulist">
        ${line("pavlova", { note: `the meringue · made ahead (it holds the oven 3½ hr) <button class="lu-choice">Change ▾</button>` })}
        ${line("lemon-curd", { note: "with the pavlova", sub: madeHave(1) })}
        ${line("blueberry-whipped-cream", { note: "with the pavlova", sub: madeHave(0) + nest([["blueberry-syrup", 0]]) })}
      </ul>`);
  const readyNested = () => menuTop(`<ul class="lu-menulist">
        ${line("pavlova", { title: "Lemon Blueberry Pavlova", note: "an example recipe whose parts are its ingredients", sub: nest([["pavlova", 0, "Pavlova Meringue"], ["lemon-curd", 1], ["blueberry-whipped-cream", 0]]) + `<ul class="lu-nest lu-nest2">${(() => { const r = R["blueberry-syrup"]; return `<li class="${fam(r)}"><span class="lu-menuname">${esc(r.title)}</span><span class="lu-dots"></span><span class="lu-menutime">${fmtMinutes(r.totalMinutes)}</span>${madeHave(0)}</li>`; })()}</ul><p class="lu-with">plus fresh berries, then put it together right before serving</p>` })}
      </ul>`);
  const sheet = (title, body) => `<div class="backdrop lu-backdrop"></div><div class="sheet lu-sheet lu-addsheet" role="dialog" aria-label="${esc(title)}">
      <div class="sheet-head"><h2>${esc(title)}</h2></div><div class="sheet-body">${body}</div></div>`;

  // ===== Screens =====
  const SCREENS = [
    { key: "empty", name: "Lineup: empty", options: [{ html: () => `<div class="lu-a">
      <p class="lu-eyebrow">Your lineup</p><h1 class="lu-h1">Let's make something</h1>
      <p class="lede">Pick the recipes you're making together: a whole dinner, or one dessert made from a few recipes. You get one order to make them in.</p>
      ${searchBox()}<p><a class="lu-link" href="#">Or browse all recipes →</a></p>
      <ol class="lu-how"><li><b>Add recipes</b> with + here, or "Add to lineup" on any recipe.</li><li><b>Make your choices:</b> courses, what you're making and what you have, prep first.</li><li><b>Start cooking.</b> One step at a time, across everything.</li></ol></div>` }] },
    { key: "search", name: "Lineup: searching", options: [{ html: () => `<div class="lu-c">
      <div class="lu-toprow"><a class="back" href="#">← Back to your lineup · 7</a></div>
      ${searchBox(QUERY)}
      <nav class="tabs lu-tabs"><button class="tab" data-cat="all" aria-pressed="true">All</button><button class="tab" data-cat="baking">Baking</button><button class="tab" data-cat="cooking">Cooking</button><button class="tab" data-cat="cocktails">Cocktails</button></nav>
      <ul class="lu-rows lu-rows-c">${Object.values(R).filter((r) => `${r.title} ${r.description}`.toLowerCase().includes(QUERY)).slice(0, 6).map((r) => `<li class="${fam(r)}" data-icon="${esc(r.icon)}"><span class="card-icon" aria-hidden="true"></span>
        <a href="#" class="lu-rowtext"><b>${esc(r.title)}</b><span>${esc(r.description)}</span></a>
        ${IN.has(r.slug) ? `<span class="lu-textbtn lu-added">✓ Added</span>` : `<button class="btn lu-textbtn">+ Add</button>`}</li>`).join("")}</ul></div>` }] },
    { key: "ready", name: "Lineup: ready to cook", options: [
      { name: "Your pavlova today", note: "Connected recipes (pavlova, curd, cream) sit side by side. Nested ones are indented under the dish they're part of: garlic paste under the potatoes, syrup under the blueberry cream.", html: () => `<div class="lu-c">${readyConnected()}</div>` },
      { name: "A pavlova with its parts as ingredients", note: "If a recipe's ingredients are its parts (meringue, curd, cream), they're all nested under it, with the syrup one level further in.", html: () => `<div class="lu-c">${readyNested()}</div>` },
    ] },
    { key: "add", name: "Recipe page: not added yet", options: [{ html: () => recipePage(`${start}<button class="btn lu-addbtn">+ Add to lineup</button>`) }] },
    { key: "added", name: "Recipe page: just added, \"goes with\"", options: [{ note: "Shown once, right after adding. Ticked ones are added as connected recipes. Not now just closes it.", html: () => recipePage(`${start}${inBtn(false)}`, "", "pavlova")
      + sheet("Added to your lineup", `<p>Pavlova often goes with:</p><div class="lu-gwlist">${[["lemon-curd", true], ["whipped-cream", false], ["blueberry-whipped-cream", true]].map(([sl, on]) => `<label class="${fam(R[sl])}"><input type="checkbox"${on ? " checked" : ""}><span><b>${esc(R[sl].title)}</b><small>${esc(R[sl].description)}</small></span></label>`).join("")}</div>
        <div class="lu-btnrow"><button class="btn cook-start fam-baking">Add these 2</button><button class="btn">Not now</button></div>`) }] },
    { key: "forwhich", name: "Lineup: adding a connected recipe later", options: [{ note: "Adding lemon curd while a pavlova is already in the lineup asks what it's for, so the plan knows when it goes in.", html: () => SCREENS.find((x) => x.key === "search").options[0].html()
      + sheet("Is the lemon curd for the pavlova?", `<p class="muted">If it is, the plan has it ready for when you put the pavlova together.</p><div class="lu-btnrow"><button class="btn cook-start fam-baking">For the pavlova</button><button class="btn">On its own</button></div>`) }] },
    { key: "recipe", name: "Recipe page: in your lineup", options: [{ html: () => recipePage(`${start}${inBtn(false)}`) }] },
    { key: "remove", name: "Recipe page: tapping \"In your lineup\"", options: [
      { name: "A small menu", note: "Tapping it opens a small menu. Nothing is removed until you choose.", html: () => recipePage(`${start}${inBtn(true)}`,
        `<div class="lu-menu-pop" role="menu"><button role="menuitem">Remove from lineup</button><button role="menuitem">Go to your lineup</button></div>`) },
      { name: "Removes, with undo", note: "Tapping it removes the recipe straight away. The button goes back to \"+ Add to lineup\" and a note offers Undo for a few seconds.", html: () => recipePage(`${start}<button class="btn lu-addbtn">+ Add to lineup</button>`)
        + `<div class="lu-toast" role="status">Removed from your lineup <button>Undo</button></div>` },
    ] },
    { key: "cards", name: "Recipes page: browsing", options: [{ html: () => `<div class="lu-c"><div class="lu-toprow lu-endrow">${lineupLink()}</div>${searchBox("", "Search by name, ingredient, or tag…")}
      <ul class="grid">${["hasselback-potatoes", "israeli-salad", "lemon-curd", "pavlova"].map((s) => card(R[s], IN.has(s) ? `<span class="lu-tape">In your lineup</span>` : "")).join("")}</ul></div>` }] },
    { key: "cook", name: "Cooking: a step", cooking: "lemon-butter-parmesan-asparagus", options: [{ html: () => `${cookTop(`${chip("lemon-butter-parmesan-asparagus")} Step 9 of 24`)}${lineupBar(8)}${timerStrip()}
      <div class="cook-body"><p class="cook-do">Squeeze the juice of half the lemon over the asparagus. Lay the lemon rings across the top third of the spears, then scatter the butter pats over the center.</p>
        <ul class="cook-ings">${[["½", "lemon, juiced"], ["½", "lemon, cut into thin rings"], ["3 tbsp", "unsalted butter, cut into small pats"]].map(([a, n]) => `<li><label><input type="checkbox"><span><b>${esc(a)}</b> <span>${esc(n)}</span></span></label></li>`).join("")}</ul></div>
      ${upNext("hasselback-potatoes", "Pull the tray out and baste with the reserved garlic butter.")}${nav()}` }] },
    { key: "gap", name: "Cooking: a wait", cooking: "pan-seared-ribeye", options: [{ html: () => gap("idle") }] },
    { key: "gaprun", name: "Cooking: a wait, timer running", cooking: "pan-seared-ribeye", options: [{ note: "The ring empties as the time runs out (sped up here to one minute). Next step moves on early.", html: () => gap("run") }] },
    { key: "gapring", name: "Cooking: the wait is up (ringing)", cooking: "pan-seared-ribeye", options: [{ note: "It rings until you press Stop. Nothing moves on by itself.", html: () => gap("ring") }] },
    { key: "gapstop", name: "Cooking: after pressing Stop", cooking: "pan-seared-ribeye", options: [
      { name: "Stop only stops the sound", note: "You stay on the wait screen, now saying time's up. Next step is the one way to move on, as on every screen.", html: () => gap("stopped") },
      { name: "Stop also moves you on", note: "Stop silences the alarm and opens the next step straight away.", html: () => stepScreen("pan-seared-ribeye", "Step 13 of 24", "Heat the oil in the skillet over medium-high heat until it just starts to smoke.", [["2 tbsp", "cooking oil"]], upNext("pan-seared-ribeye", "Pat the steak dry and season the top."), "") },
    ] },
    { key: "otherring", name: "Cooking: another dish's timer rings", cooking: "pan-seared-ribeye", options: [{ note: "It doesn't interrupt the step you're on. Its strip rings with its own Stop, and the plan makes its follow-up your next step.", html: () => stepScreen("pan-seared-ribeye", "Step 16 of 24", "Lay it in seasoned side down, season the new top side, and cook without moving it: 3 to 4 minutes for a 1 in steak.", [["½ tbsp", "steak seasoning (the rest)"]], upNext("hasselback-potatoes", "Pull the tray out and baste with the reserved garlic butter."),
        `<div class="cook-timer ringing fam-cooking" role="timer"><span class="cook-timer-time">0:00</span><span class="cook-timer-what">Potatoes, bake · <b>Time's up: then baste them</b></span><span class="cook-timer-actions"><button class="btn">Stop</button></span></div>`) }] },
  ];
  function gap(state) {
    const running = state === "run", ringing = state === "ring", up = state === "ring" || state === "stopped";
    const ringHTML = up ? `<div class="lu-timering lu-up${ringing ? " lu-ringing" : ""}" role="timer"><svg viewBox="0 0 120 120" aria-hidden="true"><circle class="lu-track" cx="60" cy="60" r="54"/></svg><span><b>0:00</b><small>${ringing ? "time's up" : "done"}</small></span></div>` : ring(running);
    const text = up ? (ringing ? "Time's up." : "Time's up. Go on to the next step when you're ready.") : "Wait about 12 minutes before the next step.";
    const btn = ringing ? `<button class="btn cook-go lu-stop">Stop</button>` : running ? `<button class="btn lu-addbtn">Pause</button>` : up ? "" : `<button class="btn cook-timer-start lu-addbtn">Start 12 min timer</button>`;
    return `${cookTop("Your lineup · Wait")}${lineupBar(12)}${timerStrip()}
      <div class="cook-body lu-waitbody">${ringHTML}<p class="cook-do">${text}</p>
        ${up ? "" : `<p class="muted">The potatoes and applesauce are going. Nothing needs you yet.</p>`}
        ${btn ? `<div class="lu-btnrow">${btn}</div>` : ""}</div>
      ${upNext("pan-seared-ribeye", "Heat the oil in the skillet over medium-high heat until it just starts to smoke.")}${nav()}`;
  }
  function stepScreen(slug, label, text, ings, after, extraTimer) {
    return `${cookTop(`${chip(slug)} ${label}`)}${lineupBar(13)}
      <div class="cook-timers">${extraTimer}${TIMERS.filter((t) => !extraTimer || t.slug !== "hasselback-potatoes").map((t) => `<div class="cook-timer running ${fam(R[t.slug])}" role="timer"><span class="cook-timer-time">${t.time}</span><span class="cook-timer-what">${esc(t.what)}</span><span class="cook-timer-actions"><button class="btn">Pause</button><button class="btn cook-timer-cancel" aria-label="Cancel timer">✕</button></span></div>`).join("")}</div>
      <div class="cook-body"><p class="cook-do">${esc(text)}</p><ul class="cook-ings">${ings.map(([a, n]) => `<li><label><input type="checkbox"><span><b>${esc(a)}</b> <span>${esc(n)}</span></span></label></li>`).join("")}</ul></div>
      ${after}${nav()}`;
  }

  // ===== Switcher and render =====
  let s = "empty", o = 0;
  const readHash = () => {
    const m = /^#([a-z]+)(?:-(\d))?$/.exec(location.hash);
    const sc = m && SCREENS.find((x) => x.key === m[1]);
    if (sc) { s = sc.key; o = Math.min(sc.options.length, +(m[2] || 1)) - 1; }
  };
  const go = (ns, no) => { s = ns; o = no; history.replaceState(null, "", `#${s}${SCREENS.find((x) => x.key === s).options.length > 1 ? `-${o + 1}` : ""}`); render(); };
  function render() {
    const sc = SCREENS.find((x) => x.key === s), opt = sc.options[o];
    const cooking = !!sc.cooking;
    document.body.classList.toggle("cooking", cooking);
    document.body.classList.toggle("fam-cooking", ["add", "recipe", "remove"].includes(s));
    document.body.classList.toggle("fam-baking", s === "added");
    cook.hidden = !cooking;
    if (cooking) { cook.className = `cook ${fam(R[sc.cooking])}`; cook.innerHTML = opt.html(); app.innerHTML = ""; }
    else { cook.innerHTML = ""; app.innerHTML = opt.html(); }
    const many = sc.options.length > 1;
    bar.innerHTML = `${many ? `<div class="lu-sw-row"><button type="button" data-o="-1" aria-label="Previous option">‹</button>
        <span class="lu-sw-label"><b>${o + 1} of ${sc.options.length}</b> ${esc(opt.name)}</span><button type="button" data-o="1" aria-label="Next option">›</button></div>` : ""}
      ${opt.note ? `<p class="lu-sw-note">${esc(opt.note)}</p>` : ""}
      <label class="lu-sw-screen"><span class="visually-hidden">Screen</span><select id="lu-screen">${SCREENS.map((x) =>
        `<option value="${x.key}"${x.key === s ? " selected" : ""}>${esc(x.name)}${x.options.length > 1 ? ` (${x.options.length} options)` : ""}</option>`).join("")}</select></label>`;
    window.scrollTo(0, 0);
  }
  const step = (d) => { const n = SCREENS.find((x) => x.key === s).options.length; if (n > 1) go(s, (o + d + n) % n); };
  bar.addEventListener("click", (e) => { const b = e.target.closest("[data-o]"); if (b) step(+b.dataset.o); });
  bar.addEventListener("change", (e) => { if (e.target.id === "lu-screen") go(e.target.value, 0); });
  document.addEventListener("keydown", (e) => {
    if (e.target.closest("input, textarea, select, [contenteditable]")) return;
    if (e.key === "ArrowLeft") step(-1); else if (e.key === "ArrowRight") step(1);
  });
  document.addEventListener("click", (e) => { if (e.target.closest("main a, .cook a")) e.preventDefault(); });
  window.addEventListener("hashchange", () => { readHash(); render(); });

  fetch("recipes/index.json").then((res) => res.json()).then((list) => {
    R = Object.fromEntries(list.map((r) => [r.slug, r]));
    readHash();
    render();
  });
})();
