// A new recipe, from the intake to the editor (docs/specs/recipe-editor-plan.md,
// "One editor"): the intake reads it and asks its questions, then "Continue in
// the editor" opens it in the editor as a new recipe (edit.html?new), with
// the reader's guesses, the things to check and the original. The editor's
// Save publishes it as a new file, named from its title.
import { test, expect, EDITOR_INDEX, signIn } from "./fixtures.mjs";
import { ROLLS, NOODLES, readRecipe } from "./intake-samples.mjs";

const preview = (page) => page.getByRole("region", { name: "Recipe preview" });
const original = (page) => page.getByRole("region", { name: "The original" });
const stepRow = (page, text) => preview(page).locator("li[data-step]").filter({ hasText: text });
const kept = (page) => page.evaluate(() => localStorage.getItem("sss:intake"));

// Answers POST /api/save with `reply`, and keeps each request's body.
async function fakeSave(page, reply) {
  const sent = [];
  await page.route("**/api/save", (route) => {
    sent.push(route.request().postDataJSON());
    return route.fulfill(typeof reply === "function" ? reply(sent.length) : reply);
  });
  return sent;
}
const published = (slug) => ({ json: { slug, title: "x", sha: "1".repeat(40), commit: "c".repeat(40) } });

// Signed in to an account that can edit, Milk Rolls read and its question answered.
async function readRolls(page, baseURL, text = ROLLS, section = "Baking") {
  await signIn(page, baseURL);
  await page.route("**/recipes/index.json", (route) => route.fulfill({ json: EDITOR_INDEX }));
  await readRecipe(page, text, section);
  const use = page.getByRole("button", { name: "Use this time" });
  for (const b of await use.all()) await b.click();
}
async function continueInEditor(page) {
  await page.getByRole("link", { name: "Continue in the editor" }).click();
  await expect(page).toHaveURL(/edit\.html\?new$/);
  await expect(preview(page).getByRole("heading", { level: 1 })).toBeVisible();
}

