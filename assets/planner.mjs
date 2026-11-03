// The lineup planner: puts every step of several recipes in one order for one
// cook. See docs/specs/meal-planner-design.md, "How the planner works".

// A time as recipes write it, in minutes, from its first time: "About 6 min",
// "45 sec", "1 1/2 hr", "1 hr 15 min". A range plans from its middle, so
// "7 to 8 min" is 7.5. (Cook mode's timers start at the short end instead.)
const NUM = String.raw`\d+(?:\.\d+)?(?:\s+\d+\/\d+)?|\d+\/\d+`;
const TIME = new RegExp(`(${NUM})\\s*(?:(?:to|-|–)\\s*(${NUM})\\s*)?(sec(?:ond)?s?|min(?:ute)?s?|hrs?|hours?)\\b(?:\\s*(\\d+)\\s*min)?`, "i");
const num = (x) => x.split(/\s+/).reduce((t, p) => t + (p.includes("/") ? p.split("/")[0] / p.split("/")[1] : +p), 0);
function minutes(text) {
  const m = TIME.exec(text || "");
  if (!m) return 0;
  const per = { s: 1 / 60, m: 1, h: 60 }[m[3][0].toLowerCase()];
  const low = num(m[1]), high = m[2] ? num(m[2]) : low;
  return ((low + high) / 2) * per + (m[4] ? +m[4] : 0);
}

// Two oven settings are the same if they're equal ("broil", "off") or
// temperatures within 15°F of each other, so 200C and 400F share.
const fahrenheit = (setting) => {
  const m = /^(\d+)\s*([CF])$/i.exec(setting);
  return m ? (m[2].toUpperCase() === "C" ? m[1] * 9 / 5 + 32 : +m[1]) : null;
};
const sameSetting = (a, b) => {
  const fa = fahrenheit(a), fb = fahrenheit(b);
  return fa != null && fb != null ? Math.abs(fa - fb) <= 15 : a === b;
};

// Minutes for the oven to heat: 3 for the broiler, otherwise 15.
const heatTime = (setting) => (setting === "broil" ? 3 : 15);

// "Heat the oven to 200°C / 400°F", from either unit.
function heatText(setting) {
  if (setting === "broil") return "Switch the oven to broil";
  const f = fahrenheit(setting);
  if (f == null) return `Heat the oven to ${setting}`;
  const c = Math.round((f - 32) * 5 / 9 / 10) * 10, ff = Math.round(f / 25) * 25;
  return `Heat the oven to ${c}°C / ${ff}°F`;
}

// Equipment that holds a set number of things at once.
const CAPACITY = { burner: 4, microwave: 1, grill: 1 };

// How long a dish can wait once done. Without a `serve`, components and baking
// keep, a cocktail is made just before (5 minutes) and a cooking dish is hot
// (10 minutes).
function sits(r) {
  const serve = r.serve || (r.kind === "component" || r.category === "baking" ? "keeps" : r.category === "cocktails" ? "soon" : "hot");
  if (serve === "keeps") return Infinity;
  return r.sits ? minutes(r.sits) : serve === "soon" && r.category === "cocktails" ? 5 : 10;
}

// Each dish as a chain of steps: hands is how long your hands are busy, then
// wait runs on its own, unless watch says it needs you there. A hot dish can
// sit only `sits` minutes once done; one that keeps can sit as long as it likes.
// `oven` is the setting a step needs, and `preheat` heats the oven to a setting
// in the background; the dish holds the oven from its first such step to the
// end of its last.
//
// A required ingredient that links to a recipe (`recipe`) is a nested recipe:
// it's made too, unless the lineup says it's already made. An optional one is
// a connected recipe: made only if it's in the lineup itself. Either way, the
// step that uses it waits for it: `neededBy` lists those [dish, step] pairs.
const lower = (x) => String(x ?? "").trim().toLowerCase();
// A step without `hands`: the recipe's active (or prep) time, less what other
// steps give, spread over the steps without one. Otherwise 2 minutes.
function handsGuess(r, steps) {
  const label = (r.times || []).find(([k]) => /active|prep/i.test(k));
  const active = label ? minutes(label[1]) : r.time?.prep;
  const without = steps.filter((s) => s.hands == null).length;
  if (!active || !without) return 2;
  const given = steps.reduce((a, s) => a + (s.hands == null ? 0 : minutes(s.hands)), 0);
  return Math.max(0, active - given) / without;
}

