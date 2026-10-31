(() => {
  const { CATEGORIES, esc, fmtMinutes, totalMinutes, getJSON } = window.SSS;
  const root = document.getElementById("recipe");
  const slug = new URLSearchParams(location.search).get("r") || "";

  const fail = (msg) => {
    root.innerHTML = `<a class="back" href="./">← All recipes</a><p class="error">${esc(msg)}</p>`;
  };

  if (!/^[a-z0-9-]+$/.test(slug)) return fail("Recipe not found.");

  // Progress (checked ingredients / finished steps) is remembered per recipe on this device.
  const KEY = `sss:progress:${slug}`;
  const load = () => { try { return JSON.parse(localStorage.getItem(KEY)) || {}; } catch { return {}; } };
  const save = (p) => { try { localStorage.setItem(KEY, JSON.stringify(p)); } catch {} };

  // Ingredients and steps may be a flat list of strings, or a list of
  // { "group": "For the sauce", "items": [...] } sections (or a mix).
  const toGroups = (list = []) => {
    const groups = [];
    for (const entry of list) {
      if (typeof entry === "string") {
        if (!groups.length || groups[groups.length - 1].group) groups.push({ group: "", items: [] });
        groups[groups.length - 1].items.push(entry);
      } else if (entry && Array.isArray(entry.items)) {
        groups.push({ group: entry.group || "", items: entry.items });
      }
    }
    return groups;
  };

  function render(r) {
    const cat = CATEGORIES[r.category] || { label: r.category };
    document.title = `${r.title} · Shaken, Stirred & Sautéed`;
    const t = r.time || {};
    const total = totalMinutes(t);

    const facts = [
      ["Makes", r.yield],
      ["Prep", t.prep != null && fmtMinutes(t.prep)],
      ["Cook", t.cook != null && fmtMinutes(t.cook)],
      ["Chill", t.chill != null && fmtMinutes(t.chill)],
      ["Total", total != null && fmtMinutes(total)],
      ["Glass", r.glass],
      ["Method", r.method],
      ["Garnish", r.garnish],
    ].filter(([, v]) => v);

    let ingIdx = 0, stepIdx = 0;
    const ingHTML = toGroups(r.ingredients).map((g) => `
      ${g.group ? `<h3>${esc(g.group)}</h3>` : ""}
      <ul class="ingredients">${g.items.map((it) => `
        <li><label><input type="checkbox" data-ing="${ingIdx++}"><span>${esc(it)}</span></label></li>`).join("")}
      </ul>`).join("");
    const stepHTML = toGroups(r.steps).map((g) => `
      ${g.group ? `<h3>${esc(g.group)}</h3>` : ""}
      <ol class="steps" style="counter-reset: step ${stepIdx}">${g.items.map((s) => `
        <li data-step="${stepIdx++}" tabindex="0">${esc(s)}</li>`).join("")}
      </ol>`).join("");

    root.innerHTML = `
      <a class="back" href="./?cat=${encodeURIComponent(r.category)}">← ${esc(cat.label)}</a>
      ${r.image ? `<img class="recipe-hero" src="${esc(r.image)}" alt="">` : ""}
      <h1>${esc(r.title)}</h1>
      ${r.description ? `<p class="lede">${esc(r.description)}</p>` : ""}
      ${facts.length ? `<dl class="facts">${facts.map(([k, v]) =>
        `<div class="fact"><dt>${k}</dt><dd>${esc(v)}</dd></div>`).join("")}</dl>` : ""}

      <div class="toolbar">
        <button class="btn" id="wake" aria-pressed="false" hidden>☀️ Keep screen on</button>
        <button class="btn" id="reset">↺ Reset checkmarks</button>
        <button class="btn" onclick="window.print()">🖨 Print</button>
      </div>

      <section class="section"><h2>Ingredients</h2>${ingHTML}</section>
      <section class="section"><h2>${r.category === "cocktails" ? "Method" : "Steps"}</h2>${stepHTML}</section>
      ${r.notes && r.notes.length ? `<section class="section"><h2>Notes</h2>
        <ul class="notes">${r.notes.map((n) => `<li>${esc(n)}</li>`).join("")}</ul></section>` : ""}
      ${r.tags && r.tags.length ? `<div class="tag-list">${r.tags.map((tg) =>
        `<a class="chip" href="./?tag=${encodeURIComponent(tg)}">#${esc(tg)}</a>`).join("")}</div>` : ""}
      ${r.source ? `<p class="source">Source: ${r.source.url
        ? `<a href="${esc(r.source.url)}" rel="noopener" target="_blank">${esc(r.source.name || r.source.url)}</a>`
        : esc(r.source.name)}</p>` : ""}
    `;
    wire();
  }

  function wire() {
    const progress = Object.assign({ ing: [], steps: [] }, load());
    const boxes = [...root.querySelectorAll("[data-ing]")];
    const steps = [...root.querySelectorAll("[data-step]")];

    const paint = () => {
      boxes.forEach((b) => { b.checked = progress.ing.includes(+b.dataset.ing); });
      const firstOpen = steps.find((s) => !progress.steps.includes(+s.dataset.step));
      steps.forEach((s) => {
        s.classList.toggle("done", progress.steps.includes(+s.dataset.step));
        s.classList.toggle("current", s === firstOpen && progress.steps.length > 0);
      });
    };
    const toggle = (arr, i) => { const k = arr.indexOf(i); k >= 0 ? arr.splice(k, 1) : arr.push(i); };

    root.addEventListener("change", (e) => {
      if (!e.target.matches("[data-ing]")) return;
      toggle(progress.ing, +e.target.dataset.ing); save(progress); paint();
    });
    steps.forEach((s) => {
      const flip = () => { toggle(progress.steps, +s.dataset.step); save(progress); paint(); };
      s.addEventListener("click", flip);
      s.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); flip(); } });
    });
    document.getElementById("reset").addEventListener("click", () => {
      progress.ing = []; progress.steps = []; save(progress); paint();
    });
    paint();

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

  getJSON(`recipes/${slug}.json`).then(render).catch(() => fail("Recipe not found."));
})();
