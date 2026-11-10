// Laws for the lineup planner (assets/planner.mjs): things that hold for every
// lineup, not just the examples in planner.test.mjs. Each law is checked on
// random lineups made by fast-check; when one breaks, fast-check shrinks the
// lineup to the smallest one that still breaks it and prints it, with the seed
// to replay it. Each run picks a new seed, shown in the test group's name: set
// PLANNER_SEED to it to run the same lineups again (if planning ever stalls, say).
//
// The laws come from docs/specs/meal-planner-design.md, "How the planner works".
// Like planner.test.mjs, they go through planLineup() only.
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import fc from "fast-check";
import { planLineup } from "../../assets/planner.mjs";

const RUNS = 100;
// Times are minutes, and ranges plan from their middle, so allow for rounding.
const EPS = 1e-6;

// One step of a random recipe. Each kind is a step real recipes have.
const OVENS = ["200C", "400F", "350F", "300F", "broil"];
const stepArb = fc.record({
  kind: fc.constantFrom("plain", "wait", "oven", "stove", "prep", "during"),
  hands: fc.integer({ min: 0, max: 15 }),
  wait: fc.integer({ min: 1, max: 60 }),
  watch: fc.boolean(),
  oven: fc.constantFrom(...OVENS),
  kit: fc.constantFrom("burner", "burner", "microwave", "grill"),
});
const recipeArb = fc.record({
  steps: fc.array(stepArb, { minLength: 1, maxLength: 5 }),
  category: fc.constantFrom("cooking", "cooking", "baking"),
  serve: fc.constantFrom(undefined, "hot", "keeps"),
  sits: fc.integer({ min: 2, max: 30 }),
});

function toRecipe(slug, r) {
  const steps = r.steps.map((s, i) => {
    const step = { do: `${slug}: step ${i + 1}`, hands: `${s.hands} min` };
    const kind = s.kind === "during" && i === 0 ? "plain" : s.kind;
    if (kind === "wait") Object.assign(step, { wait: `${s.wait} min`, watch: s.watch });
    if (kind === "oven") Object.assign(step, { wait: `${s.wait} min`, oven: s.oven, watch: s.oven === "broil" && s.watch });
    if (kind === "stove") Object.assign(step, { wait: `${s.wait} min`, [s.kit]: true, watch: s.watch });
    if (kind === "prep") step.prep = true;
    if (kind === "during") step.during = true;
    return step;
  });
  return { title: slug, category: r.category, ingredients: [], steps, ...(r.serve && { serve: r.serve, sits: `${r.sits} min` }) };
}

// A lineup of one to four random dishes. (More makes planning too slow to run
// on every push; it would take five dishes on the stove at once to test the
// four-burner limit, so that's left to planner.test.mjs, "other equipment".)
const lineupArb = fc.record({
  dishes: fc.array(recipeArb, { minLength: 1, maxLength: 4 }),
  prepFirst: fc.boolean(),
}).map(({ dishes, prepFirst }) => {
  const recipes = Object.fromEntries(dishes.map((r, i) => [`dish${i + 1}`, toRecipe(`dish${i + 1}`, r)]));
  return { lineup: { dishes: Object.keys(recipes).map((slug) => ({ slug })), prepFirst }, recipes };
});

// The plans a cook would follow: the day's, and the one made ahead of time.
// Planning is the slow part, so every law gets the same random lineups (one
// seed for the whole file) and each lineup is planned once.
const SEED = Number(process.env.PLANNER_SEED) || (Date.now() | 0);
const planCache = new Map();
function plansFor({ lineup, recipes }) {
  const key = JSON.stringify({ lineup, recipes });
  if (!planCache.has(key)) {
    const plan = planLineup(lineup, recipes);
    planCache.set(key, { plan, all: [plan, ...(plan.aheadOfTime ? [plan.aheadOfTime] : [])] });
  }
  return planCache.get(key);
}

