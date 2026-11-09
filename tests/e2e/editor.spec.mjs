// The recipe editor (edit.html), before saving exists: the preview, edit in
// place, Details with the lineup fields, the checker's errors and to-dos, the
// unsaved draft, and the sign-in gate. See docs/specs/recipe-editor-plan.md,
// "Slice 3".
import { test, expect, EDITOR_INDEX, EDITOR_RECIPES, signIn } from "./fixtures.mjs";

// Opens a recipe in the editor, signed in, with the editor's test recipes in the index.
async function openEditor(page, baseURL, slug) {
  await signIn(page, baseURL);
  await page.route("**/recipes/index.json", (route) => route.fulfill({ json: EDITOR_INDEX }));
  await page.goto(`edit.html?r=${slug}`);
  await expect(preview(page).getByRole("heading", { level: 1 })).toBeVisible();
}
const preview = (page) => page.getByRole("region", { name: "Recipe preview" });
const details = async (page) => {
  const summary = page.getByText("Details", { exact: true });
  if (!(await page.locator("details.edit-details").evaluate((d) => d.open))) await summary.click();
  return page.locator("details.edit-details");
};
const stepBox = (scope, n) => scope.getByRole("group", { name: new RegExp(`^Step ${n}:`) });
const ingredientBox = (scope, name) => scope.getByRole("group", { name, exact: true });
const draftOf = (page, slug) => page.evaluate((s) => JSON.parse(localStorage.getItem(`sss:draft:${s}`))?.recipe, slug);
// Each step as text, in the order shown (an open form shows its Step field's text).
const stepTexts = (page) => preview(page).locator("ol.steps > li").evaluateAll((lis) =>
  lis.map((li) => li.querySelector("textarea[name=do]")?.value ?? li.textContent.trim()));

test.describe("the preview", () => {
  test("shows the card, then the recipe as its page does", async ({ page, baseURL }) => {
    await openEditor(page, baseURL, "pork-carnitas");
    await expect(page.getByRole("region", { name: "Card preview" }).getByRole("heading", { name: "Pork Carnitas" })).toBeVisible();
    await expect(preview(page).getByRole("heading", { level: 1 })).toHaveText("Pork Carnitas");
    await expect(preview(page).getByRole("button", { name: "3 lb Pork shoulder in 2-inch chunks" })).toBeVisible();
    await expect(preview(page).getByRole("heading", { name: "For the braise" })).toBeVisible();
    expect(await stepTexts(page)).toEqual([
      "Season the pork.", "Braise until tender.⏱ 2 1/2 hours✓ Falls apart with a fork", "Shred the pork.", "Crisp it in a hot pan.",
    ]);
  });

  test("editing an ingredient changes the preview and the card's search", async ({ page, baseURL }) => {
    await openEditor(page, baseURL, "pork-carnitas");
    await preview(page).getByRole("button", { name: "1 orange" }).click();
    await page.getByLabel("Ingredient", { exact: true }).fill("2 oranges");
    await page.getByRole("button", { name: "Done" }).click();
    await expect(preview(page).getByRole("button", { name: "2 oranges" })).toBeVisible();
    await expect(preview(page).getByRole("button", { name: "2 oranges" })).toBeFocused();
  });

  test("the title, description and yield are edited in place", async ({ page, baseURL }) => {
    await openEditor(page, baseURL, "pork-carnitas");
    await preview(page).getByRole("button", { name: "Pork Carnitas" }).click();
    await page.getByLabel("Title").fill("Crispy Carnitas");
    await page.getByLabel("Yield").fill("Serves 8");
    await page.getByRole("button", { name: "Done" }).click();
    await expect(preview(page).getByRole("heading", { level: 1 })).toHaveText("Crispy Carnitas");
    await expect(preview(page).locator(".facts")).toContainText("8");
    await expect(page.getByRole("region", { name: "Card preview" }).getByRole("heading", { name: "Crispy Carnitas" })).toBeVisible();
  });

  test("a group is renamed in place", async ({ page, baseURL }) => {
    await openEditor(page, baseURL, "pork-carnitas");
    await preview(page).getByRole("button", { name: "For the braise" }).click();
    await page.getByLabel("Group name").fill("Braise");
    await page.getByRole("button", { name: "Done" }).click();
    await expect(preview(page).getByRole("heading", { name: "Braise", exact: true })).toBeVisible();
  });
});

