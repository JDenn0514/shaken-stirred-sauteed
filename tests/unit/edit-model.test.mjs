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

  test("a plain-text step becomes { do } when it gets a wait", () => {
    const r = M.updateStep({ title: "A", steps: ["Boil."] }, 0, { do: "Boil.", wait: "5 min", cue: "" });
    assert.deepEqual(r.steps, [{ do: "Boil.", wait: "5 min" }]);
  });

  test("adding a step", () => {
    const { recipe, at } = M.addStep(keeper());
    assert.equal(at, 2);
    assert.deepEqual(recipe.steps[1].items[1], { do: "" });
  });

  test("splitting a step: the first part keeps what it uses, the second its wait", () => {
    const r = M.splitStep({ title: "A", steps: [{ do: "Mix the dough. Bake it.", uses: ["Flour"], hands: "5 min", wait: "20 min", cue: "Golden", oven: "200C" }] }, 0, 14);
    assert.deepEqual(r.steps, [
      { do: "Mix the dough.", uses: ["Flour"], hands: "5 min" },
      { do: "Bake it.", wait: "20 min", cue: "Golden", oven: "200C" },
    ]);
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
