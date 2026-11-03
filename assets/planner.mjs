// The lineup planner: puts every step of several recipes in one order for one
// cook. See docs/specs/meal-planner-design.md, "How the planner works".

// "3 min" as minutes.
const minutes = (text) => {
  const m = /(\d+(?:\.\d+)?)\s*min/i.exec(text || "");
  return m ? +m[1] : 0;
};

// How long a dish can wait once done. Without a `serve`, a cooking dish is hot
// and can sit 10 minutes.
const sits = (r) => (r.serve === "keeps" ? Infinity : r.sits ? minutes(r.sits) : 10);

// Each dish as a chain of steps: hands is how long your hands are busy, then
// wait runs on its own, unless watch says it needs you there. A hot dish can
// sit only `sits` minutes once done; one that keeps can sit as long as it likes.
function chains(lineup, recipes) {
  return lineup.dishes.map(({ slug }) => ({
    slug,
    sits: sits(recipes[slug]),
    steps: recipes[slug].steps.map((s) => ({ slug, text: s.do, hands: minutes(s.hands), wait: minutes(s.wait), watch: !!s.watch })),
  }));
}

// Work back from serving at minute `serve`: each step's latest start.
function latestStarts(dish, serve) {
  let t = serve;
  return dish.steps.map((s) => s).reverse().map((s) => (t -= s.hands + s.wait)).reverse();
}

// Move forward through time. Whenever the cook's hands are free, start the
// most urgent step that can start: the one whose latest start is soonest.
function simulate(dishes, serve) {
  const latest = dishes.map((d) => latestStarts(d, serve));
  const next = dishes.map(() => 0);      // index of each dish's next step
  const readyAt = dishes.map(() => 0);   // when that step can start
  const steps = [];
  // A hot dish starts no earlier than would leave it sitting too long.
  const earliest = dishes.map((dish, d) => latest[d][0] - dish.sits);
  const left = (d) => next[d] < dishes[d].steps.length;
  const opensAt = (d) => Math.max(readyAt[d], next[d] === 0 ? earliest[d] : -Infinity);
  let t = 0, handsFree = 0, end = 0;
  while (dishes.some((_, d) => left(d))) {
    const can = dishes.map((_, d) => d).filter((d) => left(d) && opensAt(d) <= t && handsFree <= t);
    if (!can.length) {
      t = Math.min(...[handsFree, ...dishes.map((_, d) => d).filter(left).map(opensAt)].filter((x) => x > t));
      continue;
    }
    const d = can.reduce((a, b) => (latest[b][next[b]] < latest[a][next[a]] ? b : a));
    const s = dishes[d].steps[next[d]++];
    steps.push({ slug: s.slug, text: s.text, at: t });
    readyAt[d] = t + s.hands + s.wait;
    handsFree = s.watch ? readyAt[d] : t + s.hands;
    end = Math.max(end, readyAt[d]);
  }
  return { steps, end };
}

export function planLineup(lineup, recipes) {
  const dishes = chains(lineup, recipes);
  const shortest = Math.max(...dishes.map((d) => d.steps.reduce((a, s) => a + s.hands + s.wait, 0)));
  const { steps, end } = simulate(dishes, shortest);
  return { steps, minutes: end };
}
