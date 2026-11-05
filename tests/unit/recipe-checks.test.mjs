// The shared recipe checker (assets/recipe-checks.js), used by the build script
// and later by the editor and the Worker. Every expected value here is either
// written out by hand or comes from the real build (tests/helpers/build-index.mjs),
// so the checker can never quietly drift from what the build says.
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { buildIndex, recipe } from "../helpers/build-index.mjs";

const { checkRecipe, checkLinks, linkedFrom, indexEntry, patchIndex } = createRequire(import.meta.url)("../../assets/recipe-checks.js");
const vocab = JSON.parse(readFileSync(new URL("../../recipes/vocabulary.json", import.meta.url), "utf8"));

// The build's messages for one recipe, without the "recipes/<slug>.json: " it adds.
const fromBuild = (slug, r) => {
  const res = buildIndex({ [slug]: r });
  const own = (list) => list.filter((m) => m.startsWith(`recipes/${slug}.json: `)).map((m) => m.slice(`recipes/${slug}.json: `.length));
  return { errors: own(res.errors), warnings: own(res.warnings) };
};

// An ingredient that links to another recipe, used by a step.
const linking = (title, to, extra = {}) =>
  recipe({ title, ingredients: [{ qty: "1 tbsp", item: "Paste", recipe: to, ...extra }], steps: [{ do: "Stir in the paste.", uses: ["Paste"] }] });

describe("checkRecipe", () => {
  test("a good recipe has no errors or warnings", () =>
    assert.deepEqual(checkRecipe("test-recipe", recipe(), vocab), { errors: [], warnings: [] }));

  test("a bad recipe gets the build's messages, without the file name", () => {
    const bad = recipe({ title: "", category: "drinks", steps: [], tags: { colour: ["red"] }, time: undefined });
    const result = checkRecipe("Bad_Name", bad, vocab);
    assert.deepEqual(result, {
      errors: [
        "file name must be lowercase letters, numbers and dashes",
        'missing "title"',
        '"category" must be one of baking, cooking, cocktails',
        "no steps",
        'unknown tag dimension "colour"',
      ],
      warnings: ["no key ingredients tagged", "no total time, so it can't be filtered by time"],
    });
    assert.deepEqual(result, fromBuild("Bad_Name", bad));
  });

  test("bad planning data gets the build's messages", () => {
    const bad = recipe({
      serve: "cold",
      sits: "not long",
      ingredients: [{ item: "Rice", optional: "yes" }, { item: "Chili flakes", note: "optional" }],
      steps: [
        { do: "Simmer the rice in a pan.", watch: true, hands: "a while" },
        { do: "Fry.", during: true, preheat: "off" },
        { do: "Bake.", holds: true, oven: "hot" },
        { do: "Cool.", holds: true, burner: "yes" },
      ],
    });
    const result = checkRecipe("test-recipe", bad, vocab);
    assert.deepEqual(result, {
      errors: [
        '"serve" must be one of hot, soon, keeps',
        '"sits" must be a time, like "10 min"',
        'step 1: "hands" must be a time, like "10 min"',
        'step 1: "watch" needs a "wait" to watch',
        'step 2: "preheat" can\'t be "off"; use "oven": "off" to turn it off',
        'step 2: "during" needs an earlier step with a wait to run alongside',
        'step 3: oven setting "hot" isn\'t one of "200C", "400F", "broil" or "off"',
        'step 4: "burner" must be true or false',
        'more than one step with "holds"; only the last one counts',
        '"Rice": "optional" must be true or false',
      ],
      warnings: [
        'step 1 mentions "pan" but has no equipment field (oven, preheat, burner, grill or microwave)',
        '"Chili flakes" says it\'s optional but isn\'t marked "optional": true',
      ],
    });
    assert.deepEqual(result, fromBuild("test-recipe", bad));
  });

  test("a link to another recipe isn't checked here, since that needs the index", () =>
    assert.deepEqual(checkRecipe("a", linking("a", "no-such-recipe"), vocab), { errors: [], warnings: [] }));
});