// A recipe's steps as one list, grouped or not, each with its position `n`, the
// way saved progress counts them.
const stepsOf = (r) => r.steps.flatMap((g) => (g && Array.isArray(g.items) ? g.items : [g]))
  .map((s, n) => ({ ...(typeof s === "string" ? { do: s } : s), n }));
const ingredientsOf = (r) => (r.ingredients || []).flatMap((g) => (g && Array.isArray(g.items) ? g.items : [g]));
//
// A hot dish is held back from the first step after it starts to keep (or its
// first step), skipping its prep, which is done whenever there's room.
const heldFrom = (steps, from) => {
  const cooking = steps.findIndex((x, i) => i >= from && !x.prep);
  return cooking < 0 ? steps.length : cooking;
};

// `parts` splits a dish made ahead: "before" is the part up to where it keeps,
// planned ahead of time; "after" is the rest, on the day; "skip" leaves out a
// dish that keeps entirely.
function chains(lineup, recipes, parts = {}) {
  const dishes = [];
  const add = (slug, made, course, parent = null) => {
    const part = parent ? null : parts[slug];
    if (part === "skip") return;
    const r = recipes[slug];
    // Prep that can be done ahead comes before the dish's first step that isn't
    // prep; "just before" prep stays where the recipe has it.
    const ahead = (s) => s.prep === true || s.prepOnly;
    const all = stepsOf(r);
    const ordered = [...all.filter(ahead), ...all.filter((s) => !ahead(s))];
    const steps = ordered.map((s) => ({
      slug, n: s.n, text: s.do, hands: s.hands == null ? handsGuess(r, all) : minutes(s.hands), wait: minutes(s.wait), watch: !!s.watch,
      oven: s.oven || null, preheat: s.preheat || null, holds: !!s.holds, prep: ahead(s),
      kit: Object.keys(CAPACITY).filter((k) => s[k]),
      needs: (Array.isArray(s.uses) ? s.uses : []).map((u) => lower(typeof u === "string" ? u : u.item)),
    }));
    // A dish whose first oven setting isn't heated by an earlier step of its own
    // gets a heating step first.
    const first = steps.findIndex((x) => x.oven);
    if (first >= 0 && !steps.slice(0, first).some((x) => x.preheat && sameSetting(x.preheat, steps[first].oven))) {
      const setting = steps[first].oven;
      steps.unshift({ slug, n: "heat", text: heatText(setting), hands: 1, wait: 0, watch: false, oven: null, preheat: setting, kit: [], needs: [], added: true });
    }
    // After a `holds` step the dish keeps (a cooled meringue), so only the steps
    // after it are tied to serving.
    const holdsAt = steps.findLastIndex((x) => x.holds) + 1;
    const from = part === "after" ? holdsAt : 0, to = part === "before" ? holdsAt : steps.length;
    const kept = steps.slice(from, to);
    const index = dishes.push({
      slug, course, steps: kept, lastOven: kept.findLastIndex((s) => s.oven || s.preheat), neededBy: parent ? [parent] : [],
      sits: part === "before" ? Infinity : sits(r),
      servedFrom: part === "before" ? kept.length : heldFrom(kept, part === "after" ? 0 : holdsAt),
    }) - 1;
    for (const ing of ingredientsOf(r)) {
      if (typeof ing !== "object" || !ing.recipe || made.includes(ing.recipe)) continue;
      const at = Math.max(0, steps.findIndex((s) => s.needs.includes(lower(ing.item))));
      if (at < from || at >= to) continue;
      const step = at - from;
      if (ing.optional) links.push({ slug: ing.recipe, by: [index, step] });
      else add(ing.recipe, made, course, [index, step]);
    }
  };
  const links = [];
  // Baking starts as dessert and everything else as the main; nested recipes
  // follow their dish.
  for (const { slug, made = [], course } of lineup.dishes) add(slug, made, course || (recipes[slug].category === "baking" ? "Dessert" : "Main"));
  for (const { slug, by } of links) dishes.find((d) => d.slug === slug)?.neededBy.push(by);
  // "Prep everything first" (the default) or "Fastest".
  dishes.prepFirst = lineup.prepFirst !== false;
  return dishes;
}

