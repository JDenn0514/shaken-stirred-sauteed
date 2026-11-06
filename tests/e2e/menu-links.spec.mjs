// Getting around, and getting a recipe onto your menu, from every page: the
// site's Recipes · Menu · Add recipe bar (Menu with its count), the recipe page's
// "+ Add to menu", the tape on the recipes page's cards, your menu in view
// while you choose recipes, and the welcome page's link.
import { test, expect, onMenu, signIn } from "./fixtures.mjs";

const saved = (page) => page.evaluate(() => JSON.parse(localStorage.getItem("sss:lineup") || "null"));
const nav = (page) => page.getByRole("navigation", { name: "Site" });
const menuTab = (page) => nav(page).getByRole("link", { name: /^Menu/ });

test.describe("the site bar", () => {
  // "Add recipe" is only there when signed in (Jacob, 2026-11-06), so these sign in.
  for (const [url, current] of [["index.html", null], ["recipes.html", "Recipes"], ["menu.html", "Menu"], ["intake.html", "Add recipe"]]) {
    test(`is on ${url}${current ? `, with ${current} as the current page` : ""}`, async ({ page, baseURL }) => {
      await signIn(page, baseURL);
      await page.goto(url);
      // No Home link: the site's title goes home.
      await expect(nav(page).getByRole("link")).toHaveCount(3);
      await expect(page.getByRole("banner").getByRole("link", { name: /Shaken, Stirred/ })).toHaveAttribute("href", "./");
      await expect(nav(page).getByRole("link", { name: "Recipes" })).toHaveAttribute("href", "recipes.html");
      await expect(menuTab(page)).toHaveAttribute("href", "menu.html");
      await expect(nav(page).getByRole("link", { name: "Add recipe" })).toHaveAttribute("href", "intake.html");
      if (current) await expect(nav(page).getByRole("link", { name: new RegExp(`^${current}`) })).toHaveAttribute("aria-current", "page");
      else await expect(nav(page).locator("[aria-current]")).toHaveCount(0);
    });
  }

  test("is on a recipe page too, and Menu shows how many dishes are on it", async ({ page }) => {
    await onMenu(page, ["lemon-bars", "pork-carnitas"]);
    await page.goto("recipe.html?r=lemon-bars");
    await expect(menuTab(page)).toHaveAccessibleName("Menu 2 dishes");
    await expect(menuTab(page)).toContainText("2");
  });

  test("is out of the way while cooking", async ({ page }) => {
    await page.goto("recipe.html?r=lemon-bars");
    await page.getByRole("button", { name: "Start baking" }).click();
    await expect(nav(page)).toBeHidden();
  });
});

