// The recipe page (recipe.html): what it shows, checking things off, the
// current step, links out, and staying safe with bad recipe files.
import { readFileSync } from "node:fs";
import { test, expect } from "./fixtures.mjs";

const open = (page, slug) => page.goto(`recipe.html?r=${slug}`);
const heading = (page) => page.getByRole("heading", { level: 1 });
const ingredient = (page, name) => page.getByRole("checkbox", { name });
// Steps are list items you tap. The current step has aria-current="step"; "done" is only shown by styling for now.
const step = (page, text) => page.locator("ol.steps li", { hasText: text });
const fact = (page, label) => page.locator(".facts .fact", { has: page.locator("dt", { hasText: label }) }).locator("dd");

test.describe("shows", () => {
  test.beforeEach(async ({ page }) => {
    await open(page, "pork-carnitas");
    await expect(heading(page)).toHaveText("Pork Carnitas");
  });

  test("the title in the browser tab", async ({ page }) => {
    await expect(page).toHaveTitle("Pork Carnitas · Shaken, Stirred & Sautéed");
  });

  test("the yield and times", async ({ page }) => {
    await expect(fact(page, "Serves")).toHaveText("6");
    await expect(fact(page, "Prep")).toHaveText("20 min");
    await expect(fact(page, "Cook")).toHaveText("2 hr 40 min");
    await expect(fact(page, "Total")).toHaveText("3 hr");
  });

  test("ingredients with amounts, notes and group headings", async ({ page }) => {
    await expect(ingredient(page, /Pork shoulder/)).toBeVisible();
    await expect(page.locator(".ingredients li").first()).toHaveText("1400 g · 3 lb Pork shoulder in 2-inch chunks");
    await expect(page.getByRole("heading", { name: "For the braise" })).toBeVisible();
    await expect(page.getByRole("checkbox")).toHaveCount(3);
  });

  test("steps with their wait times, cues and group headings", async ({ page }) => {
    await expect(page.locator("ol.steps li")).toHaveCount(4);
    await expect(step(page, "Braise until tender.")).toContainText("2 1/2 hours");
    await expect(step(page, "Braise until tender.")).toContainText("Falls apart with a fork");
    await expect(page.getByRole("heading", { name: "To finish" })).toBeVisible();
  });

  test("before you start and notes", async ({ page }) => {
    await expect(page.getByRole("heading", { name: "Before you start" })).toBeVisible();
    await expect(page.getByText("Take the pork out of the fridge an hour ahead.")).toBeVisible();
    await expect(page.getByRole("heading", { name: "Notes" })).toBeVisible();
    await expect(page.getByText("Freezes well.")).toBeVisible();
  });

  test("the source as a link that opens in a new tab", async ({ page }) => {
    const link = page.getByRole("link", { name: "Grandma" });
    await expect(link).toHaveAttribute("href", "https://example.com/carnitas");
    await expect(link).toHaveAttribute("target", "_blank");
    await expect(link).toHaveAttribute("rel", "noopener noreferrer");
  });
});

