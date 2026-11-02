// Light and dark mode (assets/theme.js): follows the phone's setting until you
// pick one, and remembers what you picked.
import { test, expect } from "./fixtures.mjs";

const theme = (page) => page.locator("html");
const toggle = (page) => page.getByRole("button", { name: /Switch to (dark|light) mode/ });

test.use({ colorScheme: "light" });

test("follows the system setting when you haven't picked one", async ({ page }) => {
  await page.goto("recipes.html");
  await expect(theme(page)).toHaveAttribute("data-theme", "light");
  await page.emulateMedia({ colorScheme: "dark" });
  await expect(theme(page)).toHaveAttribute("data-theme", "dark");
});

test("the button says which mode it switches to", async ({ page }) => {
  await page.goto("recipes.html");
  await expect(toggle(page)).toHaveAccessibleName("Switch to dark mode");
  await toggle(page).click();
  await expect(toggle(page)).toHaveAccessibleName("Switch to light mode");
});

test("your pick is remembered across reloads and pages, over the system setting", async ({ page }) => {
  await page.goto("recipes.html");
  await toggle(page).click();
  await expect(theme(page)).toHaveAttribute("data-theme", "dark");
  await page.reload();
  await expect(theme(page)).toHaveAttribute("data-theme", "dark");
  await page.goto("recipe.html?r=pork-carnitas");
  await expect(theme(page)).toHaveAttribute("data-theme", "dark");
  await page.emulateMedia({ colorScheme: "light" });
  await expect(theme(page)).toHaveAttribute("data-theme", "dark");
});

test("picking the mode the system already uses goes back to following the system", async ({ page }) => {
  await page.goto("index.html");
  await toggle(page).click(); // dark: a pick
  await toggle(page).click(); // light: same as the system, so no pick
  await page.reload();
  await page.emulateMedia({ colorScheme: "dark" });
  await expect(theme(page)).toHaveAttribute("data-theme", "dark");
});

test("the phone's browser bar colour matches the mode", async ({ page }) => {
  await page.goto("recipes.html");
  const active = page.locator('meta[name="theme-color"][media="all"]');
  await expect(active).toHaveAttribute("content", "#f3f4f1");
  await toggle(page).click();
  await expect(active).toHaveAttribute("content", "#15120f");
});
