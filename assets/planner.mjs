// The lineup planner: puts every step of several recipes in one order for one
// cook. See docs/specs/meal-planner-design.md, "How the planner works".

// "3 min" as minutes.
const minutes = (text) => {
  const m = /(\d+(?:\.\d+)?)\s*min/i.exec(text || "");
  return m ? +m[1] : 0;
};

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

// How long a dish can wait once done. Without a `serve`, a cooking dish is hot
// and can sit 10 minutes.
const sits = (r) => (r.serve === "keeps" ? Infinity : r.sits ? minutes(r.sits) : 10);

// Each dish as a chain of steps: hands is how long your hands are busy, then
// wait runs on its own, unless watch says it needs you there. A hot dish can
// sit only `sits` minutes once done; one that keeps can sit as long as it likes.
// `oven` is the setting a step needs, and `preheat` heats the oven to a setting
// in the background; the dish holds the oven from its first such step to the
// end of its last.
function chains(lineup, recipes) {
  return lineup.dishes.map(({ slug }) => {
    const steps = recipes[slug].steps.map((s) => ({
      slug, text: s.do, hands: minutes(s.hands), wait: minutes(s.wait), watch: !!s.watch,
      oven: s.oven || null, preheat: s.preheat || null,
    }));
    // A dish that needs the oven but never heats it gets a heating step first.
    const first = steps.find((x) => x.oven);
    if (first && !steps.some((x) => x.preheat)) {
      steps.unshift({ slug, text: heatText(first.oven), hands: 1, wait: 0, watch: false, oven: null, preheat: first.oven, added: true });
    }
    return { slug, sits: sits(recipes[slug]), steps, lastOven: steps.findLastIndex((s) => s.oven || s.preheat) };
  });
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
function simulate(dishes, serve) {
  const latest = dishes.map((d) => latestStarts(d, serve));
  // A hot dish starts no earlier than would leave it sitting too long.
  const earliest = dishes.map((dish, d) => latest[d][0] - dish.sits);
  const next = dishes.map(() => 0);           // index of each dish's next step
  const readyAt = dishes.map(() => 0);        // when that step can start
  const oven = new Map();                     // dish -> { setting, until } while it holds the oven
  let heat = null;                            // { setting, hotAt }: what the oven was last heated to
  const steps = [];
  let t = 0, handsFree = 0;

  const left = (d) => next[d] < dishes[d].steps.length;
  const opensAt = (d) => Math.max(readyAt[d], next[d] === 0 ? earliest[d] : -Infinity);
  const ovenFree = (d, setting) => [...oven].every(([o, h]) => o === d || h.until <= t || sameSetting(h.setting, setting));
  const hot = (setting) => !heat || !sameSetting(heat.setting, setting) || heat.hotAt <= t;
  const canStart = (d) => {
    const s = dishes[d].steps[next[d]];
    const setting = s.oven || s.preheat;
    return opensAt(d) <= t && handsFree <= t && (!setting || ovenFree(d, setting)) && (!s.oven || hot(s.oven));
  };

  while (dishes.some((_, d) => left(d))) {
    const can = dishes.map((_, d) => d).filter((d) => left(d) && canStart(d));
    if (!can.length) {
      const times = [handsFree, ...dishes.map((_, d) => d).filter(left).map(opensAt), ...[...oven.values()].map((h) => h.until), heat ? heat.hotAt : 0];
      t = Math.min(...times.filter((x) => x > t));
      continue;
    }
    const d = can.reduce((a, b) => (latest[b][next[b]] < latest[a][next[a]] ? b : a));
    const i = next[d]++;
    const s = dishes[d].steps[i];
    // An added heating step isn't needed if the oven's already at that setting.
    if (s.added && heat && sameSetting(heat.setting, s.preheat)) continue;
    steps.push({ slug: s.slug, text: s.text, at: t, ...(s.added && { added: true }) });
    readyAt[d] = t + s.hands + s.wait;
    handsFree = s.watch ? readyAt[d] : t + s.hands;
    if (s.preheat) heat = { setting: s.preheat, hotAt: t + s.hands + heatTime(s.preheat) };
    const setting = s.oven || s.preheat;
    if (setting) oven.set(d, { setting, until: i === dishes[d].lastOven ? readyAt[d] : Infinity });
  }
  return { steps, end: Math.max(...readyAt) };
}

// The earliest serve time one cook can get everything ready for.
export function planLineup(lineup, recipes) {
  const dishes = chains(lineup, recipes);
  const shortest = Math.max(...dishes.map((d) => d.steps.reduce((a, s) => a + s.hands + s.wait, 0)));
  let plan;
  for (let serve = Math.ceil(shortest); serve < shortest + 24 * 60; serve++) {
    plan = simulate(dishes, serve);
    if (plan.end <= serve) return { steps: plan.steps, minutes: serve };
  }
  return { steps: plan.steps, minutes: plan.end };
}