test.describe("steps, by keyboard", () => {
  // Opens step n's editing form by keyboard.
  const openStep = (page, name) => preview(page).getByRole("button", { name }).press("Enter");

  test("adding a step", async ({ page, baseURL }) => {
    await openEditor(page, baseURL, "pork-carnitas");
    await preview(page).getByRole("button", { name: "Add step" }).press("Enter");
    await expect(page.getByLabel("Step", { exact: true })).toBeFocused();
    await page.keyboard.type("Serve with tortillas.");
    await page.getByRole("button", { name: "Done" }).press("Enter");
    expect((await stepTexts(page)).at(-1)).toBe("Serve with tortillas.");
  });

  test("removing a step", async ({ page, baseURL }) => {
    await openEditor(page, baseURL, "pork-carnitas");
    await openStep(page, "Season the pork.");
    await page.getByRole("button", { name: "Remove" }).press("Enter");
    expect(await stepTexts(page)).toHaveLength(3);
    expect((await stepTexts(page))[0]).toMatch(/^Braise until tender/);
  });

  test("moving a step down and back up", async ({ page, baseURL }) => {
    await openEditor(page, baseURL, "pork-carnitas");
    await openStep(page, "Season the pork.");
    await page.getByRole("button", { name: "Move down" }).press("Enter");
    expect((await stepTexts(page))[1]).toBe("Season the pork.");
    // Focus stays on the button, so pressing it again keeps moving the step.
    await expect(page.getByRole("button", { name: "Move down" })).toBeFocused();
    await page.getByRole("button", { name: "Move up" }).press("Enter");
    expect((await stepTexts(page))[0]).toBe("Season the pork.");
  });

  test("splitting a step where the cursor is, and joining it back", async ({ page, baseURL }) => {
    await openEditor(page, baseURL, "pork-carnitas");
    await openStep(page, "Shred the pork.");
    // Typing leaves the cursor at the end; step back over " Taste it.". (Home
    // would be shorter, but on a Mac it doesn't move the cursor in a textarea.)
    await page.getByLabel("Step", { exact: true }).fill("");
    await page.getByLabel("Step", { exact: true }).pressSequentially("Shred the pork. Taste it.");
    for (let i = 0; i < " Taste it.".length; i++) await page.keyboard.press("ArrowLeft");
    await page.getByRole("button", { name: "Split here" }).press("Enter");
    expect((await stepTexts(page)).slice(2)).toEqual(["Shred the pork.", "Taste it.", "Crisp it in a hot pan."]);

    await openStep(page, "Shred the pork.");
    await page.getByRole("button", { name: "Join with the next step" }).press("Enter");
    expect((await stepTexts(page)).slice(2)).toEqual(["Shred the pork. Taste it.", "Crisp it in a hot pan."]);
  });
});

test("fields the editor has no control for come out of an edit unchanged", async ({ page, baseURL }) => {
  await openEditor(page, baseURL, "old-fashioned");
  await preview(page).getByRole("button", { name: "2 oz Bourbon 60 ml" }).click();
  await preview(page).getByLabel("Amount", { exact: true }).fill("2 1/2 oz");
  await page.getByRole("button", { name: "Done" }).click();
  await preview(page).getByRole("button", { name: /^Strain over/ }).click();
  await page.getByLabel("Step", { exact: true }).fill("Strain over one large cube.");
  await page.getByRole("button", { name: "Done" }).click();

  const before = EDITOR_RECIPES["old-fashioned"];
  const after = await draftOf(page, "old-fashioned");
  const expected = structuredClone(before);
  expected.ingredients[0].qty = "2 1/2 oz";
  expected.steps[1].do = "Strain over one large cube.";
  expect(after).toEqual(expected);
  expect(Object.keys(after)).toEqual(Object.keys(before));
});

