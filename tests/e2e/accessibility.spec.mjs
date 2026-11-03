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
    await expect(page.locator(`ol.steps li[aria-current="step"]`)).toHaveCount(1);
  }],
  ["cocktail recipe", "recipe.html?r=daiquiri", (page) => expect(page.getByRole("heading", { level: 1 })).toBeVisible()],
  ["cook mode, before you start", "recipe.html?r=lemon-bars", async (page) => {
    await page.getByRole("button", { name: "Start baking" }).click();
    await expect(cook(page).getByRole("heading", { name: "Before you start" })).toBeVisible();
  }],
  ["cook mode on a step, an ingredient ticked and up next open", "recipe.html?r=lemon-bars", async (page) => {
    await page.getByRole("button", { name: "Start baking" }).click();
    await cookButton(page, "Next step").click();
    await cook(page).getByRole("checkbox").first().check();
    await cook(page).getByRole("button", { name: /^Up next/ }).click();
    await expect(cook(page).getByRole("button", { name: /^Up next/ })).toHaveAttribute("aria-expanded", "true");
  }],
  ["cook mode with a timer running", "recipe.html?r=lemon-bars", async (page) => {
    await toCrustBake(page);
    await cookButton(page, "Next step").click();
    await expect(cook(page).getByRole("timer")).toBeVisible();
  }],
  ["cook mode with a timer ringing", "recipe.html?r=lemon-bars", async (page) => {
    await toCrustBake(page);
    await page.clock.fastForward("16:00");
    await expect(cook(page).getByRole("button", { name: "+2 min" })).toBeVisible();
  }],
  ["cook mode, all done", "recipe.html?r=pork-carnitas", async (page) => {
    await page.getByRole("button", { name: "Start cooking" }).click();
    for (let i = 0; i < 5; i++) await cook(page).getByRole("button", { name: /^(Next step|Finish)$/ }).click();
    await expect(cook(page).getByRole("heading", { name: "All done" })).toBeVisible();
  }],
  ["cocktail cook mode", "recipe.html?r=daiquiri", async (page) => {
    await page.getByRole("button", { name: "Start mixing" }).click();
    await expect(cook(page)).toBeVisible();
  }],
];

function cook(page) { return page.getByRole("region", { name: "Cook mode" }); }
function cookButton(page, name) { return cook(page).getByRole("button", { name, exact: true }); }
// Lemon Bars step 2, with its 15-minute timer started (on a clock the test controls).
async function toCrustBake(page) {
  await page.clock.install();
  await page.getByRole("button", { name: "Start baking" }).click();
  await cookButton(page, "Next step").click();
  await cookButton(page, "Next step").click();
  await cook(page).getByRole("button", { name: "Start 15 min timer" }).click();
}

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