// What the recipe says about a planned step. An added heating step ("Heat the
// oven to…") isn't on the recipe, and its id isn't a number.
const recipeStep = (recipes, x) => (typeof x.step === "number" ? recipes[x.slug].steps[x.step] : null);
// The setting a heating step heats to, as the cook reads it:
// "Heat the oven to 200°C / 400°F", "Switch the oven to broil".
const heatsTo = (text) => (/broil/.test(text) ? "broil" : `${/(\d+)°F/.exec(text)[1]}F`);
const kitOf = (s) => (s ? ["burner", "microwave", "grill"].filter((k) => s[k]) : []);
// How long a step keeps your hands busy, and when it's over, its wait included.
const busyUntil = (x) => x.at + x.hands + (x.watch ? x.wait : 0);
const endsAt = (x) => x.at + x.hands + x.wait;

const fahrenheit = (setting) => {
  const m = /^(\d+)\s*([CF])$/i.exec(setting);
  return m ? (m[2].toUpperCase() === "C" ? m[1] * 9 / 5 + 32 : +m[1]) : null;
};
const sameSetting = (a, b) => {
  const fa = fahrenheit(a), fb = fahrenheit(b);
  return fa != null && fb != null ? Math.abs(fa - fb) <= 15 : a === b;
};
const covers = (heated, needed) => sameSetting(heated, needed) || (fahrenheit(heated) ?? -1) >= (fahrenheit(needed) ?? Infinity);
const heatTime = (setting) => (setting === "broil" ? 3 : 15);
const overlap = (a, b) => a.from < b.to - EPS && b.from < a.to - EPS;

const law = (name, check, options = {}) => test(name, options, () => {
  fc.assert(fc.property(lineupArb, (input) => { check(input, plansFor(input)); }), { numRuns: RUNS, seed: SEED });
});

