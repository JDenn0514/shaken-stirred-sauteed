// ===== Meal planner: the part worth keeping =====
// Pure functions, no DOM. The page below only calls into these.
//
// A step:  { text, hands, wait, watch, oven, ovenChange, preheat, burner, micro, auto }
//   hands  minutes your hands are busy
//   wait   minutes after that the step runs on its own (bake, chill, rest)
//   watch  true when the wait still needs you standing there (searing, broiling)
//   preheat "200C" | "350F" | "broil": heats the oven in the background; the
//           recipe carries on, and the oven step after it waits until it's hot
//   oven   the oven setting the step needs while it runs
//   ovenChange  turning the oven down or off: no preheat needed
// A recipe: { key, title, family, serve: "hot" | "soon" | "keeps", hold, steps, subs }
//   hold   for hot/soon dishes, how many minutes it can sit once done
//   subs   sub-recipes: [{ label, step, options: [[recipeKey | "have", label], ...] }]
const Planner = (() => {
  const HEAT_MIN = { broil: 3 };
  const DEFAULT_HEAT = 15;
  const BURNERS = 4;

  // The recipes in a meal: the dishes picked, plus each sub-recipe the cook chose to make.
  function buildMeal(lib, dishKeys, choices) {
    const out = [];
    const add = (key, isSub) => {
      if (out.some((r) => r.key === key)) return out.find((r) => r.key === key);
      const src = lib[key];
      const r = { ...src, sub: isSub, steps: src.steps.map((s, i) => ({ ...s, id: `${key}.${i}`, r: key, needs: [] })) };
      out.push(r);
      for (const sub of src.subs || []) {
        const pick = choices[`${key}/${sub.label}`] ?? sub.options[0][0];
        if (pick === "have") continue;
        add(pick, true);
        r.steps[sub.step].needs.push(pick);
      }
      return r;
    };
    dishKeys.forEach((k) => add(k, false));
    return out;
  }

  const heatMin = (temp) => HEAT_MIN[temp] ?? DEFAULT_HEAT;
  // How long a step holds up the rest of its recipe. A preheat runs in the background,
  // unless the very next step is the one that needs the oven hot.
  const chainDur = (s, next) => {
    if (!s.preheat) return s.hands + (s.wait || 0);
    return next && next.oven === s.preheat ? Math.max(s.hands, heatMin(s.preheat)) : s.hands;
  };
  const recipeDur = (r) => r.steps.reduce((a, s, i) => a + chainDur(s, r.steps[i + 1]), 0);
  // The first step that has to happen close to serving: everything before a
  // "holds" step (a cooled meringue) can be done as early as you like.
  const serveFrom = (r) => {
    let h = 0;
    r.steps.forEach((s, i) => { if (s.holds) h = i + 1; });
    return h;
  };

  // Run one cook through the meal, aiming to serve at minute S.
  // progress.fixed holds steps already done: { id: { start, extra } }; nothing new starts before progress.now.
  function simulate(recipes, S, progress, shift = {}) {
    const fixed = progress.fixed || {};
    const now = progress.now || 0;
    const byKey = Object.fromEntries(recipes.map((r) => [r.key, r]));
    const latest = {};
    const setDeadline = (r, D) => {
      let acc = D;
      for (let i = r.steps.length - 1; i >= 0; i--) {
        const s = r.steps[i];
        acc -= chainDur(s, r.steps[i + 1]);
        latest[s.id] = acc;
        for (const k of s.needs) setDeadline(byKey[k], acc);
      }
    };
    recipes.filter((r) => !r.sub).forEach((r) => setDeadline(r, S - (shift[r.key] || 0)));
    const earliest = (r) => (r.serve === "keeps" ? -Infinity : latest[r.steps[serveFrom(r)].id] - r.hold);
    const heldBack = (r) => (r.serve === "hot" ? "Held back so it's hot when you serve" : "Held back so it's fresh when you serve");
    const ovenBlockers = {};

    const st = {};
    const idx = Object.fromEntries(recipes.map((r) => [r.key, 0]));
    const lastOven = {};
    for (const r of recipes) {
      lastOven[r.key] = -1;
      r.steps.forEach((s, i) => { if (s.oven || s.preheat) lastOven[r.key] = i; });
    }
    const oven = { temp: null, readyAt: 0, owners: new Set() };
    const waitingSince = {};
    const blockedBy = {};
    let t = 0;
    let cookFree = 0;
    let guard = 0;

    const recipeDone = (k) => {
      const r = byKey[k];
      const last = r.steps[r.steps.length - 1];
      return st[last.id] && st[last.id].end <= t;
    };
    const releaseOven = () => {
      for (const k of [...oven.owners]) {
        const li = lastOven[k];
        const s = byKey[k].steps[li];
        if (st[s.id] && st[s.id].end <= t) oven.owners.delete(k);
      }
    };
    const othersInOven = (k) => [...oven.owners].filter((o) => o !== k);
    const ovenLabel = (temp) => (temp === "broil" ? "broil" : temp === "off" ? "off, door shut" : temp.replace(/(\d+)([CF])/, "$1°$2"));

    // Why can't step s start right now? null if it can.
    const blockReason = (r, s) => {
      for (const k of s.needs) if (!recipeDone(k)) return `Waits for the ${byKey[k].title.toLowerCase()} to be ready`;
      if (idx[r.key] === serveFrom(r) && t < earliest(r)) return heldBack(r);
      if (s.burner) {
        const busy = Object.values(st).filter((x) => x.burner && x.start <= t && t < x.end).length;
        if (busy >= BURNERS) return "Waits for a free burner";
      }
      if (s.micro && Object.values(st).some((x) => x.micro && x.start <= t && t < x.end)) return "Waits for the microwave";
      if (s.preheat) {
        if (oven.temp === s.preheat) return null;
        const o = othersInOven(r.key);
        if (o.length) return `Waits for the oven: ${o.map((k) => byKey[k].title).join(", ")} at ${ovenLabel(oven.temp)}`;
      } else if (s.oven) {
        if (s.ovenChange) {
          const o = othersInOven(r.key);
          if (o.length) return `Waits for the oven: ${o.map((k) => byKey[k].title).join(", ")} at ${ovenLabel(oven.temp)}`;
          if (t < oven.readyAt) return "Waits for the oven to heat";
        } else if (oven.temp !== s.oven) {
          const o = othersInOven(r.key);
          return o.length ? `Waits for the oven: ${o.map((k) => byKey[k].title).join(", ")} at ${ovenLabel(oven.temp)}` : `Needs the oven at ${ovenLabel(s.oven)}`;
        } else if (t < oven.readyAt) return "Waits for the oven to heat";
      }
      return null;
    };

    const chainReadyAt = (r) => {
      const i = idx[r.key];
      if (i >= r.steps.length) return null;
      if (i === 0) return 0;
      const p = st[r.steps[i - 1].id];
      return p.preheat || p.skipped ? p.handsEnd : p.end;
    };

    const start = (r, s, forced) => {
      const extra = forced ? forced.extra || 0 : 0;
      const hands = s.hands + extra;
      let rec;
      if (s.preheat && oven.temp === s.preheat) {
        rec = { start: t, handsEnd: t, end: t, skipped: true, note: `The oven's already at ${ovenLabel(s.preheat)}` };
        oven.owners.add(r.key);
      } else if (s.preheat) {
        oven.temp = s.preheat;
        oven.readyAt = t + hands + heatMin(s.preheat);
        oven.owners.add(r.key);
        rec = { start: t, handsEnd: t + hands, end: t + hands, preheat: true, heatEnd: oven.readyAt };
        cookFree = t + hands;
      } else {
        if (s.oven) {
          if (s.ovenChange || oven.temp !== s.oven) { oven.temp = s.oven; oven.readyAt = Math.max(oven.readyAt, t); }
          oven.owners.add(r.key);
        }
        const end = t + hands + (s.wait || 0);
        rec = { start: t, handsEnd: t + hands, end, burner: s.burner, micro: s.micro };
        cookFree = s.watch ? end : t + hands;
      }
      rec.extra = extra;
      rec.latest = latest[s.id];
      const ready = waitingSince[s.id];
      if (!rec.skipped && ready != null && t - ready >= 1 && blockedBy[s.id]) rec.reason = blockedBy[s.id];
      st[s.id] = rec;
      idx[r.key]++;
    };

    while (recipes.some((r) => idx[r.key] < r.steps.length) && guard++ < 5000) {
      releaseOven();
      // Steps already done start exactly when they did.
      let startedForced = false;
      for (const r of recipes) {
        const s = r.steps[idx[r.key]];
        if (s && fixed[s.id] && fixed[s.id].start <= t) { start(r, s, fixed[s.id]); startedForced = true; }
      }
      if (startedForced) continue;

      const cands = [];
      for (const r of recipes) {
        const s = r.steps[idx[r.key]];
        if (!s || fixed[s.id]) continue;
        const ready = chainReadyAt(r);
        if (ready == null || ready > t) continue;
        if (waitingSince[s.id] == null) waitingSince[s.id] = t;
        const why = blockReason(r, s);
        if (why) {
          if (!why.startsWith("Held back") || !blockedBy[s.id]) blockedBy[s.id] = why;
          if (why.startsWith("Waits for the oven:")) (ovenBlockers[r.key] ||= new Set()).add(...othersInOven(r.key));
          continue;
        }
        const skipping = s.preheat && oven.temp === s.preheat;
        if (!skipping && cookFree > t) continue;
        if (t < now) continue;
        cands.push({ r, s, key: latest[s.id] });
      }
      if (cands.length) {
        cands.sort((a, b) => a.key - b.key);
        start(cands[0].r, cands[0].s, null);
        continue;
      }
      // Nothing can start: jump to the next moment something changes.
      const ev = [cookFree, oven.readyAt, now];
      for (const x of Object.values(st)) ev.push(x.handsEnd, x.end);
      for (const r of recipes) if (idx[r.key] === serveFrom(r)) ev.push(earliest(r));
      for (const f of Object.values(fixed)) ev.push(f.start);
      const next = Math.min(...ev.filter((e) => e > t + 1e-9 && Number.isFinite(e)));
      if (!Number.isFinite(next)) break;
      t = next;
    }

    const ends = {};
    for (const r of recipes) { const l = r.steps[r.steps.length - 1]; ends[r.key] = st[l.id] ? st[l.id].end : Infinity; }
    let late = 0, cold = 0, worst = null;
    for (const r of recipes) {
      if (r.sub) continue;
      if (ends[r.key] - S > late) { late = ends[r.key] - S; worst = r.key; }
      if (r.serve !== "keeps") cold = Math.max(cold, S - r.hold - ends[r.key]);
    }
    return { st, ends, late, cold, S, worst, ovenBlockers };
  }

  // The plan: the earliest serve time one cook can hit, and every step's slot in it.
  function plan(recipes, progress = {}) {
    const now = progress.now || 0;
    let lo = now;
    for (const r of recipes) if (!r.sub) lo = Math.max(lo, recipeDur(r));
    const byKey = Object.fromEntries(recipes.map((r) => [r.key, r]));
    let best = null;
    for (let S = Math.ceil(lo); S < lo + 600 && !(best && best.ok); S++) {
      // If a dish comes out late, plan it (or whatever had the oven) to finish
      // a little earlier, as far as that dish can sit and wait.
      const shift = {};
      for (let k = 0; k < 8; k++) {
        const sim = simulate(recipes, S, progress, shift);
        sim.ok = sim.late <= 0.01 && sim.cold <= 0.01;
        if (!best || sim.ok || sim.late + sim.cold < best.late + best.cold) best = sim;
        if (sim.ok || !sim.worst) break;
        let moved = false;
        // Pull earlier the dishes holding the oven it waited for, or else the late dish itself.
        const pull = sim.ovenBlockers[sim.worst] ? [...sim.ovenBlockers[sim.worst], sim.worst] : [sim.worst];
        for (const b of pull) {
          const br = byKey[b];
          if (!br || br.sub) continue;
          const cap = br.serve === "keeps" ? Infinity : br.hold;
          const want = Math.min(cap, (shift[b] || 0) + Math.ceil(sim.late));
          if (want > (shift[b] || 0)) { shift[b] = want; moved = true; }
        }
        if (!moved) break;
      }
    }
    const rows = [];
    for (const r of recipes) for (const s of r.steps) if (best.st[s.id]) rows.push({ step: s, recipe: r, ...best.st[s.id] });
    rows.sort((a, b) => a.start - b.start || a.handsEnd - b.handsEnd);
    return { serve: best.S, rows, ok: best.ok, late: best.late, worst: best.worst && byKey[best.worst].title };
  }

  // What the cook does. state: { dishes, choices, now, fixed }
  function reduce(lib, state, action) {
    switch (action.type) {
      case "reset":
        return { dishes: action.dishes, choices: action.choices || {}, now: 0, fixed: {} };
      case "done": {
        const p = plan(buildMeal(lib, state.dishes, state.choices), state);
        const next = p.rows.find((x) => !state.fixed[x.step.id] && !x.skipped);
        if (!next) return state;
        const fixed = { ...state.fixed };
        for (const x of p.rows) if (x.skipped && x.start <= next.start) fixed[x.step.id] = { start: x.start, extra: 0 };
        const extra = action.extra || 0;
        fixed[next.step.id] = { start: next.start, extra };
        const handsEnd = next.start + next.step.hands + extra;
        const now = next.step.watch ? handsEnd + (next.step.wait || 0) : handsEnd;
        return { ...state, fixed, now };
      }
      case "finish": {
        let s = state;
        for (let i = 0; i < 200; i++) { const n = reduce(lib, s, { type: "done" }); if (n === s) break; s = n; }
        return s;
      }
      default:
        return state;
    }
  }

  return { buildMeal, plan, reduce };
})();