test.describe("from the intake", () => {
  test("Continue in the editor opens the recipe read, as a new recipe, with the original beside it", async ({ page, baseURL }) => {
    await readRolls(page, baseURL);
    await continueInEditor(page);
    await expect(preview(page).getByRole("heading", { level: 1 })).toHaveText("Milk Rolls");
    await expect(page.getByText("New recipe")).toBeVisible();
    await expect(page.getByText("recipes/milk-rolls.json")).toBeVisible();
    await expect(stepRow(page, "bake until golden")).toContainText("⏱ 20 to 25 minutes");
    await expect(original(page)).toContainText("2 1/4 teaspoons instant yeast");
    await expect(page.getByRole("button", { name: "Delete this recipe" })).toHaveCount(0);
  });

  test("the intake only offers it to someone who can save", async ({ page }) => {
    await readRecipe(page, ROLLS, "Baking");
    await page.getByRole("button", { name: "Use this time" }).click();
    await expect(page.getByRole("link", { name: "Continue in the editor" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Copy recipe" })).toBeEnabled();
  });

  test("the intake waits for its questions to be answered", async ({ page, baseURL }) => {
    await signIn(page, baseURL);
    await readRecipe(page, ROLLS, "Baking");
    await expect(page.getByRole("link", { name: "Continue in the editor" })).toHaveCount(0);
    await expect(page.getByText("Still needed: 1 question to answer")).toBeVisible();
    await page.getByRole("button", { name: "Use this time" }).click();
    await expect(page.getByRole("link", { name: "Continue in the editor" })).toBeVisible();
  });

  test("with nothing read, there's nothing to finish", async ({ page, baseURL }) => {
    await signIn(page, baseURL);
    await page.goto("edit.html?new");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Nothing to finish");
    await expect(page.getByRole("link", { name: "Add a recipe" }).last()).toHaveAttribute("href", "intake.html");
  });

  test("signed out, it asks you to sign in", async ({ page }) => {
    await page.goto("edit.html?new");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Sign in to edit");
  });
});

test.describe("the reader's guesses, in the editor", () => {
  test("a step the reader split can be joined back", async ({ page, baseURL }) => {
    await readRolls(page, baseURL);
    await continueInEditor(page);
    const warm = stepRow(page, "warm the milk");
    await expect(warm).toContainText("Split from one step");
    await warm.getByRole("button", { name: "Join back" }).click();
    await expect(preview(page).locator("li[data-step]")).toHaveCount(3);
    await expect(preview(page).locator("li[data-step]").first()).toContainText("until lukewarm. Pour it into a large bowl");
  });

  test("a guess can be changed: whether a wait needs you there", async ({ page, baseURL }) => {
    await readRolls(page, baseURL);
    await continueInEditor(page);
    const knead = stepRow(page, "knead until smooth");
    await expect(knead.getByRole("checkbox", { name: "Needs you there" })).toBeChecked();
    await knead.getByRole("checkbox", { name: "Needs you there" }).uncheck();
    const sent = await fakeSave(page, published("milk-rolls"));
    await page.getByRole("button", { name: "Save" }).click();
    await expect(page.getByRole("status").filter({ hasText: "Published" })).toBeVisible();
    expect(sent[0].recipe.steps.find((s) => s.do.includes("knead")).watch).toBeUndefined();
  });

  test("an added prep step shows in prep-first order, with its guess to confirm", async ({ page, baseURL }) => {
    await signIn(page, baseURL);
    await readRecipe(page, NOODLES, "Cooking");
    const served = page.getByRole("group", { name: "How is it served?" });
    await served.getByRole("radio", { name: /^Hot/ }).check();
    await continueInEditor(page);
    await expect(preview(page).getByRole("switch", { name: "Prep first" })).toBeChecked();
    const prep = stepRow(page, "Mince the garlic");
    await expect(prep).toContainText("Added: prep from the ingredient list");
    await expect(prep.getByRole("combobox", { name: /Prep/ })).toHaveValue("ahead");
  });

  test("the things to check sit beside what they're about", async ({ page, baseURL }) => {
    await readRolls(page, baseURL);
    await continueInEditor(page);
    await expect(preview(page)).toContainText("Check every amount against the original");
  });

  test("a reload keeps the changes made in the editor", async ({ page, baseURL }) => {
    await readRolls(page, baseURL);
    await continueInEditor(page);
    await preview(page).getByRole("button", { name: "Milk Rolls" }).click();
    await page.getByLabel("Title").fill("Soft Milk Rolls");
    await page.getByRole("button", { name: "Done" }).click();
    await page.reload();
    await expect(preview(page).getByRole("heading", { level: 1 })).toHaveText("Soft Milk Rolls");
    await expect(page.getByText("recipes/soft-milk-rolls.json")).toBeVisible();
  });
});

test.describe("saving a new recipe", () => {
  test("publishes it under a name made from its title, without the review's marks, and carries on as that recipe", async ({ page, baseURL }) => {
    await readRolls(page, baseURL);
    await continueInEditor(page);
    // The editor's own tools, which the intake never had: a tag, from Details.
    await page.getByText("Details").click();
    await page.getByRole("group", { name: "Type" }).getByRole("checkbox").first().check();
    const sent = await fakeSave(page, published("milk-rolls"));
    await page.getByRole("button", { name: "Save" }).click();

    const status = page.getByRole("status").filter({ hasText: "Published" });
    await expect(status.getByRole("link", { name: "See Milk Rolls on the site" })).toHaveAttribute("href", "recipe.html?r=milk-rolls");
    expect(sent).toHaveLength(1);
    expect(sent[0].slug).toBe("milk-rolls");
    expect(sent[0].baseSha).toBeUndefined();
    expect(sent[0].recipe.tags.type).toHaveLength(1);
    expect(JSON.stringify(sent[0].recipe)).not.toMatch(/reviewId|"review"/);
    expect(JSON.stringify(sent[0])).not.toContain("METHOD");
    await expect(page).toHaveURL(/edit\.html\?r=milk-rolls$/);
    await expect(page.getByText(/^Editing/)).toContainText("recipes/milk-rolls.json");
    expect(await kept(page)).toBeNull();

    // The next save is an edit of the file it made.
    await preview(page).getByRole("button", { name: "Milk Rolls" }).click();
    await page.getByLabel("Title").fill("Milk Buns");
    await page.getByRole("button", { name: "Done" }).click();
    await page.getByRole("button", { name: "Save" }).click();
    await expect(page.getByRole("status").filter({ hasText: "See Milk Buns" })).toBeVisible();
    expect(sent[1]).toMatchObject({ slug: "milk-rolls", baseSha: "1".repeat(40) });
  });

  test("once saved, the intake doesn't offer it back", async ({ page, baseURL }) => {
    await readRolls(page, baseURL);
    await continueInEditor(page);
    await fakeSave(page, published("milk-rolls"));
    await page.getByRole("button", { name: "Save" }).click();
    await expect(page.getByRole("status").filter({ hasText: "Published" })).toBeVisible();
    await page.goto("intake.html");
    await expect(page.getByRole("button", { name: "Read the recipe" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Carry on" })).toHaveCount(0);
  });

  test("a title another recipe has is a problem to fix before saving", async ({ page, baseURL }) => {
    await readRolls(page, baseURL);
    await continueInEditor(page);
    await preview(page).getByRole("button", { name: "Milk Rolls" }).click();
    await page.getByLabel("Title").fill("Pork Carnitas");
    await page.getByRole("button", { name: "Done" }).click();
    await expect(page.getByRole("region", { name: "Problems to fix" })).toContainText("There's already a recipe called recipes/pork-carnitas.json");
    await expect(page.getByRole("button", { name: "Save" })).toBeDisabled();
  });

  test("a name taken since is refused by the Worker, and the draft is kept", async ({ page, baseURL }) => {
    await readRolls(page, baseURL);
    await continueInEditor(page);
    await fakeSave(page, { status: 409, json: { error: "There's already a recipe called recipes/milk-rolls.json. Open it in the editor to change it." } });
    await page.getByRole("button", { name: "Save" }).click();
    await expect(page.getByRole("alert")).toContainText("There's already a recipe called recipes/milk-rolls.json");
    await expect(page).toHaveURL(/edit\.html\?new$/);
    expect(await kept(page)).not.toBeNull();
  });
});

test.describe("the original, in the editor", () => {
  test("sits beside the preview", async ({ page, baseURL }) => {
    await readRolls(page, baseURL);
    await continueInEditor(page);
    const [o, p] = await Promise.all([original(page).boundingBox(), preview(page).boundingBox()]);
    expect(o.x).toBeGreaterThan(p.x + p.width - 1);
  });

  test("on a phone, is one tap away", async ({ page, baseURL }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await readRolls(page, baseURL);
    await continueInEditor(page);
    const text = original(page).getByText("2 1/4 teaspoons instant yeast");
    await expect(text).toBeHidden();
    await original(page).getByRole("button", { name: "Show the original" }).click();
    await expect(text).toBeVisible();
  });
});