// Work back from serving at minute `serve`: each step's latest start. Heating
// the oven has to start early enough for it to be hot by the oven step that
// needs it.
function latestStarts(dish, serve) {
  const { steps } = dish, out = [];
  let t = serve;
  for (let i = steps.length - 1; i >= 0; i--) {
    t -= steps[i].hands + steps[i].wait;
    if (steps[i].preheat) {
      const j = steps.findIndex((x, k) => k > i && x.oven && sameSetting(x.oven, steps[i].preheat));
      if (j >= 0) t = Math.min(t, out[j] - heatTime(steps[i].preheat) - steps[i].hands);
    }
    out[i] = t;
  }
  return out;
}

// Move forward through time. Whenever the cook's hands are free, start the
// most urgent step that can start: the one whose latest start is soonest.
// `early` plans a dish to be ready that many minutes before serving.
// Dessert is served 45 minutes after the main. In between you're at the table,
// so the only hands-on steps are a dessert's finishing touches: steps of a
// dessert dish that can't be made ahead.
const DESSERT_AFTER = 45;
const serveTimes = (dishes, serve) => (dishes.some((d) => d.course === "Main") ? { Main: serve, Dessert: serve + DESSERT_AFTER } : { Dessert: serve });
//
// `progress` is what's happened so far: `done` lists finished steps as
// { slug, step, at }, `at` being the minute you moved on from it, plus
// `waitUntil` when its timer was given more time or stopped early; `current`
// is the step on screen, { slug, step, at } with `at` when it was started, which
// stays your step whatever rings meanwhile; `now` is the minute it is. Finished steps stay where they happened, waits run from when
// you moved on, and nothing new starts before now.
function simulate(dishes, serve, early = {}, progress = {}) {
  const times = serveTimes(dishes, serve);
  const due = dishes.map((d) => times[d.course] ?? serve);
  const atTable = (d, t) => times.Main != null && t >= times.Main && t < times.Dessert && !(dishes[d].course === "Dessert" && dishes[d].sits !== Infinity);
  // A nested or connected recipe has to be ready by the latest start of the
  // steps that use it. Work out the dishes that use others first.
  const latest = [];
  for (let pass = 0; pass < dishes.length && latest.filter(Boolean).length < dishes.length; pass++) {
    dishes.forEach((d, i) => {
      if (latest[i] || d.neededBy.some(([p]) => !latest[p])) return;
      const by = Math.min(...d.neededBy.map(([p, step]) => latest[p][step]));
      latest[i] = latestStarts(d, Math.min(by, due[i] - (early[d.slug] || 0)));
    });
  }
  const waits = dishes.map((_, d) => dishes.flatMap((x, n) => x.neededBy.filter(([p]) => p === d).map(([, step]) => [n, step])));
  const waitingFor = (d) => waits[d].filter(([, step]) => step === next[d]).map(([n]) => n);
  // A hot dish starts no earlier than would leave it sitting too long.
  const earliest = dishes.map((dish, d) => (dish.servedFrom < dish.steps.length ? latest[d][dish.servedFrom] + (early[dish.slug] || 0) - dish.sits : -Infinity));
  const heldUpBy = dishes.map(() => new Set());   // dishes whose oven use kept each one waiting
  const next = dishes.map(() => 0);           // index of each dish's next step
  const readyAt = dishes.map(() => 0);        // when that step can start
  const oven = new Map();                     // dish -> { setting, until } while it holds the oven
  let heat = null;                            // { setting, hotAt }: what the oven was last heated to
  const busy = [];                            // { kind, until } for each piece of equipment in use
  const steps = [];
  let t = 0, handsFree = 0;
  const done = new Map((progress.done || []).map((x) => [`${x.slug}:${x.step}`, x]));
  const doneAt = (d) => (left(d) ? done.get(`${dishes[d].slug}:${dishes[d].steps[next[d]].n}`)?.at : undefined);
  const waitUntil = (d) => done.get(`${dishes[d].slug}:${dishes[d].steps[next[d] - 1].n}`)?.waitUntil;
  const prepLeft = () => dishes.some((dish, d) => dish.steps.some((x, i) => i >= next[d] && x.prep));
  const free = (kind) => busy.filter((b) => b.kind === kind && b.until > t).length < CAPACITY[kind];

  const left = (d) => next[d] < dishes[d].steps.length;
  const opensAt = (d) => Math.max(readyAt[d], next[d] === dishes[d].servedFrom ? earliest[d] : -Infinity);
  const ovenFree = (d, setting) => [...oven].every(([o, h]) => o === d || h.until <= t || sameSetting(h.setting, setting));
  const hot = (setting) => !heat || !sameSetting(heat.setting, setting) || heat.hotAt <= t;
  const canStart = (d) => {
    const s = dishes[d].steps[next[d]];
    const setting = s.oven || s.preheat;
    // Prepping everything first, only prep and heating the oven start until all
    // the meal's prep is under way.
    if (dishes.prepFirst && !s.prep && !s.preheat && prepLeft()) return false;
    return opensAt(d) <= t && handsFree <= t && !atTable(d, t) && (!setting || ovenFree(d, setting)) && (!s.oven || hot(s.oven)) && s.kit.every(free) && waitingFor(d).every((n) => !left(n) && readyAt[n] <= t);
  };

  // Replay the finished steps, in the order they were done.
  const start = (d, s, at, finished) => {
    readyAt[d] = finished ? (waitUntil(d) ?? (s.watch ? finished : finished + s.wait)) : at + s.hands + s.wait;
    handsFree = Math.max(handsFree, finished ?? (s.watch ? readyAt[d] : at + s.hands));
    for (const kind of s.kit) busy.push({ kind, until: readyAt[d] });
    if (s.preheat) heat = { setting: s.preheat, hotAt: at + s.hands + heatTime(s.preheat) };
    const setting = s.oven || s.preheat;
    if (setting) oven.set(d, { setting, until: next[d] - 1 === dishes[d].lastOven ? readyAt[d] : Infinity });
  };
  for (;;) {
    const ds = dishes.map((_, d) => d).filter((d) => doneAt(d) !== undefined);
    if (!ds.length) break;
    const d = ds.reduce((a, b) => (doneAt(b) < doneAt(a) ? b : a));
    const finished = doneAt(d), s = dishes[d].steps[next[d]++];
    const at = finished - s.hands - (s.watch ? s.wait : 0);
    steps.push({ slug: s.slug, step: s.n, text: s.text, at, done: true, ...(s.added && { added: true }) });
    start(d, s, at, finished);
  }
  const cur = progress.current;
  const onScreen = cur ? dishes.findIndex((x, i) => x.slug === cur.slug && left(i) && x.steps[next[i]].n === cur.step) : -1;
  if (onScreen >= 0) {
    const s = dishes[onScreen].steps[next[onScreen]++];
    steps.push({ slug: s.slug, step: s.n, text: s.text, at: cur.at, current: true, ...(s.added && { added: true }) });
    start(onScreen, s, cur.at);
  }
  t = Math.max(t, progress.now || 0);
  handsFree = Math.max(handsFree, t);

  while (dishes.some((_, d) => left(d))) {
    const can = dishes.map((_, d) => d).filter((d) => left(d) && canStart(d));
    for (const d of dishes.map((_, x) => x).filter(left)) {
      const s = dishes[d].steps[next[d]], setting = s.oven || s.preheat;
      if (setting && opensAt(d) <= t && !ovenFree(d, setting)) {
        for (const [o, h] of oven) if (o !== d && h.until > t && !sameSetting(h.setting, setting)) heldUpBy[d].add(dishes[o].slug);
      }
    }
    if (!can.length) {
      const events = [handsFree, ...dishes.map((_, d) => d).filter(left).map(opensAt), ...[...oven.values()].map((h) => h.until), heat ? heat.hotAt : 0, ...busy.map((b) => b.until), ...readyAt, ...Object.values(times)];
      t = Math.min(...events.filter((x) => x > t));
      continue;
    }
    const d = can.reduce((a, b) => (latest[b][next[b]] < latest[a][next[a]] ? b : a));
    const i = next[d]++;
    const s = dishes[d].steps[i];
    // Heating isn't needed if the oven's already at that setting: an added step
    // is left out, and a recipe's own is marked skipped, taking no time.
    if (s.preheat && heat && sameSetting(heat.setting, s.preheat)) {
      if (s.added) continue;
      steps.push({ slug: s.slug, step: s.n, text: s.text, at: t, skipped: true });
      readyAt[d] = t;
      oven.set(d, { setting: heat.setting, until: i === dishes[d].lastOven ? t : Infinity });
      continue;
    }
    steps.push({ slug: s.slug, step: s.n, text: s.text, at: t, ...(s.added && { added: true }) });
    start(d, s, t);
  }
  return {
    steps, end: Math.max(...readyAt),
    ready: Object.fromEntries(dishes.map((dish, d) => [dish.slug, readyAt[d]])),
    late: Object.fromEntries(dishes.map((dish, d) => [dish.slug, readyAt[d] - due[d]]).filter(([, l]) => l > 0)),
    courses: times,
    heldUpBy: Object.fromEntries(dishes.map((dish, d) => [dish.slug, [...heldUpBy[d]]])),
  };
}

