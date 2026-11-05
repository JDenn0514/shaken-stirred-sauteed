// The link checker (scripts/check-links.mjs): every page, stylesheet, icon and
// recipe image the site points at has to exist.
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { checkLinks } from "../helpers/check-links.mjs";

// Checks the files and asserts exactly these "<file>: <path>" links are reported broken.
function brokenLinks(files, expected) {
  const res = checkLinks(files);
  assert.deepEqual(res.broken.sort(), expected.sort(), res.output);
  assert.equal(res.ok, expected.length === 0, res.output);
}

describe("pages", () => {
  test("a link or script that points at a missing file", () => brokenLinks({
    "index.html": '<link rel="stylesheet" href="assets/style.css"><script src="assets/gone.js"></script>',
    "assets/style.css": "",
  }, ["index.html: assets/gone.js"]));

  test("ignores other websites, email links, inline data and in-page anchors", () => brokenLinks({
    "index.html": '<a href="https://example.com/x"></a><a href="mailto:me@example.com"></a>'
      + '<img src="data:image/png;base64,AAAA"><a href="#top"></a><a href="//cdn.example.com/x.js"></a>',
  }, []));

  test("reads a link without its ?query or #anchor, and a folder link as its index.html", () => brokenLinks({
    "index.html": '<a href="recipes.html?cat=baking#list"></a><a href="./"></a><a href="guide/"></a>',
    "recipes.html": "",
    "guide/index.html": "",
  }, []));

  test("ignores <base>, which sets where links start rather than pointing at a file", () => brokenLinks({
    "moved/index.html": '<base href="/old-site/"><script src="moved.js"></script>',
    "moved/moved.js": "",
  }, []));

  test("ignores a tag shown as text, like a code example", () => brokenLinks({
    "index.html": '<pre><code>&lt;a class="card" href="recipe.html?r=…"&gt;</code></pre>',
  }, []));

  test("reads links in a subfolder's page relative to that page", () => brokenLinks({
    "guide/index.html": '<link href="../assets/style.css"><img src="logo.svg"><a href="../missing.html"></a>',
    "assets/style.css": "",
    "guide/logo.svg": "",
  }, ["guide/index.html: ../missing.html"]));
});

describe("stylesheets", () => {
  test("a font or image in url(...) that's missing, read relative to the stylesheet", () => brokenLinks({
    "assets/style.css": '@font-face { src: url("./fonts/a.woff2") format("woff2"), url(fonts/gone.woff2); }\n'
      + ".x { background: url('data:image/svg+xml,%3Csvg%3E'); mask: url(\"../missing.svg\"); }",
    "assets/fonts/a.woff2": "",
  }, ["assets/style.css: fonts/gone.woff2", "assets/style.css: ../missing.svg"]));
});

describe("app manifest", () => {
  test("a home-screen icon that's missing", () => brokenLinks({
    "manifest.webmanifest": { icons: [{ src: "assets/icon-192.png" }, { src: "assets/icon-512.png" }] },
    "assets/icon-192.png": "",
  }, ["manifest.webmanifest: assets/icon-512.png"]));
});

describe("recipes", () => {
  test("a recipe photo that's missing (photos on other websites aren't checked)", () => brokenLinks({
    "recipes/carnitas.json": { title: "Carnitas", image: "images/carnitas.jpg" },
    "recipes/tinga.json": { title: "Tinga", image: "images/tinga.jpg" },
    "recipes/salsa.json": { title: "Salsa", image: "https://example.com/salsa.jpg" },
    "recipes/vocabulary.json": { image: "not-a-recipe.jpg" },
    "images/carnitas.jpg": "",
  }, ["recipes/tinga.json: images/tinga.jpg"]));
});

describe("recipe drawings", () => {
  test("a drawing listed in assets/recipe-icons.js with no assets/icons/<name>.svg", () => brokenLinks({
    "assets/recipe-icons.js": 'module.exports = { KEYS: ["loaf", "coupe"] };',
    "assets/icons/loaf.svg": "",
  }, ["assets/recipe-icons.js: icons/coupe.svg"]));
});
