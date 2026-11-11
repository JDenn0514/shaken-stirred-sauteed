// The recipe checker (scripts/build-index.mjs): what it rejects, what it only
// warns about, and what it writes into recipes/index.json.
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { buildIndex, recipe } from "../helpers/build-index.mjs";

// Builds one recipe and asserts the build fails with a message matching `pattern`.
function rejects(r, pattern, slug = "test-recipe") {
  const res = buildIndex({ [slug]: r });
  assert.equal(res.ok, false, `expected the build to fail, got:\n${res.output}`);
  assert.ok(res.errors.some((e) => pattern.test(e)), `no error matching ${pattern} in:\n${res.output}`);
}

// Builds one recipe, asserts it passes, and returns its index entry.
function entry(r) {
  const res = buildIndex({ "test-recipe": r });
  assert.equal(res.ok, true, `expected the build to pass, got:\n${res.output}`);
  return res.index[0];
}

describe("accepts", () => {
  test("a minimal valid recipe", () => {
    const e = entry(recipe());
    assert.equal(e.slug, "test-recipe");
    assert.equal(e.title, "Test Recipe");
    assert.equal(e.kind, "dish");
  });

  test("grouped ingredients and steps, and object-style entries", () => {
    entry(recipe({
      ingredients: [{ group: "For the sauce", items: [{ qty: "1 cup", item: "Stock" }, "Salt"] }],
      steps: [{ do: "Simmer.", wait: "10 min", cue: "Thickened" }],
    }));
  });
});

