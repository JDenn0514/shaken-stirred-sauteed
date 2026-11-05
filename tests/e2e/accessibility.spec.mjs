// Automated accessibility scan (axe) of each page, in light and dark mode,
// against WCAG 2.1 A and AA. It catches things like low colour contrast and
// missing labels; it can't judge everything, so it's a floor, not a guarantee.
import AxeBuilder from "@axe-core/playwright";
import { test, expect, onMenu } from "./fixtures.mjs";

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
  ["recipe page in prep-first order, part-way through the prep", "recipe.html?r=veg-stir-fry", async (page) => {
    await expect(page.getByRole("switch", { name: "Prep first" })).toBeChecked();
    await page.locator("ol.steps li").first().click();
    await expect(page.locator(`ol.steps li[aria-current="step"]`)).toHaveCount(1);
  }],
  ["recipe page as written, with its Prep first switch off", "recipe.html?r=veg-stir-fry", async (page) => {
    await page.getByRole("switch", { name: "Prep first" }).click();
    await expect(page.getByRole("switch", { name: "Prep first" })).not.toBeChecked();
  }],
  ["cook mode in the prep stage", "recipe.html?r=veg-stir-fry", async (page) => {
    await page.getByRole("button", { name: "Start cooking" }).click();
    await expect(cook(page).getByTestId("step-label")).toHaveText("Prep · Step 1 of 6");
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
  ["menu page, empty", "menu.html", (page) => expect(page.getByRole("heading", { level: 1 })).toHaveText("Let's make something")],
  ["menu page, searching", "menu.html?q=lemon", (page) => expect(page.getByRole("button", { name: "+ Add" })).toBeVisible()],
  ["menu page with dishes, a nested recipe and a make-ahead line", "menu.html", async (page) => {
    await expect(page.getByRole("region", { name: "Ahead of time" })).toBeVisible();
  }, ["roast-chicken", "green-beans", "slow-cake"]],
  ["menu page with a dish's menu open", "menu.html", async (page) => {
    await page.getByRole("button", { name: "Green Beans", exact: true }).click();
    await expect(page.getByRole("menu")).toBeVisible();
  }, ["roast-chicken", "green-beans"]],
  ["menu page asking what a recipe doesn't say", "menu.html", async (page) => {
    await expect(page.getByRole("region", { name: /the recipes don't say/ })).toBeVisible();
  }, ["mystery-stew"]],
  ["menu page when no order works", "menu.html", (page) => expect(page.getByRole("alert")).toBeVisible(), ["loop-a"]],
  ["recipe page on your menu, with its menu open", "recipe.html?r=lemon-bars", async (page) => {
    await page.getByRole("button", { name: /On your menu/ }).click();
    await expect(page.getByRole("menu")).toBeVisible();
  }, ["lemon-bars"]],
  ["index page with a recipe on your menu", "recipes.html", (page) => expect(page.getByText("On your menu")).toBeVisible(), ["lemon-bars"]],
  ["welcome page with a menu", "index.html", (page) => expect(page.getByRole("link", { name: "Your menu · 1 →" })).toBeVisible(), ["lemon-bars"]],
  ["menu cook mode, gathering", "menu.html", async (page) => {
    await startMenu(page);
    await expect(cook(page).getByRole("heading", { name: "Before you start" })).toBeVisible();
  }, ["roast-chicken", "green-beans"]],
  ["menu cook mode on a step", "menu.html", async (page) => {
    await startMenu(page, 1);
    await expect(cook(page).getByTestId("instruction")).toHaveText("Chop the parsley.");
  }, ["roast-chicken", "green-beans"]],
  ["menu cook mode on a wait", "menu.html", async (page) => {
    await startMenu(page, 6);
    await expect(cookButton(page, "Start 15 min timer")).toBeVisible();
  }, ["roast-chicken", "green-beans"]],
  ["menu cook mode on a wait, timer running", "menu.html", async (page) => {
    await startMenu(page, 6);
    await cookButton(page, "Start 15 min timer").click();
    await expect(cookButton(page, "Pause")).toBeVisible();
  }, ["roast-chicken", "green-beans"]],
  ["menu cook mode, the wait is up", "menu.html", async (page) => {
    await startMenu(page, 6);
    await cookButton(page, "Start 15 min timer").click();
    await page.clock.fastForward("15:01");
    await expect(cookButton(page, "Stop")).toBeVisible();
  }, ["roast-chicken", "green-beans"]],
  ["menu cook mode with another timer ringing", "menu.html", async (page) => {
    await startMenu(page, 8);
    await page.clock.fastForward("40:01");
    await expect(cook(page).getByRole("timer", { name: "Roast Chicken" })).toContainText("Time's up.");
  }, ["roast-chicken", "green-beans"]],
  ["menu cook mode, plating up and all done", "menu.html", async (page) => {
    await startMenu(page, 14);
    await expect(cook(page).getByRole("heading", { name: "Plate up the main" })).toBeVisible();
    await cookButton(page, "Finish").click();
    await expect(cook(page).getByRole("heading", { name: "All done" })).toBeVisible();
  }, ["roast-chicken", "green-beans"]],
  ["index page with your menu beside it", "recipes.html?cat=cooking", (page) => expect(page.getByRole("region", { name: "Your menu" }).getByRole("link", { name: "Pork Carnitas" })).toBeVisible(), ["pork-carnitas", "lemon-bars"]],
  ["index page on a phone with your menu open", "recipes.html", async (page) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.getByRole("button", { name: "Your menu" }).click();
    await expect(page.getByRole("link", { name: "Your menu →" })).toBeVisible();
  }, ["pork-carnitas", "lemon-bars"]],
];

function cook(page) { return page.getByRole("region", { name: "Cook mode" }); }
function cookButton(page, name) { return cook(page).getByRole("button", { name, exact: true }); }
// Starts cooking the menu (on a clock the test controls) and presses Next step
// that many times.
async function startMenu(page, nexts = 0) {
  await page.clock.install();
  await page.getByRole("button", { name: /^Start cooking/ }).click();
  for (let i = 0; i < nexts; i++) {
    const before = await cook(page).textContent();
    await cookButton(page, "Next step").click();
    await expect(cook(page)).not.toHaveText(before);
  }
}
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

    for (const [name, url, ready, menu] of PAGES) {
      test(`${name} has no detectable accessibility problems`, async ({ page }) => {
        if (menu) await onMenu(page, menu);
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
