// The editor's changes to a recipe (assets/edit-model.mjs). Each takes a
// recipe and returns a changed copy. Ingredients and steps are found by their
// place in the file, counting across groups from 0 (as the recipe page's
// data-ing and data-step do). Fields the editor has no control for must come
// out exactly as they went in.
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import fc from "fast-check";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { recipe as goodRecipe } from "../helpers/build-index.mjs";
import * as M from "../../assets/edit-model.mjs";

// A recipe with fields the editor never touches, in an unusual order.
const keeper = () => ({
  wobble: { anything: [1, 2] },
  title: "Old Fashioned",
  category: "cocktails",
  abv: "32%",
  nutrition: "Sugar, mostly",
  origin: "Louisville, 1880s",
  ingredients: [
    { qty: "2 oz", item: "Bourbon", ml: 60, colour: "amber" },
    { group: "Syrup", items: ["1 tsp sugar", { qty: "2 dashes", item: "Bitters", optional: true }] },
  ],
  steps: [
    { do: "Stir the sugar and bitters.", hands: "1 min", uses: ["1 tsp sugar", "Bitters"], shake: "never" },
    { group: "Finish", items: [{ do: "Add the bourbon and ice, then stir.", wait: "30 sec", watch: true, cue: "Cold glass" }] },
  ],
  serve: "soon",
  afterword: "kept",
});

// The real checker, for tests that ask whether it would accept what the editor wrote.
const { checkRecipe } = createRequire(import.meta.url)("../../assets/recipe-checks.js");
const VOCAB = JSON.parse(readFileSync(new URL("../../recipes/vocabulary.json", import.meta.url), "utf8"));
const BASE = goodRecipe();
const ovenProblems = (setting) =>
  checkRecipe("x", { ...BASE, steps: [{ do: "Bake.", oven: setting }] }, VOCAB).errors.filter((e) => /oven setting/.test(e));

const flat = (l) => l.flatMap((e) => (e && Array.isArray(e.items) ? e.items : [e]));

describe("keeps what it doesn't edit", () => {
  test("changing the title leaves every other field, and their order, as it was", () => {
    const before = keeper();
    const after = M.setField(before, "title", "Rye Old Fashioned");
    assert.deepEqual(Object.keys(after), Object.keys(before));
    assert.deepEqual({ ...after, title: before.title }, before);
    assert.equal(after.title, "Rye Old Fashioned");
  });

  test("the recipe given isn't changed", () => {
    const before = keeper();
    const copy = structuredClone(before);
    M.setField(before, "title", "x");
    M.removeStep(before, 0);
    assert.deepEqual(before, copy);
  });

  test("editing an ingredient keeps its other fields", () => {
    const after = M.updateIngredient(keeper(), 0, { qty: "2 1/2 oz", item: "Bourbon", note: "" });
    assert.deepEqual(after.ingredients[0], { qty: "2 1/2 oz", item: "Bourbon", ml: 60, colour: "amber" });
  });

  test("editing a step keeps its other fields", () => {
    const after = M.updateStep(keeper(), 0, { do: "Stir well.", wait: "", cue: "" });
    assert.deepEqual(after.steps[0], { do: "Stir well.", hands: "1 min", uses: ["1 tsp sugar", "Bitters"], shake: "never" });
  });
});

describe("the title, description and yield", () => {
  test("an empty field is taken out", () => {
    const after = M.setField({ title: "A", description: "B", category: "cooking" }, "description", "  ");
    assert.deepEqual(after, { title: "A", category: "cooking" });
  });
  test("a new field goes at the end", () =>
    assert.deepEqual(Object.keys(M.setField({ title: "A", category: "cooking" }, "yield", "Serves 2")), ["title", "category", "yield"]));
  test("the source's name and link", () => {
    const r = M.setField(M.setField({ title: "A" }, "source.name", "Grandma"), "source.url", "https://example.com");
    assert.deepEqual(r.source, { name: "Grandma", url: "https://example.com" });
    assert.equal(M.setField(M.setField(r, "source.name", ""), "source.url", "").source, undefined);
  });
  test("only fields the editor knows", () => assert.throws(() => M.setField({}, "category", "baking")));
});

describe("ingredients", () => {
  test("a plain-text ingredient stays plain text", () =>
    assert.equal(M.updateIngredient(keeper(), 1, { text: "2 tsp sugar" }).ingredients[1].items[0], "2 tsp sugar"));

  test("adding one puts an empty ingredient at the end, and says where", () => {
    const { recipe, at } = M.addIngredient(keeper());
    assert.equal(at, 3);
    assert.deepEqual(flat(recipe.ingredients)[3], { item: "" });
    assert.equal(recipe.ingredients[1].items.length, 3);
  });

  test("removing one", () =>
    assert.deepEqual(flat(M.removeIngredient(keeper(), 0).ingredients).map((i) => i.item || i), ["1 tsp sugar", "Bitters"]));

  test("removing a group's last ingredient removes the group", () => {
    let r = M.removeIngredient(keeper(), 1);
    r = M.removeIngredient(r, 1);
    assert.deepEqual(r.ingredients, [keeper().ingredients[0]]);
  });

  test("moving one up and down, into and out of groups", () => {
    const names = (r) => r.ingredients.map((e) => (e.items ? `${e.group}: ${e.items.map((i) => i.item || i).join(", ")}` : e.item || e));
    const down = M.moveIngredient(keeper(), 0, 1);
    assert.deepEqual(names(down), ["Syrup: Bourbon, 1 tsp sugar, Bitters"]);
    const swapped = M.moveIngredient(keeper(), 1, 1);
    assert.deepEqual(names(swapped), ["Bourbon", "Syrup: Bitters, 1 tsp sugar"]);
    const out = M.moveIngredient(keeper(), 1, -1);
    assert.deepEqual(names(out), ["Bourbon", "1 tsp sugar", "Syrup: Bitters"]);
    assert.deepEqual(M.moveIngredient(keeper(), 0, -1), keeper(), "the first can't go further up");
  });
});

