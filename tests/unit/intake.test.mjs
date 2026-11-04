// The recipe intake's text reader (tools/intake/): text copied from a photo
// (Apple Live Text), a screenshot or a recipe app, or a web page's recipe data,
// turned into a draft recipe in the site's format, with what a person must check.
// The cookbook-style examples are made up, in the layout of a real cookbook page.
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { parseRecipeText } from "../../tools/intake/parse.mjs";
import { draftFromText, draftFromSchemaOrg, forSaving } from "../../tools/intake/intake.mjs";
import { buildIndex } from "../helpers/build-index.mjs";

const flat = (l = []) => l.flatMap((e) => (e && Array.isArray(e.items) ? e.items : [e]));
const page1 = `Season: All | Active Time: 40 minutes I Total Time: 3 hours, plus time to cool
Difficulty: 2 (Easy)
Cardamom Knots
Makes 12 knots
Special Equipment:
Instant-read thermometer
Stand mixer
DOUGH
½ cup whole milk (4 oz / 113g)
1(0.25 oz / 7g) envelope instant yeast (about 2¼ teaspoons)
⅓ cup granulated sugar (2.3 oz / 66g)
2 large eggs (3.5 oz / 100g)
3 cups all-purpose flour (13.8 oz / 390g), plus more for kneading
1 teaspoon Diamond Crystal kosher salt
(0.11 oz / 3g)
1 stick unsalted butter (4 oz / 113g), cut into ½-inch pieces, at room temperature
FILLING
6 tablespoons unsalted butter (3 oz / 85g), softened
Pinch of kosher salt
Pearl sugar, for sprinkling
These knots started as a way to use up a jar of cardamom, and they turned into the thing friends ask for every winter. The dough is soft and rich, and it doesn't need a stand mixer, though one helps.
Warm the milk: In a small saucepan, gently warm the milk over low heat until it's lukewarm, about 105ºF. Pour it into a large bowl and whisk in the yeast; let it sit until foamy, 5 to 10 minutes.
Make the dough: Add the sugar and eggs and whisk. Add the flour and salt and mix until shaggy, then knead until smooth, 8 to 10 minutes.
Let it rise: Cover the bowl and leave it somewhere warm until doubled, 11/2 to 21/2 hours.
Shape the knots: Roll the dough into a 12 × 16-inch rectangle and cut it into (continues)
DO AHEAD
The knots keep for 2 days at room temperature.`;
const page2 = `12 strips. Twist each strip and tie it into a knot.
Spread each knot with the softened butter. Cover and leave them until puffy, about 1 hour.
Bake: Sprinkle with pearl sugar. Bake until deep golden. a Then let them cool on a rack,
at least 15 minutes.
1 Don't rush the rise: a cold kitchen can take the full time.`;

describe("reading a cookbook page", () => {
  const { recipe, flags } = parseRecipeText([page1, page2]);
  const ings = flat(recipe.ingredients), steps = flat(recipe.steps);
  const ing = (item) => ings.find((i) => i.item === item);

  test("the title, yield and times come from the header", () => {
    assert.equal(recipe.title, "Cardamom Knots");
    assert.equal(recipe.yield, "Makes 12 knots");
    assert.deepEqual(recipe.times, [["Active", "40 minutes"], ["Total", "3 hours, plus time to cool"]]);
    assert.deepEqual(recipe.time, { prep: 40, total: 180 });
  });

  test("special equipment becomes the equipment list", () =>
    assert.deepEqual(recipe.equipment, ["Instant-read thermometer", "Stand mixer"]));

  test("headings in capitals group the ingredients", () =>
    assert.deepEqual(recipe.ingredients.map((g) => g.group), ["Dough", "Filling"]));

  test("an ingredient line becomes amount, weight, item and note", () => {
    assert.deepEqual(ing("whole milk"), { qty: "½ cup", grams: 113, item: "whole milk" });
    assert.deepEqual(ing("unsalted butter"), { qty: "1 stick", grams: 113, item: "unsalted butter", note: "cut into ½-inch pieces, at room temperature" });
    assert.deepEqual(ing("instant yeast"), { qty: "1 envelope", grams: 7, item: "instant yeast", note: "about 2¼ teaspoons" });
    assert.deepEqual(ing("large eggs"), { qty: "2", grams: 100, item: "large eggs" });
    assert.deepEqual(ing("all-purpose flour"), { qty: "3 cups", grams: 390, item: "all-purpose flour", note: "plus more for kneading" });
    assert.deepEqual(ing("kosher salt"), { qty: "Pinch", item: "kosher salt" });
    assert.deepEqual(ing("Pearl sugar"), { item: "Pearl sugar", note: "for sprinkling" });
  });

  test("a weight that wrapped onto its own line joins its ingredient", () =>
    assert.deepEqual(ing("Diamond Crystal kosher salt"), { qty: "1 teaspoon", grams: 3, item: "Diamond Crystal kosher salt" }));

  test("the story before the method is kept apart, not made a step", () => {
    assert.match(recipe.headnote, /^These knots started/);
    assert.ok(!steps.some((s) => /These knots/.test(s.do)));
  });

  test("named paragraphs become step groups, and a page break mid-sentence is joined", () => {
    assert.deepEqual(recipe.steps.map((g) => g.group), ["Warm the milk", "Make the dough", "Let it rise", "Shape the knots", "Bake"]);
    assert.equal(flat([recipe.steps[3]])[0].do, "Roll the dough into a 12 × 16-inch rectangle and cut it into 12 strips. Twist each strip and tie it into a knot.");
    assert.equal(recipe.steps[3].items.length, 2, "the unnamed paragraph after the page break belongs to the step before it");
  });

  test("OCR slips are repaired: degrees, run-together fractions, footnote markers, missing spaces and split lines", () => {
    assert.match(steps[0].do, /about 105°F\./);
    assert.match(steps[2].do, /1 1\/2 to 2 1\/2 hours/);
    assert.equal(steps.at(-1).do, "Sprinkle with pearl sugar. Bake until deep golden. Then let them cool on a rack, at least 15 minutes.");
  });

  test("Do ahead and footnotes become notes", () =>
    assert.deepEqual(recipe.notes, [
      { group: "Do ahead", items: ["The knots keep for 2 days at room temperature."] },
      { group: "Footnotes", items: ["Don't rush the rise: a cold kitchen can take the full time."] },
    ]));

  test("every amount is flagged for a person to check", () =>
    assert.equal(flags.filter((f) => f.kind === "amount").length, ings.filter((i) => i.qty).length));

  test("a bake with no time is flagged", () =>
    assert.ok(flags.some((f) => f.kind === "time" && /Bake until deep golden/.test(f.text)), JSON.stringify(flags)));
});

