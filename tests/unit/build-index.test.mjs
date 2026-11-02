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