describe(`laws for the lineup planner (seed ${SEED})`, () => {
  law("every step of every dish is planned exactly once", ({ recipes }, { all }) => {
    const seen = all.flatMap((p) => p.steps).filter((x) => typeof x.step === "number").map((x) => `${x.slug}:${x.step}`);
    const expected = Object.entries(recipes).flatMap(([slug, r]) => r.steps.map((_, n) => `${slug}:${n}`));
    assert.deepEqual([...seen].sort(), [...expected].sort());
  });

  law("a dish's steps keep the recipe's order, with its prep moved first", ({ recipes }, { all }) => {
    for (const p of all) {
      for (const [slug, r] of Object.entries(recipes)) {
        const planned = p.steps.filter((x) => x.slug === slug && typeof x.step === "number").map((x) => x.step);
        if (!planned.length) continue;
        const n = r.steps.map((_, i) => i);
        const expected = [...n.filter((i) => r.steps[i].prep), ...n.filter((i) => !r.steps[i].prep)];
        assert.deepEqual(planned, expected, `${slug}'s steps`);
      }
    }
  });

  law("one cook: no two steps need your hands at once", (_, { all }) => {
    for (const p of all) {
      const steps = [...p.steps].filter((x) => !x.skipped).sort((a, b) => a.at - b.at);
      for (let i = 1; i < steps.length; i++) {
        const before = steps.slice(0, i).reduce((a, b) => (busyUntil(b) > busyUntil(a) ? b : a));
        assert.ok(steps[i].at >= busyUntil(before) - EPS,
          `"${steps[i].text}" starts at ${steps[i].at}, while "${before.text}" has you busy until ${busyUntil(before)}`);
      }
    }
  });

  law("a step starts only once the step before it is done, its wait included, unless it runs during that wait", ({ recipes }, { all }) => {
    for (const p of all) {
      for (const slug of Object.keys(recipes)) {
        const steps = p.steps.filter((x) => x.slug === slug);
        // `base` is the last step not marked `during`; `during` lists the
        // steps since, which run while its wait does.
        let base = null, during = [];
        for (const x of steps) {
          const runsDuring = recipeStep(recipes, x)?.during;
          if (base && runsDuring) {
            const after = during.length ? during.at(-1) : base;
            assert.ok(x.at >= after.at + after.hands - EPS, `"${x.text}" starts at ${x.at}, before "${after.text}" is done`);
            during.push(x);
            continue;
          }
          if (base) {
            assert.ok(x.at >= endsAt(base) - EPS, `"${x.text}" starts at ${x.at}, before "${base.text}"'s wait is over at ${endsAt(base)}`);
            for (const d of during) assert.ok(x.at >= d.at + d.hands - EPS, `"${x.text}" starts at ${x.at}, before "${d.text}" is done`);
          }
          base = x;
          during = [];
        }
      }
    }
  });

  law("every dish is ready by the time its course is served", (_, { plan }) => {
    const courseOf = (slug) => plan.serving.find((c) => c.dishes.includes(slug))?.course;
    for (const [slug, ready] of Object.entries(plan.ready)) {
      const course = courseOf(slug);
      if (!course) continue;
      assert.ok(ready <= plan.courses[course] + EPS, `${slug} is ready at ${ready}, after ${course.toLowerCase()} is served at ${plan.courses[course]}`);
    }
  });

  law("never more burners, microwaves or grills in use than the kitchen has", ({ recipes }, { all }) => {
    const capacity = { burner: 4, microwave: 1, grill: 1 };
    for (const p of all) {
      const uses = p.steps.flatMap((x) => kitOf(recipeStep(recipes, x)).map((kind) => ({ kind, from: x.at, to: endsAt(x), text: x.text })));
      for (const u of uses) {
        const at = uses.filter((v) => v.kind === u.kind && v.from <= u.from + EPS && u.from < v.to - EPS);
        assert.ok(at.length <= capacity[u.kind], `${at.length} steps use the ${u.kind} at minute ${u.from}: ${at.map((v) => v.text).join(", ")}`);
      }
    }
  });

  law("the oven is never needed at two settings at once", ({ recipes }, { all }) => {
    for (const p of all) {
      const uses = p.steps.map((x) => ({ x, setting: recipeStep(recipes, x)?.oven, from: x.at, to: endsAt(x) })).filter((u) => u.setting);
      for (const a of uses) {
        for (const b of uses) {
          if (a.x.slug === b.x.slug || sameSetting(a.setting, b.setting) || !overlap(a, b)) continue;
          assert.fail(`"${a.x.text}" (${a.setting}, ${a.from}–${a.to}) and "${b.x.text}" (${b.setting}, ${b.from}–${b.to}) are in the oven at once`);
        }
      }
    }
  });

  // Follows the oven through the plan: a heating step heats it, and a step at a
  // lower setting turns it down, so needing it hotter again means heating it again.
  law("nothing goes in the oven before it's heated to that setting", ({ recipes }, { all }) => {
    for (const p of all) {
      let oven = null;
      for (const x of [...p.steps].filter((y) => !y.skipped).sort((a, b) => a.at - b.at)) {
        const heats = x.added ? heatsTo(x.text) : recipeStep(recipes, x)?.preheat;
        if (heats) { oven = { setting: heats, hotAt: x.at + x.hands + (oven && oven.hotAt <= x.at && covers(oven.setting, heats) ? 0 : heatTime(heats)) }; continue; }
        const setting = recipeStep(recipes, x)?.oven;
        if (!setting || setting === "off") continue;
        assert.ok(oven && covers(oven.setting, setting) && oven.hotAt <= x.at + EPS,
          `"${x.text}" goes in at ${setting} at minute ${x.at}, but the oven is ${oven ? `at ${oven.setting}, hot at ${oven.hotAt}` : "cold"}`);
        if (!sameSetting(oven.setting, setting)) oven = { setting, hotAt: x.at };
      }
    }
  });
});
