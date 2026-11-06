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