describe("OCR text that's likely wrong", () => {
  test("a fraction read as a symbol is flagged, not guessed", () => {
    const { flags } = parseRecipeText("Toast\nINGREDIENTS\n% cup sugar\n¥ cup milk\n1 cup flour\nMETHOD\nMix everything.");
    assert.deepEqual(flags.filter((f) => f.kind === "unreadable").map((f) => f.text), ["% cup sugar", "¥ cup milk"]);
  });
});

describe("reading a screenshot or recipe app", () => {
  const text = `Weeknight Lasagna
Ingredients
• 1 pound sweet Italian sausage
• 1 (28 ounce) can crushed tomatoes
• 2 tablespoons white sugar
Directions
1. In a Dutch oven, cook the sausage over medium heat until browned, about 8 minutes.
2. Stir in the tomatoes and sugar. Simmer, covered, for about 1 1/2 hours.
3. Bake in the preheated oven for 25 minutes.
Source: https://example.com/recipe/weeknight-lasagna`;
  const { recipe } = parseRecipeText(text);

  test("bullets and numbers are dropped, and sections are found by their headings", () => {
    assert.equal(recipe.title, "Weeknight Lasagna");
    assert.deepEqual(flat(recipe.ingredients).map((i) => i.item), ["sweet Italian sausage", "crushed tomatoes", "white sugar"]);
    assert.deepEqual(flat(recipe.steps).map((s) => s.do.slice(0, 20)), ["In a Dutch oven, coo", "Stir in the tomatoes", "Bake in the preheate"]);
  });

  test("a can's size stays with its amount", () =>
    assert.deepEqual(flat(recipe.ingredients)[1], { qty: "1 (28 ounce) can", item: "crushed tomatoes" }));

  test("the source link is kept", () => assert.deepEqual(recipe.source, { name: "", url: "https://example.com/recipe/weeknight-lasagna" }));
});

describe("reading a web page's recipe data", () => {
  const data = {
    "@context": "https://schema.org", "@type": "Recipe", name: "Peanut Sauce", recipeYield: "2 cups",
    prepTime: "PT10M", totalTime: "PT1H10M", author: { name: "A. Cook" },
    recipeIngredient: ["1   cup    smooth peanut butter", "2   tablespoons    garlic, chopped ", "3/4  cup    water"],
    recipeInstructions: [{ "@type": "HowToSection", name: "Sauce", itemListElement: [{ "@type": "HowToStep", text: "Blend everything until smooth, about 1 minute." }] }],
  };
  const { recipe } = draftFromSchemaOrg(data, { category: "cooking", url: "https://example.com/peanut" });

  test("ingredients, steps, yield and times come across", () => {
    assert.deepEqual(flat(recipe.ingredients).map((i) => [i.qty, i.item]), [["1 cup", "smooth peanut butter"], ["2 tablespoons", "garlic"], ["3/4 cup", "water"]]);
    assert.equal(recipe.steps[0].group, "Sauce");
    assert.equal(recipe.yield, "2 cups");
    assert.deepEqual(recipe.times, [["Prep", "10 min"], ["Total", "1 hr 10 min"]]);
    assert.deepEqual(recipe.source, { name: "A. Cook", url: "https://example.com/peanut" });
  });

  test("it's found inside a whole page's HTML too", () => {
    const html = `<html><script type="application/ld+json">${JSON.stringify({ "@graph": [{ "@type": "WebPage" }, data] })}</script></html>`;
    assert.equal(draftFromSchemaOrg(html, { category: "cooking" }).recipe.title, "Peanut Sauce");
  });
});