test.describe("lineup fields in Details", () => {
  test("watch is only offered on a step with a wait", async ({ page, baseURL }) => {
    await openEditor(page, baseURL, "garlic-bread");
    const d = await details(page);
    await expect(stepBox(d, 2).getByLabel("Needs you there the whole wait")).toBeVisible();
    await expect(stepBox(d, 1).getByLabel("Needs you there the whole wait")).toHaveCount(0);
  });

  test("choosing holds on one step clears it from another", async ({ page, baseURL }) => {
    await openEditor(page, baseURL, "garlic-bread");
    const d = await details(page);
    const holds = (n) => stepBox(d, n).getByRole("radio", { name: "Keeps as long as you like after this step" });
    await holds(1).check();
    await holds(2).check();
    await expect(holds(1)).not.toBeChecked();
    const steps = (await draftOf(page, "garlic-bread")).steps;
    expect(steps.map((s) => !!s.holds)).toEqual([false, true, false]);
  });

  test("the linked-recipe picker only offers recipes that exist", async ({ page, baseURL }) => {
    await openEditor(page, baseURL, "garlic-bread");
    const d = await details(page);
    const picker = ingredientBox(d, "Garlic butter").getByLabel("Made by another recipe");
    await expect(picker).toHaveValue("garlic-butter");
    const offered = await picker.locator("option").allInnerTexts();
    const others = EDITOR_INDEX.filter((e) => e.slug !== "garlic-bread").map((e) => e.title);
    expect(offered).toEqual(["Not made by a recipe", ...others]);
    await expect(ingredientBox(d, "Garlic butter").getByRole("textbox")).toHaveCount(0);
  });

  test("a step mentioning the oven is a to-do until an oven choice is made", async ({ page, baseURL }) => {
    await openEditor(page, baseURL, "garlic-bread");
    const todo = page.getByRole("region", { name: "To do" });
    await expect(todo).toContainText('step 2 mentions "oven" but has no equipment field');
    const d = await details(page);
    await stepBox(d, 2).getByLabel("Oven", { exact: true }).selectOption({ label: "At a temperature" });
    await stepBox(d, 2).getByLabel("Oven temperature").fill("220C");
    await stepBox(d, 2).getByLabel("Oven temperature").blur();
    await expect(page.getByText(/step 2 mentions "oven"/)).toHaveCount(0);
    expect((await draftOf(page, "garlic-bread")).steps[1].oven).toBe("220C");
  });

  test("a to-do's quick choice: the step doesn't use the oven", async ({ page, baseURL }) => {
    await openEditor(page, baseURL, "garlic-bread");
    const todo = page.getByRole("region", { name: "To do" });
    await todo.getByRole("button", { name: "Step 2 doesn't use the oven" }).click();
    await expect(page.getByText(/step 2 mentions "oven"/)).toHaveCount(0);
    expect((await draftOf(page, "garlic-bread")).steps[1].oven).toBe(false);
  });

  test("an added prep step shows only in the prep-first preview", async ({ page, baseURL }) => {
    await openEditor(page, baseURL, "garlic-bread");
    await expect(preview(page).getByRole("switch", { name: "Prep first" })).toHaveCount(0);
    const d = await details(page);
    await d.getByRole("button", { name: "Add a prep step" }).click();
    await expect(page.getByLabel("Step", { exact: true })).toBeFocused();
    await page.getByLabel("Step", { exact: true }).fill("Soften the garlic butter.");
    await page.getByRole("button", { name: "Done" }).click();

    const prepFirst = preview(page).getByRole("switch", { name: "Prep first" });
    await expect(prepFirst).toBeChecked();
    expect((await stepTexts(page))[0]).toBe("Soften the garlic butter.");
    await prepFirst.click();
    expect(await stepTexts(page)).not.toContain("Soften the garlic butter.");
  });
});

test("a step using an ingredient that isn't there shows the checker's message and turns Save off", async ({ page, baseURL }) => {
  await openEditor(page, baseURL, "lemon-bars");
  const save = page.getByRole("button", { name: "Save" });
  await expect(save).toBeEnabled();
  await preview(page).getByRole("button", { name: "8 Tbsp Butter melted" }).click();
  await page.getByLabel("Ingredient", { exact: true }).fill("Ghee");
  await page.getByRole("button", { name: "Done" }).click();
  const message = `step 1 uses "Butter", which isn't one of the ingredients`;
  await expect(page.getByRole("region", { name: "Problems to fix" })).toContainText(message);
  await expect(preview(page).locator("ol.steps > li").first()).toContainText(message);
  await expect(save).toBeDisabled();
});

