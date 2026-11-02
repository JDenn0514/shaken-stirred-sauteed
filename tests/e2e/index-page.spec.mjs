// The full index (recipes.html): search, sections, filters, sorting, and
// keeping all of that in the URL. Uses the test recipes in fixtures.mjs.
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
  test("finds a recipe by name", async ({ page }) => {
    await search(page).fill("carnitas");
    await expect(titles(page)).toHaveText(["Pork Carnitas"]);
  });

  test("finds a recipe by an ingredient line", async ({ page }) => {
    await search(page).fill("tomatillo");
    await expect(titles(page)).toHaveText(["Salsa Verde"]);
  });

  test("finds recipes by a tag", async ({ page }) => {
    await search(page).fill("mexican");
    await expect(titles(page)).toHaveText(["Chicken Tinga", "Pork Carnitas", "Salsa Verde"]);
  });

  test("with several words, finds recipes that match all of them", async ({ page }) => {
    await search(page).fill("chicken mexican");
    await expect(titles(page)).toHaveText(["Chicken Tinga"]);
  });

  test("updates the section counts", async ({ page }) => {
    await search(page).fill("chicken");
    await expect(tab(page, "all")).toContainText("2");
    await expect(tab(page, "cooking")).toContainText("2");
    await expect(tab(page, "baking")).toContainText("0");
  });

  test("says so when nothing matches", async ({ page }) => {
    await search(page).fill("zzzz");
    await expect(titles(page)).toHaveCount(0);
    await expect(page.locator("#count")).toHaveText("0 recipes");
    await expect(page.getByText("Nothing matches that.")).toBeVisible();
  });
});

test.describe("sections", () => {
  test("show only that section's recipes", async ({ page }) => {
    await tab(page, "cocktails").click();
    await expect(titles(page)).toHaveText(["Daiquiri"]);
    await expect(tab(page, "cocktails")).toHaveAttribute("aria-pressed", "true");
  });

  test("show that section's own filters", async ({ page }) => {
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

  test("picking several options in one filter widens the results", async ({ page }) => {
    await pick(page, "Cuisine", "Thai");
    await expect(titles(page)).toHaveText(["Thai Basil Chicken"]);
    await pick(page, "Cuisine", "Mexican");
    await expect(titles(page)).toHaveText(["Chicken Tinga", "Pork Carnitas", "Salsa Verde", "Thai Basil Chicken"]);
  });

  test("combining filters narrows the results", async ({ page }) => {
    await pick(page, "Cuisine", "Mexican");
    await pick(page, "Ingredients", "Chicken");
    await expect(titles(page)).toHaveText(["Chicken Tinga"]);
  });

  test("a filter's option counts ignore that filter's own picks", async ({ page }) => {
    await pick(page, "Cuisine", "Mexican");
    await page.locator("#filters").getByRole("button", { name: /^Cuisine/ }).click();
    const thai = page.getByRole("dialog", { name: "Cuisine" }).getByRole("button", { name: /^Thai/ });
    await expect(thai).toContainText("1");
    await expect(thai).toBeEnabled();
  });

  test("options that would give no results are disabled", async ({ page }) => {
    await search(page).fill("carnitas");
    await page.locator("#filters").getByRole("button", { name: /^Cuisine/ }).click();
    await expect(page.getByRole("dialog", { name: "Cuisine" }).getByRole("button", { name: /^Thai/ })).toBeDisabled();
  });

  test("the time filter uses the total time", async ({ page }) => {
    await pick(page, "Time", "Under 30 min");
    await expect(titles(page)).toHaveText(["Thai Basil Chicken"]);
  });

  test("removing a chip turns that option off", async ({ page }) => {
    await pick(page, "Cuisine", "Thai", "Mexican");
    await page.getByRole("button", { name: "Remove Cuisine: Thai" }).click();
    await expect(titles(page)).toHaveText(["Chicken Tinga", "Pork Carnitas", "Salsa Verde"]);
  });

  test("Clear all turns every filter off", async ({ page }) => {
    await pick(page, "Cuisine", "Mexican");
    await pick(page, "Ingredients", "Chicken");
    await page.getByRole("button", { name: "Clear all" }).click();
    await expect(page.locator("#count")).toHaveText("4 recipes");
    await expect(page.locator("#active .chip")).toHaveCount(0);
  });

  test("switching to a section the filter doesn't apply to drops it", async ({ page }) => {
    await pick(page, "Cuisine", "Thai");
    await tab(page, "baking").click();
    await expect(titles(page)).toHaveText(["Lemon Bars"]);
    await expect(page).not.toHaveURL(/cuisine=/);
    await tab(page, "cooking").click();
    await expect(page.locator("#count")).toHaveText("4 recipes");
  });

  test("shared filters carry over between sections", async ({ page }) => {
    await pick(page, "Ingredients", "Chicken");
    await tab(page, "all").click();
    await expect(titles(page)).toHaveText(["Chicken Tinga", "Thai Basil Chicken"]);
  });
});

test.describe("sorting", () => {
  test("A–Z is the default", async ({ page }) => {
    await expect(titles(page)).toHaveText(["Chicken Tinga", "Daiquiri", "Lemon Bars", "Pork Carnitas", "Salsa Verde", "Thai Basil Chicken"]);
  });

  test("Newest puts recipes without a date last", async ({ page }) => {
    await page.getByLabel("Sort").selectOption("new");
    await expect(titles(page)).toHaveText(["Lemon Bars", "Pork Carnitas", "Chicken Tinga", "Thai Basil Chicken", "Daiquiri", "Salsa Verde"]);
  });

  test("Quickest puts recipes without a time last", async ({ page }) => {
    await page.getByLabel("Sort").selectOption("quick");
    await expect(titles(page)).toHaveText(["Daiquiri", "Thai Basil Chicken", "Chicken Tinga", "Lemon Bars", "Pork Carnitas", "Salsa Verde"]);
  });
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