describe("steps", () => {
  test("an empty wait is taken out, and with it watch, which needs a wait", () =>
    assert.deepEqual(M.updateStep(keeper(), 1, { do: "Stir.", wait: "", cue: "Cold glass" }).steps[1].items[0], { do: "Stir.", cue: "Cold glass" }));

  test("a step saved as not waiting stays that way when its wait is left empty, and takes a time when given one", () => {
    const r = { title: "A", steps: [{ do: "Let it rest on the counter.", wait: false }] };
    assert.deepEqual(M.updateStep(r, 0, { do: "Let it rest on the floured counter.", wait: "", cue: "" }).steps,
      [{ do: "Let it rest on the floured counter.", wait: false }]);
    assert.deepEqual(M.updateStep(r, 0, { do: "Let it rest on the counter.", wait: "10 min", cue: "" }).steps,
      [{ do: "Let it rest on the counter.", wait: "10 min" }]);
  });

  test("a plain-text step becomes { do } when it gets a wait", () => {
    const r = M.updateStep({ title: "A", steps: ["Boil."] }, 0, { do: "Boil.", wait: "5 min", cue: "" });
    assert.deepEqual(r.steps, [{ do: "Boil.", wait: "5 min" }]);
  });

  test("adding a step", () => {
    const { recipe, at } = M.addStep(keeper());
    assert.equal(at, 2);
    assert.deepEqual(recipe.steps[1].items[1], { do: "" });
  });

  test("adding a step after another puts it next, in the same group", () => {
    const r = { title: "Bars", steps: [
      { group: "Crust", items: [{ do: "Press the crust." }, { do: "Bake the crust." }] },
      { group: "Filling", items: [{ do: "Whisk the filling." }] },
    ] };
    const { recipe, at } = M.addStep(r, { after: 1 });
    assert.equal(at, 2);
    assert.deepEqual(recipe.steps, [
      { group: "Crust", items: [{ do: "Press the crust." }, { do: "Bake the crust." }, { do: "" }] },
      { group: "Filling", items: [{ do: "Whisk the filling." }] },
    ]);
    assert.deepEqual(M.addStep(r, { after: 0 }).recipe.steps[0].items, [{ do: "Press the crust." }, { do: "" }, { do: "Bake the crust." }]);
  });

  test("adding an ingredient after another puts it next, in the same group", () => {
    const { recipe, at } = M.addIngredient(keeper(), { after: 1 });
    assert.equal(at, 2);
    assert.deepEqual(recipe.ingredients[1].items, ["1 tsp sugar", { item: "" }, { qty: "2 dashes", item: "Bitters", optional: true }]);
    assert.deepEqual(recipe.ingredients[0], keeper().ingredients[0]);
  });

  test("adding a step after one in an ungrouped list", () => {
    const { recipe, at } = M.addStep({ title: "A", steps: ["Mix.", "Bake."] }, { after: 0 });
    assert.equal(at, 1);
    assert.deepEqual(recipe.steps, ["Mix.", { do: "" }, "Bake."]);
  });

  test("putting one line back as it was keeps every other change", () => {
    const before = keeper();
    let now = M.updateStep(before, 0, { do: "Stir it all.", wait: "", cue: "" });
    now = M.setStepField(now, 1, "hands", "2 min");
    now = M.setField(now, "title", "Older Fashioned");
    const back = M.putBack(now, before, "step:0");
    assert.deepEqual(flat(back.steps)[0], flat(before.steps)[0]);
    assert.equal(flat(back.steps)[1].hands, "2 min");
    assert.equal(back.title, "Older Fashioned");
    assert.equal(M.putBack(now, before, "about").title, "Old Fashioned");
    assert.equal(flat(M.putBack(now, before, "about").steps)[0].do, "Stir it all.");
  });

  test("putting an ingredient back as it was", () => {
    const before = keeper();
    const now = M.updateIngredient(before, 2, { qty: "3 dashes", item: "Bitters", note: "" });
    assert.deepEqual(M.putBack(now, before, "ing:2"), before);
  });

  test("splitting a step: the first part keeps what it uses, the second its wait", () => {
    const r = M.splitStep({ title: "A", steps: [{ do: "Mix the dough. Bake it.", uses: ["Flour"], hands: "5 min", wait: "20 min", cue: "Golden", oven: "200C" }] }, 0, 14);
    assert.deepEqual(r.steps, [
      { do: "Mix the dough.", uses: ["Flour"], hands: "5 min" },
      { do: "Bake it.", wait: "20 min", cue: "Golden", oven: "200C" },
    ]);
  });

  // The garlic soup's step 2, as the intake read it (docs/ideas.md).
  const soup = () => ({ title: "Soup", steps: [
    "Peel the garlic.",
    { do: "Cook garlic 5 minutes in butter. Onion 2 minutes, potato 1 minute then add stock…", hands: "2 min", uses: ["Garlic", "Butter", "Onion", "Potato", "Stock"],
      wait: "5 min", cue: "Soft but not brown", watch: true, burner: true },
  ] });

  test("splitting the garlic soup's step: the wait goes with the half that says its time", () => {
    const r = M.splitStep(soup(), 1, "Cook garlic 5 minutes in butter.".length);
    assert.deepEqual(r.steps, [
      "Peel the garlic.",
      { do: "Cook garlic 5 minutes in butter.", hands: "2 min", uses: ["Garlic", "Butter", "Onion", "Potato", "Stock"], wait: "5 min", cue: "Soft but not brown", watch: true, burner: true },
      { do: "Onion 2 minutes, potato 1 minute then add stock…" },
    ]);
  });

  test("splitting where neither half, or both, say the wait's time: the wait goes second", () => {
    const step = (text) => ({ title: "A", steps: [{ do: text, wait: "10 min", burner: true }] });
    assert.deepEqual(M.splitStep(step("Fry 5 minutes. Simmer until thick."), 0, 14).steps,
      [{ do: "Fry 5 minutes." }, { do: "Simmer until thick.", wait: "10 min", burner: true }]);
    assert.deepEqual(M.splitStep(step("Fry 10 minutes. Simmer 10 minutes."), 0, 15).steps,
      [{ do: "Fry 10 minutes." }, { do: "Simmer 10 minutes.", wait: "10 min", burner: true }]);
  });

  test("splitting matches the wait's time however it's written", () => {
    const r = M.splitStep({ title: "A", steps: [{ do: "Roast 35–45 minutes. Rest it.", wait: "35 to 45 min", oven: "200C" }] }, 0, 20);
    assert.deepEqual(r.steps, [{ do: "Roast 35–45 minutes.", wait: "35 to 45 min", oven: "200C" }, { do: "Rest it." }]);
    const half = M.splitStep({ title: "A", steps: [{ do: "Simmer for 1 1/2 hours. Season.", wait: "90 min" }] }, 0, 24);
    assert.deepEqual(half.steps, [{ do: "Simmer for 1 1/2 hours.", wait: "90 min" }, { do: "Season." }]);
  });

  test("splitting: a time that isn't how long the step takes doesn't count", () => {
    const r = M.splitStep({ title: "A", steps: [{ do: "Check it at 10 minutes. Bake until set.", wait: "10 min", oven: "180C" }] }, 0, 24);
    assert.deepEqual(r.steps, [{ do: "Check it at 10 minutes." }, { do: "Bake until set.", wait: "10 min", oven: "180C" }]);
  });

  test("splitting: holds stays with the second half, preheat with the half about the oven", () => {
    const held = M.splitStep({ title: "A", steps: [{ do: "Bake 1 hr. Leave it in the turned-off oven.", wait: "1 hr", oven: "120C", holds: true }] }, 0, 11);
    assert.deepEqual(held.steps, [{ do: "Bake 1 hr.", wait: "1 hr", oven: "120C" }, { do: "Leave it in the turned-off oven.", holds: true }]);
    const heat = M.splitStep({ title: "A", steps: [{ do: "Heat the oven to 200C. Mix the dough.", hands: "5 min", preheat: "200C" }] }, 0, 22);
    assert.deepEqual(heat.steps, [{ do: "Heat the oven to 200C.", hands: "5 min", preheat: "200C" }, { do: "Mix the dough." }]);
    const later = M.splitStep({ title: "A", steps: [{ do: "Mix the dough. Preheat the oven.", preheat: "200C" }] }, 0, 14);
    assert.deepEqual(later.steps, [{ do: "Mix the dough." }, { do: "Preheat the oven.", preheat: "200C" }]);
  });

  test("splitting with the cursor at either end does nothing", () => {
    const r = soup();
    assert.deepEqual(M.splitStep(r, 1, 0), r);
    assert.deepEqual(M.splitStep(r, 1, r.steps[1].do.length), r);
  });

  test("splitting the garlic soup's step at each time: each part waits its own time", () => {
    const r = M.splitAtTimes(soup(), 1);
    assert.deepEqual(r.steps, [
      "Peel the garlic.",
      { do: "Cook garlic 5 minutes in butter.", hands: "2 min", uses: ["Garlic", "Butter", "Onion", "Potato", "Stock"], wait: "5 min", cue: "Soft but not brown", watch: true, burner: true },
      { do: "Onion 2 minutes.", wait: "2 min" },
      { do: "Potato 1 minute then add stock…", wait: "1 min" },
    ]);
  });

  test("splitting at each time: the cut comes after the time when nothing marks the end of that part", () => {
    const r = M.splitAtTimes({ title: "A", steps: [{ do: "Fry the onion 3 to 4 min then the garlic 30 sec", wait: "30 sec" }] }, 0);
    assert.deepEqual(r.steps, [{ do: "Fry the onion 3 to 4 min." , wait: "3 to 4 min" }, { do: "Then the garlic 30 sec", wait: "30 sec" }]);
  });

  test("where a step can be split at each time: only where it says two or more times", () => {
    assert.equal(M.timedParts("Cook garlic 5 minutes in butter. Onion 2 minutes, potato 1 minute then add stock…"), 3);
    assert.equal(M.timedParts("Bake 20 minutes. Check it at 10 minutes."), 1);
    assert.equal(M.timedParts("Stir."), 0);
    assert.deepEqual(M.splitAtTimes({ title: "A", steps: ["Bake 20 minutes."] }, 0), { title: "A", steps: ["Bake 20 minutes."] });
  });

  test("merging a step with the next one", () => {
    const r = M.mergeSteps({ title: "A", steps: [{ do: "Mix the dough.", uses: ["Flour"] }, { do: "Bake it.", wait: "20 min", uses: ["Flour", "Egg"] }, "Eat."] }, 0);
    assert.deepEqual(r.steps, [{ do: "Mix the dough. Bake it.", uses: ["Flour", "Egg"], wait: "20 min" }, "Eat."]);
  });

  test("where a moved step ends up: one place on, or the same place when it only crosses into or out of a group", () => {
    assert.equal(M.movedTo(keeper(), "steps", 0, 1), 0, "into the next group, still first");
    assert.equal(M.movedTo(keeper(), "steps", 1, -1), 1, "out of its group, still second");
    assert.equal(M.movedTo({ steps: ["a", "b", "c"] }, "steps", 1, 1), 2);
    assert.equal(M.movedTo({ steps: ["a", "b", "c"] }, "steps", 0, -1), 0, "the first can't go up");
  });

  // One move crosses one boundary: down into the next group puts it at the
  // group's start, the next move takes it past the group's first step.
  test("moving a step down into the next group, then further down", () => {
    const once = M.moveStep(keeper(), 0, 1);
    assert.deepEqual(once.steps, [{ group: "Finish", items: [keeper().steps[0], keeper().steps[1].items[0]] }]);
    assert.deepEqual(M.moveStep(once, 0, 1).steps, [{ group: "Finish", items: [keeper().steps[1].items[0], keeper().steps[0]] }]);
  });
});

