// The menu page (menu.html): the recipes you're cooking together. Empty, it
// offers a search; searching adds dishes; with dishes it shows them as a menu
// card, with each dish's choices, and starts cooking them all.
import { test, expect, onMenu } from "./fixtures.mjs";

const card = (page) => page.getByRole("region", { name: "Your menu" });
const dishButton = (page, name) => card(page).getByRole("button", { name, exact: true });
const saved = (page) => page.evaluate(() => JSON.parse(localStorage.getItem("sss:lineup") || "null"));

test.describe("empty", () => {
  test.beforeEach(async ({ page }) => { await page.goto("menu.html"); });

  test("invites you to start, with a search and a way to browse", async ({ page }) => {
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Let's make something");
    await expect(page.getByRole("searchbox", { name: "Search recipes" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Or browse all recipes →" })).toHaveAttribute("href", "recipes.html");
    await expect(page.getByRole("listitem").filter({ hasText: "Start cooking" })).toBeVisible();
  });

  test("searching lists matching recipes, each with Add", async ({ page }) => {
    await page.getByRole("searchbox", { name: "Search recipes" }).fill("lemon");
    const row = page.getByRole("listitem").filter({ hasText: "Lemon Bars" });
    await expect(row).toBeVisible();
    await expect(row.getByRole("link", { name: /Lemon Bars/ })).toHaveAttribute("href", "recipe.html?r=lemon-bars");
    await expect(page.getByRole("listitem").filter({ hasText: "Pork Carnitas" })).toHaveCount(0);
    await expect(page.getByRole("link", { name: "← Back to your menu" })).toBeVisible();
  });

  test("the section tabs narrow the results", async ({ page }) => {
    await page.getByRole("searchbox", { name: "Search recipes" }).fill("a");
    await expect(page.getByRole("listitem").filter({ hasText: "Daiquiri" })).toBeVisible();
    await page.getByRole("button", { name: /^Baking/ }).click();
    await expect(page.getByRole("listitem").filter({ hasText: "Lemon Bars" })).toBeVisible();
    await expect(page.getByRole("listitem").filter({ hasText: "Daiquiri" })).toHaveCount(0);
  });

  test("Add puts a recipe on the menu, and Back shows it on the card", async ({ page }) => {
    await page.getByRole("searchbox", { name: "Search recipes" }).fill("lemon");
    const row = page.getByRole("listitem").filter({ hasText: "Lemon Bars" });
    await row.getByRole("button", { name: "+ Add" }).click();
    await expect(row.getByText("✓ Added")).toBeVisible();
    await expect(page.getByRole("link", { name: "← Back to your menu · 1" })).toBeVisible();
    expect((await saved(page)).dishes).toEqual([{ slug: "lemon-bars" }]);
    await page.getByRole("link", { name: "← Back to your menu · 1" }).click();
    await expect(dishButton(page, "Lemon Bars")).toBeVisible();
  });

  test("coming back from a recipe keeps the search", async ({ page }) => {
    await page.getByRole("searchbox", { name: "Search recipes" }).fill("lemon");
    await page.getByRole("link", { name: /Lemon Bars/ }).click();
    await expect(page).toHaveURL(/recipe\.html\?r=lemon-bars/);
    await page.goBack();
    await expect(page.getByRole("searchbox", { name: "Search recipes" })).toHaveValue("lemon");
    await expect(page.getByRole("listitem").filter({ hasText: "Lemon Bars" })).toBeVisible();
  });
});

test.describe("with dishes", () => {
  test.beforeEach(async ({ page }) => {
    await onMenu(page, ["roast-chicken", "green-beans", "slow-cake"]);
    await page.goto("menu.html");
    await expect(card(page)).toBeVisible();
    // Planned, so the card isn't redrawn under a click. (Using the card while
    // it plans is tested on its own, below.)
    await expect(page.getByRole("button", { name: /^Start cooking · about/ })).toBeVisible();
  });

  test("shows the dishes by course, with nested recipes under their dish", async ({ page }) => {
    await expect(card(page).getByRole("heading", { name: "Main" })).toBeVisible();
    await expect(card(page).getByRole("heading", { name: /^Dessert/ })).toContainText("45 min later");
    const chicken = card(page).getByRole("listitem").filter({ has: page.getByRole("button", { name: "Roast Chicken", exact: true }) });
    // A nested recipe sits in a list inside its dish's item.
    await expect(chicken.getByRole("list").getByRole("listitem").filter({ hasText: "Herb Butter" })).toBeVisible();
    await expect(chicken.getByRole("radio", { name: "Make it" })).toBeChecked();
    await expect(page.getByRole("link", { name: "← Recipes" })).toBeVisible();
    // The search is behind "+ Add a dish", not on the card.
    await expect(page.getByRole("searchbox")).toBeHidden();
  });

  test("Already made is remembered", async ({ page }) => {
    await card(page).getByRole("radio", { name: "Already made" }).click();
    await expect(card(page).getByRole("radio", { name: "Already made" })).toBeChecked();
    expect((await saved(page)).dishes[0]).toEqual({ slug: "roast-chicken", made: ["herb-butter"] });
    await page.reload();
    await expect(card(page).getByRole("radio", { name: "Already made" })).toBeChecked();
  });

  test("a dish's name opens its menu: open it, move it to the other course, or remove it", async ({ page }) => {
    await dishButton(page, "Green Beans").click();
    await expect(page.getByRole("menuitem", { name: "Open the recipe" })).toHaveAttribute("href", "recipe.html?r=green-beans");
    await page.getByRole("menuitem", { name: "Move to Dessert" }).click();
    const dessert = card(page).getByRole("list", { name: "Dessert" });
    await expect(dessert.getByRole("button", { name: "Green Beans", exact: true })).toBeVisible();
    await dishButton(page, "Green Beans").click();
    await page.getByRole("menuitem", { name: "Remove from menu" }).click();
    await expect(dishButton(page, "Green Beans")).toHaveCount(0);
    expect((await saved(page)).dishes.map((d) => d.slug)).toEqual(["roast-chicken", "slow-cake"]);
  });

  test("Escape closes a dish's menu", async ({ page }) => {
    await dishButton(page, "Green Beans").click();
    await expect(page.getByRole("menu")).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.getByRole("menu")).toHaveCount(0);
    await expect(dishButton(page, "Green Beans")).toBeFocused();
  });

  test("offers to make a long dish ahead, in its own box", async ({ page }) => {
    await expect(card(page)).toContainText(/made ahead/i);
    const ahead = page.getByRole("region", { name: "Ahead of time" });
    await expect(ahead.getByRole("button", { name: /^Start .* · about/ })).toBeVisible();
    await card(page).getByRole("button", { name: /^Change/ }).click();
    await page.getByRole("menuitem", { name: "Make it all today" }).click();
    await expect(page.getByRole("region", { name: "Ahead of time" })).toHaveCount(0);
    expect((await saved(page)).ahead).toEqual({ "slow-cake": false });
  });

  test("Prep everything first is on by default, and remembered when changed", async ({ page }) => {
    const prep = page.getByRole("switch", { name: "Prep everything first" });
    await expect(prep).toBeChecked();
    await expect(card(page)).toContainText(/Fastest would be/);
    await prep.click();
    await expect(prep).not.toBeChecked();
    await expect(card(page)).toContainText(/Prep first would be/);
    expect(await page.evaluate(() => localStorage.getItem("sss:prep-first"))).toBe("false");
  });

  test("Start cooking says about how long it takes", async ({ page }) => {
    await expect(page.getByRole("button", { name: /^Start cooking · about \d/ })).toBeVisible();
  });

  test("+ Add a dish opens the search", async ({ page }) => {
    await card(page).getByRole("link", { name: "+ Add a dish" }).click();
    await expect(page.getByRole("link", { name: "← Back to your menu · 3" })).toBeVisible();
    await expect(page.getByRole("searchbox", { name: "Search recipes" })).toBeFocused();
  });
});

test("asks what the recipes don't say, and saves the answers to the recipe", async ({ page }) => {
  await onMenu(page, ["mystery-stew"]);
  await page.goto("menu.html");
  const asks = page.getByRole("region", { name: /the recipes don't say/ });
  await expect(asks).toContainText("Bake for about 25 minutes.");
  const start = page.getByRole("button", { name: /^Start cooking/ });
  const before = await start.textContent();
  await asks.getByRole("textbox", { name: /how long/i }).fill("25");
  await asks.getByRole("button", { name: "Save" }).first().click();
  await expect(asks).not.toContainText("Bake for about 25 minutes.");
  await expect(start).not.toHaveText(before);
  await asks.getByRole("radio", { name: /^Soon/ }).click();
  await expect(page.getByRole("region", { name: /the recipes don't say/ })).toHaveCount(0);
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem("sss:answers:mystery-stew"))))
    .toEqual({ waits: { 1: "25 min" }, serve: "soon" });
});

test("opening the search while the menu is still being planned stays on the search", async ({ page }) => {
  // Planning that takes a while, as on a slow phone.
  await page.addInitScript(() => {
    const Slow = class extends window.Worker {
      postMessage(m) { setTimeout(() => Worker.prototype.postMessage.call(this, m), 1000); }
    };
    window.Worker = Slow;
  });
  await onMenu(page, ["roast-chicken", "green-beans"]);
  await page.goto("menu.html");
  await expect(page.getByRole("button", { name: "Planning…" })).toBeVisible();
  await card(page).getByRole("link", { name: "+ Add a dish" }).click();
  await expect(page.getByRole("searchbox", { name: "Search recipes" })).toBeVisible();
  await page.waitForTimeout(2500);
  await expect(page.getByRole("searchbox", { name: "Search recipes" })).toBeVisible();
  await expect(page.getByRole("heading", { level: 1, name: "Your menu" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: /^Start cooking/ })).toHaveCount(0);
});

test("a step that doesn't really wait can be answered so, and isn't asked about again", async ({ page }) => {
  await onMenu(page, ["mystery-stew"]);
  await page.goto("menu.html");
  const asks = page.getByRole("region", { name: /the recipes don't say/ });
  await asks.getByRole("button", { name: "It doesn't wait" }).click();
  await expect(asks).not.toContainText("Bake for about 25 minutes.");
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem("sss:answers:mystery-stew"))))
    .toEqual({ waits: { 1: false } });
  await page.reload();
  await expect(page.getByRole("region", { name: /the recipes don't say/ })).not.toContainText("Bake for about 25 minutes.");
});

test("a wait in a step that waits for something else splits the step when answered, shown to check and undo", async ({ page }) => {
  await onMenu(page, ["cooling-buns"]);
  await page.goto("menu.html");
  const asks = page.getByRole("region", { name: /the recipes don't say/ });
  const bake = asks.locator("form").filter({ hasText: "Bake until deep golden." });
  await expect(bake).toContainText("Then let them cool on a rack");
  const start = page.getByRole("button", { name: /^Start cooking/ });
  const before = await start.textContent();
  await bake.getByRole("textbox", { name: /how long/i }).fill("25");
  await bake.getByRole("button", { name: "Save" }).click();

  const split = page.getByRole("region", { name: "Steps split by your answers" });
  await expect(split).toContainText("Cooling Buns, step 2, is now two steps");
  await expect(split.getByRole("listitem")).toHaveText([
    "Bake until deep golden. ⏱ 25 min",
    "Then let them cool on a rack, at least 15 minutes. ⏱ At least 15 min",
  ]);
  await expect(start).not.toHaveText(before);
  await expect(asks.locator("form").filter({ hasText: "Bake until deep golden." })).toHaveCount(0);

  // A later step's answer is saved to that step as the recipe numbers it.
  await asks.locator("form").filter({ hasText: "let the glaze set" }).getByRole("textbox", { name: /how long/i }).fill("10");
  await asks.locator("form").filter({ hasText: "let the glaze set" }).getByRole("button", { name: "Save" }).click();
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem("sss:answers:cooling-buns"))))
    .toEqual({ splits: { 1: { sentence: "Bake until deep golden.", wait: "25 min" } }, waits: { 2: "10 min" } });

  await split.getByRole("button", { name: "Undo the split" }).click();
  await expect(page.getByRole("region", { name: "Steps split by your answers" })).toHaveCount(0);
  await expect(page.getByRole("region", { name: /the recipes don't say/ }).locator("form").filter({ hasText: "Bake until deep golden." })).toHaveCount(1);
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem("sss:answers:cooling-buns"))))
    .toEqual({ splits: {}, waits: { 2: "10 min" } });
});

test("warns when a dish will be ready too early, and no order gets it closer", async ({ page }) => {
  await onMenu(page, ["fried-rice", "crispy-fish"]);
  await page.goto("menu.html");
  const warning = card(page).getByRole("note").filter({ hasText: "before serving" });
  await expect(warning).toHaveCount(1);
  await expect(warning).toContainText(/(Fried Rice|Crispy Fish) will be ready about 1\d min before serving, longer than it can wait \(2 min\)\. No order gets it closer\./);
});

test("doesn't warn when every dish is ready in time", async ({ page }) => {
  await onMenu(page, ["fried-rice", "slow-cake"]);
  await page.goto("menu.html");
  await expect(page.getByRole("button", { name: /^Start cooking · about/ })).toBeVisible();
  await expect(card(page).getByRole("note").filter({ hasText: "before serving" })).toHaveCount(0);
});

test("says so when no order works", async ({ page }) => {
  await onMenu(page, ["loop-a"]);
  await page.goto("menu.html");
  await expect(page.getByRole("alert")).toContainText("can't be planned together");
  await expect(page.getByRole("button", { name: /^Start cooking/ })).toHaveCount(0);
});