describe("the whole intake", () => {
  test("a cookbook page becomes a draft the recipe checker accepts, with planning data", () => {
    const { recipe, flags } = draftFromText([page1, page2], { category: "baking" });
    const res = buildIndex({ "cardamom-knots": recipe });
    assert.equal(res.ok, true, res.output);
    assert.ok(flat(recipe.steps).some((s) => s.wait), "no waits were read");
    assert.ok(flags.some((f) => f.kind === "category") === false);
  });

  test("without a section, it asks for one", () =>
    assert.ok(draftFromText([page1, page2]).flags.some((f) => f.kind === "category")));
});

describe("splitting a step that does more than one thing", () => {
  const draft = (method) => draftFromText(`Test Loaf\nINGREDIENTS\n1 cup milk\n2 cups flour\nMETHOD\n${method}`, { category: "baking" });
  const texts = (d) => flat(d.recipe.steps).filter((s) => !s.prepOnly).map((s) => s.do);

  test("a wait with no time after a timed step becomes its own step", () => {
    const d = draft("Bake: Brush the loaf with egg. Bake until deeply browned, 35 to 45 minutes. Let cool completely on a wire rack.");
    assert.deepEqual(texts(d), ["Brush the loaf with egg. Bake until deeply browned, 35 to 45 minutes.", "Let cool completely on a wire rack."]);
  });

  test("warming on the stove, then pouring into a bowl to wait, becomes two steps", () => {
    const d = draft("Proof the yeast: In a small saucepan, gently warm the milk over low heat until lukewarm, about 105°F. Pour the milk into a large bowl and whisk in the yeast; let it sit until foamy, 5 to 10 minutes.");
    const steps = flat(d.recipe.steps).filter((s) => !s.prepOnly);
    assert.deepEqual(steps.map((s) => s.do.slice(0, 30)), ["In a small saucepan, gently wa", "Pour the milk into a large bow"]);
    assert.equal(steps[0].burner, true);
    assert.equal(steps[1].wait, "5 to 10 minutes");
    assert.equal(steps[1].burner, undefined);
  });

  test("an alternative in brackets doesn't change what the step uses", () => {
    const d = draft("Warm the milk: In a small saucepan, warm the milk over low heat until lukewarm (you can do this in the microwave, too). Pour the milk into a large bowl and let it sit, 5 minutes.");
    const first = flat(d.recipe.steps).find((s) => !s.prepOnly);
    assert.equal(first.burner, true);
    assert.equal(first.microwave, undefined);
  });

  test("getting ready for a wait stays in the same step", () =>
    assert.equal(texts(draft("Let it rise: Butter a large bowl and set the dough in it. Cover the bowl and let it sit somewhere warm until doubled, 1 1/2 to 2 1/2 hours.")).length, 1));

  test("taking a pan off the heat stays in the same step", () =>
    assert.equal(texts(draft("Warm the cream: Heat the milk and cream over medium, stirring now and then. Take it off the heat once it steams.")).length, 1));

  test("a split step is marked for review, with the original and its parts", () => {
    const d = draft("Bake: Bake until deeply browned, 35 to 45 minutes. Let cool completely on a wire rack.");
    const steps = flat(d.recipe.steps);
    assert.deepEqual(steps.map((s) => s.review), ["split", "split"]);
    const f = d.flags.find((x) => x.kind === "split");
    assert.equal(f.text, "Bake until deeply browned, 35 to 45 minutes. Let cool completely on a wire rack.");
    assert.deepEqual(f.parts, ["Bake until deeply browned, 35 to 45 minutes.", "Let cool completely on a wire rack."]);
  });

  test("an alternative joined to the step before is marked too", () => {
    const d = draft("1. Blend everything with ice for 5 seconds.\n2. No blender? Shake everything hard with ice instead.\n3. Pour into a glass.");
    const f = d.flags.find((x) => x.kind === "joined");
    assert.ok(f, JSON.stringify(d.flags));
    assert.equal(flat(d.recipe.steps).filter((s) => s.review === "joined").length, 1);
  });

  test("the review marks come off before the recipe is saved", () => {
    const d = draft("Bake: Bake until deeply browned, 35 to 45 minutes. Let cool completely on a wire rack.");
    const saved = forSaving(d.recipe);
    assert.ok(flat(saved.steps).every((s) => s.review === undefined));
    assert.equal(buildIndex({ "test-loaf": saved }).ok, true);
  });
});
