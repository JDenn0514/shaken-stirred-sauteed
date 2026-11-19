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
// Save on a new import: its first Save names the amounts not ticked Checked
// (build step 25), and its Save goes ahead.
async function saveImport(page) {
  await page.getByRole("button", { name: "Save" }).click();
  await page.getByRole("dialog", { name: "Check the amounts?" }).getByRole("button", { name: "Save" }).click();
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

  test("with nothing read, it offers to bring one in or start from scratch in a section", async ({ page, baseURL }) => {
    await signIn(page, baseURL);
    await page.goto("edit.html?new");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Add a recipe");
    await expect(page.getByRole("link", { name: "Bring one in" })).toHaveAttribute("href", "intake.html");
    const sections = page.getByRole("navigation", { name: "Start from scratch" }).getByRole("link");
    await expect(sections).toHaveText([/Baking/, /Cooking/, /Cocktails/]);
    expect(await sections.evaluateAll((as) => as.map((a) => a.getAttribute("href")))).toEqual(["edit.html?new=baking", "edit.html?new=cooking", "edit.html?new=cocktails"]);
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
    await saveImport(page);
    await expect(page.getByRole("status").filter({ hasText: "Published" })).toBeVisible();
    expect(sent[0].recipe.steps.find((s) => s.do.includes("knead")).watch).toBeUndefined();
  });

  test("in an open step, the intake's guess stands in for the editor's own setting, so it shows once", async ({ page, baseURL }) => {
    await readRolls(page, baseURL);
    await continueInEditor(page);
    await stepRow(page, "knead until smooth").getByRole("button").first().click();
    const fold = page.getByRole("group", { name: "For the lineup" });
    await fold.getByText(/^For the lineup/).click();
    await expect(fold.getByRole("checkbox", { name: "Needs you there" })).toBeChecked();
    await expect(fold.getByRole("checkbox", { name: "Needs you there the whole wait" })).toHaveCount(0);
    await fold.getByRole("checkbox", { name: "Needs you there" }).uncheck();
    await page.getByRole("button", { name: "Done" }).click();
    await expect(stepRow(page, "knead until smooth").getByRole("checkbox", { name: "Needs you there" })).not.toBeChecked();
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
    await page.getByText("Details", { exact: true }).click();
    await page.getByRole("group", { name: "Type" }).getByRole("checkbox").first().check();
    const sent = await fakeSave(page, published("milk-rolls"));
    await saveImport(page);

    const status = page.getByRole("status").filter({ hasText: "Published" });
    await expect(status.getByRole("link", { name: "See Milk Rolls on the site" })).toHaveAttribute("href", "recipe.html?r=milk-rolls");
    expect(sent).toHaveLength(1);
    expect(sent[0].slug).toBe("milk-rolls");
    expect(sent[0].baseSha).toBeUndefined();
    expect(sent[0].recipe.tags.type).toHaveLength(1);
    expect(JSON.stringify(sent[0].recipe)).not.toMatch(/reviewId|"review"/);
    expect(JSON.stringify(sent[0])).not.toContain("METHOD");
    await expect(page).toHaveURL(/edit\.html\?r=milk-rolls$/);
    // From then on it's an ordinary recipe: the bar names it and its section.
    await expect(page.getByRole("region", { name: "Editing" })).toContainText("Editing · Baking");
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
    await saveImport(page);
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
    await saveImport(page);
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

  test("on a phone, opens over the page from the bar, wherever you are on it", async ({ page, baseURL }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await readRolls(page, baseURL);
    await continueInEditor(page);
    await preview(page).getByRole("button", { name: "Edit step 3" }).press("Enter");
    const step = page.getByLabel("Step", { exact: true });
    await step.fill(`${await step.inputValue()} Brush with milk.`);
    const typed = await step.inputValue();
    const bar = page.getByRole("region", { name: "Editing" });
    await bar.getByRole("button", { name: "Show the original" }).press("Enter");
    const sheet = page.getByRole("dialog", { name: "The original" });
    await expect(sheet.getByText("2 1/4 teaspoons instant yeast")).toBeVisible();
    await expect(sheet.getByRole("button", { name: "Hide the original" })).toBeFocused();
    await page.keyboard.press("Enter");
    await expect(sheet).toBeHidden();
    await expect(bar.getByRole("button", { name: "Show the original" })).toBeFocused();
    // The open step, and what was typed in it, are as they were.
    await expect(step).toHaveValue(typed);
  });

  test("on a laptop, the site's name lines up with the recipe's name in the bar", async ({ page, baseURL }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await readRolls(page, baseURL);
    await continueInEditor(page);
    const brand = await page.getByRole("link", { name: "Shaken, Stirred & Sautéed", exact: true }).boundingBox();
    const bar = await page.getByRole("region", { name: "Editing" }).boundingBox();
    expect(Math.round(brand.x)).toBe(Math.round(bar.x));
  });

  test("on a wide laptop, the original keeps the place beside the preview: there's no side rail", async ({ page, baseURL }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await readRolls(page, baseURL);
    await continueInEditor(page);
    await expect(page.getByRole("complementary", { name: "Checks and details" })).toHaveCount(0);
    const side = await original(page).boundingBox(), sheet = await preview(page).boundingBox();
    expect(side.x).toBeGreaterThanOrEqual(sheet.x + sheet.width);
  });

  test("on a laptop, the bar has no button for it: it's beside the preview already", async ({ page, baseURL }) => {
    await readRolls(page, baseURL);
    await continueInEditor(page);
    await expect(page.getByRole("region", { name: "Editing" }).getByRole("button", { name: "Show the original" })).toBeHidden();
  });
});

// Each amount the reader read can be ticked "Checked" against the original
// (docs/specs/editor-redesign.md, build step 25, decision 8).
test.describe("checking the amounts", () => {
  const tick = (page, name) => preview(page).locator("li[data-ing-row]").filter({ hasText: name }).getByRole("checkbox", { name: /^Checked/ });

  test("each amount has a Checked tick, which changing the amount takes off", async ({ page, baseURL }) => {
    await readRolls(page, baseURL);
    await continueInEditor(page);
    await expect(tick(page, "Whole milk")).toHaveAccessibleName("Checked 1 cup Whole milk");
    await expect(tick(page, "Whole milk")).not.toBeChecked();
    await tick(page, "Whole milk").focus();
    await page.keyboard.press("Space");
    await expect(tick(page, "Whole milk")).toBeChecked();
    await expect(tick(page, "Whole milk")).toBeFocused();

    await preview(page).getByRole("button", { name: "Edit Whole milk" }).press("Enter");
    await page.getByLabel("Amount", { exact: true }).fill("1 1/4 cups");
    await page.getByRole("button", { name: "Done" }).press("Enter");
    await expect(tick(page, "Whole milk")).not.toBeChecked();
    await page.getByRole("button", { name: "Undo" }).click();
    await expect(tick(page, "Whole milk")).toBeChecked();
  });

  test("a reload keeps the ticks", async ({ page, baseURL }) => {
    await readRolls(page, baseURL);
    await continueInEditor(page);
    await tick(page, "Instant yeast").check();
    await page.reload();
    await expect(tick(page, "Instant yeast")).toBeChecked();
  });

  test("the first Save names the amounts not yet ticked, and saves anyway when you say", async ({ page, baseURL }) => {
    const sent = await fakeSave(page, published("milk-rolls"));
    await readRolls(page, baseURL);
    await continueInEditor(page);
    await tick(page, "Whole milk").check();
    await tick(page, "Instant yeast").check();
    await page.getByRole("button", { name: "Save" }).press("Enter");
    const ask = page.getByRole("dialog", { name: "Check the amounts?" });
    await expect(ask.getByRole("listitem")).toHaveText(["3 cups Bread flour"]);
    expect(sent).toHaveLength(0);
    await ask.getByRole("button", { name: "Save" }).press("Enter");
    await expect(page.getByRole("status").filter({ hasText: "Published" })).toBeVisible();
    expect(sent).toHaveLength(1);
    expect(JSON.stringify(sent[0].recipe)).not.toContain("checked");
  });

  test("it reminds once: after Keep checking, Save saves", async ({ page, baseURL }) => {
    const sent = await fakeSave(page, published("milk-rolls"));
    await readRolls(page, baseURL);
    await continueInEditor(page);
    await page.getByRole("button", { name: "Save" }).press("Enter");
    await page.getByRole("dialog", { name: "Check the amounts?" }).getByRole("button", { name: "Keep checking" }).press("Enter");
    await expect(page.getByRole("button", { name: "Save" })).toBeFocused();
    expect(sent).toHaveLength(0);
    await page.getByRole("button", { name: "Save" }).press("Enter");
    await expect(page.getByRole("status").filter({ hasText: "Published" })).toBeVisible();
  });

  test("with every amount ticked, Save saves at once", async ({ page, baseURL }) => {
    const sent = await fakeSave(page, published("milk-rolls"));
    await readRolls(page, baseURL);
    await continueInEditor(page);
    for (const name of ["Whole milk", "Instant yeast", "Bread flour"]) await tick(page, name).check();
    await page.getByRole("button", { name: "Save" }).press("Enter");
    await expect(page.getByRole("status").filter({ hasText: "Published" })).toBeVisible();
    expect(sent).toHaveLength(1);
  });
});
