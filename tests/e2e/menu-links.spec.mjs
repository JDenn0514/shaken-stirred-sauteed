// Getting a recipe onto your menu, and back to the menu, from the other pages:
// the recipe page's "+ Add to menu", the "Menu · N →" link beside the back
// link, the tape on the recipes page's cards, and the welcome page's link.
import { test, expect, onMenu } from "./fixtures.mjs";

const saved = (page) => page.evaluate(() => JSON.parse(localStorage.getItem("sss:lineup") || "null"));

test.describe("the recipe page", () => {
  test("has a menu link beside the back link, reading Menu → while the menu is empty", async ({ page }) => {
    await page.goto("recipe.html?r=lemon-bars");
    await expect(page.getByRole("link", { name: "← Baking" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Menu →" })).toHaveAttribute("href", "menu.html");
  });

  test("+ Add to menu puts the recipe on the menu", async ({ page }) => {
    await page.goto("recipe.html?r=lemon-bars");
    await page.getByRole("button", { name: "+ Add to menu" }).click();
    await expect(page.getByRole("button", { name: /On your menu/ })).toBeVisible();
    await expect(page.getByRole("link", { name: "Menu · 1 →" })).toBeVisible();
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
    await expect(page.getByRole("link", { name: "Menu · 1 →" })).toBeVisible();
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

  test("links to your menu above the search", async ({ page }) => {
    await onMenu(page, ["lemon-bars"]);
    await page.goto("recipes.html");
    await expect(page.getByRole("link", { name: "Menu · 1 →" })).toHaveAttribute("href", "menu.html");
  });
});

test.describe("the welcome page", () => {
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
