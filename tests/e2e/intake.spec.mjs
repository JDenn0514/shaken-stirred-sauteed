// The recipe intake's review screen (intake.html): paste a recipe's text,
// answer what the lineup needs (docs/specs/intake-lineup-needs.md), check the
// preview, fix what was read wrong, and get the recipe file.
import { test, expect } from "./fixtures.mjs";
import { ROLLS, CHICKEN, readRecipe } from "./intake-samples.mjs";

const preview = (page) => page.getByRole("region", { name: "Preview" });
const questions = (page) => page.getByRole("region", { name: "Questions" });
const recipeFile = async (page) => {
  await page.getByRole("button", { name: "Copy recipe" }).click();
  return JSON.parse(await page.getByLabel("Recipe file").inputValue());
};

test("shows the recipe it read, as a preview", async ({ page }) => {
  await readRecipe(page, ROLLS, "Baking");
  await expect(preview(page).getByRole("button", { name: "Milk Rolls" })).toBeVisible();
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

test("a step the reader split can be joined back", async ({ page }) => {
  await readRecipe(page, ROLLS, "Baking");
  const warm = preview(page).locator("ol.steps > li").filter({ hasText: "warm the milk" });
  await expect(warm).toContainText("Split from one step");
  await warm.getByRole("button", { name: "Join back" }).click();
  await expect(preview(page).locator("ol.steps > li")).toHaveCount(3);
  await expect(preview(page).locator("ol.steps > li").first()).toContainText("until lukewarm. Pour it into a large bowl");
});

test("a guess on a step can be changed: whether a wait needs you there", async ({ page }) => {
  await readRecipe(page, ROLLS, "Baking");
  const knead = preview(page).locator("ol.steps > li").filter({ hasText: "knead until smooth" });
  await expect(knead.getByRole("checkbox", { name: "Needs you there" })).toBeChecked();
  await knead.getByRole("checkbox", { name: "Needs you there" }).uncheck();
  await questions(page).getByRole("button", { name: "Use this time" }).click();
  const recipe = await recipeFile(page);
  expect(recipe.steps.find((s) => s.do.includes("knead")).watch).toBeUndefined();
});

test("an ingredient read wrong can be fixed in the preview", async ({ page }) => {
  await readRecipe(page, ROLLS, "Baking");
  await preview(page).getByRole("button", { name: /bread flour/ }).click();
  await preview(page).getByLabel("Amount").fill("3 1/2 cups");
  await preview(page).getByRole("button", { name: "Done" }).click();
  await expect(preview(page).getByRole("button", { name: /3 1\/2 cups bread flour/ })).toBeVisible();
  await questions(page).getByRole("button", { name: "Use this time" }).click();
  const recipe = await recipeFile(page);
  expect(recipe.ingredients.find((i) => i.item === "bread flour").qty).toBe("3 1/2 cups");
});

test("the things to check are listed: here, every amount", async ({ page }) => {
  await readRecipe(page, ROLLS, "Baking");
  await expect(page.getByRole("region", { name: "Things to check" })).toContainText("Check every amount against the original");
});