test("only the section's tags are offered, and none can be typed", async ({ page, baseURL }) => {
  await openEditor(page, baseURL, "lemon-bars");
  const tags = (await details(page)).getByRole("group", { name: "Tags" });
  const offered = await tags.getByRole("group").evaluateAll((sets) => sets.map((s) => s.querySelector("legend").textContent));
  expect(offered).toEqual(["Type", "Flavor", "Uses up", "Ingredients", "Occasion", "Season", "Diet"]);
  await expect(tags.getByRole("checkbox", { name: "Cookies & bars" })).toBeChecked();
  await expect(tags.getByRole("textbox")).toHaveCount(0);
  await tags.getByRole("checkbox", { name: "Make-ahead" }).check();
  expect((await draftOf(page, "lemon-bars")).tags.occasion).toEqual(["make-ahead"]);
});

test("a reload brings back the unsaved draft", async ({ page, baseURL }) => {
  await openEditor(page, baseURL, "pork-carnitas");
  await preview(page).getByRole("button", { name: "Pork Carnitas" }).click();
  await page.getByLabel("Title").fill("Carnitas, Edited");
  await page.getByRole("button", { name: "Done" }).click();
  await page.reload();
  await page.getByRole("button", { name: "Bring back my changes" }).click();
  await expect(preview(page).getByRole("heading", { level: 1 })).toHaveText("Carnitas, Edited");
});

test("signed in, Add recipe is in the site bar and on the welcome page", async ({ page, baseURL }) => {
  await signIn(page, baseURL);
  await page.goto("index.html");
  await expect(page.getByRole("navigation", { name: "Site" }).getByRole("link", { name: "Add recipe" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Add a recipe →" })).toBeVisible();
});

test("a recipe with no total time is a to-do until one is given", async ({ page, baseURL }) => {
  await openEditor(page, baseURL, "salsa-verde");
  await expect(page.getByRole("region", { name: "To do" })).toContainText("no total time");
  const times = (await details(page)).getByRole("group", { name: "Times, in minutes" });
  await times.getByLabel("Prep").fill("10");
  await times.getByLabel("Prep").blur();
  await times.getByLabel("Total").fill("15");
  await times.getByLabel("Total").blur();
  await expect(page.getByText("no total time")).toHaveCount(0);
  expect((await draftOf(page, "salsa-verde")).time).toEqual({ prep: 10, total: 15 });
  await expect(page.getByRole("region", { name: "Card preview" })).toContainText("15 min");
});

test("an account that can't edit the site is told so, and shown no recipe", async ({ page, baseURL }) => {
  await signIn(page, baseURL);
  await page.route("**/api/me", (route) => route.fulfill({ json: { name: "A Friend", canEdit: false } }));
  await page.goto("edit.html?r=pork-carnitas");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("This account can't edit this site");
  await expect(page.getByText("Pork Carnitas")).toHaveCount(0);
});

test("signing out takes Add recipe away", async ({ page, baseURL }) => {
  await signIn(page, baseURL);
  await page.route("**/api/signout", (route) => route.fulfill({ json: {} }));
  await page.goto("recipes.html");
  const add = page.getByRole("navigation", { name: "Site" }).getByRole("link", { name: "Add recipe" });
  await expect(add).toBeVisible();
  await page.getByRole("contentinfo").getByRole("button", { name: "Sign out" }).click();
  await expect(add).toHaveCount(0);
});

test.describe("signed out", () => {
  test("edit.html asks you to sign in, and shows no recipe", async ({ page }) => {
    await page.goto("edit.html?r=pork-carnitas");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Sign in to edit");
    await expect(page.getByText("Pork Carnitas")).toHaveCount(0);
  });

  test("a stale sign-in hint asks you to sign in again", async ({ page, baseURL }) => {
    await page.context().addCookies([{ name: "signed-in", value: "1", url: baseURL }]);
    await page.goto("edit.html?r=pork-carnitas");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Sign in again");
  });

  for (const url of ["index.html", "recipes.html", "recipe.html?r=pork-carnitas", "menu.html", "intake.html"]) {
    test(`${url} has no Edit, no Add recipe and no link to the editor`, async ({ page }) => {
      await page.goto(url);
      await expect(page.locator("main")).not.toBeEmpty();
      await expect(page.getByRole("link", { name: /^Add (a )?recipe/ })).toHaveCount(0);
      await expect(page.getByRole("link", { name: /^Edit\b/ })).toHaveCount(0);
      await expect(page.getByRole("button", { name: /^Edit\b/ })).toHaveCount(0);
      await expect(page.locator('a[href*="edit.html"]')).toHaveCount(0);
    });
  }
});
