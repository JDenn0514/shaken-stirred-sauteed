// Automated accessibility scan (axe) of each page, in light and dark mode,
// against WCAG 2.1 A and AA. It catches things like low colour contrast and
// missing labels; it can't judge everything, so it's a floor, not a guarantee.
import AxeBuilder from "@axe-core/playwright";
import { test, expect } from "./fixtures.mjs";

const PAGES = [
  ["welcome page", "index.html", (page) => expect(page.locator('[data-count="all"]')).toHaveText("all 6")],
  ["index page", "recipes.html", (page) => expect(page.locator("#count")).toHaveText("6 recipes")],
  ["index page with a filter open", "recipes.html?cat=cooking&cuisine=mexican", async (page) => {
    await page.locator("#filters").getByRole("button", { name: /^Cuisine/ }).click();
    await expect(page.getByRole("dialog", { name: "Cuisine" })).toBeVisible();
  }],
  ["recipe page", "recipe.html?r=pork-carnitas", (page) => expect(page.getByRole("heading", { level: 1 })).toBeVisible()],
  ["recipe page part-way through", "recipe.html?r=pork-carnitas", async (page) => {
    await page.getByRole("checkbox").first().check();
    await page.locator("ol.steps li").first().click();
    await expect(page.locator("ol.steps li.current")).toHaveCount(1);
  }],
  ["cocktail recipe", "recipe.html?r=daiquiri", (page) => expect(page.getByRole("heading", { level: 1 })).toBeVisible()],
];

// One line per problem, so a failure reads as a to-do list.
const summarize = (violations) => violations.flatMap((v) =>
  v.nodes.map((n) => `${v.id} (${v.impact}): ${n.failureSummary.split("\n").slice(1).join(" ").trim()}\n    at ${n.target.join(" ")}`));

for (const scheme of ["light", "dark"]) {
  test.describe(`${scheme} mode`, () => {
    test.use({ colorScheme: scheme });

    for (const [name, url, ready] of PAGES) {
      test(`${name} has no detectable accessibility problems`, async ({ page }) => {
        await page.goto(url);
        await ready(page);
        const { violations } = await new AxeBuilder({ page })
          .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
          .analyze();
        expect(summarize(violations)).toEqual([]);
      });
    }
  });
}