describe("groups", () => {
  test("adding a named group with one empty entry", () => {
    const { recipe, at } = M.addGroup(keeper(), "steps", "Garnish");
    assert.deepEqual(recipe.steps.at(-1), { group: "Garnish", items: [{ do: "" }] });
    assert.equal(at, 2);
  });
  test("renaming a group, counted among the named groups", () =>
    assert.equal(M.renameGroup(keeper(), "ingredients", 0, "Sweet").ingredients[1].group, "Sweet"));
});

describe("times", () => {
  test("a time is a number of minutes, and an empty one is taken out", () => {
    let r = M.setTime({ title: "A", time: { prep: 10, cook: 20 } }, "cook", "35");
    assert.deepEqual(r.time, { prep: 10, cook: 35 });
    r = M.setTime(r, "total", "45");
    assert.deepEqual(r.time, { prep: 10, cook: 35, total: 45 });
    r = M.setTime(M.setTime(M.setTime(r, "prep", ""), "cook", ""), "total", " ");
    assert.equal(r.time, undefined);
  });
  test("a new time goes in a new time field", () =>
    assert.deepEqual(M.setTime({ title: "A" }, "total", "15"), { title: "A", time: { total: 15 } }));
  test("only prep, cook, chill, rest and total", () => assert.throws(() => M.setTime({}, "bake", "5")));
});

describe("tags", () => {
  test("setting a filter's values, and clearing it", () => {
    const r = M.setTags({ title: "A", tags: { ingredients: ["rice"] } }, "cuisine", ["thai"]);
    assert.deepEqual(r.tags, { ingredients: ["rice"], cuisine: ["thai"] });
    assert.deepEqual(M.setTags(r, "cuisine", []).tags, { ingredients: ["rice"] });
  });
});

describe("lineup fields", () => {
  test("a step's planning fields, and taking one out", () => {
    let r = M.setStepField(keeper(), 0, "oven", false);
    r = M.setStepField(r, 0, "burner", true);
    r = M.setStepField(r, 0, "hands", "");
    assert.deepEqual(r.steps[0], { do: "Stir the sugar and bitters.", uses: ["1 tsp sugar", "Bitters"], shake: "never", oven: false, burner: true });
  });
  test("a plain-text step becomes { do } when it gets one", () =>
    assert.deepEqual(M.setStepField({ steps: ["Fry."] }, 0, "burner", true).steps, [{ do: "Fry.", burner: true }]));
  test("only the lineup's step fields", () => assert.throws(() => M.setStepField(keeper(), 0, "do", "x")));

  test("holds on one step clears it from another", () => {
    const r = M.setHolds(M.setHolds(keeper(), 0), 1);
    assert.equal(r.steps[0].holds, undefined);
    assert.equal(r.steps[1].items[0].holds, true);
    assert.equal(flat(M.setHolds(r, null).steps).some((s) => s.holds), false);
  });

  test("adding a prep step puts it first, marked prep and prepOnly", () => {
    const { recipe, at } = M.addPrepStep(keeper());
    assert.equal(at, 0);
    assert.deepEqual(recipe.steps[0], { do: "", prep: true, prepOnly: true });
  });

  test("linking an ingredient to a recipe, and unlinking it", () => {
    let r = M.setIngredientField(keeper(), 0, "recipe", "bourbon-infusion");
    r = M.setIngredientField(r, 0, "alreadyMade", true);
    assert.deepEqual(r.ingredients[0], { qty: "2 oz", item: "Bourbon", ml: 60, colour: "amber", recipe: "bourbon-infusion", alreadyMade: true });
    assert.deepEqual(M.setIngredientField(r, 0, "recipe", "").ingredients[0], keeper().ingredients[0]);
  });
  test("an optional ingredient can't start on Already made", () => {
    let r = M.setIngredientField(M.setIngredientField(keeper(), 0, "recipe", "x"), 0, "alreadyMade", true);
    r = M.setIngredientField(r, 0, "optional", true);
    assert.equal(r.ingredients[0].alreadyMade, undefined);
    assert.equal(r.ingredients[0].optional, true);
  });
  test("a plain-text ingredient becomes { item } when it's linked", () =>
    assert.deepEqual(M.setIngredientField({ ingredients: ["Garlic paste"] }, 0, "recipe", "garlic-paste").ingredients, [{ item: "Garlic paste", recipe: "garlic-paste" }]));

  test("what's assumed when serve and sits are blank, as the planner assumes it", () => {
    assert.deepEqual(M.servingFallback({ category: "cooking" }), { serve: "hot", sits: "10 min" });
    assert.deepEqual(M.servingFallback({ category: "cocktails" }), { serve: "soon", sits: "5 min" });
    assert.deepEqual(M.servingFallback({ category: "baking" }), { serve: "keeps", sits: "" });
    assert.deepEqual(M.servingFallback({ category: "cooking", kind: "component" }), { serve: "keeps", sits: "" });
  });
});

