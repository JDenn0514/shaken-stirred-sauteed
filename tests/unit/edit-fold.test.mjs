// A step's "For the lineup" fold in the editor (assets/edit-fold.mjs): its
// checkboxes, its chips, and what it says when something isn't offered.
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import fc from "fast-check";
import { lineupFold, usesByGroup, mentions } from "../../assets/edit-fold.mjs";
import * as M from "../../assets/edit-model.mjs";
import { recipeArb, flat as flatList } from "../helpers/recipe-arb.mjs";

// The fold's checkboxes, as [label, ticked], read from its HTML. Drawing uses
// the page's escaping (window.SSS.esc), so the test gives it a plain one.
globalThis.window ??= { SSS: { esc: (s) => String(s ?? "").replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`) } };
const boxes = (html) => [...html.matchAll(/<input type="checkbox"([^>]*)>\s*([^<]+)<\/label>/g)].map(([, attrs, label]) => [unescape(label.trim()), / checked/.test(attrs)]);
const unescape = (s) => s.replace(/&#(\d+);/g, (_, c) => String.fromCharCode(c)).replace(/&#x([\da-f]+);/gi, (_, c) => String.fromCharCode(parseInt(c, 16)))
  .replace(/&quot;/g, '"').replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&");
const fold = (steps, n, ctx = {}) => boxes(lineupFold({ ingredients: [], steps }, n, { named: `step ${n + 1}`, ...ctx }));
const has = (steps, n, label, ctx) => fold(steps, n, ctx).find(([l]) => l === label);

// The fold's label: what it is, and how many problems and to-dos are about it.
const label = (ctx) => lineupFold({ ingredients: [], steps: ["Stir."] }, 0, { named: "step 1", ...ctx }).match(/<summary[^>]*>([^<]*)<\/summary>/)[1];
describe("lineupFold: its label", () => {
  test("just For the lineup, with nothing to check", () => assert.equal(label({}), "For the lineup"));
  test("with something to check, how many", () => {
    assert.equal(label({ toCheck: 1 }), "For the lineup: 1 to check");
    assert.equal(label({ toCheck: 3 }), "For the lineup: 3 to check");
  });
});

describe("lineupFold: waiting", () => {
  const NO_WAIT = "It doesn't wait";
  test("a step with no wait offers It doesn't wait, unticked", () => assert.deepEqual(has([{ do: "Stir." }], 0, NO_WAIT), [NO_WAIT, false]));
  test("a plain-text step offers it too", () => assert.deepEqual(has(["Stir."], 0, NO_WAIT), [NO_WAIT, false]));
  test("a step saved as not waiting has it ticked", () => assert.deepEqual(has([{ do: "Stir.", wait: false }], 0, NO_WAIT), [NO_WAIT, true]));
  test("a step with a wait time doesn't offer it", () => assert.equal(has([{ do: "Rest.", wait: "5 min" }], 0, NO_WAIT), undefined));
  test("Needs you there the whole wait is still only on a step with a wait time", () => {
    assert.equal(has([{ do: "Stir.", wait: false }], 0, "Needs you there the whole wait"), undefined);
    assert.deepEqual(has([{ do: "Rest.", wait: "5 min" }], 0, "Needs you there the whole wait"), ["Needs you there the whole wait", false]);
  });
});

describe("lineupFold: done during an earlier step's wait", () => {
  const DURING = "Done during an earlier step's wait";
  const GUESS = '<label class="import-guess"><input type="checkbox" data-act="r-during" checked> Done while an earlier step waits</label>';
  test("offered after a wait nobody watches", () => assert.deepEqual(has([{ do: "Rest.", wait: "30 min" }, "Chop."], 1, DURING), [DURING, false]));
  test("ticked on a step saved as during", () => assert.deepEqual(has([{ do: "Rest.", wait: "30 min" }, { do: "Chop.", during: true }], 1, DURING), [DURING, true]));
  test("not on the first step", () => assert.equal(has([{ do: "Rest.", wait: "30 min" }], 0, DURING), undefined));
  test("not after a watched wait", () => assert.equal(has([{ do: "Stir.", wait: "5 min", watch: true }, "Chop."], 1, DURING), undefined));
  test("still shown, ticked, where it no longer fits, so it can be taken off", () =>
    assert.deepEqual(has([{ do: "Stir.", wait: "5 min", watch: true }, { do: "Chop.", during: true }], 1, DURING), [DURING, true]));
  test("on an imported recipe, the intake's guess stands in for it, so it shows once", () => {
    const got = fold([{ do: "Rest.", wait: "30 min" }, "Chop."], 1, { duringGuess: GUESS });
    assert.equal(got.find(([l]) => l === DURING), undefined);
    assert.deepEqual(got.find(([l]) => l === "Done while an earlier step waits"), ["Done while an earlier step waits", true]);
  });
  test("on an imported recipe, the guess says nothing about why", () =>
    assert.equal(why([{ do: "Stir.", wait: "5 min", watch: true }, "Chop."], 1, { duringGuess: GUESS }), ""));
});

// Where it isn't offered, the fold says why, in place of the checkbox, and
// how to make it fit when there's a way.
const why = (steps, n, ctx) => unescape(lineupFold({ ingredients: [], steps }, n, { named: `step ${n + 1}`, ...ctx }).match(/<p class="edit-why[^"]*">([^<]*)<\/p>/)?.[1] || "");
describe("lineupFold: why done during an earlier step's wait isn't offered", () => {
  const NOT = "Done during an earlier step's wait isn't offered";
  test("on the first step", () => assert.equal(why([{ do: "Rest.", wait: "30 min" }], 0), `${NOT}: no earlier step waits.`));
  test("after a wait that needs you there", () =>
    assert.equal(why([{ do: "Stir.", wait: "5 min", watch: true }, "Chop."], 1), `${NOT}: step 1's wait needs you there the whole time.`));
  test("after a step that doesn't wait", () =>
    assert.equal(why(["Mix.", "Chop."], 1), `${NOT}: step 1, just before it, doesn't wait.`));
  test("after a step that doesn't wait but could be done during the wait before it, how to make it fit", () =>
    assert.equal(why([{ do: "Bake.", wait: "20 min" }, "Whip the cream.", "Mix it in the mixer."], 2),
      `${NOT}: step 2, just before it, doesn't wait. If step 2 happens while step 1 waits, tick it there first, and this one can be too.`));
  test("steps named as the sheet names them", () =>
    assert.equal(why(["Mix.", "Chop."], 1, { nameOf: (i) => `step ${i + 5}` }), `${NOT}: step 5, just before it, doesn't wait.`));
  test("on an added prep step", () =>
    assert.equal(why([{ do: "Rest.", wait: "30 min" }, { do: "Mince the garlic.", prepOnly: true }], 1), `${NOT} on an added prep step: prep is planned on its own.`));
  test("nothing said where it's offered, or ticked", () => {
    assert.equal(why([{ do: "Rest.", wait: "30 min" }, "Chop."], 1), "");
    assert.equal(why([{ do: "Stir.", wait: "5 min", watch: true }, { do: "Chop.", during: true }], 1), "");
  });
});

