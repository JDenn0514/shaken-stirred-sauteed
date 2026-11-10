// A recipe website's page, fetched by the Worker (/api/fetch), turned into a
// draft: from its schema.org recipe data when it has some, otherwise from the
// page's visible text. Either way the source is the site's name and the address.
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { draftFromPage, pageText } from "../../tools/intake/page.mjs";

const flat = (l = []) => l.flatMap((e) => (e && Array.isArray(e.items) ? e.items : [e]));
const RECIPE = {
  "@context": "https://schema.org", "@type": "Recipe", name: "Lemon Bars", author: { "@type": "Person", name: "A. Baker" },
  recipeIngredient: ["1 cup flour", "2 lemons"], recipeInstructions: [{ "@type": "HowToStep", text: "Bake for 25 minutes." }],
};
const withData = (head = "") => `<html><head>${head}<script type="application/ld+json">${JSON.stringify(RECIPE)}</script></head><body><h1>Lemon Bars</h1></body></html>`;

describe("a page with recipe data", () => {
  test("is read from its data, with the author and the site's name as the source", () => {
    const { recipe } = draftFromPage(withData('<meta property="og:site_name" content="Example Kitchen">'), { url: "https://www.example.com/lemon-bars", category: "baking" });
    assert.equal(recipe.title, "Lemon Bars");
    assert.deepEqual(flat(recipe.ingredients).map((i) => i.item), ["flour", "lemons"]);
    assert.deepEqual(recipe.source, { name: "A. Baker, Example Kitchen", url: "https://www.example.com/lemon-bars" });
  });

  test("with no site name given, the source is named after the address", () => {
    const { recipe } = draftFromPage(withData(), { url: "https://www.example.com/lemon-bars", category: "baking" });
    assert.equal(recipe.source.name, "A. Baker, example.com");
  });

  test("the site's name can come from its recipe data's publisher", () => {
    const html = `<script type="application/ld+json">${JSON.stringify({ ...RECIPE, author: undefined, publisher: { "@type": "Organization", name: "Bake Daily" } })}</script>`;
    assert.equal(draftFromPage(html, { url: "https://bake.example/x", category: "baking" }).recipe.source.name, "Bake Daily");
  });
});

describe("a page without recipe data", () => {
  const html = `<!doctype html><html><head><title>Garlic Bread | My Blog</title>
    <meta property="og:site_name" content="My Blog"><style>.x { color: red }</style><script>var tracking = "Ingredients";</script></head>
    <body><header><nav><a href="/">Home</a> <a href="/recipes">Recipes</a></nav></header>
    <main><article><h1>Garlic Bread</h1><p>Makes 1 loaf</p>
      <h2>Ingredients</h2><ul><li>1 baguette</li><li>4 tablespoons butter, softened</li><li>3 cloves garlic, minced</li></ul>
      <h2>Instructions</h2><ol><li>Heat the oven to 400&deg;F.</li><li>Mix the butter &amp; garlic, and spread it on the bread.</li><li>Bake until golden, 10 minutes.</li></ol>
    </article></main>
    <aside>Sign up for our newsletter</aside><footer>&copy; My Blog</footer></body></html>`;
  const { recipe, flags } = draftFromPage(html, { url: "https://myblog.example/garlic-bread", category: "baking" });

  test("is read from its visible text", () => {
    assert.equal(recipe.title, "Garlic Bread");
    assert.deepEqual(flat(recipe.ingredients).map((i) => i.item), ["baguette", "butter", "garlic"]);
    const steps = flat(recipe.steps).map((s) => s.do);
    for (const written of ["Heat the oven to 400°F.", "Mix the butter & garlic, and spread it on the bread.", "Bake until golden, 10 minutes."]) {
      assert.ok(steps.includes(written), written);
    }
  });

  test("the source is the site's name and the address", () =>
    assert.deepEqual(recipe.source, { name: "My Blog", url: "https://myblog.example/garlic-bread" }));

  test("says it was read from the text, so everything needs checking", () =>
    assert.ok(flags.some((f) => /recipe data/.test(f.why))));

  test("menus, scripts, styles and footers aren't part of the text", () => {
    const text = pageText(html);
    for (const junk of ["Home", "tracking", "color: red", "newsletter", "©"]) assert.ok(!text.includes(junk), junk);
    assert.match(text, /^Garlic Bread\nMakes 1 loaf\nIngredients\n1 baguette\n/);
  });
});