describe("indexEntry", () => {
  test("is the build's entry, with the recipes its ingredients link to", () => {
    const recipes = { a: linking("A", "b"), b: recipe({ title: "B" }) };
    const built = buildIndex(recipes);
    assert.equal(built.ok, true, built.output);
    assert.deepEqual(indexEntry("a", recipes.a, vocab), built.index[0]);
    assert.deepEqual(built.index[0].links, [{ item: "Paste", recipe: "b" }]);
    assert.deepEqual(built.index[1].links, []);
  });
});

describe("checkLinks", () => {
  test("finds a link to a recipe that doesn't exist, as the build says it", () => {
    const recipes = { a: linking("A", "no-such-recipe"), b: recipe({ title: "B" }) };
    const index = Object.entries(recipes).map(([slug, r]) => indexEntry(slug, r, vocab));
    const errors = ['recipes/a.json: "Paste" links to recipe "no-such-recipe", which doesn\'t exist'];
    assert.deepEqual(checkLinks(index), errors);
    assert.deepEqual(buildIndex(recipes).errors, errors);
  });

  test("finds a loop, as the build says it, whatever order the index is in", () => {
    const recipes = { b: linking("Apple", "c"), c: linking("Banana", "a"), a: linking("Cherry", "b") };
    const index = Object.entries(recipes).map(([slug, r]) => indexEntry(slug, r, vocab));
    const errors = ["recipe links loop: a → b → c → a"];
    assert.deepEqual(checkLinks(index), errors);
    assert.deepEqual(checkLinks(index.toReversed()), errors);
    assert.deepEqual(buildIndex(recipes).errors, errors);
  });

  test("is happy with links that exist and don't loop", () => {
    const built = buildIndex({ a: linking("A", "c"), b: linking("B", "c", { optional: true }), c: recipe({ title: "C" }) });
    assert.deepEqual(checkLinks(built.index), []);
  });
});

describe("linkedFrom", () => {
  const built = buildIndex({ a: linking("Apple Pie", "c"), b: linking("Banana Bread", "c"), c: recipe({ title: "Custard" }) });

  test("lists the recipes that link to one, and for which ingredient", () =>
    assert.deepEqual(linkedFrom(built.index, "c"), [
      { slug: "a", title: "Apple Pie", item: "Paste" },
      { slug: "b", title: "Banana Bread", item: "Paste" },
    ]));
  test("is empty when nothing links to it", () => assert.deepEqual(linkedFrom(built.index, "a"), []));
});

// The Worker saves one recipe by patching index.json; that has to give exactly
// what a full rebuild of the same recipes would.
describe("patchIndex", () => {
  const apple = recipe({ title: "Apple Pie", category: "baking", tags: {} });
  const custard = recipe({ title: "Custard", category: "baking", tags: {} });
  const banana = linking("Banana Bread", "a");
  const entryFor = (slug, r) => indexEntry(slug, r, vocab);
  const rebuilt = (recipes) => {
    const res = buildIndex(recipes);
    assert.equal(res.ok, true, res.output);
    return res.index;
  };

  test("adding a recipe", () => {
    const before = rebuilt({ a: apple, c: custard });
    assert.deepEqual(patchIndex(before, "b", entryFor("b", banana)), rebuilt({ a: apple, b: banana, c: custard }));
  });

  test("replacing a recipe, including a new title that sorts it elsewhere", () => {
    const before = rebuilt({ a: apple, b: banana, c: custard });
    const renamed = { ...apple, title: "Zucchini Pie" };
    assert.deepEqual(patchIndex(before, "a", entryFor("a", renamed)), rebuilt({ a: renamed, b: banana, c: custard }));
  });

  test("removing a recipe", () => {
    const before = rebuilt({ a: apple, b: banana, c: custard });
    assert.deepEqual(patchIndex(before, "c", null), rebuilt({ a: apple, b: banana }));
  });

  test("leaves the index it was given alone", () => {
    const before = rebuilt({ a: apple, c: custard });
    const copy = structuredClone(before);
    patchIndex(before, "b", entryFor("b", banana));
    patchIndex(before, "c", null);
    assert.deepEqual(before, copy);
  });
});
