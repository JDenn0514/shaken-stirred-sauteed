// "What's changed" in the editor (assets/edit-changes.mjs): the differences
// between the recipe as it is on the site and as edited, in a cook's words.
// Amounts, times and temperatures are marked `number`, and come first: Save
// shows the list before saving only when one of them changed (decision 7 in
// docs/specs/editor-redesign.md).
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import fc from "fast-check";
import { changes } from "../../assets/edit-changes.mjs";
import * as M from "../../assets/edit-model.mjs";
import { recipeArb, flat } from "../helpers/recipe-arb.mjs";

const VOCAB = JSON.parse(readFileSync(new URL("../../recipes/vocabulary.json", import.meta.url), "utf8"));

const bars = () => ({
  title: "Lemon Bars",
  category: "baking",
  yield: "Makes 16",
  time: { total: 90 },
  heat: "350°F",
  ingredients: [
    { group: "Crust", items: [{ grams: 125, qty: "1 cup", item: "Flour" }, { grams: 50, qty: "1/4 cup", item: "Sugar" }, { grams: 115, qty: "8 tbsp", item: "Butter", note: "melted" }] },
    { group: "Filling", items: [{ grams: 200, qty: "1 cup", item: "Sugar" }, { qty: "3 large", item: "Eggs" }] },
  ],
  steps: [
    { do: "Mix the flour, sugar and butter.", uses: ["Flour", { group: "Crust", item: "Sugar" }, "Butter"] },
    { do: "Bake the crust.", wait: "15 min", oven: "350F" },
    { do: "Whisk the filling.", hands: "3 min" },
  ],
  notes: ["Keeps 3 days."],
  tags: { type: ["cookies-bars"], ingredients: ["lemon"] },
});
const lines = (before, after, opts) => changes(before, after, { vocab: VOCAB, ...opts }).map((c) => `${c.number ? "# " : ""}${c.text}`);