describe("rejects", () => {
  test("a file name with capitals or underscores", () => rejects(recipe(), /file name/, "Bad_Name"));
  test("broken JSON", () => rejects("{ not json", /not valid JSON/));
  test("a missing title", () => rejects(recipe({ title: "" }), /missing "title"/));
  test("an unknown category", () => rejects(recipe({ category: "drinks" }), /"category" must be one of/));
  test("an unknown kind", () => rejects(recipe({ kind: "snack" }), /"kind" must be one of/));
  test("no ingredients", () => rejects(recipe({ ingredients: [] }), /no ingredients/));
  test("no steps", () => rejects(recipe({ steps: [] }), /no steps/));
  test("an ingredient object without an item", () =>
    rejects(recipe({ ingredients: [{ qty: "1 cup" }] }), /every ingredient needs/));
  test("a step object without a do", () => rejects(recipe({ steps: [{ wait: "5 min" }] }), /every step needs/));
  test("a total time that isn't a number", () => rejects(recipe({ time: { total: "30" } }), /"time.total" must be a number/));
  test("a javascript: source link", () =>
    rejects(recipe({ source: { name: "x", url: "javascript:alert(1)" } }), /"source.url" must start with/));
  test("an image that isn't an images/ path or https URL", () =>
    rejects(recipe({ image: "http://example.com/a.jpg" }), /"image" must be/));
  test("a badly formatted added date", () => rejects(recipe({ added: "31/10/2026" }), /"added" should look like/));
  test("an unknown icon", () => rejects(recipe({ icon: "spaceship" }), /"icon" must be one of/));
  test("tags written as a list instead of an object", () => rejects(recipe({ tags: ["thai"] }), /"tags" must be an object/));
  test("an unknown filter", () => rejects(recipe({ tags: { colour: ["red"] } }), /unknown tag dimension "colour"/));
  test("a filter that is worked out automatically", () =>
    rejects(recipe({ tags: { time: ["under-30"] } }), /"time" is worked out automatically/));
  test("a filter from another section", () =>
    rejects(recipe({ category: "baking", tags: { spirit: ["rum"] } }), /"spirit" isn't a baking filter/));
  test("a filter value that isn't a list", () => rejects(recipe({ tags: { cuisine: "thai" } }), /tags.cuisine must be a list/));
  test("a value that isn't in the vocabulary", () =>
    rejects(recipe({ tags: { cuisine: ["martian"] } }), /"martian" isn't an allowed cuisine value/));
  test("a flavor that belongs to another section", () =>
    rejects(recipe({ tags: { flavor: ["spirit-forward"] } }), /"spirit-forward" isn't an allowed flavor value for cooking/));
});

// A step's "uses" names the ingredients it needs, for cook mode.
describe("ingredients a step uses", () => {
  const crustAndFilling = [
    { group: "Crust", items: [{ qty: "1 cup", item: "Flour" }, { qty: "1/4 cup", item: "Sugar" }] },
    { group: "Filling", items: [{ qty: "1 cup", item: "Sugar" }, "Powdered sugar, for dusting"] },
  ];
  const withUses = (uses) => recipe({ ingredients: crustAndFilling, steps: [{ do: "Mix.", uses }] });

  test("accepts ingredients named by item, by group and item, or as written", () =>
    entry(withUses(["flour", { group: "Filling", item: "Sugar" }, "Powdered sugar, for dusting"])));
  test("accepts a step's own share of an ingredient", () =>
    entry(withUses([{ group: "Crust", item: "Sugar", amount: "2 Tbsp" }])));
  test("rejects uses that isn't a list", () => rejects(withUses("Flour"), /step 1: "uses" must be a list/));
  test("rejects an ingredient the recipe doesn't have", () =>
    rejects(withUses(["Butter"]), /step 1 uses "Butter", which isn't one of the ingredients/));
  test("rejects a name that matches two ingredients", () =>
    rejects(withUses(["Sugar"]), /step 1 uses "Sugar", which matches 2 ingredients: add its "group"/));
  test("rejects a group the recipe doesn't have", () =>
    rejects(withUses([{ group: "Topping", item: "Sugar" }]), /step 1 uses "Sugar" from "Topping", which isn't one of the ingredients/));
  test("rejects an entry with no item", () => rejects(withUses([{ amount: "1 cup" }]), /step 1: every entry in "uses" needs an "item"/));
  test("rejects an amount that isn't text", () =>
    rejects(withUses([{ item: "Flour", amount: 2 }]), /step 1: "amount" must be text/));
  test("counts steps across groups", () =>
    rejects(recipe({ ingredients: crustAndFilling, steps: ["Heat the oven.", { group: "Mix", items: [{ do: "Mix.", uses: ["Butter"] }] }] }),
      /step 2 uses "Butter"/));
});

describe("warns but still passes", () => {
  test("no key ingredients tagged", () => {
    const res = buildIndex({ "test-recipe": recipe({ tags: {} }) });
    assert.equal(res.ok, true, res.output);
    assert.ok(res.warnings.some((w) => /no key ingredients tagged/.test(w)), res.output);
  });

  test("no total time", () => {
    const res = buildIndex({ "test-recipe": recipe({ time: undefined }) });
    assert.equal(res.ok, true, res.output);
    assert.ok(res.warnings.some((w) => /no total time/.test(w)), res.output);
  });
});

describe("total time", () => {
  test("adds up prep, cook, chill and rest when there's no total", () =>
    assert.equal(entry(recipe({ time: { prep: 10, cook: 20, chill: 30, rest: 5 } })).totalMinutes, 65));
  test("uses total when it's given", () =>
    assert.equal(entry(recipe({ time: { prep: 10, cook: 20, total: 90 } })).totalMinutes, 90));
  test("is empty when there are no times", () => assert.equal(entry(recipe({ time: undefined })).totalMinutes, null));
});

describe("time filter", () => {
  const timeOf = (total) => entry(recipe({ time: { total } })).facets.time;
  test("30 min counts as under 30 and under 1 hr", () => assert.deepEqual(timeOf(30), ["under-30", "under-60"]));
  test("31 min counts as under 1 hr only", () => assert.deepEqual(timeOf(31), ["under-60"]));
  test("60 min counts as under 1 hr", () => assert.deepEqual(timeOf(60), ["under-60"]));
  test("61 min has no time filter", () => assert.equal(timeOf(61), undefined));
});

describe("cocktail strength filter", () => {
  const strengthOf = (standardDrinks) =>
    entry(recipe({ category: "cocktails", standardDrinks, tags: { ingredients: ["lime"] } })).facets.strength;
  test("under 1 standard drink is light", () => assert.deepEqual(strengthOf(0.9), ["light"]));
  test("exactly 1 is medium", () => assert.deepEqual(strengthOf(1), ["medium"]));
  test("exactly 2 is medium", () => assert.deepEqual(strengthOf(2), ["medium"]));
  test("over 2 is strong", () => assert.deepEqual(strengthOf(2.1), ["strong"]));
  test("no standard drinks means no strength", () => assert.equal(strengthOf(undefined), undefined));
  test("food never gets a strength", () => assert.equal(entry(recipe({ standardDrinks: 3 })).facets.strength, undefined));
});

describe("index entry", () => {
  test("components get the component kind filter", () =>
    assert.deepEqual(entry(recipe({ kind: "component" })).facets.kind, ["component"]));

  test("search text includes the title, ingredients and tag labels, in lower case", () => {
    const e = entry(recipe({
      title: "Pork Carnitas",
      ingredients: [{ qty: "3 lb", item: "Pork Shoulder", note: "cubed" }],
      tags: { cuisine: ["chinese-taiwanese"], ingredients: ["pork"] },
    }));
    for (const word of ["pork carnitas", "3 lb pork shoulder cubed", "chinese & taiwanese"]) {
      assert.ok(e.search.includes(word), `"${word}" missing from search text: ${e.search}`);
    }
  });

  test("picks a drawing from the cocktail's glass", () =>
    assert.equal(entry(recipe({ category: "cocktails", glass: "Coupe", tags: {} })).icon, "coupe"));

  test("recipes are sorted by title", () => {
    const res = buildIndex({ b: recipe({ title: "Banana Bread" }), a: recipe({ title: "Apple Pie" }), c: recipe({ title: "Cherry Tart" }) });
    assert.deepEqual(res.index.map((e) => e.title), ["Apple Pie", "Banana Bread", "Cherry Tart"]);
  });
});

// Planning data for the lineup (docs/specs/meal-planner-design.md, "Recipe data
// changes"): how long your hands are busy, equipment, prep, and links between
// recipes through their ingredients.
describe("planning data", () => {
  const withStep = (step) => recipe({ steps: [{ do: "Cook the rice.", ...step }] });
  const passes = (recipes) => {
    const res = buildIndex(recipes);
    assert.equal(res.ok, true, `expected the build to pass, got:\n${res.output}`);
    return res;
  };
  const warnsAbout = (recipes, pattern) =>
    assert.ok(passes(recipes).warnings.some((w) => pattern.test(w)), `no warning matching ${pattern} in:\n${buildIndex(recipes).output}`);
  const quiet = (recipes, pattern) =>
    assert.ok(!passes(recipes).warnings.some((w) => pattern.test(w)), `unexpected warning matching ${pattern}`);

  test("accepts every field written the way the planner reads it", () => passes({
    "test-recipe": recipe({
      serve: "hot", sits: "10 min",
      ingredients: [{ qty: "1 cup", item: "Rice" }, { qty: "2 tbsp", item: "Chili oil", recipe: "chili-oil", optional: true }],
      steps: [
        { do: "Rinse the rice.", hands: "2 min", prep: true, uses: ["Rice"] },
        { do: "Chop the scallions.", hands: "1 min", prep: "just before", prepOnly: true },
        { do: "Heat the oven.", hands: "30 sec", preheat: "200C" },
        { do: "Simmer the rice in a pan.", hands: "1 to 2 min", wait: "15 min", watch: true, burner: true },
        { do: "Bake in the oven.", hands: "1 min", wait: "10 min", oven: "400F", holds: true },
        { do: "Broil the top.", hands: "1 min", wait: "2 min", oven: "broil" },
        { do: "Turn the oven off and leave it in.", wait: "1 hr", oven: "off" },
        { do: "Warm it in the microwave.", microwave: true, wait: "1 min" },
        { do: "Char it on the grill.", grill: true, uses: ["Chili oil"] },
      ],
    }),
    "chili-oil": recipe({ title: "Chili Oil", kind: "component", serve: "keeps" }),
  }));

  test("accepts a step saved as not waiting", () => passes({ "test-recipe": withStep({ wait: false }) }));
  test("rejects a wait it can't read", () => rejects(withStep({ wait: "a while" }), /step 1: "wait" must be a time, like "10 min", or false/));
  test("rejects a wait of true", () => rejects(withStep({ wait: true }), /step 1: "wait" must be a time/));
  test("rejects watch on a step saved as not waiting", () => rejects(withStep({ wait: false, watch: true }), /step 1: "watch" needs a "wait"/));
  test("rejects a hands time it can't read", () => rejects(withStep({ hands: "a while" }), /step 1: "hands" must be a time/));
  test("rejects a hands time that isn't text", () => rejects(withStep({ hands: 5 }), /step 1: "hands" must be a time/));
  test("rejects a sits time it can't read", () => rejects(recipe({ sits: "not long" }), /"sits" must be a time/));
  test("rejects an unknown serve", () => rejects(recipe({ serve: "cold" }), /"serve" must be one of hot, soon, keeps/));
  test("rejects an oven setting it doesn't know", () =>
    rejects(withStep({ oven: "hot", wait: "5 min" }), /step 1: oven setting "hot"/));
  test("rejects an oven temperature without a unit", () => rejects(withStep({ oven: "200" }), /step 1: oven setting "200"/));
  test("rejects a preheat setting it doesn't know", () => rejects(withStep({ preheat: "medium" }), /step 1: oven setting "medium"/));
  test("rejects heating the oven to off", () => rejects(withStep({ preheat: "off" }), /step 1: "preheat" can't be "off"/));
  test("rejects watch on a step without a wait", () => rejects(withStep({ watch: true }), /step 1: "watch" needs a "wait"/));
  test("rejects prep that isn't true or \"just before\"", () =>
    rejects(withStep({ prep: "early" }), /step 1: "prep" must be true or "just before"/));
  test("rejects an equipment flag that isn't true or false", () =>
    rejects(withStep({ burner: "yes" }), /step 1: "burner" must be true or false/));
  test("accepts during on a step after one with a wait, skipping added prep steps", () =>
    passes({ "test-recipe": recipe({ steps: [
      { do: "Simmer.", wait: "20 min" }, { do: "Chop the scallions.", prep: true, prepOnly: true },
      { do: "Fry the pork.", during: true }, { do: "Glaze it.", during: true }, { do: "Serve." },
    ] }) }));
  test("rejects during that isn't true or false", () =>
    rejects(recipe({ steps: [{ do: "Simmer.", wait: "20 min" }, { do: "Fry.", during: "yes" }] }), /step 2: "during" must be true or false/));
  test("rejects during on the first step", () =>
    rejects(withStep({ during: true }), /step 1: "during" needs an earlier step with a wait to run alongside/));
  test("rejects during after a step with no wait", () =>
    rejects(recipe({ steps: [{ do: "Chop." }, { do: "Fry.", during: true }] }), /step 2: "during" needs an earlier step with a wait to run alongside/));
  test("rejects during after a watched wait, which needs your hands", () =>
    rejects(recipe({ steps: [{ do: "Sear.", wait: "4 min", watch: true }, { do: "Chop.", during: true }] }), /step 2: "during" can't run alongside a watched wait/));
  test("rejects more than one holds in a recipe", () =>
    rejects(recipe({ steps: [{ do: "Bake.", holds: true }, { do: "Cool.", holds: true }] }), /more than one step with "holds"/));
  test("counts holds across step groups", () =>
    rejects(recipe({ steps: [{ group: "A", items: [{ do: "Bake.", holds: true }] }, { group: "B", items: [{ do: "Cool.", holds: true }] }] }),
      /more than one step with "holds"/));

  describe("recipe links", () => {
    const linking = (slug, to, extra = {}) =>
      recipe({ title: slug, ingredients: [{ qty: "1 tbsp", item: "Paste", recipe: to, ...extra }], steps: [{ do: "Stir in the paste.", uses: ["Paste"] }] });

    test("rejects a link to a recipe that doesn't exist", () =>
      rejects(linking("test-recipe", "no-such-recipe"), /"Paste" links to recipe "no-such-recipe", which doesn't exist/));
    test("rejects a list of recipes, which the planner can't follow yet", () =>
      rejects(linking("test-recipe", ["a", "b"]), /"Paste": "recipe" must be one recipe's file name/));
    test("accepts a nested recipe that starts on Already made", () =>
      passes({ a: linking("a", "b", { alreadyMade: true }), b: recipe({ title: "b" }) }));
    test("rejects alreadyMade that isn't true or false", () =>
      rejects(linking("test-recipe", "paste", { alreadyMade: "yes" }), /"Paste": "alreadyMade" must be true or false/));
    test("rejects alreadyMade without a recipe link", () =>
      rejects(recipe({ ingredients: [{ item: "Rice", alreadyMade: true }] }), /"Rice": "alreadyMade" needs a "recipe"/));
    test("rejects alreadyMade on an optional link, which is never made unless you add it", () =>
      rejects(linking("test-recipe", "paste", { optional: true, alreadyMade: true }), /"Paste": "alreadyMade" is only for required ingredients/));
    test("rejects an optional flag that isn't true or false", () =>
      rejects(recipe({ ingredients: [{ item: "Rice", optional: "yes" }] }), /"Rice": "optional" must be true or false/));
    test("rejects a recipe that links to itself", () =>
      rejects(linking("test-recipe", "test-recipe"), /recipe links loop: test-recipe → test-recipe/));
    test("rejects links that loop through other recipes", () => {
      const res = buildIndex({ a: linking("a", "b"), b: linking("b", "c"), c: linking("c", "a") });
      assert.equal(res.ok, false, res.output);
      assert.ok(res.errors.some((e) => /recipe links loop: a → b → c → a/.test(e)), res.output);
    });
    test("accepts a recipe linked from two others", () =>
      passes({ a: linking("a", "c"), b: linking("b", "c", { optional: true }), c: recipe({ title: "c" }) }));
    test("warns when no step uses a linked ingredient", () =>
      warnsAbout({ "test-recipe": recipe({ ingredients: [{ item: "Paste", recipe: "paste" }] }), paste: recipe({ title: "Paste" }) },
        /"Paste" links to a recipe but no step uses it/));
  });

  describe("warns about equipment the text mentions but the step doesn't say", () => {
    for (const [what, text] of [
      ["the oven", "Bake in the oven until golden."],
      ["the broiler", "Broil until bubbling."],
      ["a skillet", "Warm the oil in a skillet."],
      ["a pan", "Melt the butter in a pan."],
      ["a saucepan", "Bring the juice to a simmer in a saucepan."],
      ["the grill", "Grill the corn, turning."],
      ["the microwave", "Microwave on high."],
    ]) {
      test(what, () => warnsAbout({ "test-recipe": withStep({ do: text }) }, /step 1 mentions .* but has no equipment field/));
    }
    test("not when the step has an equipment field", () =>
      quiet({ "test-recipe": withStep({ do: "Melt the butter in a pan.", burner: true }) }, /equipment field/));
    test("not when the field says the step doesn't use it", () =>
      quiet({ "test-recipe": withStep({ do: "Press the dough into the pan.", burner: false }) }, /equipment field/));
    test("not when oven: false says a step that mentions the oven doesn't use it", () =>
      quiet({ "test-recipe": withStep({ do: "Set the dough somewhere warm, away from the oven.", oven: false }) }, /equipment field/));
    test("not for words that only contain one", () =>
      quiet({ "test-recipe": withStep({ do: "Pour the pancake batter over the panko." }) }, /equipment field/));
  });

  describe("warns about optional ingredients not marked optional", () => {
    test("in the amount", () =>
      warnsAbout({ "test-recipe": recipe({ ingredients: [{ qty: "optional", item: "Lemon curd" }] }) }, /"Lemon curd" says it's optional/));
    test("in the note", () =>
      warnsAbout({ "test-recipe": recipe({ ingredients: [{ item: "Chili flakes", note: "optional" }] }) }, /"Chili flakes" says it's optional/));
    test("in a plain-text ingredient", () =>
      warnsAbout({ "test-recipe": recipe({ ingredients: ["Mint, to garnish (optional)"] }) }, /"Mint, to garnish \(optional\)" says it's optional/));
    // Saying it as well as marking it is refused by the format rules ("optional is said once").
    test("not when it's marked optional", () => {
      const res = buildIndex({ "test-recipe": recipe({ ingredients: [{ item: "Chili flakes", note: "optional", optional: true }] }) });
      assert.ok(!res.warnings.some((w) => /says it's optional/.test(w)), res.output);
    });
  });
});

// How a recipe is written, so every recipe reads the same way. A recipe that breaks one is refused.
describe("format", () => {
  const ingredient = (i) => buildIndex({ "test-recipe": recipe({ ingredients: [i] }) });
  const refuses = (i, message) => {
    const res = ingredient(i);
    assert.equal(res.ok, false, `expected the build to fail, got:\n${res.output}`);
    assert.ok(res.errors.includes(`recipes/test-recipe.json: ${message}`), `no error "${message}" in:\n${res.output}`);
  };
  const quiet = (i) => {
    const res = ingredient(i);
    assert.equal(res.ok, true, res.output);
    assert.deepEqual(res.warnings.filter((w) => w.startsWith("recipes/")), [], res.output);
  };

  describe("units are lowercase", () => {
    test("refuses a capital in the amount", () =>
      refuses({ qty: "4 Tbsp", item: "Butter" }, '"Butter": write "4 Tbsp" in lowercase, "4 tbsp"'));
    test("is happy with lowercase", () => quiet({ qty: "1 1/2 tbsp", item: "Butter" }));
  });

  describe("ingredient names start with a capital", () => {
    test("refuses a lowercase name", () =>
      refuses({ qty: "2 tbsp", item: "olive oil" }, '"olive oil": start the name with a capital, "Olive oil"'));
    test("is happy with a capital, or a name that starts with a number", () => {
      quiet({ qty: "2 tbsp", item: "Olive oil" });
      quiet({ qty: "8", item: "10 in tortillas" });
    });
  });

  describe("prep goes in the note", () => {
    test("refuses prep after a comma in the name", () =>
      refuses({ qty: "2", item: "Carrots, peeled and chopped" }, '"Carrots, peeled and chopped": move "peeled and chopped" into "note"'));
    test("refuses how much to use after a comma", () =>
      refuses({ qty: "1 tsp", item: "Salt, plus more to taste" }, '"Salt, plus more to taste": move "plus more to taste" into "note"'));
    test("moves only the prep when the name has a comma of its own", () =>
      refuses({ qty: "1 lb", item: "Boneless, skinless chicken thighs, thinly sliced" },
        '"Boneless, skinless chicken thighs, thinly sliced": move "thinly sliced" into "note"'));
    test("counts ground as prep", () =>
      refuses({ qty: "1 tsp", item: "Black pepper, freshly ground, to taste" },
        '"Black pepper, freshly ground, to taste": move "freshly ground, to taste" into "note"'));
    test("leaves commas in brackets alone", () =>
      quiet({ qty: "1 tsp", item: "Granulated garlic (or 2 cloves, finely minced)" }));
    test("is happy with a comma that's part of the name", () => {
      quiet({ qty: "1 lb", item: "Boneless, skinless chicken thighs" });
      quiet({ qty: "1 cup", item: "Fresh herbs: parsley, mint or dill" });
    });
  });

  describe("grams and ml go in their own fields", () => {
    test("refuses grams in the amount", () =>
      refuses({ qty: "300g/10.5oz", item: "Yellow noodles" }, '"Yellow noodles": put the grams in "300g/10.5oz" in "grams" (a number), not "qty"'));
    test("refuses ml in the amount", () =>
      refuses({ qty: "40 ml", item: "Soy sauce" }, '"Soy sauce": put the ml in "40 ml" in "ml" (a number), not "qty"'));
    test("is happy with grams in their own field", () => quiet({ grams: 300, qty: "10.5 oz", item: "Yellow noodles" }));
    test("is happy with a unit that ends in g", () => quiet({ qty: "2 large", item: "Eggs" }));
  });

  describe("amounts are written out", () => {
    test("refuses ~ for about", () =>
      refuses({ qty: "~2 cups", item: "Broth" }, '"Broth": write "about" instead of "~" in "~2 cups"'));
    test("refuses a fraction character", () =>
      refuses({ qty: "1 ½ cups", item: "Flour" }, '"Flour": write fractions with a slash, like "1 1/2", not "½"'));
    test("is happy with about and slash fractions", () => quiet({ qty: "about 1 1/2 cups", item: "Flour" }));
  });

  describe("optional is said once, by \"optional\": true", () => {
    test("refuses it when the amount says it too", () =>
      refuses({ qty: "optional", item: "Lemon curd", optional: true },
        '"Lemon curd" is marked "optional": true, which the page shows, so the text doesn\'t need to say "optional"'));
    test("refuses it when the note says it too", () =>
      refuses({ item: "Chili flakes", note: "optional, for heat", optional: true },
        '"Chili flakes" is marked "optional": true, which the page shows, so the text doesn\'t need to say "optional"'));
    test("is happy with just the flag", () => quiet({ qty: "to taste", item: "Whipped cream", optional: true }));
  });
});