describe("a step that doesn't wait, and a step done during another's wait", () => {
  const soup = () => ({
    steps: [
      { do: "Chop the onion." },
      { do: "Simmer the stock.", wait: "20 min", watch: true },
      { do: "Toast the bread.", hands: "3 min" },
    ],
  });

  test("It doesn't wait is wait: false, and taking it back leaves no wait", () => {
    const r = M.setStepField(soup(), 0, "wait", false);
    assert.deepEqual(r.steps[0], { do: "Chop the onion.", wait: false });
    assert.deepEqual(M.setStepField(r, 0, "wait", undefined).steps[0], { do: "Chop the onion." });
  });
  test("a plain-text step that doesn't wait becomes { do, wait: false }", () =>
    assert.deepEqual(M.setStepField({ steps: ["Stir."] }, 0, "wait", false).steps, [{ do: "Stir.", wait: false }]));
  test("saying a step with a wait doesn't wait takes its watch with it, since watch needs a wait", () =>
    assert.deepEqual(M.setStepField(soup(), 1, "wait", false).steps[1], { do: "Simmer the stock.", wait: false }));
  test("typing a time into a step that doesn't wait replaces the false", () =>
    assert.equal(M.updateStep(M.setStepField(soup(), 0, "wait", false), 0, { wait: "5 min" }).steps[0].wait, "5 min"));
  test("only false or nothing: a wait's time is typed in the step's Wait", () =>
    assert.throws(() => M.setStepField(soup(), 0, "wait", "5 min")));

  test("during is set and taken out", () => {
    const r = M.setStepField(soup(), 2, "during", true);
    assert.deepEqual(r.steps[2], { do: "Toast the bread.", hands: "3 min", during: true });
    assert.deepEqual(M.setStepField(r, 2, "during", undefined).steps[2], soup().steps[2]);
  });

  // During is offered only where the checker would accept it: the nearest
  // earlier step that isn't itself during (or an added prep step) has a wait
  // nobody has to watch.
  describe("which steps can be done during an earlier step's wait", () => {
    const can = (steps) => steps.map((_, n) => M.canRunDuring({ steps }, n));
    test("not the first step, which has nothing before it", () =>
      assert.deepEqual(can([{ do: "a", wait: "5 min" }]), [false]));
    test("a step after one with a wait", () =>
      assert.deepEqual(can([{ do: "a", wait: "5 min" }, { do: "b" }, "c"]), [false, true, false]));
    test("not after a wait that doesn't wait", () =>
      assert.deepEqual(can([{ do: "a", wait: false }, { do: "b" }]), [false, false]));
    test("not after a watched wait, which needs your hands", () =>
      assert.deepEqual(can([{ do: "a", wait: "5 min", watch: true }, { do: "b" }]), [false, false]));
    test("several steps in a row during the same wait", () =>
      assert.deepEqual(can([{ do: "a", wait: "30 min" }, { do: "b", during: true }, { do: "c" }]), [false, true, true]));
    test("an added prep step in between is skipped over, and isn't offered it itself, since it's done ahead", () =>
      assert.deepEqual(can([{ do: "a", wait: "30 min" }, { do: "p", prep: true, prepOnly: true }, { do: "c" }]), [false, false, true]));
    test("across groups, counted as the file does", () =>
      assert.equal(M.canRunDuring({ steps: [{ group: "Stock", items: [{ do: "a", wait: "1 hr" }] }, { group: "Bread", items: ["b"] }] }, 1), true));
    test("agrees with the checker on every case above", () => {
      const cases = [
        [{ do: "a", wait: "5 min" }, { do: "b" }],
        [{ do: "a", wait: false }, { do: "b" }],
        [{ do: "a", wait: "5 min", watch: true }, { do: "b" }],
        [{ do: "a", wait: "30 min" }, { do: "b", during: true }, { do: "c" }],
        [{ do: "a", wait: "30 min" }, { do: "p", prep: true, prepOnly: true }, { do: "c" }],
      ];
      for (const steps of cases) {
        const n = steps.length - 1;
        const marked = steps.map((s, k) => (k === n ? { ...s, during: true } : s));
        const complains = checkRecipe("x", { ...BASE, steps: marked }, VOCAB).errors.some((e) => /"during"/.test(e));
        assert.equal(M.canRunDuring({ steps }, n), !complains, JSON.stringify(steps));
      }
    });
  });
});