// The Uses chips: grouped under the ingredient group names, so two "Sugar"s
// can be told apart. In each group, ticked ones first, then ones the step's
// text mentions, then the rest, each in the recipe's order. Nothing is
// ticked or hidden for you.
describe("usesByGroup", () => {
  const bars = () => ({
    ingredients: [
      { group: "Crust", items: [{ qty: "1 cup", item: "Flour" }, { qty: "1/4 cup", item: "Sugar" }, { qty: "8 tbsp", item: "Butter" }] },
      { group: "Filling", items: [{ qty: "1 cup", item: "Sugar" }, { qty: "3 large", item: "Eggs" }, { qty: "1/2 cup", item: "Lemon juice" }, "Powdered sugar, for dusting"] },
    ],
    steps: [
      { do: "Mix the flour, sugar and butter.", uses: ["Flour", { group: "Crust", item: "Sugar" }, "Butter"] },
      { do: "Whisk the eggs and half the lemon juice.", uses: [{ item: "Lemon juice", amount: "1/4 cup" }] },
      "Chill.",
    ],
  });
  const shape = (groups) => groups.map((g) => [g.group, g.items.map((i) => `${i.name}${i.ticked ? "✓" : ""}${i.mentioned ? "~" : ""}${i.amount ? `(${i.amount})` : ""}`)]);

  test("under the group names, in the recipe's order, with their places in the file", () => {
    const got = usesByGroup(bars(), 2);
    assert.deepEqual(shape(got), [["Crust", ["Flour", "Sugar", "Butter"]], ["Filling", ["Sugar", "Eggs", "Lemon juice", "Powdered sugar, for dusting"]]]);
    assert.deepEqual(got.flatMap((g) => g.items.map((i) => i.ing)), [0, 1, 2, 3, 4, 5, 6]);
  });
  test("ticked first, then mentioned, then the rest, in each group", () =>
    assert.deepEqual(shape(usesByGroup(bars(), 1)), [
      ["Crust", ["Flour", "Sugar", "Butter"]],
      ["Filling", ["Lemon juice✓(1/4 cup)", "Eggs~", "Sugar", "Powdered sugar, for dusting"]],
    ]));
  test("the right Sugar is ticked, and the other only mentioned", () =>
    assert.deepEqual(shape(usesByGroup(bars(), 0)), [
      ["Crust", ["Flour✓", "Sugar✓", "Butter✓"]],
      ["Filling", ["Sugar~", "Powdered sugar, for dusting~", "Eggs", "Lemon juice"]],
    ]));
  test("ungrouped ingredients are one group with no name", () =>
    assert.deepEqual(shape(usesByGroup({ ingredients: ["1 orange", { qty: "2 tsp", item: "Kosher salt" }], steps: ["Salt the pork."] }, 0)),
      [["", ["Kosher salt~", "1 orange"]]]));
  test("ungrouped ingredients before a group stay before it", () =>
    assert.deepEqual(usesByGroup({ ingredients: [{ item: "Salt" }, { group: "Sauce", items: [{ item: "Soy" }] }, { item: "Rice" }], steps: ["Go."] }, 0).map((g) => g.group),
      ["", "Sauce", ""]));
  test("no ingredients, no groups", () => assert.deepEqual(usesByGroup({ steps: ["Stir."] }, 0), []));
});

