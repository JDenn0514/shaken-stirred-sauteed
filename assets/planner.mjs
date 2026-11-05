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
// The short end of a range, where cook mode's timer starts: "35 to 45 min" is 35.
function shortEnd(text) {
  const m = TIME.exec(text || "");
  return m ? num(m[1]) * { s: 1 / 60, m: 1, h: 60 }[m[3][0].toLowerCase()] + (m[4] ? +m[4] : 0) : 0;
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

// An oven heated to one setting covers another if it's the same, or hotter
// (turning it down needs no heating), or the other is "off".
const covers = (heated, needed) => {
  if (needed === "off" || sameSetting(heated, needed)) return true;
  const h = fahrenheit(heated), n = fahrenheit(needed);
  return h != null && n != null && h >= n;
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
// end of its last, or, if a later step takes it out (`oven: false`), until
// that step is done.
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
    // A recipe is made once, even when it's both a dish in the lineup and
    // another dish's nested recipe: the dish that uses it waits for that one.
    const already = dishes.find((d) => d.slug === slug);
    if (already) { if (parent) already.neededBy.push(parent); return; }
    // Made ahead entirely, it isn't made on the day, even as a nested recipe.
    if (parts[slug] === "skip") return;
    const part = parent ? null : parts[slug];
    const r = recipes[slug];
    // Prep that can be done ahead comes before the dish's first step that isn't
    // prep; "just before" prep stays where the recipe has it. A dish that keeps
    // part-way (`holds`) does this for each part, so the fruit for a pavlova's
    // topping is prepped on the day, not with the meringue.
    const ahead = (s) => s.prep === true || s.prepOnly;
    const all = stepsOf(r);
    const prepFirst = (l) => [...l.filter(ahead), ...l.filter((s) => !ahead(s))];
    const keepsAt = all.findLastIndex((s) => s.holds) + 1;
    const ordered = [...prepFirst(all.slice(0, keepsAt)), ...prepFirst(all.slice(keepsAt))];
    const steps = ordered.map((s) => ({
      slug, n: s.n, text: s.do, hands: s.hands == null ? handsGuess(r, all) : minutes(s.hands), wait: minutes(s.wait), watch: !!s.watch,
      oven: s.oven || null, preheat: s.preheat || null, out: s.oven === false, holds: !!s.holds, during: !!s.during, prep: ahead(s),
      kit: Object.keys(CAPACITY).filter((k) => s[k]),
      needs: (Array.isArray(s.uses) ? s.uses : []).map((u) => lower(typeof u === "string" ? u : u.item)),
    }));
    // A dish whose first oven setting isn't heated by an earlier step of its own
    // gets a heating step, after its prep: prep isn't held back with the cooking.
    const first = steps.findIndex((x) => x.oven);
    if (first >= 0 && steps[first].oven !== "off" && !steps.slice(0, first).some((x) => x.preheat && covers(x.preheat, steps[first].oven))) {
      const setting = steps[first].oven;
      const afterPrep = steps.findIndex((x) => !x.prep);
      steps.splice(afterPrep < 0 ? steps.length : afterPrep, 0, { slug, n: "heat", text: heatText(setting), hands: 1, wait: 0, watch: false, oven: null, preheat: setting, kit: [], needs: [], added: true });
    }
    // After a `holds` step the dish keeps (a cooled meringue), so only the steps
    // after it are tied to serving.
    const holdsAt = steps.findLastIndex((x) => x.holds) + 1;
    const from = part === "after" ? holdsAt : 0, to = part === "before" ? holdsAt : steps.length;
    const kept = steps.slice(from, to);
    const lastSetting = kept.findLastIndex((s) => s.oven || s.preheat), takenOut = kept.findIndex((s, k) => k > lastSetting && s.out);
    const index = dishes.push({
      slug, course, steps: kept, lastOven: lastSetting >= 0 && takenOut >= 0 ? takenOut : lastSetting, neededBy: parent ? [parent] : [],
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
  // A recipe that a prep step uses is made during the prep, every step of it,
  // and so is any recipe that one uses.
  let grew = true;
  while (grew) {
    grew = false;
    for (const d of dishes) {
      if (d.duringPrep || !d.neededBy.some(([p, step]) => dishes[p].steps[step].prep || dishes[p].duringPrep)) continue;
      d.duringPrep = grew = true;
    }
  }
  return dishes;
}

// Work back from serving at minute `serve`: each step's latest start. Heating
// the oven has to start early enough for it to be hot by the oven step that
// needs it.
//
// Steps marked `during` run while the step before them (the first one not
// marked) waits, unless you have to watch it; the step after them waits for
// both. So that step's wait has to end by the time the step after the
// `during` steps starts (`join`), and its hands-on part by the time the first
// of them starts.
const overlaps = (steps, i) => !steps[i].during && !steps[i].watch && !!steps[i + 1]?.during;
function latestStarts(dish, serve) {
  const { steps } = dish, out = [];
  let t = serve, join = serve;
  for (let i = steps.length - 1; i >= 0; i--) {
    if (!steps[i + 1]?.during) join = t;
    if (overlaps(steps, i)) t = Math.min(join - steps[i].hands - steps[i].wait, t - steps[i].hands);
    else t -= steps[i].hands + steps[i].wait;
    if (steps[i].preheat) {
      const j = steps.findIndex((x, k) => k > i && x.oven && x.oven !== "off" && covers(steps[i].preheat, x.oven));
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
  // Only the prep at the head of a dish counts: prep for the part after it
  // keeps comes later.
  const leadPrep = dishes.map((dish) => { const i = dish.steps.findIndex((x) => !x.prep); return i < 0 ? dish.steps.length : i; });
  const prepLeft = () => dishes.some((dish, d) => next[d] < leadPrep[d]);
  const free = (kind) => busy.filter((b) => b.kind === kind && b.until > t).length < CAPACITY[kind];

  const left = (d) => next[d] < dishes[d].steps.length;
  // A hot dish is held back from its first step tied to serving, and again at
  // each later step that starts cooking (oven, burner, grill, microwave): such a
  // step starts no earlier than its sitting time before it's due, so nothing
  // roasts early and then waits for the oven. Hands-on steps aren't held.
  const cooks = (s) => (s.oven && s.oven !== "off") || s.kit.length > 0;
  const opensAt = (d) => {
    const dish = dishes[d], s = dish.steps[next[d]];
    if (next[d] < dish.servedFrom || dish.sits === Infinity) return readyAt[d];
    if (next[d] === dish.servedFrom) return Math.max(readyAt[d], earliest[d]);
    return cooks(s) ? Math.max(readyAt[d], latest[d][next[d]] + (early[dish.slug] || 0) - dish.sits) : readyAt[d];
  };
  // Dishes share the oven at the same setting, but only if at most one of them
  // will need it at another setting later: two that both change it (lime bars
  // down to 300F, a pavlova down to 200F) would each wait for the other.
  const settingsLeft = (x) => dishes[x].steps.slice(next[x], dishes[x].lastOven + 1).map((s) => s.oven || s.preheat).filter(Boolean);
  const staysAt = (x, setting) => settingsLeft(x).every((s) => sameSetting(s, setting));
  const ovenFree = (d, setting) => [...oven].every(([o, h]) => o === d || h.until <= t
    || (sameSetting(h.setting, setting) && (oven.has(d) || staysAt(d, setting) || staysAt(o, h.setting))));
  const hot = (setting) => setting === "off" || !heat || !covers(heat.setting, setting) || heat.hotAt <= t;
  const canStart = (d) => {
    const s = dishes[d].steps[next[d]];
    const setting = s.oven || s.preheat;
    // Prepping everything first, only prep and heating the oven start until all
    // the meal's prep is under way.
    if (dishes.prepFirst && !s.prep && !s.preheat && !dishes[d].duringPrep && prepLeft()) return false;
    return opensAt(d) <= t && handsFree <= t && !atTable(d, t) && (!setting || ovenFree(d, setting)) && (!s.oven || hot(s.oven)) && s.kit.every(free) && waitingFor(d).every((n) => !left(n) && readyAt[n] <= t);
  };

  // Replay the finished steps, in the order they were done.
  // `end` is when the step's wait is over. Its dish's next step can start then,
  // or as soon as your hands are free if that step runs during this wait; the
  // wait then runs in the background until the `during` steps are done.
  const background = dishes.map(() => 0);
  const settle = (d, end, handsDone) => {
    if (overlaps(dishes[d].steps, next[d] - 1)) {
      background[d] = end;
      readyAt[d] = handsDone;
    } else if (dishes[d].steps[next[d]]?.during) readyAt[d] = end;
    else {
      readyAt[d] = Math.max(end, background[d]);
      background[d] = 0;
    }
  };
  const start = (d, s, at, finished) => {
    const end = finished ? (waitUntil(d) ?? (s.watch ? finished : finished + s.wait)) : at + s.hands + s.wait;
    handsFree = Math.max(handsFree, finished ?? (s.watch ? end : at + s.hands));
    settle(d, end, finished ?? at + s.hands);
    for (const kind of s.kit) busy.push({ kind, until: end });
    // Turning a hot oven down needs no heating time.
    if (s.preheat) heat = { setting: s.preheat, hotAt: at + s.hands + (heat && heat.hotAt <= at && covers(heat.setting, s.preheat) ? 0 : heatTime(s.preheat)) };
    // A step that turns the oven down or off ("turn the heat down to 200F",
    // "turn the oven off and let it cool inside") leaves it at that setting,
    // so a dish that needs it hotter afterwards heats it again.
    else if (s.oven && heat && !sameSetting(heat.setting, s.oven) && covers(heat.setting, s.oven)) heat = { setting: s.oven, hotAt: at };
    const setting = s.oven || s.preheat;
    if (setting) oven.set(d, { setting, until: next[d] - 1 === dishes[d].lastOven ? end : Infinity });
    else if (s.out && oven.has(d)) oven.set(d, { ...oven.get(d), until: finished ?? at + s.hands });
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
      // Nothing left can ever start: say so rather than loop forever.
      if (t === Infinity) throw new Error(`No order works: ${dishes.filter((_, x) => left(x)).map((x) => x.slug).join(", ")} can't go on`);
      continue;
    }
    // Food left on the heat comes first. A dish has food on the heat while the
    // last step it started that isn't "during" another's wait used a burner and
    // has a wait, or that ends off the stove: the juice simmering, even while its
    // eggs are whisked, or the syrup simmering until its sugar dissolves; or that
    // used the oven, with a wait, when the next step takes the food out. Nothing
    // from another dish starts that would run past the moment it's ready (less
    // the dish's own steps still to do during the wait), and once it's ready its
    // next step goes first.
    const onHeat = (x) => {
      if (!left(x) || next[x] === 0) return null;
      const st = dishes[x].steps;
      let k = next[x] - 1;
      while (k > 0 && st[k].during) k--;
      // A pot with no timer ("keep it at a simmer until the sugar dissolves")
      // is ready as soon as the step is, unless the next step is on the stove too.
      // Food in the oven counts when the next step takes it out.
      const pot = st[k].kit.includes("burner") && (st[k].wait > 0 || !st[next[x]].kit.includes("burner"));
      const roasting = st[k].oven && st[k].oven !== "off" && st[k].wait > 0 && st[next[x]].out;
      if (!pot && !roasting) return null;
      let need = 0;
      for (let j = next[x]; j < st.length && st[j].during; j++) need += st[j].hands;
      return { due: st[next[x]].during ? background[x] : readyAt[x], need };
    };
    const busyFor = (x) => { const s = dishes[x].steps[next[x]]; return s.hands + (s.watch ? s.wait : 0); };
    const cooking = dishes.map((_, x) => [x, onHeat(x)]).filter(([, h]) => h);
    const soon = cooking.filter(([, h]) => h.due > t);
    // Room before the next pot is ready, not counting the dish's own: a pot's
    // next step doesn't run past another pot being ready either.
    const roomFor = (x) => { const others = soon.filter(([y]) => y !== x); return others.length ? Math.min(...others.map(([, h]) => h.due - h.need)) - t + 0.5 : Infinity; };
    const fits = can.filter((x) => busyFor(x) <= roomFor(x));
    if (!fits.length) { t = Math.min(...soon.map(([, h]) => h.due)); continue; }
    const ready = fits.filter((x) => cooking.some(([y]) => y === x));
    // When two pots are ready at once, the shorter step goes first, so less
    // food waits less time; otherwise the most urgent step.
    const d = ready.length > 1
      ? ready.reduce((a, b) => (busyFor(b) < busyFor(a) || (busyFor(b) === busyFor(a) && latest[b][next[b]] < latest[a][next[a]]) ? b : a))
      : (ready.length ? ready : fits).reduce((a, b) => (latest[b][next[b]] < latest[a][next[a]] ? b : a));
    const i = next[d]++;
    const s = dishes[d].steps[i];
    // Heating isn't needed if the oven's already at that setting: an added step
    // is left out, and a recipe's own is marked skipped, taking no time.
    if (s.preheat && heat && sameSetting(heat.setting, s.preheat)) {
      if (s.added) continue;
      steps.push({ slug: s.slug, step: s.n, text: s.text, at: t, skipped: true });
      settle(d, t, t);
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
  const shortest = Math.max(progress.now || 0, ...dishes.map((d) => -latestStarts(d, 0)[0] || 0));
  // Serving later than doing every step back to back never helps.
  const horizon = shortest + Math.min(24 * 60, dishes.reduce((a, d) => a + d.steps.reduce((b, s) => b + s.hands + s.wait, 0), 60));
  // When no serve time gets every hot dish there within its sitting time
  // (three dishes that each must be eaten within 5 minutes, and one cook),
  // the sitting times are loosened a little at a time until one does: the
  // dishes sit only as much longer as they must, and the plan stays whole.
  let plan;
  for (const extra of [0, 5, 10, 20, 40, 80, Infinity]) {
    const loose = extra ? Object.assign(dishes.map((d) => ({ ...d, sits: d.sits + extra })), { prepFirst: dishes.prepFirst }) : dishes;
    for (let serve = shortest; serve < horizon; serve++) {
      plan = planFor(loose, serve, progress);
      if (!Object.keys(plan.late).length) return { steps: plan.steps, minutes: serve, ready: plan.ready, courses: plan.courses };
    }
  }
  return { steps: plan.steps, minutes: plan.end, ready: plan.ready, courses: plan.courses };
}

// Plan the lineup. A dish that keeps, entirely or after a `holds` step, can
// have that part made ahead of time. When that would make the day more than
// 30 minutes shorter, the plan asks (makeAhead), starting on "ahead" unless
// lineup.ahead says otherwise, and the part made ahead gets its own plan.
const MAKE_AHEAD_SAVES = 30;

// What the plan doesn't know, for the page to ask the cook. A step that waits
// (bakes, rises, chills, cools, rests…) with no time plans as if it took none,
// so the plan comes out short; a dish with no serving time is planned on an
// assumption. Components, baking and cocktails have safe defaults, so they
// aren't reported.
const WAITS = /\b(bake|roast|rise|proof|chill|refrigerate|cool|marinate|soak|freeze|let (?:it |them |the \w+ )?(?:rest|sit|stand|set)|rest (?:it|them|for|until|on|in)|leave (?:it|them) (?:to|until|on|in|overnight)|set (?:it |them )?aside (?:in|somewhere|until)|until (?:it's |they're |it has |they have )?(?:doubled|expanded|puffy|risen)|(?:in a warm (?:spot|place)|somewhere warm))\b/i;
// Not waits: work done while something else waits, warnings ("Don't let them
// soak"), keeping it for later ("refrigerate up to 24 hours"), a glass chilled
// while you mix, the oven left on for later.
const NOT_A_WAIT = /^(?:while|meanwhile|as|once|when|after|before|during|don't|do not|never|use (?:it )?(?:right away|immediately))\b|\bwhile you\b|\bup to \d|\buntil (?:serving|needed|you're ready|ready to)\b|\bchill (?:the |a |your )?(?:glass|glasses|coupe|mug|cup)|\b(?:leave|keep) the oven on\b/i;
const TIME_IN = /\b\d+(?:\s+\d+\/\d+)?\s*(?:(?:to|-|–)\s*\d+(?:\s+\d+\/\d+)?\s*)?(?:sec|seconds?|min|minutes?|hrs?|hours?)\b|\bovernight\b/i;
function unknownsOf(slugs, recipes) {
  const unknown = [];
  for (const slug of slugs) {
    const r = recipes[slug];
    for (const s of stepsOf(r)) {
      // Prep's waits (butter softening) aren't what makes a plan short.
      if (s.wait || s.during || s.prep || s.prepOnly) continue;
      // A step in the oven always takes time. (Not one on the stove: stirring
      // "until fragrant" is hands-on time the step already counts.)
      const cooking = s.oven && s.oven !== "off" && !NOT_A_WAIT.test(s.do);
      const waiting = s.do.split(/(?<=[.!?])\s+/).find((x) => !NOT_A_WAIT.test(x) && WAITS.test(x)) || (cooking && s.do);
      if (!waiting) continue;
      const time = TIME_IN.exec(waiting);
      unknown.push({ kind: "wait", slug, step: s.n, text: s.do, ...(time && { suggest: time[0] }) });
    }
    if (!r.serve && r.kind !== "component" && r.category !== "baking" && r.category !== "cocktails") {
      unknown.push({ kind: "serve", slug, assumed: `hot, sitting up to ${sits(r)} min` });
    }
  }
  return unknown;
}
// What the lineup page needs that only the planner knows, added to a finished
// plan (see the design doc, "What the planner gives the page"):
// - each step's hands-on time, wait and whether it needs you there (watch);
// - a step with a wait has a timer: when it starts, when its short end comes
//   (where cook mode's timer starts) and when it ends, and `followUp`, the index of
//   the dish's next step, to show when the timer rings;
// - `idle`: how long nothing needs you before the step, so "nothing needs you"
//   is only said when it's true;
// - `serving`: each course with its time, its dishes, and how long each dish
//   waits between ready and served, against how long it can (`over` > 0 is
//   worth telling the cook: "the potatoes will be ready an hour early").
function forThePage(plan, dishes, recipes, lineup) {
  const info = new Map(dishes.flatMap((d) => d.steps.map((s) => [`${d.slug}:${s.n}`, s])));
  let free = -Infinity;
  const steps = plan.steps.map((x, i) => {
    const s = info.get(`${x.slug}:${x.step}`) || { hands: 1, wait: 0, watch: false };
    const out = { ...x, hands: s.hands, wait: s.wait, watch: s.watch };
    if (s.wait > 0) {
      const from = x.at + s.hands, raw = x.step === "heat" ? null : stepsOf(recipes[x.slug])[x.step]?.wait;
      out.timer = { from, short: from + (shortEnd(raw) || s.wait), ends: from + s.wait };
      const next = plan.steps.findIndex((y, j) => j > i && y.slug === x.slug && !info.get(`${y.slug}:${y.step}`)?.during);
      if (next >= 0) out.followUp = next;
    }
    if (!x.skipped) {
      out.idle = i === 0 || free === -Infinity ? 0 : Math.max(0, x.at - free);
      free = Math.max(free, x.at + s.hands + (s.watch ? s.wait : 0));
    }
    return out;
  });
  if (!plan.courses) return { ...plan, steps };
  const dish = Object.fromEntries(dishes.map((d) => [d.slug, d]));
  const serving = Object.entries(plan.courses).map(([course, at]) => {
    const here = lineup.dishes.map((d) => d.slug).filter((slug) => dish[slug]?.course === course);
    const sitting = Object.fromEntries(here.filter((slug) => plan.ready[slug] != null).map((slug) => {
      const limit = dish[slug].sits, waits = at - plan.ready[slug];
      return [slug, { limit: limit === Infinity ? null : limit, waits, over: limit === Infinity ? 0 : Math.max(0, waits - limit) }];
    }));
    return { course, at, dishes: here, sitting };
  }).filter((c) => c.dishes.length);
  return { ...plan, steps, serving };
}

// `options.madeAhead`, once the make-ahead choice is settled (while cooking),
// lists the dishes whose first part is made ahead, and the plan skips comparing
// each dish both ways, which is most of its work.
export function planLineup(lineup, recipes, progress = {}, options = {}) {
  const keepsWhole = (slug) => !stepsOf(recipes[slug]).some((s) => s.holds);
  const dayParts = (slugs) => Object.fromEntries(slugs.map((slug) => [slug, keepsWhole(slug) ? "skip" : "after"]));
  const dayLength = (p) => Math.max(...Object.values(p.courses));
  const everything = chains(lineup, recipes);
  const unknown = unknownsOf([...new Set(everything.map((d) => d.slug))], recipes);
  const settled = Array.isArray(options.madeAhead);
  const allToday = settled && options.madeAhead.length ? null : search(everything, progress);
  const makeAhead = settled ? options.madeAhead.map((slug) => ({ slug, ahead: true })) : [];
  for (const { slug } of settled ? [] : lineup.dishes) {
    // A dish that keeps entirely can be made ahead only if something's left for
    // the day.
    if (keepsWhole(slug) && (sits(recipes[slug]) !== Infinity || lineup.dishes.length === 1)) continue;
    const saves = dayLength(allToday) - dayLength(search(chains(lineup, recipes, dayParts([slug])), progress));
    if (saves > MAKE_AHEAD_SAVES) makeAhead.push({ slug, saves, ahead: lineup.ahead?.[slug] ?? true });
  }
  const ahead = makeAhead.filter((q) => q.ahead).map((q) => q.slug);
  // What cook mode shows: the step to do now, and how long to wait before it
  // when nothing needs you yet.
  const withNow = (raw) => {
    const plan = forThePage(raw, everything, recipes, lineup);
    if (plan.aheadOfTime) plan.aheadOfTime = forThePage(plan.aheadOfTime, everything, recipes, lineup);
    const upNow = plan.steps.find((x) => !x.done && !x.skipped) ?? null;
    return { ...plan, upNow, wait: upNow ? Math.max(0, upNow.at - (progress.now || 0)) : 0, unknown };
  };
  if (!ahead.length) return withNow({ ...allToday, makeAhead, aheadOfTime: null });
  const before = search(chains({ dishes: lineup.dishes.filter((d) => ahead.includes(d.slug)) }, recipes,
    Object.fromEntries(ahead.map((slug) => [slug, keepsWhole(slug) ? null : "before"]))));
  return withNow({ ...search(chains(lineup, recipes, dayParts(ahead)), progress), makeAhead, aheadOfTime: { steps: before.steps, minutes: before.minutes } });
}