test.describe("the recipe page", () => {
  test("keeps just the back link in its top row: the site bar leads to the menu", async ({ page }) => {
    await page.goto("recipe.html?r=lemon-bars");
    await expect(page.getByRole("link", { name: "← Baking" })).toBeVisible();
    await expect(page.getByRole("main").getByRole("link", { name: /^Menu/ })).toHaveCount(0);
    await expect(menuTab(page)).toHaveAccessibleName("Menu");
  });

  test("+ Add to menu puts the recipe on the menu", async ({ page }) => {
    await page.goto("recipe.html?r=lemon-bars");
    await page.getByRole("button", { name: "+ Add to menu" }).click();
    await expect(page.getByRole("button", { name: /On your menu/ })).toBeVisible();
    await expect(menuTab(page)).toHaveAccessibleName("Menu 1 dish");
    expect((await saved(page)).dishes).toEqual([{ slug: "lemon-bars" }]);
  });

  test("On your menu opens a small menu: remove it, or go to your menu", async ({ page }) => {
    await onMenu(page, ["lemon-bars", "pork-carnitas"]);
    await page.goto("recipe.html?r=lemon-bars");
    const on = page.getByRole("button", { name: /On your menu/ });
    await expect(on).toHaveAttribute("aria-expanded", "false");
    await on.click();
    await expect(on).toHaveAttribute("aria-expanded", "true");
    await expect(page.getByRole("menuitem", { name: "Go to your menu" })).toHaveAttribute("href", "menu.html");
    await page.getByRole("menuitem", { name: "Remove from menu" }).click();
    await expect(page.getByRole("button", { name: "+ Add to menu" })).toBeFocused();
    await expect(menuTab(page)).toHaveAccessibleName("Menu 1 dish");
    expect((await saved(page)).dishes).toEqual([{ slug: "pork-carnitas" }]);
  });

  test("Escape closes the small menu", async ({ page }) => {
    await onMenu(page, ["lemon-bars"]);
    await page.goto("recipe.html?r=lemon-bars");
    await page.getByRole("button", { name: /On your menu/ }).click();
    await page.keyboard.press("Escape");
    await expect(page.getByRole("menu")).toHaveCount(0);
    await expect(page.getByRole("button", { name: /On your menu/ })).toBeFocused();
  });

  test("Start still cooks just this recipe when it's on the menu", async ({ page }) => {
    await onMenu(page, ["lemon-bars", "pork-carnitas"]);
    await page.goto("recipe.html?r=lemon-bars");
    await page.getByRole("button", { name: "Start baking" }).click();
    await expect(page).toHaveURL(/recipe\.html\?r=lemon-bars#cook$/);
    await expect(page.getByRole("region", { name: "Cook mode" }).getByRole("heading", { name: "Before you start" })).toBeVisible();
  });
});

test.describe("the recipes page", () => {
  test("tapes the cards of recipes on your menu", async ({ page }) => {
    await onMenu(page, ["lemon-bars"]);
    await page.goto("recipes.html");
    const card = (title) => page.getByRole("listitem").filter({ has: page.getByRole("heading", { name: title }) });
    await expect(card("Lemon Bars")).toContainText("On your menu");
    await expect(card("Pork Carnitas")).not.toContainText("On your menu");
  });

  test("on a phone, Your menu opens a list of what's on it", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await onMenu(page, ["lemon-bars", "daiquiri"]);
    await page.goto("recipes.html");
    const toggle = page.getByRole("button", { name: "Your menu" });
    await expect(toggle).toHaveAttribute("aria-expanded", "false");
    await expect(page.getByRole("link", { name: "Daiquiri", exact: true })).toBeHidden();
    await toggle.click();
    await expect(toggle).toHaveAttribute("aria-expanded", "true");
    const peek = page.getByRole("region", { name: "Your menu" });
    await expect(peek.getByRole("link", { name: "Lemon Bars" })).toHaveAttribute("href", "recipe.html?r=lemon-bars");
    await expect(peek.getByRole("link", { name: "Daiquiri" })).toBeVisible();
    await expect(peek.getByRole("link", { name: "Your menu →" })).toHaveAttribute("href", "menu.html");
  });

  test("on a phone, there's no Your menu button while the menu is empty", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("recipes.html");
    await expect(page.locator("#count")).toHaveText("6 recipes");
    await expect(page.getByRole("button", { name: "Your menu" })).toBeHidden();
  });

  test("on a wide screen, your menu sits beside the recipes", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 860 });
    await onMenu(page, ["lemon-bars"]);
    await page.goto("recipes.html");
    const peek = page.getByRole("region", { name: "Your menu" });
    await expect(peek.getByRole("link", { name: "Lemon Bars" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Your menu" })).toBeHidden();
    const [panel, grid] = await Promise.all([peek.boundingBox(), page.locator("#grid").boundingBox()]);
    expect(panel.x).toBeGreaterThan(grid.x + grid.width - 1);
  });

  test("on a wide screen with an empty menu, it says how to add to it", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 860 });
    await page.goto("recipes.html");
    await expect(page.getByRole("region", { name: "Your menu" })).toContainText("Nothing on your menu yet.");
  });
});

test("the menu page's search shows your menu beside the results on a wide screen", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 860 });
  await onMenu(page, ["lemon-bars"]);
  await page.goto("menu.html?q=a");
  await page.getByRole("listitem").filter({ hasText: "Daiquiri" }).getByRole("button", { name: "+ Add" }).click();
  const peek = page.getByRole("region", { name: "Your menu" });
  await expect(peek.getByRole("link", { name: "Daiquiri" })).toBeVisible();
  await expect(peek.getByRole("link", { name: "Lemon Bars" })).toBeVisible();
  const [panel, results] = await Promise.all([peek.boundingBox(), page.locator(".menu-results").boundingBox()]);
  expect(panel.x).toBeGreaterThan(results.x + results.width - 1);
});

test.describe("the welcome page", () => {
  test("links to adding a recipe, when signed in", async ({ page, baseURL }) => {
    await signIn(page, baseURL);
    await page.goto("index.html");
    await page.getByRole("link", { name: "Add a recipe →" }).click();
    await expect(page).toHaveURL(/intake\.html$/);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Add a recipe");
  });

  test("invites you to build a menu while it's empty", async ({ page }) => {
    await page.goto("index.html");
    await expect(page.getByRole("link", { name: "Let's build your menu →" })).toHaveAttribute("href", "menu.html");
  });

  test("links to your menu, with its count", async ({ page }) => {
    await onMenu(page, ["lemon-bars", "daiquiri"]);
    await page.goto("index.html");
    await expect(page.getByRole("link", { name: "Your menu · 2 →" })).toHaveAttribute("href", "menu.html");
  });
});
