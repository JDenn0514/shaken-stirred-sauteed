// The recipe intake's review screen (intake.html): paste a recipe's text,
// answer what the lineup needs (docs/specs/intake-lineup-needs.md), see the
// preview, and get the recipe file. Fixing what was read wrong, and saving,
// are the editor's (tests/e2e/intake-to-editor.spec.mjs).
import { test, expect } from "./fixtures.mjs";
import { ROLLS, CHICKEN, NOODLES, readRecipe } from "./intake-samples.mjs";

const preview = (page) => page.getByRole("region", { name: "Preview" });
const questions = (page) => page.getByRole("region", { name: "Questions" });
const recipeFile = async (page) => {
  await page.getByRole("button", { name: "Copy recipe" }).click();
  return JSON.parse(await page.getByLabel("Recipe file").inputValue());
};

test("shows the recipe it read, as a preview", async ({ page }) => {
  await readRecipe(page, ROLLS, "Baking");
  await expect(preview(page).getByRole("heading", { name: "Milk Rolls" })).toBeVisible();
  await expect(preview(page).getByRole("listitem").filter({ hasText: "whole milk" })).toBeVisible();
  await expect(preview(page).locator("ol.steps > li")).toHaveCount(4);
});

test("asks for a time for a step that waits, filled in from its text", async ({ page }) => {
  await readRecipe(page, ROLLS, "Baking");
  const bake = questions(page).getByRole("group", { name: /bake until golden/ });
  await expect(bake.getByLabel("How long?")).toHaveValue("20 to 25 minutes");
  await bake.getByRole("button", { name: "Use this time" }).click();
  await expect(bake).toContainText("✓ 20 to 25 minutes");
  await expect(preview(page).locator("ol.steps > li").filter({ hasText: "bake until golden" })).toContainText("⏱ 20 to 25 minutes");
});

test("a time it can't read isn't taken, and says why", async ({ page }) => {
  await readRecipe(page, CHICKEN, "Cooking");
  const bake = questions(page).getByRole("group", { name: /bake until the rice is tender/ });
  await bake.getByLabel("How long?").fill("until done");
  await bake.getByRole("button", { name: "Use this time" }).click();
  await expect(bake).toContainText('like "35 min"');
  await expect(bake).not.toContainText("✓");
});

test("the recipe can't be copied until every question is answered", async ({ page }) => {
  await readRecipe(page, CHICKEN, "Cooking");
  await expect(page.getByRole("button", { name: "Copy recipe" })).toBeDisabled();
  await expect(page.getByText("Still needed: 3 questions to answer")).toBeVisible();

  await questions(page).getByRole("group", { name: /bake until the rice is tender/ }).getByLabel("How long?").fill("20 to 25 min");
  await questions(page).getByRole("group", { name: /bake until the rice is tender/ }).getByRole("button", { name: "Use this time" }).click();
  await questions(page).getByRole("group", { name: /Let it rest/ }).getByRole("button", { name: "It doesn't wait" }).click();
  const served = questions(page).getByRole("group", { name: "How is it served?" });
  await served.getByRole("radio", { name: /^Hot/ }).check();
  await served.getByLabel("Can sit for").fill("5 min");
  await served.getByLabel("Can sit for").blur();

  await expect(page.getByRole("button", { name: "Copy recipe" })).toBeEnabled();
  const recipe = await recipeFile(page);
  expect(recipe.title).toBe("Skillet Chicken and Rice");
  expect(recipe.serve).toBe("hot");
  expect(recipe.sits).toBe("5 min");
  expect(recipe.steps.find((s) => s.do.includes("bake until the rice")).wait).toBe("20 to 25 min");
  await expect(page.getByText("recipes/skillet-chicken-and-rice.json")).toBeVisible();
});

test("the things to check are listed: here, every amount", async ({ page }) => {
  await readRecipe(page, ROLLS, "Baking");
  await expect(page.getByRole("region", { name: "Things to check" })).toContainText("Check every amount against the original");
});