// Oven settings as people write them, tidied into the file's "400F" or "200C".
describe("oven temperatures in any common form", () => {
  for (const [typed, want] of [
    ["400°F", "400F"], ["400 °F", "400F"], ["400° F", "400F"], ["400 F", "400F"], ["400f", "400F"],
    ["200 degrees C", "200C"], ["200 degrees Celsius", "200C"], ["350 deg F", "350F"], ["180ºC", "180C"],
    ["425˚F", "425F"], ["220 c", "220C"], ["375 Fahrenheit", "375F"], ["160 centigrade", "160C"],
    ["  400F  ", "400F"], ["400F", "400F"], ["400 °F.", "400F"], ["Broil", "broil"], [" OFF ", "off"],
  ]) test(`"${typed}" is ${want}`, () => assert.equal(M.ovenSetting(typed), want));

  // Left as typed, so the checker still says what's wrong with it.
  for (const typed of ["400", "400°", "gas mark 6", "hot", "", "4OO F", "400 K", "400FF", "F 400", "400 / 200C"])
    test(`"${typed}" is left as it is`, () => assert.equal(M.ovenSetting(typed), typed));

  test("the oven and preheat are tidied as they're set; nothing else is", () => {
    let r = M.setStepField({ steps: ["Bake."] }, 0, "oven", "400 °F");
    r = M.setStepField(r, 0, "preheat", "200 degrees C");
    r = M.setStepField(r, 0, "hands", "5 F");
    assert.deepEqual(r.steps[0], { do: "Bake.", oven: "400F", preheat: "200C", hands: "5 F" });
  });

  // Laws, checked on random spellings. The seed is in the group's name;
  // OVEN_SEED=<seed> runs the same ones again.
  const seed = Number(process.env.OVEN_SEED) || Date.now() % 2 ** 31;
  describe(`laws (seed ${seed})`, () => {
    const opts = { seed, numRuns: 300 };
    const degrees = fc.constantFrom("", "°", "º", "˚", " degrees ", " degree ", " deg ", "deg");
    const space = fc.constantFrom("", " ", "  ");
    const units = { F: ["F", "f", "Fahrenheit", "fahrenheit", "FAHRENHEIT"], C: ["C", "c", "Celsius", "celsius", "centigrade"] };
    const spelled = fc.record({
      n: fc.integer({ min: 50, max: 600 }),
      unit: fc.constantFrom("F", "C"),
      pick: fc.nat(),
      a: space, deg: degrees, b: space, dot: fc.constantFrom("", "."), pad: space,
    }).map((x) => ({ ...x, text: `${x.pad}${x.n}${x.a}${x.deg}${x.b}${units[x.unit][x.pick % units[x.unit].length]}${x.dot}${x.pad}` }));

    test("any common spelling of a temperature comes out as its number and unit, which the checker accepts", () =>
      fc.assert(fc.property(spelled, ({ n, unit, text }) => {
        const got = M.ovenSetting(text);
        assert.equal(got, `${n}${unit}`, `"${text}"`);
        assert.deepEqual(ovenProblems(got), [], `"${text}" → "${got}"`);
      }), opts));

    test("anything else comes back exactly as typed, or as a setting the checker accepts", () =>
      fc.assert(fc.property(fc.string({ unit: fc.constantFrom(..."0123456789 °FfCcdegrsbilofKk.") }), (text) => {
        const got = M.ovenSetting(text);
        if (got !== text) assert.deepEqual(ovenProblems(got), [], `"${text}" → "${got}"`);
      }), opts));

    test("tidying twice is the same as tidying once", () =>
      fc.assert(fc.property(fc.oneof(spelled.map((x) => x.text), fc.string()), (text) => {
        assert.equal(M.ovenSetting(M.ovenSetting(text)), M.ovenSetting(text));
      }), opts));
  });
});

// Moving a recipe to another section: its tags that section doesn't have
// are dropped, and listed first so you know. Takes a list of sections, so it
// can later become picking several (docs/specs/editor-redesign.md, decision 6).
describe("moving to another section", () => {
  const carnitas = () => ({
    title: "Pork Carnitas",
    category: "cooking",
    glass: "coupe",
    tags: { cuisine: ["mexican"], flavor: ["bright", "spicy"], ingredients: ["pork"], occasion: ["weeknight"] },
    steps: ["Braise."],
  });
  const said = (lost) => lost.map((t) => `${t.dimLabel}: ${t.label}`);

  test("the tags a move would drop, by their names on the site", () =>
    assert.deepEqual(said(M.tagsLost(carnitas(), ["cocktails"], VOCAB)), ["Cuisine: Mexican", "Flavor: Bright & tangy", "Flavor: Spicy"]));
  test("each says what it is in the file too", () =>
    assert.deepEqual(M.tagsLost(carnitas(), ["cocktails"], VOCAB)[0], { dim: "cuisine", value: "mexican", dimLabel: "Cuisine", label: "Mexican" }));
  test("staying in the same section drops nothing", () => assert.deepEqual(M.tagsLost(carnitas(), ["cooking"], VOCAB), []));
  test("a tag any of the sections has is kept", () =>
    assert.deepEqual(said(M.tagsLost(carnitas(), ["cocktails", "cooking"], VOCAB)), []));
  test("a tag the vocabulary doesn't know is dropped, named as it's written", () =>
    assert.deepEqual(said(M.tagsLost({ category: "cooking", tags: { colour: ["red"], course: ["side", "pudding"] } }, ["cooking"], VOCAB)), ["colour: red", "Course: pudding"]));
  test("no tags, nothing to drop", () => {
    assert.deepEqual(M.tagsLost({ category: "cooking" }, ["baking"], VOCAB), []);
    assert.deepEqual(M.tagsLost({ category: "cooking", tags: ["old", "list"] }, ["baking"], VOCAB), []);
  });

  test("moving sets the section and drops those tags, keeping everything else where it was", () => {
    const r = M.setCategory(carnitas(), "cocktails", VOCAB);
    assert.deepEqual(r, { title: "Pork Carnitas", category: "cocktails", glass: "coupe", tags: { ingredients: ["pork"], occasion: ["weeknight"] }, steps: ["Braise."] });
    assert.deepEqual(Object.keys(r), Object.keys(carnitas()));
  });
  test("moving back doesn't bring the dropped tags back: Undo does", () =>
    assert.deepEqual(M.setCategory(M.setCategory(carnitas(), "cocktails", VOCAB), "cooking", VOCAB).tags, { ingredients: ["pork"], occasion: ["weeknight"] }));
  test("only to a section the site has", () => assert.throws(() => M.setCategory(carnitas(), "drinks", VOCAB)));
  test("Cancel on the About form puts the section and its tags back, where they were", () => {
    const moved = M.setField(M.setCategory(carnitas(), "cocktails", VOCAB), "title", "Carnitas");
    const back = M.putBack(moved, carnitas(), "about");
    assert.deepEqual(back, carnitas());
    assert.deepEqual(Object.keys(back), Object.keys(carnitas()));
  });

  // Laws, on random tags for one section moved to another. The seed is in
  // the group's name; SECTION_SEED=<seed> runs the same ones again.
  const seed = Number(process.env.SECTION_SEED) || Date.now() % 2 ** 31;
  describe(`laws (seed ${seed})`, () => {
    const SECTIONS = ["cooking", "baking", "cocktails"];
    const valuesFor = (d, c) => (d.valuesBySection ? d.valuesBySection[c] || [] : d.values || (d.groups || []).flatMap((g) => g.values));
    const tagsFor = (c) => fc.record(Object.fromEntries(VOCAB.dimensions.filter((d) => !d.computed && d.sections.includes(c) && valuesFor(d, c).length)
      .map((d) => [d.key, fc.subarray(valuesFor(d, c).map((v) => v.key), { minLength: 1 })])), { requiredKeys: [] });
    const move = fc.constantFrom(...SECTIONS).chain((from) => fc.tuple(fc.constant(from), fc.constantFrom(...SECTIONS), tagsFor(from)));
    const opts = { seed, numRuns: 300 };
    const tagErrors = (r) => checkRecipe("x", { ...BASE, category: r.category, tags: r.tags }, VOCAB).errors;

    test("a recipe whose tags the checker accepts still has none it refuses after a move", () =>
      fc.assert(fc.property(move, ([from, to, tags]) => {
        assert.deepEqual(tagErrors({ category: from, tags }), [], "the starting tags are good");
        assert.deepEqual(tagErrors(M.setCategory({ category: from, tags }, to, VOCAB)), []);
      }), opts));
    test("what's dropped is exactly what was listed, and nothing else", () =>
      fc.assert(fc.property(move, ([from, to, tags]) => {
        const lost = new Set(M.tagsLost({ category: from, tags }, [to], VOCAB).map((t) => `${t.dim}:${t.value}`));
        const before = Object.entries(tags).flatMap(([d, vs]) => vs.map((v) => `${d}:${v}`));
        const after = Object.entries(M.setCategory({ category: from, tags }, to, VOCAB).tags).flatMap(([d, vs]) => vs.map((v) => `${d}:${v}`));
        assert.deepEqual(after, before.filter((t) => !lost.has(t)));
      }), opts));
    test("moving back drops nothing more", () =>
      fc.assert(fc.property(move, ([from, to, tags]) => {
        const there = M.setCategory({ category: from, tags }, to, VOCAB);
        assert.deepEqual(M.tagsLost(there, [from], VOCAB).filter((t) => tags[t.dim]?.includes(t.value)), M.tagsLost(there, [from], VOCAB));
      }), opts));
  });
});

