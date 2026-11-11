// Laws for recipe files: any recipe the recipe checker accepts shows on the
// recipe page and walks through cook mode, not just the recipes we have. This
// is what lets the checker (assets/recipe-checks.js) stand in for opening every
// real recipe: a new recipe that passes `node scripts/build-index.mjs` is one
// these laws have already covered the shape of.
//
// fast-check makes random recipes in every shape the README describes (plain and
// object entries, groups, waits and cues, "uses", prep-first steps, before you
// start), keeps the ones checkRecipe accepts, and serves each to the page as
// recipes/law-<n>.json. When one breaks a law, the test prints that recipe:
// copy it into an example test (recipe-page.spec.mjs or cook-mode.spec.mjs)
// first, then fix the code or the checker.
//
// Each run uses new recipes. The seed is in the test group's name;
// RECIPE_SEED=<seed> npx playwright test recipe-laws runs the same ones again.
// (playwright.config.mjs picks the seed once, so every worker agrees on it.)
import fc from "fast-check";
import { test, expect } from "./fixtures.mjs";
import { recipeArb, flat, nameOf } from "../helpers/recipe-arb.mjs";

const SEED = Number(process.env.RECIPE_SEED) || 0;
// Recipes per test (each law runs as two tests, so they share the workers).
// RECIPE_RUNS=100 checks more, for a deeper look after changing the page.
const RUNS = Number(process.env.RECIPE_RUNS) || 5;

// Serves each recipe under a new name, so no saved progress or timers carry over.
async function serving(page) {
  const files = new Map();
  await page.route(/\/recipes\/law-\d+\.json$/, (route) =>
    route.fulfill({ json: files.get(new URL(route.request().url()).pathname.split("/").pop().slice(0, -5)) }));
  let n = 0;
  return (r) => { const slug = `law-${n++}`; files.set(slug, r); return slug; };
}

// Page errors and console errors, collected for the whole test.
function errorsOn(page) {
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
  return errors;
}

// Checks the law on RUNS random recipes. Stops at the first recipe that breaks
// it (no shrinking: every try is a page load, and a failed check waits for its
// timeout) and prints it as JSON, ready to paste into a test recipe.
const holds = (seed, law) => fc.assert(fc.asyncProperty(recipeArb, async (r) => {
  try {
    await law(r);
  } catch (e) {
    e.message = `This recipe passes the checker but breaks the law:\n${JSON.stringify(r, null, 2)}\n\n${e.message}`;
    throw e;
  }
}), { numRuns: RUNS, seed, endOnFailure: true });

test.describe(`laws for recipe files (seed ${SEED})`, () => {
  test.describe.configure({ timeout: 120_000 });

  for (const part of [1, 2]) {
    test(`any recipe the checker accepts shows on the recipe page (${part} of 2)`, async ({ page }) => {
      const serve = await serving(page), errors = errorsOn(page);
      await holds(SEED + part, async (r) => {
        await page.goto(`recipe.html?r=${serve(r)}`);
        await expect(page.getByRole("heading", { level: 1 })).toHaveText(r.title);
        const ingredients = flat(r.ingredients), steps = flat(r.steps);
        await expect(page.getByRole("checkbox")).toHaveCount(ingredients.length);
        // Names can repeat or contain one another ("salt", "lemon salt"), hence first().
        for (const i of ingredients) await expect(page.getByRole("checkbox", { name: nameOf(i) }).first()).toBeVisible();
        await expect(page.locator("ol.steps li")).toHaveCount(steps.length);
        for (const s of steps) await expect(page.locator("ol.steps li", { hasText: typeof s === "string" ? s : s.do }).first()).toBeVisible();
        expect(errors).toEqual([]);
      });
    });

    test(`any recipe the checker accepts walks through cook mode (${part} of 2)`, async ({ page }) => {
      const serve = await serving(page), errors = errorsOn(page);
      const cook = page.getByRole("region", { name: "Cook mode" });
      const next = cook.getByRole("button", { name: /^(Next step|Finish)$/ });
      await holds(SEED + part, async (r) => {
        await page.goto(`recipe.html?r=${serve(r)}`);
        await page.getByRole("button", { name: /^Start (baking|cooking|mixing)$/ }).click();
        await expect(cook).toBeVisible();
        if (r.beforeYouStart?.length) await next.click();
        // Steps may come prep first, so each one shown is found in the recipe by
        // its text, and every step must be shown exactly once.
        const all = flat(r.steps), seen = [];
        for (let n = 0; n < all.length; n++) {
          await expect(cook.getByTestId("step-label")).toHaveText(new RegExp(`Step ${n + 1} of ${all.length}$`));
          const shown = await cook.getByTestId("instruction").textContent();
          const k = all.findIndex((s, i) => !seen.includes(i) && (typeof s === "string" ? s : s.do) === shown);
          expect(k, `step ${n + 1}: "${shown}"`).toBeGreaterThanOrEqual(0);
          seen.push(k);
          await expect(cook.getByRole("checkbox"), `step ${n + 1}`).toHaveCount(all[k].uses?.length ?? 0);
          await next.click();
        }
        await expect(cook.getByRole("heading", { name: "All done" })).toBeVisible();
        expect(seen.toSorted((a, b) => a - b)).toEqual(all.map((_, i) => i));
        expect(errors).toEqual([]);
      });
    });
  }
});