describe("changes: examples", () => {
  test("nothing changed, nothing to say", () => assert.deepEqual(lines(bars(), bars()), []));

  test("an ingredient's amount and weight", () => {
    const r = M.updateIngredient(bars(), 2, { qty: "10 tbsp", grams: "140", item: "Butter", note: "melted" });
    assert.deepEqual(lines(bars(), r), ["# Butter: 8 tbsp → 10 tbsp", "# Butter: 115 g → 140 g"]);
  });
  test("millilitres added", () =>
    assert.deepEqual(lines(bars(), M.updateIngredient(bars(), 4, { qty: "3 large", item: "Eggs", ml: "150" })), ["# Eggs: 150 ml added"]));
  test("a repeated name says which group", () =>
    assert.deepEqual(lines(bars(), M.updateIngredient(bars(), 3, { qty: "1 1/4 cups", grams: "250", item: "Sugar" })),
      ["# Sugar (Filling): 1 cup → 1 1/4 cups", "# Sugar (Filling): 200 g → 250 g"]));
  test("a rename, and a note", () =>
    assert.deepEqual(lines(bars(), M.updateIngredient(bars(), 2, { qty: "8 tbsp", grams: "115", item: "Ghee", note: "soft" })),
      ["Butter → Ghee", "Ghee: note “melted” → “soft”"]));
  test("an ingredient added and one removed", () => {
    let r = M.removeIngredient(bars(), 4);
    r = M.updateIngredient(M.addIngredient(r).recipe, 4, { qty: "1 tsp", item: "Lemon zest" });
    assert.deepEqual(lines(bars(), r), ["# Added: 1 tsp Lemon zest", "# Removed: 3 large Eggs"]);
  });
  test("an ingredient moved", () => assert.deepEqual(lines(bars(), M.moveIngredient(bars(), 0, 1)), ["Ingredients: the order changed"]));

  test("a step's wait, hands-on time and oven", () => {
    let r = M.updateStep(bars(), 1, { do: "Bake the crust.", wait: "18 min" });
    r = M.setStepField(r, 1, "oven", "375F");
    r = M.setStepField(r, 2, "hands", "5 min");
    assert.deepEqual(lines(bars(), r), ["# Step 2 wait: 15 min → 18 min", "# Step 2 oven: 350F → 375F", "# Step 3 hands-on: 3 min → 5 min"]);
  });
  test("a step reworded, and its cue", () =>
    assert.deepEqual(lines(bars(), M.updateStep(bars(), 1, { do: "Bake the crust until pale gold.", wait: "15 min", cue: "Pale gold" })),
      ["Step 2 reworded: “Bake the crust until pale gold.”", "Step 2 cue: “Pale gold” added"]));
  test("a step's other lineup settings", () =>
    assert.deepEqual(lines(bars(), M.setStepField(M.setStepField(bars(), 1, "watch", true), 2, "burner", true)),
      ["Step 2: needs you there the whole wait", "Step 3: uses the burner"]));
  test("what a step uses", () =>
    assert.deepEqual(lines(bars(), M.setUses(bars(), 2, [{ ing: 3, amount: "" }, { ing: 4, amount: "" }])), ["Step 3 uses: + Sugar (Filling), + Eggs"]));
  test("a step added, one removed, and steps named as the sheet numbers them", () => {
    let r = M.removeStep(bars(), 2);
    r = M.updateStep(M.addStep(r).recipe, 2, { do: "Pour over the crust and bake.", wait: "20 min" });
    assert.deepEqual(lines(bars(), r, { stepName: (i) => `step ${i + 10}` }),
      ["# Added step 12: “Pour over the crust and bake.” (20 min)", "Removed step: “Whisk the filling.”"]);
  });
  test("a step split in two", () =>
    assert.deepEqual(lines(bars(), M.splitStep(M.updateStep(bars(), 0, { do: "Mix the flour and sugar. Add the butter." }), 0, 25)),
      ["Step 1 reworded: “Mix the flour and sugar.”", "Added step 2: “Add the butter.”"]));
  // From a law that failed: two steps said the same thing, and rewording the
  // first paired the second with it.
  test("of two steps that say the same, the one reworded is the one named", () => {
    const twins = { steps: [{ do: "Stir.", wait: "10 min" }, "Rest.", { do: "Stir.", wait: "1 hr" }] };
    assert.deepEqual(lines(twins, M.updateStep(twins, 0, { do: "Stir well.", wait: "10 min" })), ["Step 1 reworded: “Stir well.”"]);
  });
  test("steps moved", () => assert.deepEqual(lines(bars(), M.moveStep(bars(), 2, -1)), ["Steps: the order changed"]));

  test("the yield, the minutes, and the oven heat in the facts", () => {
    let r = M.setFacts(bars(), { yield: "Makes 24", times: [], time: { total: "100" }, more: { heat: "325°F" } });
    assert.deepEqual(lines(bars(), r), ["# Yield: Makes 16 → Makes 24", "# Total time: 90 min → 100 min", "# Oven heat: 350°F → 325°F"]);
  });
  test("the times as printed", () =>
    assert.deepEqual(lines({ ...bars(), times: [["Active", "20 min"]] }, { ...bars(), times: [["Active", "25 min"], ["Chill", "2 hr"]] }),
      ["# Times: Active 20 min → Active 25 min, Chill 2 hr"]));
  test("the title, the description, the section, the kind and the tags", () => {
    let r = M.setField(bars(), "title", "Lemon Squares");
    r = M.setField(r, "description", "Tart and buttery.");
    r = M.setKind(r, "component");
    r = M.setTags(r, "ingredients", ["lemon", "eggs"]);
    r = M.setCategory(r, "cooking", VOCAB);
    assert.deepEqual(lines(bars(), r), [
      "Title: “Lemon Bars” → “Lemon Squares”",
      "Description added",
      "Section: Baking → Cooking",
      "Kind: Dish → Component",
      "Tags: − Type: Cookies & bars, + Ingredients: Eggs",
    ]);
  });
  test("notes and Before you start", () =>
    assert.deepEqual(lines(bars(), { ...M.setLine(bars(), "notes", 0, "Keeps 4 days in the fridge."), beforeYouStart: ["Line the pan."] }),
      ["Notes: “Keeps 4 days in the fridge.”", "Before you start: + “Line the pan.”"]));
  test("serving, and how long it can sit", () =>
    assert.deepEqual(lines(bars(), M.setField(M.setField(bars(), "serve", "hot"), "sits", "10 min")), ["# Can sit for: 10 min", "How it's served: hot"]));
  test("amounts, times and temperatures come first", () => {
    let r = M.setField(bars(), "title", "Lemon Squares");
    r = M.updateStep(r, 1, { do: "Bake the crust.", wait: "18 min" });
    assert.deepEqual(lines(bars(), r), ["# Step 2 wait: 15 min → 18 min", "Title: “Lemon Bars” → “Lemon Squares”"]);
  });
});

