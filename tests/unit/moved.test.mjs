// The page GitHub Pages shows at the old address (moved/), sending each visitor
// to the same page on the new domain.
import { test } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";

const { newAddress } = createRequire(import.meta.url)("../../moved/moved.js");
const OLD = "https://jdenn0514.github.io";
const at = (path) => newAddress(new URL(path, OLD));

test("the home page goes to the new home page", () => {
  assert.equal(at("/shaken-stirred-sauteed/"), "https://shaken-stirred-sauteed.com/");
  assert.equal(at("/shaken-stirred-sauteed"), "https://shaken-stirred-sauteed.com/");
});

test("a recipe keeps its page and its query", () =>
  assert.equal(at("/shaken-stirred-sauteed/recipe.html?r=lemon-bars"), "https://shaken-stirred-sauteed.com/recipe.html?r=lemon-bars"));

test("the recipes page keeps its filters and anchor", () =>
  assert.equal(at("/shaken-stirred-sauteed/recipes.html?cat=baking&q=lemon#top"), "https://shaken-stirred-sauteed.com/recipes.html?cat=baking&q=lemon#top"));

test("a path from another site on github.io goes to the new home page, not a made-up page", () =>
  assert.equal(at("/some-other-repo/page.html"), "https://shaken-stirred-sauteed.com/"));