describe("mentions: whether a step's text names an ingredient", () => {
  for (const [text, name, want] of [
    ["Mix the flour and sugar.", "Sugar", true],
    ["Mix the flour and sugar.", "Flour", true],
    ["Crack the egg.", "Eggs", true],
    ["Add the eggs.", "Egg", true],
    ["Whisk in the lemon juice.", "Lemon juice", true],
    ["Season with salt.", "Kosher salt", true],
    ["Dust with powdered sugar.", "Powdered sugar, for dusting", true],
    ["Toss with the noodles.", "8 oz noodles", true],
    ["Add 4 cloves garlic.", "4 cloves garlic, minced", true],
    ["SALT it well.", "Salt", true],
    ["Add the saltwater.", "Salt", false],
    ["Juice the lemons.", "Lemon juice", true],
    ["Mix the flour.", "Sugar", false],
    ["Stir.", "", false],
    ["", "Sugar", false],
  ]) test(`"${text}" ${want ? "names" : "doesn't name"} "${name}"`, () => assert.equal(mentions(text, name), want));
});

// Laws, on random recipes the checker accepts. The seed is in the group's
// name; USES_SEED=<seed> runs the same ones again.
const usesSeed = Number(process.env.USES_SEED) || Date.now() % 2 ** 31;
describe(`usesByGroup laws (seed ${usesSeed})`, () => {
  const withStep = recipeArb.chain((r) => fc.nat({ max: Math.max(0, flatList(r.steps).length - 1) }).map((n) => [r, n]));
  const opts = { seed: usesSeed, numRuns: 200 };
  test("every ingredient is shown exactly once, under its own group", () =>
    fc.assert(fc.property(withStep, ([r, n]) => {
      const groups = usesByGroup(r, n);
      const seen = groups.flatMap((g) => g.items.map((i) => i.ing)).sort((a, b) => a - b);
      assert.deepEqual(seen, flatList(r.ingredients).map((_, k) => k));
      const groupOf = r.ingredients.flatMap((e) => (Array.isArray(e?.items) ? e.items.map(() => e.group) : [""]));
      for (const g of groups) for (const i of g.items) assert.equal(groupOf[i.ing], g.group);
    }), opts));
  test("what's ticked is exactly what the step uses, and comes before anything unticked", () =>
    fc.assert(fc.property(withStep, ([r, n]) => {
      const groups = usesByGroup(r, n);
      const ticked = groups.flatMap((g) => g.items.filter((i) => i.ticked).map((i) => i.ing)).sort((a, b) => a - b);
      assert.deepEqual(ticked, M.usesOf(r, n).picks.map((p) => p.ing).sort((a, b) => a - b));
      for (const g of groups) {
        const rank = g.items.map((i) => (i.ticked ? 0 : i.mentioned ? 1 : 2));
        assert.deepEqual(rank, [...rank].sort(), JSON.stringify(g));
      }
    }), opts));
});

// Every step either offers "Done during an earlier step's wait" or says why
// not: never both, never neither.
const whySeed = Number(process.env.WHY_SEED) || Date.now() % 2 ** 31;
describe(`why-not law (seed ${whySeed})`, () => {
  const withStep = recipeArb.chain((r) => fc.nat({ max: Math.max(0, flatList(r.steps).length - 1) }).map((n) => [r, n]));
  test("a step offers During or says why not, never both", () =>
    fc.assert(fc.property(withStep, ([r, n]) => {
      const html = lineupFold(r, n, { named: `step ${n + 1}` });
      const offered = boxes(html).some(([l]) => l === "Done during an earlier step's wait");
      const said = /<p class="edit-why/.test(html);
      assert.notEqual(offered, said, JSON.stringify(flatList(r.steps)));
    }), { seed: whySeed, numRuns: 200 }));
});