// Plan for serving at `serve`. If a dish comes out late, plan it, and any dish
// whose oven use held it up, to be ready a little earlier, but never earlier
// than it can sit, and try again.
function planFor(dishes, serve, progress) {
  const sitsFor = Object.fromEntries(dishes.map((d) => [d.slug, d.sits]));
  const early = {};
  let plan;
  for (let round = 0; round < 8; round++) {
    plan = simulate(dishes, serve, early, progress);
    const late = Object.entries(plan.late).sort((a, b) => b[1] - a[1])[0];
    if (!late) return plan;
    const [slug, by] = late;
    let moved = false;
    for (const b of [...plan.heldUpBy[slug], slug]) {
      const want = Math.min(sitsFor[b], (early[b] || 0) + Math.ceil(by));
      if (want > (early[b] || 0)) { early[b] = want; moved = true; }
    }
    if (!moved) return plan;
  }
  return plan;
}

// The earliest serve time one cook can get everything ready for.
function search(dishes, progress = {}) {
  const shortest = Math.max(progress.now || 0, ...dishes.map((d) => d.steps.reduce((a, s) => a + s.hands + s.wait, 0)));
  let plan;
  for (let serve = shortest; serve < shortest + 24 * 60; serve++) {
    plan = planFor(dishes, serve, progress);
    if (!Object.keys(plan.late).length) return { steps: plan.steps, minutes: serve, ready: plan.ready, courses: plan.courses };
  }
  return { steps: plan.steps, minutes: plan.end, ready: plan.ready, courses: plan.courses };
}