// --- Keeping an unfinished review ---------------------------------------------

const offer = (page) => page.getByRole("region", { name: "Carry on with Milk Rolls?" });

test("a reload offers the unfinished review back, and carries on with it as it was", async ({ page }) => {
  await readRecipe(page, ROLLS, "Baking");
  await questions(page).getByRole("button", { name: "Use this time" }).click();

  await page.reload();
  await expect(preview(page)).toHaveCount(0);
  await offer(page).getByRole("button", { name: "Carry on" }).click();
  await expect(offer(page)).toHaveCount(0);
  await expect(preview(page).getByRole("heading", { name: "Milk Rolls" })).toBeVisible();
  await expect(questions(page).getByRole("group", { name: /bake until golden/ })).toContainText("✓ 20 to 25 minutes");
  await expect(page.getByRole("button", { name: "Copy recipe" })).toBeEnabled();
  // And the text it was read from, to check against.
  await expect(page.getByRole("region", { name: "The original" })).toContainText("2 1/4 teaspoons instant yeast");
});

test("Start over drops the unfinished review", async ({ page }) => {
  await readRecipe(page, ROLLS, "Baking");
  await page.reload();
  await offer(page).getByRole("button", { name: "Start over" }).click();
  await expect(offer(page)).toHaveCount(0);
  await expect(preview(page)).toHaveCount(0);
  await page.reload();
  await expect(page.getByRole("button", { name: "Read the recipe" })).toBeVisible();
  await expect(offer(page)).toHaveCount(0);
});

// --- Prep first ---------------------------------------------------------------------

test("the Prep first switch shows the added prep step in place", async ({ page }) => {
  await readRecipe(page, NOODLES, "Cooking");
  const prepFirst = preview(page).getByRole("switch", { name: "Prep first" });
  await expect(prepFirst).toBeChecked();
  await expect(preview(page).getByRole("heading", { name: "Prep" })).toBeVisible();
  const prep = preview(page).locator("ol.steps > li").filter({ hasText: "Mince the garlic" });
  await expect(preview(page).locator("ol.steps > li").first()).toContainText("Mince the garlic");

  await prepFirst.focus();
  await page.keyboard.press("Space");
  await expect(prepFirst).not.toBeChecked();
  await expect(prepFirst).toBeFocused();
  await expect(prep).toHaveCount(0);
  await expect(preview(page).locator("ol.steps > li")).toHaveCount(2);
});

// --- The original beside the preview --------------------------------------------------

const original = (page) => page.getByRole("region", { name: "The original" });

test("the pasted text sits beside the preview", async ({ page }) => {
  await readRecipe(page, ROLLS, "Baking");
  await expect(original(page)).toContainText("3. Shape into 8 rolls and bake until golden");
  await expect(original(page).getByRole("button", { name: /the original/ })).toBeHidden();
  const [o, p] = await Promise.all([original(page).boundingBox(), preview(page).boundingBox()]);
  expect(o.x).toBeGreaterThan(p.x + p.width - 1);
});

test("on a phone, the original is one tap away", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await readRecipe(page, ROLLS, "Baking");
  const text = original(page).getByText("2 1/4 teaspoons instant yeast");
  await expect(text).toBeHidden();
  const show = original(page).getByRole("button", { name: "Show the original" });
  await expect(show).toHaveAttribute("aria-expanded", "false");
  await show.click();
  await expect(text).toBeVisible();
  const hide = original(page).getByRole("button", { name: "Hide the original" });
  await expect(hide).toHaveAttribute("aria-expanded", "true");
  await hide.click();
  await expect(text).toBeHidden();
});

test("the original isn't in the recipe", async ({ page }) => {
  await readRecipe(page, ROLLS, "Baking");
  await questions(page).getByRole("button", { name: "Use this time" }).click();
  expect(JSON.stringify(await recipeFile(page))).not.toContain("METHOD");
});