// Most recipe blogs make their recipe card with WP Recipe Maker. Its recipe
// data lists every ingredient in one flat list and leaves out the notes, but
// the card on the page has the ingredient groups (a sauce's own list) and the
// numbered notes the ingredients and steps point to.
describe("a page with a WP Recipe Maker card", () => {
  const data = {
    "@context": "https://schema.org", "@type": "Recipe", name: "Sesame Noodles",
    recipeIngredient: ["200g/7oz egg noodles ((note 1))", "1 tbsp oil", "2 tbsp soy sauce", "1 tsp sugar"],
    recipeInstructions: [{ "@type": "HowToStep", text: "Mix the sauce ingredients." }, { "@type": "HowToStep", text: "Boil the noodles for 3 minutes, then toss with the sauce." }],
  };
  const li = (amount, unit, name, notes) => `<li class="wprm-recipe-ingredient">
      ${amount ? `<span class="wprm-recipe-ingredient-amount">${amount}</span>` : ""}
      ${unit ? `<span class="wprm-recipe-ingredient-unit">${unit}</span>` : ""}
      <span class="wprm-recipe-ingredient-name">${name}</span>
      ${notes ? `<span class="wprm-recipe-ingredient-notes">${notes}</span>` : ""}</li>`;
  const html = `<html><head><script type="application/ld+json">${JSON.stringify(data)}</script></head><body>
    <div class="wprm-recipe-ingredients-container">
      <div class="wprm-recipe-header">Ingredients</div>
      <div class="wprm-recipe-ingredient-group"><ul class="wprm-recipe-ingredients">
        ${li("200g/7oz", "", "egg noodles", "(note 1)")}${li("1", "tbsp", "oil", "")}
      </ul></div>
      <div class="wprm-recipe-ingredient-group">
        <div class="wprm-recipe-group-name wprm-recipe-ingredient-group-name"><em>Sesame</em> Sauce (Note 2)</div>
        <ul class="wprm-recipe-ingredients">
          ${li("2", "tbsp", '<a href="/glossary/#soy">soy sauce</a>', "")}${li("1", "tsp", "sugar", " (or honey)")}
        </ul></div>
    </div>
    <div class="wprm-recipe-notes-container">
      <div class="wprm-recipe-header">Recipe Notes</div>
      <p>1. Any thin wheat noodles work. <em>Ramen</em> noodles are fine.</p>
      <p>Don't use rice noodles.</p>
      <p>2. Adjust the sauce to your liking.</p>
    </div></body></html>`;
  const { recipe } = draftFromPage(html, { url: "https://noodles.example/sesame", category: "cooking" });

  test("keeps the card's ingredient groups, named as on the page", () => {
    // The card's first group has no name: its ingredients come first, ungrouped.
    assert.deepEqual(recipe.ingredients.map((e) => (Array.isArray(e.items) ? `group: ${e.group}` : e.item)),
      ["egg noodles", "oil", "group: Sesame Sauce (Note 2)"]);
    const sauce = recipe.ingredients.find((e) => e.group === "Sesame Sauce (Note 2)");
    assert.deepEqual(sauce.items.map((i) => i.item), ["soy sauce", "sugar"]);
  });

  test("takes each ingredient's amount, name and note from the card, as written", () => {
    const [noodles, , , sugar] = flat(recipe.ingredients);
    assert.equal(noodles.qty, "200g/7oz");
    assert.equal(noodles.item, "egg noodles");
    assert.equal(noodles.note, "note 1");
    assert.equal(sugar.qty, "1 tsp");
    assert.equal(sugar.note, "or honey");
  });

  test("keeps the card's notes, each numbered note with the paragraphs that follow it", () => {
    assert.deepEqual(recipe.notes, [
      "1. Any thin wheat noodles work. Ramen noodles are fine. Don't use rice noodles.",
      "2. Adjust the sauce to your liking.",
    ]);
  });

  test("a page without the card's notes has none", () => {
    assert.equal(draftFromPage(withData(), { url: "https://www.example.com/lemon-bars", category: "baking" }).recipe.notes, undefined);
  });
});