// "kind": "dish" stays as each file has it (decision 11).
describe("kind", () => {
  test("a file saying dish keeps saying it after Component and back", () => {
    const r = M.setKind(M.setKind({ title: "T", kind: "dish", steps: [] }, "component"), "dish", { kind: "dish" });
    assert.deepEqual(r, { title: "T", kind: "dish", steps: [] });
    assert.deepEqual(Object.keys(r), ["title", "kind", "steps"]);
  });
  test("a file without kind has none after Component and back", () =>
    assert.deepEqual(M.setKind(M.setKind({ title: "T" }, "component"), "dish", {}), { title: "T" }));
  test("a component stays where it is in the file", () =>
    assert.deepEqual(Object.keys(M.setKind({ title: "T", kind: "dish", steps: [] }, "component")), ["title", "kind", "steps"]));
  test("a component made a dish, with no original, has no kind", () =>
    assert.deepEqual(M.setKind({ kind: "component" }, "dish"), {}));
  test("only dish or component", () => assert.throws(() => M.setKind({}, "side")));
});

describe("the ingredients a step uses", () => {
  // Two ingredients called Sugar, told apart by their group.
  const bars = () => ({
    title: "Bars",
    ingredients: [
      { group: "Crust", items: [{ item: "Flour" }, { item: "Sugar" }] },
      { group: "Filling", items: [{ item: "Sugar" }, "Powdered sugar, for dusting"] },
    ],
    steps: [{ do: "Mix.", uses: ["flour", { group: "Filling", item: "Sugar", amount: "half" }, "Butter"] }],
  });

  test("are read as ingredient places, with their amounts, and the names that match nothing", () =>
    assert.deepEqual(M.usesOf(bars(), 0), { picks: [{ ing: 0, amount: "" }, { ing: 2, amount: "half" }], unmatched: ["Butter"] }));

  test("are written by name, with the group only where a name is used twice", () => {
    const r = M.setUses(bars(), 0, [{ ing: 1, amount: "" }, { ing: 3, amount: "" }, { ing: 0, amount: "1 cup" }]);
    assert.deepEqual(r.steps[0].uses, [{ group: "Crust", item: "Sugar" }, "Powdered sugar, for dusting", { item: "Flour", amount: "1 cup" }]);
  });

  test("an empty list is taken out", () => assert.equal(M.setUses(bars(), 0, []).steps[0].uses, undefined));
});

// A step's "uses" names its ingredients, so renaming, removing, moving or
// regrouping an ingredient has to change the steps that use it too, or the
// checker turns Save off. Steps that don't use it stay exactly as they were.
describe("changing an ingredient carries through to the steps that use it", () => {
  const pie = () => ({
    title: "Pie",
    ingredients: [
      { group: "Crust", items: [{ item: "Flour", reviewId: "i1" }, { item: "Sugar" }, { item: "Butter" }] },
      { group: "Filling", items: [{ item: "Sugar" }, { qty: "1 cup", item: "Whole milk" }] },
    ],
    steps: [
      { do: "Rub in the butter.", uses: ["Flour", { group: "Crust", item: "Sugar" }, "butter"] },
      { do: "Warm the milk.", uses: [{ item: "Whole milk", amount: "half" }, "Vanilla"] },
      { do: "Whisk the filling.", uses: [{ group: "Filling", item: "Sugar" }, "Whole milk"] },
      { do: "Bake.", oven: "180C" },
    ],
  });
  const usesOfStep = (r, n) => flat(r.steps)[n].uses;

  test("renaming an ingredient renames it in every step that uses it, keeping amounts", () => {
    const r = M.updateIngredient(pie(), 4, { item: "Milk" });
    assert.deepEqual(usesOfStep(r, 1), [{ item: "Milk", amount: "half" }, "Vanilla"]);
    assert.deepEqual(usesOfStep(r, 2), [{ group: "Filling", item: "Sugar" }, "Milk"]);
    assert.deepEqual(usesOfStep(r, 0), usesOfStep(pie(), 0));
    assert.deepEqual(flat(r.steps)[3], flat(pie().steps)[3]);
  });

  test("a name that matched nothing stays, so its error still says what to fix", () => {
    const r = M.updateIngredient(pie(), 4, { item: "Milk" });
    assert.ok(usesOfStep(r, 1).includes("Vanilla"));
  });

  test("renaming one of two same-named ingredients: neither needs its group any more", () => {
    const r = M.updateIngredient(pie(), 1, { item: "Brown sugar" });
    assert.deepEqual(usesOfStep(r, 0), ["Flour", "Brown sugar", "butter"]);
    // The filling's Sugar is still found by its group, so its step is left alone.
    assert.deepEqual(usesOfStep(r, 2), usesOfStep(pie(), 2));
  });

  test("renaming into a name another group uses: both get their group", () => {
    const r = M.updateIngredient(pie(), 4, { item: "Flour" });
    assert.deepEqual(usesOfStep(r, 0), [{ group: "Crust", item: "Flour" }, { group: "Crust", item: "Sugar" }, "butter"]);
    assert.deepEqual(usesOfStep(r, 1), [{ group: "Filling", item: "Flour", amount: "half" }, "Vanilla"]);
    assert.deepEqual(usesOfStep(r, 2), [{ group: "Filling", item: "Sugar" }, { group: "Filling", item: "Flour" }]);
  });

  test("typing over a name, through an empty one, keeps the link", () => {
    let r = M.updateIngredient(pie(), 4, { item: "" });
    r = M.updateIngredient(r, 4, { item: "M" });
    r = M.updateIngredient(r, 4, { item: "Milk" });
    assert.deepEqual(usesOfStep(r, 1), [{ item: "Milk", amount: "half" }, "Vanilla"]);
  });

  test("putting a renamed ingredient back as it was puts its steps back too", () => {
    const renamed = M.updateIngredient(pie(), 4, { item: "Milk" });
    assert.deepEqual(M.putBack(renamed, pie(), "ing:4").steps, pie().steps);
  });

  test("a rename keeps the intake's marks on the ingredient", () => {
    assert.equal(flat(M.updateIngredient(pie(), 0, { item: "Plain flour" }).ingredients)[0].reviewId, "i1");
  });

  test("removing an ingredient takes it out of the steps that use it", () => {
    const r = M.removeIngredient(pie(), 4);
    assert.deepEqual(usesOfStep(r, 1), ["Vanilla"]);
    assert.deepEqual(usesOfStep(r, 2), [{ group: "Filling", item: "Sugar" }]);
    assert.deepEqual(usesOfStep(r, 0), usesOfStep(pie(), 0));
  });

  test("removing one of two same-named ingredients leaves the other's steps as they were", () => {
    const r = M.removeIngredient(pie(), 1);
    assert.deepEqual(usesOfStep(r, 0), ["Flour", "butter"]);
    assert.deepEqual(usesOfStep(r, 2), usesOfStep(pie(), 2));
  });

  test("renaming an ingredient group changes the group its steps name", () => {
    const r = M.renameGroup(pie(), "ingredients", 1, "Custard");
    assert.deepEqual(usesOfStep(r, 2), [{ group: "Custard", item: "Sugar" }, "Whole milk"]);
    assert.deepEqual(usesOfStep(r, 0), usesOfStep(pie(), 0));
  });

  test("moving an ingredient into another group keeps its steps pointing at it", () => {
    // Butter, the last of the crust, moves down into the filling.
    const r = M.moveIngredient(pie(), 2, 1);
    assert.equal(M.usesOf(r, 0).unmatched.length, 0);
    assert.deepEqual(M.usesOf(r, 0).picks.map((p) => flat(r.ingredients)[p.ing].item), ["Flour", "Sugar", "Butter"]);
    assert.equal(M.usesOf(r, 2).unmatched.length, 0);
  });
});

