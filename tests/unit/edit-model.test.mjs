// The editor's changes to a recipe (assets/edit-model.mjs). Each takes a
// recipe and returns a changed copy. Ingredients and steps are found by their
// place in the file, counting across groups from 0 (as the recipe page's
// data-ing and data-step do). Fields the editor has no control for must come
// out exactly as they went in.
import { test, describe } from "node:test";
import assert from "node:assert/strict";
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