// Laws, on random recipes the checker accepts. The seed is in the group's
// name; CHANGES_SEED=<seed> runs the same ones again.
const seed = Number(process.env.CHANGES_SEED) || Date.now() % 2 ** 31;
describe(`changes: laws (seed ${seed})`, () => {
  const opts = { seed, numRuns: 200 };
  const say = (r, s) => changes(r, s, { vocab: VOCAB });
  const objectIngredient = recipeArb.filter((r) => flat(r.ingredients).some((i) => typeof i === "object"))
    .chain((r) => fc.constantFrom(...flat(r.ingredients).flatMap((i, k) => (typeof i === "object" ? [k] : []))).map((k) => [r, k]));
  const objectStep = recipeArb.filter((r) => flat(r.steps).some((s) => typeof s === "object"))
    .chain((r) => fc.constantFrom(...flat(r.steps).flatMap((s, k) => (typeof s === "object" ? [k] : []))).map((k) => [r, k]));

  test("a recipe compared with itself has nothing to say", () =>
    fc.assert(fc.property(recipeArb, (r) => assert.deepEqual(say(r, structuredClone(r)), [])), opts));

  test("a new amount on an ingredient is said, as an amount, with the old and new", () =>
    fc.assert(fc.property(objectIngredient, ([r, k]) => {
      const i = flat(r.ingredients)[k];
      const after = M.updateIngredient(r, k, { ...i, qty: "17 cups" });
      if ((i.qty || "") === "17 cups") return;
      const said = say(r, after);
      assert.equal(said.length, 1, JSON.stringify(said));
      assert.equal(said[0].number, true);
      assert.match(said[0].text, /→ 17 cups$|17 cups added$/);
    }), opts));

  test("a new wait on a step is said as a time", () =>
    fc.assert(fc.property(objectStep, ([r, k]) => {
      const s = flat(r.steps)[k];
      const after = M.updateStep(r, k, { do: s.do, wait: "99 min", cue: s.cue });
      if (s.wait === "99 min") return;
      assert.ok(say(r, after).some((c) => c.number && /99 min/.test(c.text)), JSON.stringify(say(r, after)));
    }), opts));

  test("rewording a step is never an amount, time or temperature", () =>
    fc.assert(fc.property(objectStep, ([r, k]) => {
      const s = flat(r.steps)[k];
      const after = M.updateStep(r, k, { do: `${s.do} Then rest.`, wait: s.wait, cue: s.cue });
      const said = say(r, after);
      assert.ok(said.length >= 1);
      assert.ok(said.every((c) => !c.number), JSON.stringify(said));
    }), opts));

  test("amounts, times and temperatures always come first", () =>
    fc.assert(fc.property(objectIngredient, objectStep, ([r, k], [r2]) => {
      const after = M.updateIngredient({ ...r2, ingredients: r.ingredients }, k, { ...flat(r.ingredients)[k], qty: "17 cups" });
      const rank = say(r2, after).map((c) => (c.number ? 0 : 1));
      assert.deepEqual(rank, [...rank].sort());
    }), opts));
});