describe("notes and before you start", () => {
  const tips = () => ({ title: "A", notes: ["Keeps a week.", { group: "Swaps", items: ["Lime for lemon.", "Honey for sugar."] }], beforeYouStart: ["Soften the butter."] });

  test("changing a line's text", () => {
    assert.deepEqual(M.setLine(tips(), "notes", 2, " Maple for sugar. ").notes, ["Keeps a week.", { group: "Swaps", items: ["Lime for lemon.", "Maple for sugar."] }]);
    assert.deepEqual(M.setLine(tips(), "beforeYouStart", 0, "Chill the bowl.").beforeYouStart, ["Chill the bowl."]);
  });

  test("adding one after another puts it next, in the same group, and says where", () => {
    const { recipe, at } = M.addLine(tips(), "notes", { after: 1 });
    assert.equal(at, 2);
    assert.deepEqual(recipe.notes, ["Keeps a week.", { group: "Swaps", items: ["Lime for lemon.", "", "Honey for sugar."] }]);
  });

  test("adding the first one to a recipe without any", () => {
    const { recipe, at } = M.addLine({ title: "A" }, "beforeYouStart");
    assert.equal(at, 0);
    assert.deepEqual(recipe, { title: "A", beforeYouStart: [""] });
  });

  test("removing the last one takes the field out", () => {
    assert.deepEqual(M.removeLine(tips(), "beforeYouStart", 0), { title: "A", notes: tips().notes });
    const r = M.removeLine(M.removeLine(M.removeLine(tips(), "notes", 0), "notes", 0), "notes", 0);
    assert.deepEqual(r, { title: "A", beforeYouStart: ["Soften the butter."] });
  });

  test("moving a note into a group and out again", () => {
    const into = M.moveLine(tips(), "notes", 0, 1);
    assert.deepEqual(into.notes, [{ group: "Swaps", items: ["Keeps a week.", "Lime for lemon.", "Honey for sugar."] }]);
    assert.deepEqual(M.moveLine(into, "notes", 0, -1).notes, tips().notes);
    assert.equal(M.movedTo(tips(), "notes", 0, 1), 0);
  });

  test("a new group of notes", () => {
    const { recipe, at } = M.addGroup(tips(), "notes", "Storing");
    assert.equal(at, 3);
    assert.deepEqual(recipe.notes.at(-1), { group: "Storing", items: [""] });
  });

  test("putting a note back as it was", () => {
    const now = M.setLine(M.setLine(tips(), "notes", 1, "Lemon for lime."), "beforeYouStart", 0, "Chill the bowl.");
    assert.deepEqual(M.putBack(now, tips(), "note:1").notes, tips().notes);
    assert.deepEqual(M.putBack(now, tips(), "note:1").beforeYouStart, ["Chill the bowl."]);
    assert.deepEqual(M.putBack(now, tips(), "start:0"), M.setLine(tips(), "notes", 1, "Lemon for lime."));
  });

  test("empty lines are left out of what's saved", () => {
    const r = { title: "A", notes: ["", { group: "Swaps", items: [" "] }, "Keeps."], beforeYouStart: [""], steps: [{ do: "" }] };
    assert.deepEqual(M.withoutEmptyLines(r), { title: "A", notes: ["Keeps."], steps: [{ do: "" }] });
    assert.equal(M.withoutEmptyLines(tips()).notes.length, 2, "nothing to leave out");
  });
});

describe("moving a line anywhere", () => {
  // In order: A, then G1: B, C, then D, then G2: E.
  const mixed = () => ({ title: "A", steps: ["A", { group: "G1", items: ["B", "C"] }, "D", { group: "G2", items: ["E"] }] });
  const flatSteps = (r) => r.steps.flatMap((e) => (e.items ? e.items.map((i) => `${e.group}:${i}`) : [e]));

  test("Move up and Move down are off at the ends, and on where a move crosses into or out of a group", () => {
    assert.equal(M.canMove(mixed(), "steps", 0, -1), false, "the first can't go up");
    assert.equal(M.canMove({ steps: ["A", "B"] }, "steps", 1, 1), false, "the last can't go down");
    assert.equal(M.canMove(mixed(), "steps", 4, 1), true, "the last, in a group, can still leave it");
    assert.equal(M.canMove(mixed(), "steps", 1, -1), true, "out of its group");
    assert.equal(M.canMove(mixed(), "steps", 4, -1), true, "out of the last group");
    assert.equal(M.canMove({ notes: ["Only one."] }, "notes", 0, 1), false);
  });

  test("the places a line can go, under their group names, with the one it's in now", () => {
    assert.deepEqual(M.moveSlots(mixed(), "steps", 2).map(({ group, before, here }) => [group, before, here]), [
      ["", 0, false], ["", null, false],
      ["G1", 1, false], ["G1", null, true],
      ["", 3, false], ["", null, false],
      ["G2", 4, false], ["G2", null, false],
    ]);
  });

  test("moving into another group, before a line or at its end", () => {
    const slots = M.moveSlots(mixed(), "steps", 0);
    const intoG2 = slots.find((s) => s.group === "G2" && s.before === 4);
    const { recipe, at } = M.moveTo(mixed(), "steps", 0, intoG2.value);
    assert.deepEqual(flatSteps(recipe), ["G1:B", "G1:C", "D", "G2:A", "G2:E"]);
    assert.equal(at, 3);
    const endG1 = slots.find((s) => s.group === "G1" && s.before === null);
    assert.deepEqual(flatSteps(M.moveTo(mixed(), "steps", 0, endG1.value).recipe), ["G1:B", "G1:C", "G1:A", "D", "G2:E"]);
  });

  test("moving out of a group, and its group goes when it's left empty", () => {
    const slots = M.moveSlots(mixed(), "steps", 4);
    const { recipe, at } = M.moveTo(mixed(), "steps", 4, slots.find((s) => s.group === "" && s.before === 0).value);
    assert.deepEqual(recipe.steps, ["E", "A", { group: "G1", items: ["B", "C"] }, "D"]);
    assert.equal(at, 0);
  });

  test("moving to where it is changes nothing", () => {
    const here = M.moveSlots(mixed(), "steps", 2).find((s) => s.here);
    assert.deepEqual(M.moveTo(mixed(), "steps", 2, here.value), { recipe: mixed(), at: 2 });
  });

  test("an ingredient moved anywhere keeps the steps that use it pointing at it", () => {
    const r = {
      title: "A",
      ingredients: [{ group: "Crust", items: [{ item: "Flour" }, { item: "Sugar" }] }, { group: "Filling", items: [{ item: "Sugar" }, { item: "Eggs" }] }],
      steps: [{ do: "Mix.", uses: ["Flour", { group: "Crust", item: "Sugar" }] }, { do: "Whisk.", uses: [{ group: "Filling", item: "Sugar" }, "Eggs"] }],
    };
    const to = M.moveSlots(r, "ingredients", 0).find((s) => s.group === "Filling" && s.before === null);
    const { recipe, at } = M.moveTo(r, "ingredients", 0, to.value);
    assert.equal(at, 3);
    assert.deepEqual(recipe.ingredients[1].items.map((i) => i.item), ["Sugar", "Eggs", "Flour"]);
    assert.deepEqual(M.usesOf(recipe, 0).picks.map((p) => p.ing), [3, 0], "the flour, now last, and the crust's sugar, now first");
    assert.deepEqual(M.usesOf(recipe, 1).picks.map((p) => p.ing), [1, 2]);
  });
});

