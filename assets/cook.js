// Cook mode: a recipe's steps one screen at a time. recipe.js opens it (the
// page's URL ends in #cook while it's open) and shares the recipe's saved
// progress with it, so ticks and finished steps show in both views.
window.SSSCook = (() => {
  const { esc, toGroups, stepOrder } = window.SSS;

  const START = { baking: "Start baking", cooking: "Start cooking", cocktails: "Start mixing" };
  const startLabel = (r) => START[r.category] || "Start cooking";

  // Which ingredients each step uses (its "uses" list), matched the same way
  // the recipe checker matches them: by item, plus group when two share a name.
  // Ingredient numbers are positions in the whole list, as in saved progress.
  // Returns { steps: [[{ i, amount }]], usesOf: ingredient -> [steps using it] }.
  const lower = (s) => String(s ?? "").trim().toLowerCase();
  function linkIngredients(r) {
    const ings = toGroups(r.ingredients).flatMap((g) => g.items.map((it) => ({
      group: lower(g.group), item: lower(typeof it === "string" ? it : it.item),
    })));
    const steps = toGroups(r.steps).flatMap((g) => g.items).map((s) => (Array.isArray(s?.uses) ? s.uses : []).flatMap((u) => {
      const { item, group, amount } = typeof u === "string" ? { item: u } : u || {};
      const hits = ings.flatMap((x, i) => (x.item === lower(item) && (group === undefined || x.group === lower(group)) ? [i] : []));
      return hits.length === 1 ? [{ i: hits[0], amount }] : [];
    }));
    const usesOf = new Map();
    steps.forEach((list, s) => list.forEach(({ i }) => usesOf.set(i, [...(usesOf.get(i) || []), s])));
    return { steps, usesOf };
  }

  // An ingredient used by more than one step is ticked once per use
  // (progress.uses holds "step:ingredient" pairs), and counts as ticked on the
  // recipe page once every use is.
  const split = (links, i) => (links.usesOf.get(i) || []).length > 1;
  const useKey = (s, i) => `${s}:${i}`;
  function isTicked(progress, links, s, i) {
    return split(links, i) ? (progress.uses || []).includes(useKey(s, i)) : progress.ing.includes(i);
  }
  function setIng(progress, i, on) {
    progress.ing = progress.ing.filter((x) => x !== i);
    if (on) progress.ing.push(i);
  }
  // Ticks or unticks one step's use of an ingredient.
  function tickUse(progress, links, s, i, on) {
    if (!split(links, i)) return setIng(progress, i, on);
    const k = useKey(s, i);
    progress.uses = (progress.uses || []).filter((x) => x !== k);
    if (on) progress.uses.push(k);
    setIng(progress, i, links.usesOf.get(i).every((t) => progress.uses.includes(useKey(t, i))));
  }
  // Ticks or unticks an ingredient everywhere (from the recipe page).
  function tickIngredient(progress, links, i, on) {
    setIng(progress, i, on);
    if (split(links, i)) {
      const keys = links.usesOf.get(i).map((s) => useKey(s, i));
      progress.uses = (progress.uses || []).filter((x) => !keys.includes(x)).concat(on ? keys : []);
    }
  }

  // A wait as minutes, from its first time: "15 to 18 min" -> 15, "1 1/2 to
  // 2 1/2 hr" -> 90, "1 hr 15 min" -> 75, "45 sec" -> .75. null if it has none.
  const NUM = String.raw`\d+(?:\.\d+)?(?:\s+\d+\/\d+)?|\d+\/\d+`;
  const UNIT = String.raw`(sec(?:ond)?s?|min(?:ute)?s?|hrs?|hours?)\b`;
  const WAIT = new RegExp(`(${NUM})\\s*(?:(?:to|-|–)\\s*(?:${NUM})\\s*)?${UNIT}(?:\\s*(\\d+)\\s*min)?`, "i");
  const num = (s) => s.split(/\s+/).reduce((t, p) => t + (p.includes("/") ? p.split("/")[0] / p.split("/")[1] : +p), 0);
  function waitMinutes(wait) {
    const m = WAIT.exec(wait || "");
    if (!m) return null;
    const unit = m[2].toLowerCase()[0];
    return num(m[1]) * (unit === "s" ? 1 / 60 : unit === "h" ? 60 : 1) + (m[3] ? +m[3] : 0);
  }
  const fmtLength = (min) => (min < 1 ? `${Math.round(min * 60)} sec` : window.SSS.fmtMinutes(min));

  // Timers are shared by every recipe (several are often one meal), saved with
  // the time they end so they stay right through reloads:
  // [{ id, slug, title, step, cue, ends, left, total }]; a paused timer has
  // ends null and the time it had left in "left".
  const TIMERS = "sss:timers";
  const loadTimers = () => { try { return JSON.parse(localStorage.getItem(TIMERS)) || []; } catch { return []; } };
  const saveTimers = (t) => { try { localStorage.setItem(TIMERS, JSON.stringify(t)); } catch {} };
  const msLeft = (t, now) => (t.ends == null ? t.left : t.ends - now);
  const clock = (ms) => {
    const s = Math.max(0, Math.ceil(ms / 1000)), h = Math.floor(s / 3600), m = Math.floor(s / 60) % 60;
    const ss = String(s % 60).padStart(2, "0");
    return h ? `${h}:${String(m).padStart(2, "0")}:${ss}` : `${m}:${ss}`;
  };
  const timeOfDay = (ms) => {
    const d = new Date(ms), h = d.getHours();
    return `${h % 12 || 12}:${String(d.getMinutes()).padStart(2, "0")} ${h < 12 ? "am" : "pm"}`;
  };

  // A short beep and a buzz, repeated while a timer rings. The page can only
  // make sound while it's open, which cook mode's screen wake lock helps with,
  // and only after a tap since the page loaded, so every tap in cook mode
  // turns sound on. The buzz needs no tap.
  let audio = null;
  const unlockAudio = () => {
    try { audio = audio || new AudioContext(); audio.resume().catch(() => {}); } catch { audio = null; }
  };
  // On an iPhone, "playback" rings through the silent switch. It also pauses
  // music or a podcast, so it's only set while a timer rings.
  const throughSilentSwitch = (on) => {
    const type = on ? "playback" : "auto";
    if (navigator.audioSession && navigator.audioSession.type !== type) navigator.audioSession.type = type;
  };
  function beep() {
    if (navigator.vibrate) navigator.vibrate([200, 100, 200]);
    try {
      if (!audio) return;
      throughSilentSwitch(true);
      // A phone pauses sound when it locks or switches app; try to restart it.
      if (audio.state !== "running") audio.resume().catch(() => {});
      const osc = audio.createOscillator(), gain = audio.createGain();
      osc.frequency.value = 880;
      gain.gain.setValueAtTime(0.25, audio.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, audio.currentTime + 0.4);
      osc.connect(gain).connect(audio.destination);
      osc.start(); osc.stop(audio.currentTime + 0.4);
    } catch {}
  }

  // "125 g", "1 cup" first then smaller; a step's own share replaces both.
  function ingredientRow(it, amount) {
    if (typeof it === "string") return `<span>${esc(it)}</span>`;
    const units = [it.grams != null && `${it.grams} g`, it.qty, it.ml != null && `${it.ml} ml`].filter(Boolean);
    const [main, ...alt] = amount ? [amount] : units;
    return `${main ? `<b>${esc(main)}</b> ` : ""}${alt.length ? `<span class="cook-alt">${esc(alt.join(" · "))}</span> ` : ""}`
      + `<span>${esc(it.item)}</span>${it.note ? ` <span class="muted">${esc(it.note)}</span>` : ""}`;
  }

  // opts: { recipe, slug, progress, save, onChange, onClose }. progress is the recipe
  // page's { ing: [...], steps: [...] } record; save() stores it and onChange()
  // repaints the recipe page.
  function open(opts) {
    const { recipe: r, slug, progress, save, onChange, onClose } = opts;
    // steps are in file order (progress and timers use that place); order is
    // the order they're shown in, prep first or as written (SSS.stepOrder),
    // with each one's group: [{ i, group }].
    const steps = toGroups(r.steps).flatMap((g) => g.items.map((s) => (typeof s === "string" ? { do: s } : s)));
    const order = stepOrder(r, window.SSSMenu ? window.SSSMenu.prepFirst() : true).steps;
    const shownAt = (i) => order.findIndex((x) => x.i === i);
    const before = r.beforeYouStart || [];
    const notes = toGroups(r.notes);
    const ings = toGroups(r.ingredients).flatMap((g) => g.items);
    const links = linkIngredients(r);

    const el = document.createElement("section");
    el.className = "cook";
    el.setAttribute("aria-label", "Cook mode");
    document.body.append(el);
    document.body.classList.add("cooking");

    const isDone = (i) => progress.steps.includes(i);
    // Where you are: the first step not done, in the order shown (its place in the file).
    const current = () => order.find((x) => !isDone(x.i))?.i ?? -1;
    const view = () => {
      if (current() < 0) return "done";
      return before.length && !progress.started && !progress.steps.length ? "intro" : "step";
    };
    const commit = () => { save(progress); onChange(); paint(); };

    function goNext() {
      const v = view();
      if (v === "intro") progress.started = true;
      else if (v === "step") progress.steps.push(current());
      else return;
      commit();
    }
    function goBack() {
      const v = view();
      const prev = v === "done" ? order[order.length - 1]?.i ?? -1 : order[shownAt(current()) - 1]?.i ?? -1;
      if (v === "intro") return;
      if (prev >= 0) progress.steps = progress.steps.filter((i) => i !== prev);
      else if (before.length) progress.started = false;
      else return;
      commit();
    }

    const upNextHTML = (s) => s ? `
      <button class="cook-upnext" type="button" aria-expanded="false">
        <span class="cook-upnext-label">Up next</span> <span class="cook-upnext-text">${esc(s.do)}</span>
      </button>` : "";

    function paint() {
      const v = view(), i = current(), s = steps[i], at = shownAt(i), group = order[at]?.group;
      const label = v === "intro" ? "Before you start" : v === "done" ? "All done"
        : `${group ? `${group} · ` : ""}Step ${at + 1} of ${order.length}`;
      const bar = order.map(({ i: k }) => `<i class="${isDone(k) ? "done" : k === i ? "now" : ""}"></i>`).join("");

      let body;
      if (v === "intro") {
        body = `<h2>Before you start</h2><ul class="cook-list">${before.map((b) => `<li>${esc(b)}</li>`).join("")}</ul>`;
      } else if (v === "done") {
        body = `<h2>All done</h2>
          ${notes.map((g) => `${g.group ? `<h3>${esc(g.group)}</h3>` : ""}<ul class="cook-list">${g.items.map((n) => `<li>${esc(n)}</li>`).join("")}</ul>`).join("")}
          <button class="btn cook-return" type="button">Back to the recipe</button>`;
      } else {
        const uses = links.steps[i];
        body = `<p class="cook-do" data-testid="instruction">${esc(s.do)}</p>
          ${uses.length ? `<ul class="cook-ings">${uses.map(({ i: n, amount }) => `
            <li><label><input type="checkbox" data-use="${n}" ${isTicked(progress, links, i, n) ? "checked" : ""}>
              <span>${ingredientRow(ings[n], amount)}</span></label></li>`).join("")}</ul>` : ""}
          ${s.wait ? `<p class="cook-wait" data-testid="wait"><span>⏱ ${esc(s.wait)}</span>${timerButton(i, s)}</p>` : ""}
          ${s.cue ? `<p class="cook-cue" data-testid="cue">✓ ${esc(s.cue)}</p>` : ""}`;
      }
      const after = v === "intro" ? steps[order[0]?.i] : v === "step" ? steps[order[at + 1]?.i] : null;
      const canBack = v === "done" || (v === "step" && (at > 0 || before.length > 0));

      el.innerHTML = `
        <div class="cook-top">
          <span class="cook-label" data-testid="step-label">${esc(label)}</span>
          <button class="cook-close" type="button" aria-label="Close cook mode">✕</button>
        </div>
        <div class="cook-bar" aria-hidden="true">${bar}</div>
        <div class="cook-timers"></div>
        <div class="cook-body">${body}</div>
        ${upNextHTML(after)}
        <div class="cook-nav">
          <button class="btn cook-back" type="button" ${canBack ? "" : "disabled"}>Back</button>
          ${v === "done" ? "" : `<button class="btn cook-go" type="button">${v === "step" && at === order.length - 1 ? "Finish" : "Next step"}</button>`}
        </div>
        <p class="visually-hidden" aria-live="polite">${esc(label)}${v === "step" ? `: ${esc(s.do)}` : ""}</p>
        <p class="visually-hidden cook-alert" aria-live="assertive"></p>`;
      shown = null;
      paintTimers();
    }

    // Timers: a start button on each step with a wait, and a strip at the top
    // for every running timer, from this recipe or another.
    const timerButton = (i, s) => {
      const min = waitMinutes(s.wait);
      if (min == null || loadTimers().some((t) => t.slug === slug && t.step === i)) return "";
      return `<button class="btn cook-timer-start" type="button" data-start="${i}">Start ${esc(fmtLength(min))} timer</button>`;
    };
    function startTimer(i) {
      const total = waitMinutes(steps[i].wait) * 60_000;
      saveTimers([...loadTimers(), { id: `${Date.now()}-${slug}-${i}`, slug, title: r.title, step: i, cue: steps[i].cue || "", ends: Date.now() + total, left: total, total }]);
      paint();
    }
    function changeTimer(id, how) {
      const now = Date.now();
      const list = loadTimers().flatMap((t) => {
        if (t.id !== id) return [t];
        if (how === "stop") return [];
        if (how === "pause") return [{ ...t, left: msLeft(t, now), ends: null }];
        if (how === "resume") return [{ ...t, ends: now + t.left }];
        return [{ ...t, ends: now + 120_000, total: 120_000 }]; // "+2 min"
      });
      saveTimers(list);
      paint();
    }

    // A timer on this recipe is named by its step's number in the order shown.
    const shownNumber = (i) => (shownAt(i) >= 0 ? shownAt(i) : i) + 1;
    // The strip is redrawn only when a timer starts, stops, pauses or rings;
    // otherwise just its time changes, so buttons keep their focus.
    let shown = null, rang = new Set();
    function paintTimers() {
      const box = el.querySelector(".cook-timers");
      if (!box) return;
      const now = Date.now(), timers = loadTimers();
      const state = (t) => (t.ends == null ? "paused" : t.ends <= now ? "ringing" : "running");
      const key = timers.map((t) => `${t.id}:${state(t)}`).join(" ");
      if (key !== shown) {
        shown = key;
        box.innerHTML = timers.map((t) => {
          const here = t.slug === slug, st = state(t);
          const name = here ? `Step ${shownNumber(t.step)}` : `${t.title}, step ${t.step + 1}`;
          const where = here ? esc(name) : `<a href="recipe.html?r=${encodeURIComponent(t.slug)}#cook">${esc(t.title)}</a> · step ${t.step + 1}`;
          const actions = st === "ringing"
            ? `<button class="btn" type="button" data-timer="${esc(t.id)}" data-how="more">+2 min</button><button class="btn" type="button" data-timer="${esc(t.id)}" data-how="stop">Stop</button>`
            : `<button class="btn" type="button" data-timer="${esc(t.id)}" data-how="${st === "paused" ? "resume" : "pause"}">${st === "paused" ? "Resume" : "Pause"}</button>`
              + `<button class="btn cook-timer-cancel" type="button" data-timer="${esc(t.id)}" data-how="stop" aria-label="Cancel timer">✕</button>`;
          return `<div class="cook-timer ${st}" role="timer" aria-label="${esc(name)}">
            <span class="cook-timer-time" data-id="${esc(t.id)}"></span>
            <span class="cook-timer-what">${where}${st === "ringing" ? ` · ${esc(t.cue || "Time's up")}`
              : st === "running" && t.total >= 3_600_000 ? ` · Ready around ${timeOfDay(t.ends)}` : ""}</span>
            <span class="cook-timer-actions">${actions}</span>
          </div>`;
        }).join("");
      }
      for (const t of timers) {
        const span = box.querySelector(`.cook-timer-time[data-id="${CSS.escape(t.id)}"]`);
        if (span) span.textContent = clock(msLeft(t, now));
      }
      const ringing = timers.filter((t) => state(t) === "ringing");
      for (const t of ringing) if (!rang.has(t.id)) {
        rang.add(t.id);
        const alert = el.querySelector(".cook-alert");
        if (alert) alert.textContent = `Time's up: ${t.slug === slug ? "" : `${t.title}, `}step ${t.slug === slug ? shownNumber(t.step) : t.step + 1}. ${t.cue}`;
      }
      rang = new Set([...rang].filter((id) => ringing.some((t) => t.id === id)));
      return ringing.length > 0;
    }
    let ticks = 0;
    const tick = setInterval(() => {
      if (!paintTimers()) throughSilentSwitch(false);
      else if (ticks++ % 2 === 0) beep();
    }, 1000);

    el.addEventListener("keydown", unlockAudio);
    el.addEventListener("click", (e) => {
      unlockAudio();
      const b = e.target.closest("button");
      if (!b) return;
      if (b.matches(".cook-go")) goNext();
      else if (b.matches(".cook-back")) goBack();
      else if (b.matches(".cook-close, .cook-return")) onClose();
      else if (b.matches(".cook-upnext")) b.setAttribute("aria-expanded", String(b.getAttribute("aria-expanded") !== "true"));
      else if (b.dataset.start) startTimer(+b.dataset.start);
      else if (b.dataset.timer) changeTimer(b.dataset.timer, b.dataset.how);
    });

    el.addEventListener("change", (e) => {
      if (!e.target.matches("[data-use]")) return;
      tickUse(progress, links, current(), +e.target.dataset.use, e.target.checked);
      save(progress); onChange();
    });

    onSwipe(el, goNext, goBack);

    // Keep the screen awake while cook mode is open (where supported).
    let lock = null, closed = false;
    const wake = async () => {
      if (closed || lock || !("wakeLock" in navigator) || document.visibilityState !== "visible") return;
      try {
        lock = await navigator.wakeLock.request("screen");
        lock.addEventListener("release", () => { lock = null; });
        if (closed) lock.release();
      } catch { lock = null; }
    };
    document.addEventListener("visibilitychange", wake);
    wake();

    paint();
    return {
      close() {
        closed = true;
        clearInterval(tick);
        throughSilentSwitch(false);
        document.removeEventListener("visibilitychange", wake);
        if (lock) lock.release();
        el.remove();
        document.body.classList.remove("cooking");
      },
    };
  }

  // A recipe's saved progress ("sss:progress:<slug>"), kept only while the
  // recipe's ingredients and steps are the same shape as when it was saved
  // (progress is saved by position). Used by the recipe page and the menu.
  function progressFor(r, slug) {
    const KEY = `sss:progress:${slug}`;
    const shape = JSON.stringify([
      toGroups(r.ingredients).flatMap((g) => g.items.map((i) => (typeof i === "string" ? i : i.item))),
      toGroups(r.steps).reduce((n, g) => n + g.items.length, 0),
    ]);
    let fp = 0;
    for (const ch of shape) fp = (fp * 31 + ch.charCodeAt(0)) | 0;
    let saved = {};
    try { saved = JSON.parse(localStorage.getItem(KEY)) || {}; } catch {}
    const progress = Object.assign({ ing: [], steps: [] }, saved.fp == null || saved.fp === fp ? saved : {}, { fp });
    const save = (p = progress) => { try { localStorage.setItem(KEY, JSON.stringify(p)); } catch {} };
    return { progress, save };
  }

  // Swipe left for the next step, right to go back (touch and pen only, so
  // selecting text with a mouse never moves you). Both cook modes use it.
  function onSwipe(el, left, right) {
    let down = null;
    el.addEventListener("pointerdown", (e) => { down = e.pointerType === "mouse" ? null : { x: e.clientX, y: e.clientY }; });
    el.addEventListener("pointerup", (e) => {
      if (!down) return;
      const dx = e.clientX - down.x, dy = e.clientY - down.y;
      down = null;
      if (Math.abs(dx) > 60 && Math.abs(dx) > 1.5 * Math.abs(dy)) (dx < 0 ? left : right)();
    });
  }

  return {
    open, startLabel, linkIngredients, tickIngredient, progressFor, onSwipe,
    // For the menu's cook mode (menu-cook.mjs), which shares the timers and the look.
    ingredientRow, isTicked, tickUse, waitMinutes, fmtLength, loadTimers, saveTimers, msLeft, clock, timeOfDay, beep, unlockAudio,
  };
})();
