// Cooking your menu (menu.html#cook): today's cook screen with every dish's
// steps in the planner's order. It re-plans each time you move on, from what
// you've really done and when. See docs/specs/meal-planner-design.md,
// "Cooking a lineup".
//
// While cooking, the menu's saved record (sss:lineup) holds `cooking`:
//   { part: "day" | "ahead", started (ms), first (the first plan's length),
//     intro (the gather list is done), done: [{ slug, step, at, waitUntil?, timer? }],
//     current: { slug, step, at } (the step on screen), plated: [course],
//     log: ["intro" | "done" | "plate"] (what Back undoes), waitTimer }
// Times in done and current are minutes from `started`, as the planner takes them.
import { planLineup } from "./planner.mjs";
import { cookSteps, withoutServing, busyStretch, behind, dayLength, brief } from "./menu-plan.mjs";

const { esc, toGroups } = window.SSS;
const Menu = window.SSSMenu;
const C = window.SSSCook;
const key = (s) => `${s.slug}:${s.step}`;
// A wait screen only when nothing needs you for more than this many minutes.
const WAIT_SCREEN = 2;
const RING = 2 * Math.PI * 54;

export function openCook({ planMenu, onClose }) {
  const el = document.createElement("section");
  el.className = "cook menu-cook";
  el.setAttribute("aria-label", "Cook mode");
  document.body.append(el);
  document.body.classList.add("cooking");
  el.innerHTML = `<p class="loading">Planning…</p>`;

  let recipes = {}, lineup = null, plan = null, steps = [], error = null, parentOf = {}, ready = false;
  const menu = () => Menu.load();
  const cooking = () => menu().cooking;
  const change = (fn) => { const m = menu(); fn(m.cooking, m); Menu.save(m); };
  const now = () => (Date.now() - cooking().started) / 60000;
  const title = (slug) => recipes[slug]?.title || slug;
  const fam = (slug) => `fam-${esc(recipes[slug]?.category || "cooking")}`;
  const recipeStep = (s) => (typeof s.step === "number" ? toGroups(recipes[s.slug]?.steps).flatMap((g) => g.items)[s.step] : null);
  const stepObj = (s) => { const x = recipeStep(s); return typeof x === "string" ? { do: x } : x || {}; };

  // ===== Planning =====
  const settled = (c) => (Array.isArray(c.madeAhead) ? { madeAhead: c.madeAhead } : {});
  // The day, or the part made ahead on its own: both are re-planned from what
  // you've done and when.
  function replan() {
    const c = cooking(), t = now();
    try {
      const options = { ...settled(c), ...(c.part === "ahead" && { part: "ahead" }) };
      for (let i = 0; i < 6; i++) {
        plan = planLineup(lineup, recipes, { now: t, done: c.done, ...(c.current && { current: c.current }) }, options);
        // An oven already hot skips its heating step: count it as passed, so
        // the dish's later steps can be replayed after it.
        const upTo = plan.upNow ? plan.steps.indexOf(plan.upNow) : plan.steps.length;
        const passed = plan.steps.filter((s, k) => k < upTo && s.skipped && !s.done);
        if (!passed.length) break;
        change((cc) => { cc.done.push(...passed.map((s) => ({ slug: s.slug, step: s.step, at: t }))); });
      }
      if (cooking().first == null) change((cc) => { cc.first = dayLength(plan); });
      steps = cookSteps(plan, parentOf);
      error = null;
    } catch (e) {
      error = e;
    }
  }
  // Where you are: the first step (or plate-up) not done yet.
  const plated = () => cooking().plated || [];
  const isDone = (s) => (s.plate ? plated().includes(s.plate) : !!s.done);
  const curIndex = () => steps.findIndex((s) => !isDone(s));
  function view() {
    const c = cooking();
    if (error) return "error";
    if (!c.intro && gather().length) return "intro";
    const i = curIndex();
    if (i < 0) return "done";
    if (steps[i].plate) return "plate";
    const s = steps[i];
    if (c.current && key(c.current) === key(s)) return "step";
    if (plan.wait > WAIT_SCREEN) return "wait";
    // It's this step's turn: it's the step on screen from now.
    change((cc) => { cc.current = { slug: s.slug, step: s.step, at: now() }; });
    return "step";
  }
  // Everything to gather first: each dish's "Before you start".
  const gather = () => [...new Set(plan.steps.map((s) => s.slug))].filter((slug) => (recipes[slug]?.beforeYouStart || []).length);

  // ===== Moving through it =====
  function goNext() {
    const v = view(), i = curIndex(), s = steps[i];
    if (v === "intro") change((c) => { c.intro = true; c.log = [...(c.log || []), "intro"]; });
    else if (v === "wait") change((c) => { c.current = { slug: s.slug, step: s.step, at: now() }; c.waitTimer = null; });
    else if (v === "plate") change((c) => { c.plated = [...(c.plated || []), s.plate]; c.log = [...(c.log || []), "plate"]; });
    else if (v === "step") {
      const timer = s.wait > 0 && !s.watch && s.timer ? startTimer(s) : null;
      change((c) => {
        c.done.push({ slug: s.slug, step: s.step, at: now(), ...(timer && { timer }) });
        c.current = null; c.waitTimer = null;
        c.log = [...(c.log || []), "done"];
      });
      markRecipe(s, true);
    } else return;
    replan();
    paint();
  }
  function goBack() {
    const log = cooking().log || [];
    const last = log[log.length - 1];
    if (!last) return;
    change((c) => {
      c.log = log.slice(0, -1);
      c.current = null; c.waitTimer = null;
      if (last === "intro") c.intro = false;
      if (last === "plate") c.plated = (c.plated || []).slice(0, -1);
      if (last === "done") {
        const undone = c.done.pop();
        if (undone.timer) C.saveTimers(C.loadTimers().filter((t) => t.id !== undone.timer));
        markRecipe(undone, false);
      }
    });
    replan();
    paint();
  }
  // A step done here is done on its recipe's own page too.
  function markRecipe(s, on) {
    const r = recipes[s.slug];
    if (!r || typeof s.step !== "number") return;
    const { progress, save } = C.progressFor(r, s.slug);
    progress.steps = progress.steps.filter((x) => x !== s.step);
    if (on) progress.steps.push(s.step);
    save(progress);
  }
  function finish() {
    const m = menu();
    if (m.cooking.part === "ahead") {
      m.aheadDone = { ...m.aheadDone };
      for (const slug of m.cooking.madeAhead || planLineup(lineup, recipes).makeAhead.filter((x) => x.ahead).map((x) => x.slug)) m.aheadDone[slug] = true;
    }
    delete m.cooking;
    Menu.save(m);
    onClose();
  }

  // ===== Timers =====
  // A step's own wait starts its timer when you press Next step (you've just
  // put the potatoes in), at the short end of a range so you check early. The
  // timer says what comes after it, from the plan's followUp.
  function startTimer(s, len) {
    C.unlockAudio();
    const minutes = len ?? (s.timer.short - s.timer.from);
    const after = s.followUp != null ? plan.steps[s.followUp] : null;
    const total = Math.max(1, minutes) * 60_000, id = `${Date.now()}-${s.slug}-${s.step}`;
    C.saveTimers([...C.loadTimers(), {
      id, slug: s.slug, title: title(s.slug), step: s.step, cue: stepObj(s).cue || "", ends: Date.now() + total, left: total, total,
      menu: true, ...(after && { next: brief(displayText(after)), nextKey: key(after) }),
    }]);
    return id;
  }
  // Giving a timer more time, or stopping it early, re-plans: the dish's next
  // step comes when its wait really ends.
  function changeTimer(id, how) {
    const t0 = Date.now();
    const timer = C.loadTimers().find((t) => t.id === id);
    const list = C.loadTimers().flatMap((t) => {
      if (t.id !== id) return [t];
      if (how === "stop") return [];
      if (how === "pause") return [{ ...t, left: C.msLeft(t, t0), ends: null }];
      if (how === "resume") return [{ ...t, ends: t0 + t.left }];
      return [{ ...t, ends: t0 + 120_000, total: 120_000 }];
    });
    C.saveTimers(list);
    const ringing = timer && timer.ends != null && timer.ends <= t0;
    if (timer?.menu && (how === "more" || (how === "stop" && !ringing))) {
      change((c) => {
        const d = c.done.find((x) => x.timer === id);
        if (d) d.waitUntil = (how === "more" ? t0 + 120_000 - c.started : t0 - c.started) / 60000;
      });
      replan();
      paint();
    } else paintTimers(true);
  }

  // ===== Drawing =====
  // A dish's last step, inside a menu, leaves the serving to the plate-up step.
  function displayText(s) {
    const last = cooking().part !== "ahead" && !plan.steps.some((x) => x.slug === s.slug && x.at > s.at && x !== s);
    return last ? withoutServing(s.text) : s.text;
  }
  const chip = (slug) => `<span class="menu-chip ${fam(slug)}">${esc(title(slug))}</span>`;
  const ringingNext = () => new Set(C.loadTimers().filter((t) => t.ends != null && t.ends <= Date.now() && t.nextKey).map((t) => t.nextKey));
  function upNextHTML(s) {
    if (!s) return "";
    const text = s.plate ? `Plate up the ${s.plate.toLowerCase()}` : `${title(s.slug)}: ${displayText(s)}`;
    return `<button class="cook-upnext" type="button" aria-expanded="false">
      <span class="cook-upnext-label">Up next</span> <span class="cook-upnext-text">${!s.plate && ringingNext().has(key(s)) ? `<span class="menu-due">due now</span> ` : ""}${esc(text)}</span></button>`;
  }
  function heading(v, i) {
    const n = steps.length, ahead = cooking().part === "ahead" ? "Ahead of time · " : "";
    if (v === "intro") return "Before you start";
    if (v === "done") return "All done";
    if (v === "error") return "Can't plan this";
    if (v === "wait") return `${ahead}Wait · then step ${i + 1} of ${n}`;
    return `${ahead}Step ${i + 1} of ${n}`;
  }
  function busyHTML(k) {
    // Only before a stretch starts: inside one, busyStretch says nothing.
    const b = busyStretch(steps, k);
    if (!b) return "";
    const names = [...new Set(steps.slice(k, k + b.steps).filter((s) => !s.plate).map((s) => title(s.slug)))];
    return `<p class="menu-land"><b>Busy stretch next</b>${esc(list(names))} come together: ${b.steps} steps, about ${b.minutes} min, one straight after another.</p>`;
  }
  const list = (xs) => (xs.length < 2 ? xs.join("") : `${xs.slice(0, -1).join(", ")} and ${xs[xs.length - 1]}`);

  function paint() {
    if (!ready) return;
    const v = view(), i = curIndex(), s = steps[i], c = cooking();
    const behindBy = v === "step" && c.part !== "ahead" && plan ? behind(plan, c.first) : 0;
    let body = "", after = null, chipSlug = null;
    if (v === "error") {
      body = `<h2>These can't be planned together any more</h2><p>${esc(error.message || "")}</p>
        <button class="btn cook-return" type="button">Back to your menu</button>`;
    } else if (v === "intro") {
      body = `<h2>Before you start</h2><ul class="menu-gather">${gather().map((slug) => `<li class="${fam(slug)}">
          <h3>${esc(title(slug))}</h3><ul class="cook-list">${recipes[slug].beforeYouStart.map((b) => `<li>${esc(b)}</li>`).join("")}</ul></li>`).join("")}</ul>`;
      after = steps[curIndex()];
    } else if (v === "done") {
      const dishes = lineup.dishes.map((d) => d.slug).filter((slug) => toGroups(recipes[slug]?.notes).length);
      body = `<h2>All done</h2>
        ${dishes.map((slug, k) => `<details class="menu-notes"${k === 0 ? " open" : ""}><summary>${esc(title(slug))}</summary>
          ${toGroups(recipes[slug].notes).map((g) => `${g.group ? `<h3>${esc(g.group)}</h3>` : ""}<ul class="cook-list">${g.items.map((n) => `<li>${esc(n)}</li>`).join("")}</ul>`).join("")}</details>`).join("")}
        <button class="btn cook-return" type="button">Back to your menu</button>`;
    } else if (v === "plate") {
      body = `<h2>Plate up the ${esc(s.plate.toLowerCase())}</h2>
        <ul class="menu-plate">${s.dishes.map((slug) => `<li class="${fam(slug)}">${esc(title(slug))}</li>`).join("")}</ul>`;
      after = steps[i + 1];
    } else if (v === "wait") {
      body = busyHTML(i) + waitHTML();
      after = s;
    } else {
      chipSlug = s.slug;
      const r = recipes[s.slug], o = stepObj(s);
      const links = typeof s.step === "number" && r ? C.linkIngredients(r) : null;
      const uses = links ? links.steps[s.step] || [] : [];
      const ings = r ? toGroups(r.ingredients).flatMap((g) => g.items) : [];
      const { progress } = r ? C.progressFor(r, s.slug) : { progress: null };
      const range = s.timer && s.timer.short - s.timer.from < s.wait - 0.01;
      const running = C.loadTimers().some((t) => t.slug === s.slug && t.step === s.step);
      body = `${behindBy >= 5 ? `<p class="menu-behind"><b>About ${behindBy} min behind.</b> The rest of the plan has moved to fit.</p>` : ""}
        ${busyHTML(i + 1)}
        <p class="cook-do" data-testid="instruction">${esc(displayText(s))}</p>
        ${uses.length ? `<ul class="cook-ings">${uses.map(({ i: n, amount }) => `
          <li><label><input type="checkbox" data-use="${n}" ${C.isTicked(progress, links, s.step, n) ? "checked" : ""}>
            <span>${C.ingredientRow(ings[n], amount)}</span></label></li>`).join("")}</ul>` : ""}
        ${s.wait > 0 && o.wait ? `<p class="cook-wait" data-testid="wait"><span>⏱ ${esc(o.wait)}<span class="menu-range">${s.watch
            ? "Stay with it."
            : `The timer starts when you press Next step${range ? `, set to ${esc(C.fmtLength(s.timer.short - s.timer.from))} so you check early` : ""}.`}</span></span>
          ${s.watch && !running ? `<button class="btn cook-timer-start" type="button" data-own-timer>Start ${esc(C.fmtLength(s.timer.short - s.timer.from))} timer</button>` : ""}</p>` : ""}
        ${o.cue ? `<p class="cook-cue" data-testid="cue">✓ ${esc(o.cue)}</p>` : ""}`;
      after = steps[i + 1];
    }
    const label = `${chipSlug ? `${chip(chipSlug)} ` : ""}<span>${esc(heading(v, i))}</span>`;
    const bar = steps.map((x, k) => `<i class="${isDone(x) ? "done" : k === i ? "now" : ""}"></i>`).join("");
    const last = i === steps.length - 1 && (v === "step" || v === "plate");
    const canBack = (c.log || []).length > 0;
    el.className = `cook menu-cook ${chipSlug ? fam(chipSlug) : s && !s.plate ? fam(s.slug) : ""}`;
    el.innerHTML = `
      <div class="cook-top">
        <span class="cook-label" data-testid="step-label">${label}</span>
        <button class="cook-close" type="button" aria-label="Close cook mode">✕</button>
      </div>
      <div class="cook-bar" aria-hidden="true">${bar}</div>
      <div class="cook-timers"></div>
      <div class="cook-body${v === "wait" ? " menu-waitbody" : ""}">${body}</div>
      ${v === "done" || v === "error" ? "" : upNextHTML(after)}
      <div class="cook-nav">
        <button class="btn cook-back" type="button" ${canBack ? "" : "disabled"}>Back</button>
        ${v === "done" || v === "error" ? "" : `<button class="btn cook-go" type="button">${last ? "Finish" : "Next step"}</button>`}
      </div>
      <p class="visually-hidden" aria-live="polite">${esc(heading(v, i))}${v === "step" ? `, ${esc(title(s.slug))}: ${esc(displayText(s))}` : v === "plate" ? `: plate up the ${esc(s.plate.toLowerCase())}` : ""}</p>
      <p class="visually-hidden cook-alert" aria-live="assertive"></p>`;
    shown = null;
    paintTimers();
  }

  // The wait screen: "Wait about 12 minutes before the next step", a ring
  // that empties once its timer starts, and an alarm that rings until Stop.
  function waitHTML() {
    const c = cooking(), w = c.waitTimer, mins = Math.max(1, Math.round(plan.wait));
    const going = [...new Set(C.loadTimers().filter((t) => t.ends == null || t.ends > Date.now()).map((t) => t.title))];
    const up = w && w.ends != null && w.ends <= Date.now();
    const text = up ? (w.stopped ? "Time's up. Go on to the next step when you're ready." : "Time's up.")
      : `Wait about ${mins} minute${mins === 1 ? "" : "s"} before the next step.`;
    return `<div class="menu-ring${up && !w.stopped ? " ringing" : ""}${up ? " up" : ""}${w && !up ? " running" : ""}" role="timer" aria-label="Wait">
        <svg viewBox="0 0 120 120" aria-hidden="true"><circle class="menu-ring-track" cx="60" cy="60" r="54"/><circle class="menu-ring-left" cx="60" cy="60" r="54" stroke-dasharray="${RING.toFixed(1)}" stroke-dashoffset="0"/></svg>
        <span><b class="menu-ring-time">${w ? "" : mins}</b><small>${up ? "time's up" : w ? "left" : "min"}</small></span>
      </div>
      <h2 class="cook-do menu-wait-text">${esc(text)}</h2>
      ${up ? "" : `<p class="muted">${going.length ? `${esc(list(going))} ${going.length === 1 ? "is" : "are"} going. ` : ""}Nothing needs you yet.</p>`}
      <div class="menu-wait-actions">${up && !w.stopped ? `<button class="btn menu-stop" type="button" data-wait="stop">Stop</button>`
        : up ? "" : w ? `<button class="btn" type="button" data-wait="${w.ends == null ? "resume" : "pause"}">${w.ends == null ? "Resume" : "Pause"}</button>`
        : `<button class="btn cook-timer-start" type="button" data-wait="start">Start ${mins} min timer</button>`}</div>`;
  }
  function changeWait(how) {
    C.unlockAudio();
    change((c) => {
      const t0 = Date.now(), w = c.waitTimer;
      if (how === "start") { const total = Math.max(1, Math.round(plan.wait)) * 60_000; c.waitTimer = { ends: t0 + total, left: total, total }; }
      else if (how === "pause") c.waitTimer = { ...w, left: w.ends - t0, ends: null };
      else if (how === "resume") c.waitTimer = { ...w, ends: t0 + w.left };
      else if (how === "stop") c.waitTimer = { ...w, stopped: true };
    });
    paint();
    // The countdown isn't read out every second: only when it starts and stops.
    const a = el.querySelector(".cook-alert");
    if (a) a.textContent = how === "start" ? "Timer started." : how === "stop" ? "Alarm stopped." : "";
  }

  // The strip of running timers, from this menu or any recipe. It's redrawn
  // only when a timer starts, stops, pauses or rings, so buttons keep focus.
  let shown = null, rang = new Set(), waitRang = false;
  function paintTimers(force) {
    const box = el.querySelector(".cook-timers");
    if (!box) return false;
    const t0 = Date.now(), timers = C.loadTimers();
    const state = (t) => (t.ends == null ? "paused" : t.ends <= t0 ? "ringing" : "running");
    const k = timers.map((t) => `${t.id}:${state(t)}`).join(" ");
    if (force || k !== shown) {
      shown = k;
      box.innerHTML = timers.map((t) => {
        const st = state(t);
        const ink = recipes[t.slug] ? `fam-${esc(recipes[t.slug].category)}` : "";
        const what = st === "ringing"
          ? `<b>Time's up.</b> ${t.next ? `<b>Next:</b> ${esc(t.next)}` : esc(t.cue)}`
          : t.next ? `then ${esc(t.next.replace(/^then,?\s+/i, ""))}` : st === "running" && t.total >= 3_600_000 ? `ready around ${C.timeOfDay(t.ends)}` : "";
        const actions = st === "ringing"
          ? `<button class="btn" type="button" data-timer="${esc(t.id)}" data-how="more">+2 min</button><button class="btn" type="button" data-timer="${esc(t.id)}" data-how="stop">Stop</button>`
          : `<button class="btn" type="button" data-timer="${esc(t.id)}" data-how="${st === "paused" ? "resume" : "pause"}">${st === "paused" ? "Resume" : "Pause"}</button>`
            + `<button class="btn cook-timer-cancel" type="button" data-timer="${esc(t.id)}" data-how="stop" aria-label="Cancel timer">✕</button>`;
        return `<div class="cook-timer ${st} ${ink}" role="timer" aria-label="${esc(t.title)}">
          <span class="cook-timer-time" data-id="${esc(t.id)}"></span>
          <span class="cook-timer-what">${esc(t.title)}${what ? ` · ${what}` : ""}</span>
          <span class="cook-timer-actions">${actions}</span></div>`;
      }).join("");
    }
    for (const t of timers) {
      const span = box.querySelector(`.cook-timer-time[data-id="${CSS.escape(t.id)}"]`);
      if (span) span.textContent = C.clock(C.msLeft(t, t0));
    }
    const ringing = timers.filter((t) => state(t) === "ringing");
    for (const t of ringing) if (!rang.has(t.id)) {
      rang.add(t.id);
      const a = el.querySelector(".cook-alert");
      if (a) a.textContent = `Time's up: ${t.title}. ${t.next ? `Next: ${t.next}` : t.cue}`;
      // Up next may now be this timer's follow-up.
      if (ready && view() !== "done") { const u = el.querySelector(".cook-upnext"); if (u) u.outerHTML = upNextHTML(nextShown()); }
    }
    rang = new Set([...rang].filter((id) => ringing.some((t) => t.id === id)));
    // The wait screen's own ring.
    const c = cooking(), w = c && c.waitTimer, ring = el.querySelector(".menu-ring");
    let waitRinging = false;
    if (w && ring) {
      const left = w.ends == null ? w.left : Math.max(0, w.ends - t0);
      const up = w.ends != null && w.ends <= t0;
      if (up && !ring.classList.contains("up")) { paint(); return true; }
      const time = ring.querySelector(".menu-ring-time");
      if (time && !up) time.textContent = C.clock(left);
      ring.querySelector(".menu-ring-left")?.setAttribute("stroke-dashoffset", (RING * (1 - left / w.total)).toFixed(1));
      waitRinging = up && !w.stopped;
      if (waitRinging && !waitRang) { waitRang = true; const a = el.querySelector(".cook-alert"); if (a) a.textContent = "Time's up."; }
    }
    if (!waitRinging) waitRang = false;
    return ringing.length > 0 || waitRinging;
  }
  const nextShown = () => { const v = view(), i = curIndex(); return v === "wait" ? steps[i] : steps[i + 1]; };
  let ticks = 0;
  const tick = setInterval(() => { if (ready && paintTimers() && ticks++ % 2 === 0) C.beep(); }, 1000);

  el.addEventListener("click", (e) => {
    const b = e.target.closest("button");
    if (!b || !ready) return;
    if (b.matches(".cook-go")) goNext();
    else if (b.matches(".cook-back")) goBack();
    else if (b.matches(".cook-close")) onClose();
    else if (b.matches(".cook-return")) (view() === "done" ? finish() : onClose());
    else if (b.matches(".cook-upnext")) b.setAttribute("aria-expanded", String(b.getAttribute("aria-expanded") !== "true"));
    else if (b.dataset.wait) changeWait(b.dataset.wait);
    else if (b.hasAttribute("data-own-timer")) { startTimer(steps[curIndex()]); paint(); }
    else if (b.dataset.timer) { C.unlockAudio(); changeTimer(b.dataset.timer, b.dataset.how); }
  });
  C.onSwipe(el, () => ready && goNext(), () => ready && goBack());
  el.addEventListener("change", (e) => {
    if (!e.target.matches("[data-use]")) return;
    const s = steps[curIndex()], r = recipes[s.slug];
    const { progress, save } = C.progressFor(r, s.slug);
    C.tickUse(progress, C.linkIngredients(r), s.step, +e.target.dataset.use, e.target.checked);
    save(progress);
  });

  // Keep the screen awake while cooking (where supported).
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

  planMenu(menu()).then((p) => {
    if (closed) return;
    ({ recipes, lineup } = p);
    for (const d of lineup.dishes) {
      const walk = (slug, seen) => {
        for (const g of toGroups(recipes[slug]?.ingredients)) for (const it of g.items) {
          if (!it || typeof it.recipe !== "string" || it.optional || seen.has(it.recipe)) continue;
          parentOf[it.recipe] ??= slug;
          walk(it.recipe, new Set([...seen, it.recipe]));
        }
      };
      walk(d.slug, new Set([d.slug]));
    }
    replan();
    ready = true;
    paint();
  });

  return {
    close() {
      closed = true;
      clearInterval(tick);
      document.removeEventListener("visibilitychange", wake);
      if (lock) lock.release();
      el.remove();
      document.body.classList.remove("cooking");
    },
  };
}
