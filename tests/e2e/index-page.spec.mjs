// The full index (recipes.html): that the search box, tabs, filter panel,
// chips, Clear all and Sort menu work, and that the page keeps it all in the
// URL. The rules for what they show (which recipes match, option counts,
// what's disabled, sorting, reading and writing the URL) are unit tests:
// tests/unit/recipe-list.test.mjs. Uses the test recipes in fixtures.mjs.
import { test, expect } from "./fixtures.mjs";

const titles = (page) => page.locator("#grid h2");
const tab = (page, cat) => page.locator(`#tabs [data-cat="${cat}"]`);
const search = (page) => page.getByRole("searchbox", { name: "Search recipes" });

async function pick(page, filter, ...options) {
  await page.locator("#filters").getByRole("button", { name: new RegExp(`^${filter}`) }).click();
  const sheet = page.getByRole("dialog", { name: filter });
  for (const o of options) await sheet.getByRole("button", { name: new RegExp(`^${o}`) }).click();
  await sheet.getByRole("button", { name: "Done" }).click();
}

test.beforeEach(async ({ page }) => {
  await page.goto("recipes.html");
  await expect(page.locator("#count")).toHaveText("6 recipes");
});

test.describe("search", () => {
  test("typing narrows the list and the section counts", async ({ page }) => {
    await search(page).fill("chicken");
    await expect(titles(page)).toHaveText(["Chicken Tinga", "Thai Basil Chicken"]);
    await expect(tab(page, "all")).toContainText("2");
    await expect(tab(page, "baking")).toContainText("0");
    await expect(page.locator("#count")).toHaveText("2 recipes");
  });

  test("says so when nothing matches", async ({ page }) => {
    await search(page).fill("zzzz");
    await expect(titles(page)).toHaveCount(0);
    await expect(page.locator("#count")).toHaveText("0 recipes");
    await expect(page.getByText("Nothing matches that.")).toBeVisible();
  });
});

test.describe("sections", () => {
  test("a tab shows only that section's recipes", async ({ page }) => {
    await tab(page, "cocktails").click();
    await expect(titles(page)).toHaveText(["Daiquiri"]);
    await expect(tab(page, "cocktails")).toHaveAttribute("aria-pressed", "true");
  });

  test("a tab shows that section's own filters", async ({ page }) => {
    const filters = page.locator("#filters");
    await expect(filters.getByRole("button", { name: /^Cuisine/ })).toHaveCount(0);
    await tab(page, "cooking").click();
    await expect(filters.getByRole("button", { name: /^Cuisine/ })).toBeVisible();
  });
});

test.describe("filters", () => {
  test.beforeEach(async ({ page }) => {
    await tab(page, "cooking").click();
  });

  test("picking options in the panel filters the list, and the filter's button counts them", async ({ page }) => {
    await pick(page, "Cuisine", "Thai");
    await expect(titles(page)).toHaveText(["Thai Basil Chicken"]);
    await pick(page, "Cuisine", "Mexican");
    await expect(titles(page)).toHaveText(["Chicken Tinga", "Pork Carnitas", "Salsa Verde", "Thai Basil Chicken"]);
    await expect(page.locator("#filters").getByRole("button", { name: /^Cuisine/ })).toContainText("2");
  });

  test("the panel shows each option's count, and disables ones that would show nothing", async ({ page }) => {
    await search(page).fill("carnitas");
    await page.locator("#filters").getByRole("button", { name: /^Cuisine/ }).click();
    const sheet = page.getByRole("dialog", { name: "Cuisine" });
    await expect(sheet.getByRole("button", { name: /^Mexican/ })).toContainText("1");
    await expect(sheet.getByRole("button", { name: /^Mexican/ })).toBeEnabled();
    await expect(sheet.getByRole("button", { name: /^Thai/ })).toBeDisabled();
  });

  test("removing a chip turns that option off", async ({ page }) => {
    await pick(page, "Cuisine", "Thai", "Mexican");
    await page.getByRole("button", { name: "Remove Cuisine: Thai" }).click();
    await expect(titles(page)).toHaveText(["Chicken Tinga", "Pork Carnitas", "Salsa Verde"]);
    await expect(page.getByRole("button", { name: /^Remove / })).toHaveCount(1);
  });

  test("Clear all turns every filter off", async ({ page }) => {
    await pick(page, "Cuisine", "Mexican");
    await pick(page, "Ingredients", "Chicken");
    await page.getByRole("button", { name: "Clear all" }).click();
    await expect(page.locator("#count")).toHaveText("4 recipes");
    await expect(page.getByRole("button", { name: /^Remove / })).toHaveCount(0);
  });
});

test("the Sort menu reorders the list", async ({ page }) => {
  await expect(titles(page)).toHaveText(["Chicken Tinga", "Daiquiri", "Lemon Bars", "Pork Carnitas", "Salsa Verde", "Thai Basil Chicken"]);
  await page.getByLabel("Sort").selectOption("quick");
  await expect(titles(page)).toHaveText(["Daiquiri", "Thai Basil Chicken", "Chicken Tinga", "Lemon Bars", "Pork Carnitas", "Salsa Verde"]);
});

test.describe("the URL", () => {
  test("keeps the section, filters, search and sort", async ({ page }) => {
    await tab(page, "cooking").click();
    await pick(page, "Cuisine", "Mexican", "Thai");
    await search(page).fill("chicken");
    await page.getByLabel("Sort").selectOption("quick");
    await expect(page).toHaveURL(/\?cat=cooking&cuisine=mexican,thai&q=chicken&sort=quick$/);
  });

  test("a shared link opens with its filters on", async ({ page }) => {
    await page.goto("recipes.html?cat=cooking&cuisine=thai&sort=new");
    await expect(titles(page)).toHaveText(["Thai Basil Chicken"]);
    await expect(tab(page, "cooking")).toHaveAttribute("aria-pressed", "true");
    await expect(page.getByRole("button", { name: "Remove Cuisine: Thai" })).toBeVisible();
    await expect(page.getByLabel("Sort")).toHaveValue("new");
  });

  test("a link with a filter from another section ignores it", async ({ page }) => {
    await page.goto("recipes.html?cat=baking&cuisine=thai");
    await expect(titles(page)).toHaveText(["Lemon Bars"]);
    await expect(page).not.toHaveURL(/cuisine=/);
  });

  test("Back returns to the filtered list from a recipe", async ({ page }) => {
    await page.goto("recipes.html?cat=cooking&cuisine=mexican");
    await page.getByRole("link", { name: /Pork Carnitas/ }).click();
    await expect(page).toHaveURL(/recipe\.html\?r=pork-carnitas/);
    await page.goBack();
    await expect(titles(page)).toHaveText(["Chicken Tinga", "Pork Carnitas", "Salsa Verde"]);
  });
});
