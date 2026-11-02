// Shared setup for every browser test:
// - the page only ever talks to the local test server; requests anywhere else are blocked
// - the site loads a small, fixed set of test recipes instead of the real ones, so tests
//   don't break when recipes are added. The set is built by the real build script.
import { test as base, expect } from "@playwright/test";
import { buildIndex, recipe } from "../helpers/build-index.mjs";

const RECIPES = {
  "thai-basil-chicken": recipe({
    title: "Thai Basil Chicken", added: "2026-01-03", time: { total: 25 },
    ingredients: ["1 lb chicken thighs", "1 cup Thai basil"],
    tags: { cuisine: ["thai"], course: ["full-meal"], ingredients: ["chicken"] },
  }),
  "chicken-tinga": recipe({
    title: "Chicken Tinga", added: "2026-01-10", time: { total: 45 },
    ingredients: ["2 lb chicken breast", "2 chipotles in adobo"],
    tags: { cuisine: ["mexican"], course: ["protein"], ingredients: ["chicken", "chile"] },
  }),
  "pork-carnitas": recipe({
    title: "Pork Carnitas", added: "2026-02-01", time: { total: 180 },
    ingredients: ["3 lb pork shoulder", "1 orange"],
    tags: { cuisine: ["mexican"], course: ["protein"], ingredients: ["pork"] },
  }),
  "salsa-verde": recipe({
    title: "Salsa Verde", kind: "component", time: undefined,
    ingredients: ["1 lb tomatillos", "1 bunch cilantro"],
    tags: { cuisine: ["mexican"], course: ["sauce"], ingredients: ["fresh-herbs"] },
  }),
  "lemon-bars": recipe({
    title: "Lemon Bars", category: "baking", added: "2026-03-01", time: { total: 90 },
    ingredients: ["4 lemons", "1 cup sugar"],
    tags: { type: ["cookies-bars"], ingredients: ["lemon"] },
  }),
  daiquiri: recipe({
    title: "Daiquiri", category: "cocktails", added: "2025-12-01", time: { total: 5 }, standardDrinks: 1.5,
    ingredients: ["2 oz white rum", "1 oz lime juice"],
    tags: { spirit: ["rum"], ingredients: ["lime"] },
  }),
};

const built = buildIndex(RECIPES);
if (!built.ok) throw new Error(`Test recipes don't pass the recipe checker:\n${built.output}`);
export const INDEX = built.index;

export const test = base.extend({
  page: async ({ page, baseURL }, use) => {
    const origin = new URL(baseURL).origin;
    await page.route("**/*", (route) => {
      const url = new URL(route.request().url());
      if (url.origin !== origin) return route.abort("blockedbyclient");
      if (url.pathname.endsWith("/recipes/index.json")) return route.fulfill({ json: INDEX });
      return route.continue();
    });
    await use(page);
  },
});

export { expect };