test("cocktails call their sections Spec and Method, and show the glass", async ({ page }) => {
  await open(page, "daiquiri");
  await expect(page.getByRole("heading", { name: "Spec" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Method" })).toBeVisible();
  await expect(fact(page, "Glass")).toHaveText("Coupe");
  await expect(fact(page, "Std drinks")).toHaveText("1.5");
});

test.describe("checking things off", () => {
  test.beforeEach(async ({ page }) => {
    await open(page, "pork-carnitas");
    await expect(heading(page)).toHaveText("Pork Carnitas");
  });

  test("checked ingredients stay checked after a reload", async ({ page }) => {
    await ingredient(page, /Kosher salt/).check();
    await page.reload();
    await expect(ingredient(page, /Kosher salt/)).toBeChecked();
    await expect(ingredient(page, /Pork shoulder/)).not.toBeChecked();
  });

  test("tapping a step marks it done, and tapping again undoes it", async ({ page }) => {
    await step(page, "Season the pork.").click();
    await expect(step(page, "Season the pork.")).toHaveClass(/\bdone\b/);
    await step(page, "Season the pork.").click();
    await expect(step(page, "Season the pork.")).not.toHaveClass(/\bdone\b/);
  });

  test("finished steps stay done after a reload", async ({ page }) => {
    await step(page, "Shred the pork.").click();
    await page.reload();
    await expect(step(page, "Shred the pork.")).toHaveClass(/\bdone\b/);
    await expect(step(page, "Season the pork.")).not.toHaveClass(/\bdone\b/);
  });

  test("steps work from the keyboard with Enter and Space", async ({ page }) => {
    await step(page, "Season the pork.").focus();
    await page.keyboard.press("Enter");
    await expect(step(page, "Season the pork.")).toHaveClass(/\bdone\b/);
    await page.keyboard.press(" ");
    await expect(step(page, "Season the pork.")).not.toHaveClass(/\bdone\b/);
  });

  test("Reset checkmarks clears ingredients and steps, and it sticks", async ({ page }) => {
    await ingredient(page, /Kosher salt/).check();
    await step(page, "Season the pork.").click();
    await page.getByRole("button", { name: /Reset checkmarks/ }).click();
    await expect(ingredient(page, /Kosher salt/)).not.toBeChecked();
    await expect(step(page, "Season the pork.")).not.toHaveClass(/\bdone\b/);
    await page.reload();
    await expect(ingredient(page, /Kosher salt/)).not.toBeChecked();
  });

  test("each recipe remembers its own progress", async ({ page }) => {
    await page.getByRole("checkbox").first().check();
    await open(page, "chicken-tinga");
    await expect(heading(page)).toHaveText("Chicken Tinga");
    await expect(page.getByRole("checkbox").first()).not.toBeChecked();
  });
});

test.describe("the current step", () => {
  const current = (page) => page.locator(`ol.steps li[aria-current="step"]`);

  test.beforeEach(async ({ page }) => {
    await open(page, "pork-carnitas");
    await expect(heading(page)).toHaveText("Pork Carnitas");
  });

  test("isn't shown before you start", async ({ page }) => {
    await expect(current(page)).toHaveCount(0);
  });

  test("is the next step after the one you finished", async ({ page }) => {
    await step(page, "Season the pork.").click();
    await expect(current(page)).toHaveText(/Braise until tender/);
  });

  test("is the first unfinished step, even if you skipped ahead", async ({ page }) => {
    await step(page, "Braise until tender.").click();
    await expect(current(page)).toHaveText("Season the pork.");
  });

  test("carries on into the next group of steps", async ({ page }) => {
    await step(page, "Season the pork.").click();
    await step(page, "Braise until tender.").click();
    await expect(current(page)).toHaveText("Shred the pork.");
  });

  test("isn't shown once every step is done", async ({ page }) => {
    for (const s of await page.locator("ol.steps li").all()) await s.click();
    await expect(current(page)).toHaveCount(0);
  });

  test("survives a reload", async ({ page }) => {
    await step(page, "Season the pork.").click();
    await page.reload();
    await expect(current(page)).toHaveText(/Braise until tender/);
  });
});

test.describe("links", () => {
  test("the back link goes to the recipe's section", async ({ page }) => {
    await open(page, "pork-carnitas");
    await page.getByRole("link", { name: /Cooking/ }).click();
    await expect(page).toHaveURL(/recipes\.html\?cat=cooking$/);
    await expect(page.locator("#count")).toHaveText("4 recipes");
  });

  test("a tag opens its section with that filter on", async ({ page }) => {
    await open(page, "pork-carnitas");
    await page.getByRole("link", { name: "Mexican" }).click();
    await expect(page).toHaveURL(/recipes\.html\?cat=cooking&cuisine=mexican$/);
    await expect(page.locator("#grid h2")).toHaveText(["Chicken Tinga", "Pork Carnitas", "Salsa Verde"]);
  });
});

test.describe("problems", () => {
  for (const [what, query] of [["an unknown recipe", "?r=no-such-recipe"], ["a malformed link", "?r=../secrets"], ["no recipe at all", ""]]) {
    test(`${what} shows "Recipe not found"`, async ({ page }) => {
      await page.goto(`recipe.html${query}`);
      await expect(page.getByText("Recipe not found.")).toBeVisible();
      await expect(page.getByRole("link", { name: /All recipes/ })).toHaveAttribute("href", "recipes.html");
    });
  }

  test("the recipe still shows if the tag list fails to load", async ({ page }) => {
    await page.route("**/recipes/vocabulary.json", (route) => route.abort());
    await open(page, "pork-carnitas");
    await expect(heading(page)).toHaveText("Pork Carnitas");
    await expect(page.getByRole("link", { name: "Mexican" })).toHaveCount(0);
  });

  test("text in a recipe is shown as text, never run as page code", async ({ page }) => {
    await open(page, "sneaky-recipe");
    await expect(heading(page)).toHaveText(`Sneaky <img src="x" class="injected">`);
    await expect(page.getByText(`<script class="injected">1</script> flour`)).toBeVisible();
    await expect(page.locator(".injected")).toHaveCount(0);
  });

  test("a javascript: source link is shown as plain text", async ({ page }) => {
    await open(page, "sneaky-recipe");
    await expect(page.getByText("Source: Bad link")).toBeVisible();
    await expect(page.getByRole("link", { name: "Bad link" })).toHaveCount(0);
  });
});

// Every real recipe, so a recipe file the checker allows but the page can't
// show gets caught here rather than mid-cook.
test.describe("every real recipe", () => {
  test.use({ testRecipes: false });
  const real = JSON.parse(readFileSync(new URL("../../recipes/index.json", import.meta.url), "utf8"));

  for (const r of real) {
    test(`${r.slug} opens without errors`, async ({ page }) => {
      const errors = [];
      page.on("pageerror", (e) => errors.push(e.message));
      page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
      await open(page, r.slug);
      await expect(heading(page)).toHaveText(r.title);
      expect(await page.getByRole("checkbox").count()).toBeGreaterThan(0);
      expect(await page.locator("ol.steps li").count()).toBeGreaterThan(0);
      expect(errors).toEqual([]);
    });
  }
});