describe("the facts: yield, the times as printed, and the minutes", () => {
  const bread = () => ({ title: "Bread", yield: "Makes 1 loaf", times: [["Active", "20 min"], ["Rise", "1 to 2 hr"]], time: { prep: 20, total: 150 }, kept: true });

  test("the facts form sets the yield, the printed times and the minutes together", () => {
    const r = M.setFacts(bread(), { yield: " Makes 2 loaves ", times: [["Active", "25 min "], ["Rise", "2 hr"]], time: { prep: "25", cook: "", total: "160" } });
    assert.deepEqual(r, { title: "Bread", yield: "Makes 2 loaves", times: [["Active", "25 min"], ["Rise", "2 hr"]], time: { prep: 25, total: 160 }, kept: true });
  });

  test("no printed times and no minutes take the fields out", () => {
    const r = M.setFacts(bread(), { yield: "", times: [], time: { prep: "", total: "" } });
    assert.deepEqual(r, { title: "Bread", kept: true });
  });

  test("a time row is added at the end, removed, and moved", () => {
    const { recipe, at } = M.addTime(bread());
    assert.equal(at, 2);
    assert.deepEqual(recipe.times.at(-1), ["", ""]);
    assert.deepEqual(M.removeTime(bread(), 0).times, [["Rise", "1 to 2 hr"]]);
    assert.equal(M.removeTime(M.removeTime(bread(), 0), 0).times, undefined, "none left takes the field out");
    assert.deepEqual(M.moveTime(bread(), 1, -1).times, [["Rise", "1 to 2 hr"], ["Active", "20 min"]]);
    assert.deepEqual(M.moveTime(bread(), 0, -1), bread(), "the first can't go up");
  });

  test("a time row left empty is left out of what's saved", () => {
    const r = { ...bread(), times: [["Active", "20 min"], ["", " "]] };
    assert.deepEqual(M.withoutEmptyLines(r).times, [["Active", "20 min"]]);
    assert.equal(M.withoutEmptyLines({ title: "A", times: [["", ""]] }).times, undefined);
  });

  test("a total shorter than its parts gets a hint; one that isn't, or isn't given, doesn't", () => {
    assert.deepEqual(M.minutesHint({ prep: 20, cook: 30, chill: 60, total: 40 }), { total: 40, parts: 110 });
    assert.equal(M.minutesHint({ prep: 20, cook: 30, total: 50 }), null);
    assert.equal(M.minutesHint({ prep: 20, cook: 30, total: 90 }), null, "a total can include time the parts don't name");
    assert.equal(M.minutesHint({ prep: 20, cook: 30 }), null, "no total: it's added up");
    assert.equal(M.minutesHint(undefined), null);
  });

  test("putting the facts back as they were", () => {
    const now = M.setField(M.setFacts(bread(), { yield: "Makes 3", times: [], time: {} }), "title", "Bread 2");
    assert.deepEqual(M.putBack(now, bread(), "facts"), { ...bread(), title: "Bread 2" });
  });
});

describe("the baking and cocktail facts", () => {
  test("the form offers its section's facts, and any other the recipe already has", () => {
    assert.deepEqual(M.factFields({ category: "baking" }), ["pan", "heatLabel", "heat"]);
    assert.deepEqual(M.factFields({ category: "cocktails" }), ["glass", "ice", "garnish", "method", "keeps", "abv", "standardDrinks"]);
    assert.deepEqual(M.factFields({ category: "cooking" }), []);
    assert.deepEqual(M.factFields({ category: "cooking", pan: "Heavy skillet" }), ["pan"]);
  });

  test("a fact is set as typed, trimmed, and an empty one is taken out", () => {
    const r = { title: "Bars", category: "baking", pan: "8 x 8 in", heatLabel: "Oven", heat: "350F" };
    assert.deepEqual(M.setFacts(r, { more: { pan: " 9 x 9 in ", heatLabel: "", heat: "" } }), { title: "Bars", category: "baking", pan: "9 x 9 in" });
    assert.deepEqual(M.setFacts(r, { more: { heatLabel: "Oven", heat: "325F" } }).heat, "325F");
  });

  test("standard drinks is a number, or nothing", () => {
    const r = { title: "Sour", category: "cocktails", standardDrinks: 1.2 };
    assert.equal(M.setFacts(r, { more: { standardDrinks: "1.5" } }).standardDrinks, 1.5);
    assert.equal("standardDrinks" in M.setFacts(r, { more: { standardDrinks: "" } }), false);
    assert.equal("standardDrinks" in M.setFacts(r, { more: { standardDrinks: "lots" } }), false);
  });

  test("the facts form leaves the yield, times and minutes alone when it isn't given them", () => {
    const r = { title: "Sour", yield: "Makes 1", times: [["Total", "5 min"]], time: { total: 5 }, glass: "Coupe" };
    assert.deepEqual(M.setFacts(r, { more: { glass: "Rocks" } }), { ...r, glass: "Rocks" });
  });

  test("Cancel puts the baking and cocktail facts back too", () => {
    const before = { title: "Sour", glass: "Coupe", abv: "20%" };
    const now = M.setFacts(before, { more: { glass: "Rocks", abv: "" } });
    assert.deepEqual(M.putBack(now, before, "facts"), before);
  });
});