// Plan the lineup. A dish that keeps, entirely or after a `holds` step, can
// have that part made ahead of time. When that would make the day more than
// 30 minutes shorter, the plan asks (makeAhead), starting on "ahead" unless
// lineup.ahead says otherwise, and the part made ahead gets its own plan.
const MAKE_AHEAD_SAVES = 30;
export function planLineup(lineup, recipes, progress = {}) {
  const keepsWhole = (slug) => !stepsOf(recipes[slug]).some((s) => s.holds);
  const dayParts = (slugs) => Object.fromEntries(slugs.map((slug) => [slug, keepsWhole(slug) ? "skip" : "after"]));
  const dayLength = (p) => Math.max(...Object.values(p.courses));
  const allToday = search(chains(lineup, recipes), progress);
  const makeAhead = [];
  for (const { slug } of lineup.dishes) {
    if (keepsWhole(slug) && sits(recipes[slug]) !== Infinity) continue;
    const saves = dayLength(allToday) - dayLength(search(chains(lineup, recipes, dayParts([slug])), progress));
    if (saves > MAKE_AHEAD_SAVES) makeAhead.push({ slug, saves, ahead: lineup.ahead?.[slug] ?? true });
  }
  const ahead = makeAhead.filter((q) => q.ahead).map((q) => q.slug);
  if (!ahead.length) return { ...allToday, makeAhead, aheadOfTime: null };
  const before = search(chains({ dishes: lineup.dishes.filter((d) => ahead.includes(d.slug)) }, recipes,
    Object.fromEntries(ahead.map((slug) => [slug, keepsWhole(slug) ? null : "before"]))));
  return { ...search(chains(lineup, recipes, dayParts(ahead)), progress), makeAhead, aheadOfTime: { steps: before.steps, minutes: before.minutes } };
}
