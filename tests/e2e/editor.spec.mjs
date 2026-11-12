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
// Each step as text, in the order shown (an open form shows its Step field's
// text). A step's text is its first button; its Edit button comes after.
const stepTexts = (page) => preview(page).locator("ol.steps > li").evaluateAll((lis) =>
  lis.map((li) => li.querySelector("textarea[name=do]")?.value ?? (li.querySelector("button") ?? li).textContent.trim()));

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
    await preview(page).getByRole("button", { name: "1 orange", exact: true }).click();
    await page.getByLabel("Ingredient", { exact: true }).fill("2 oranges");
    await page.getByRole("button", { name: "Done" }).click();
    await expect(preview(page).getByRole("button", { name: "2 oranges", exact: true })).toBeVisible();
    await expect(preview(page).getByRole("button", { name: "2 oranges", exact: true })).toBeFocused();
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

test.describe("notes and before you start", () => {
  const section = (page, name) => preview(page).getByRole("region", { name });
  const bar = (page) => page.getByRole("region", { name: "Editing" });

  test("a note is edited in place", async ({ page, baseURL }) => {
    await openEditor(page, baseURL, "pork-carnitas");
    await section(page, "Notes").getByRole("button", { name: "Edit note 1" }).press("Enter");
    await expect(page.getByLabel("Note", { exact: true })).toBeFocused();
    await page.keyboard.type(" Thaw it overnight.");
    await page.getByRole("button", { name: "Done" }).press("Enter");
    await expect(section(page, "Notes").getByRole("button", { name: "Freezes well. Thaw it overnight." })).toBeFocused();
    expect((await draftOf(page, "pork-carnitas")).notes).toEqual(["Freezes well. Thaw it overnight."]);
  });

  test("a Before you start line is edited in place, and can be taken out", async ({ page, baseURL }) => {
    await openEditor(page, baseURL, "pork-carnitas");
    await section(page, "Before you start").getByRole("button", { name: "Take the pork out of the fridge an hour ahead." }).press("Enter");
    await page.getByRole("textbox", { name: "Before you start", exact: true }).fill("Take the pork out two hours ahead.");
    await page.getByRole("button", { name: "Done" }).press("Enter");
    await expect(section(page, "Before you start").getByRole("button", { name: "Take the pork out two hours ahead." })).toBeVisible();

    await section(page, "Before you start").getByRole("button", { name: "Edit Before you start, line 1" }).press("Enter");
    await page.getByRole("button", { name: "Remove" }).press("Enter");
    await expect(section(page, "Before you start").getByRole("button", { name: "Nothing to do before you start. Add one" })).toBeFocused();
    expect((await draftOf(page, "pork-carnitas")).beforeYouStart).toBeUndefined();
  });

  test("an empty section invites you in, and writes nothing until you type", async ({ page, baseURL }) => {
    await openEditor(page, baseURL, "old-fashioned");
    await section(page, "Notes").getByRole("button", { name: "No notes yet. Add one" }).press("Enter");
    await expect(page.getByLabel("Note", { exact: true })).toBeFocused();
    await page.getByRole("button", { name: "Cancel" }).press("Enter");
    await expect(bar(page)).toContainText("No changes");
    await expect(section(page, "Notes").getByRole("button", { name: "No notes yet. Add one" })).toBeFocused();

    await section(page, "Before you start").getByRole("button", { name: "Nothing to do before you start. Add one" }).press("Enter");
    await page.keyboard.type("Chill the glass.");
    await page.getByRole("button", { name: "Done" }).press("Enter");
    await expect(section(page, "Before you start").getByRole("button", { name: "Chill the glass." })).toBeVisible();
    expect((await draftOf(page, "old-fashioned")).beforeYouStart).toEqual(["Chill the glass."]);
  });

  test("Done on a line left empty takes it out", async ({ page, baseURL }) => {
    await openEditor(page, baseURL, "pork-carnitas");
    await section(page, "Notes").getByRole("button", { name: "Edit note 1" }).press("Enter");
    await page.getByRole("button", { name: "Add a note after this" }).press("Enter");
    await expect(page.getByLabel("Note", { exact: true })).toHaveValue("");
    await page.getByRole("button", { name: "Done" }).press("Enter");
    await expect(section(page, "Notes").getByRole("listitem")).toHaveCount(1);
    await expect(bar(page)).toContainText("No changes");
  });

  test("notes can have groups; Before you start can't", async ({ page, baseURL }) => {
    await openEditor(page, baseURL, "pork-carnitas");
    await expect(section(page, "Before you start").getByRole("button", { name: /group/ })).toHaveCount(0);
    await section(page, "Notes").getByRole("button", { name: "Add a group of notes" }).press("Enter");
    await page.getByLabel("Group name").fill("Storing");
    await page.getByRole("button", { name: "Done" }).press("Enter");
    await page.keyboard.type("Keeps 3 days.");
    await page.getByRole("button", { name: "Done" }).press("Enter");
    await expect(section(page, "Notes").getByRole("heading", { name: "Storing" })).toBeVisible();
    expect((await draftOf(page, "pork-carnitas")).notes).toEqual(["Freezes well.", { group: "Storing", items: ["Keeps 3 days."] }]);
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

  test("a step opens with the cursor at the end, and Split here there asks where to split", async ({ page, baseURL }) => {
    await openEditor(page, baseURL, "pork-carnitas");
    await openStep(page, "Shred the pork.");
    await page.keyboard.type(" Taste it.");
    await expect(page.getByLabel("Step", { exact: true })).toHaveValue("Shred the pork. Taste it.");
    await page.getByRole("button", { name: "Split here" }).press("Enter");
    await expect(page.getByRole("region", { name: "Editing" }).getByRole("status")).toHaveText("Put the cursor where the new step starts.");
    // Nothing was split, and the step is still open to put the cursor in.
    await expect(page.getByLabel("Step", { exact: true })).toHaveValue("Shred the pork. Taste it.");
    expect(await stepTexts(page)).toHaveLength(4);
  });

  test("splitting the garlic soup's step: its wait stays with the half that says 5 minutes", async ({ page, baseURL }) => {
    await openEditor(page, baseURL, "garlic-soup");
    await openStep(page, /^Cook garlic/);
    for (let i = 0; i < " Onion 2 minutes, potato 1 minute then add stock and simmer.".length; i++) await page.keyboard.press("ArrowLeft");
    await page.getByRole("button", { name: "Split here" }).press("Enter");
    expect(await stepTexts(page)).toEqual([
      "Peel the garlic.", "Cook garlic 5 minutes in butter.⏱ 5 min✓ Soft but not brown", "Onion 2 minutes, potato 1 minute then add stock and simmer.",
    ]);
    await expect(page.getByRole("region", { name: "Editing" }).getByRole("status"))
      .toHaveText("Check what steps 2 and 3 use: the ingredients all stayed with step 2.");
  });

  test("a step that says several times can be split at each time", async ({ page, baseURL }) => {
    await openEditor(page, baseURL, "garlic-soup");
    await openStep(page, "Peel the garlic.");
    await expect(page.getByRole("button", { name: "Split at each time" })).toHaveCount(0);
    await openStep(page, /^Cook garlic/);
    await page.getByRole("button", { name: "Split at each time" }).press("Enter");
    expect(await stepTexts(page)).toEqual([
      "Peel the garlic.", "Cook garlic 5 minutes in butter.⏱ 5 min✓ Soft but not brown", "Onion 2 minutes.⏱ 2 min",
      "Potato 1 minute then add stock and simmer.⏱ 1 min",
    ]);
    await expect(page.getByRole("region", { name: "Editing" }).getByRole("status"))
      .toHaveText("Check what steps 2, 3 and 4 use: the ingredients all stayed with step 2.");
    await expect(preview(page).getByRole("button", { name: /^Cook garlic/ })).toBeFocused();
  });

  test("each step has an Edit button that opens it", async ({ page, baseURL }) => {
    await openEditor(page, baseURL, "pork-carnitas");
    await expect(preview(page).getByRole("button", { name: "Edit step 3" })).toHaveText(/Edit/);
    await preview(page).getByRole("button", { name: "Edit step 3" }).press("Enter");
    await expect(page.getByLabel("Step", { exact: true })).toBeFocused();
    await expect(page.getByLabel("Step", { exact: true })).toHaveValue("Shred the pork.");
  });

  test("adding a step after another", async ({ page, baseURL }) => {
    await openEditor(page, baseURL, "pork-carnitas");
    await preview(page).getByRole("button", { name: "Edit step 1" }).press("Enter");
    await page.getByRole("button", { name: "Add a step after this" }).press("Enter");
    await expect(page.getByLabel("Step", { exact: true })).toBeFocused();
    await expect(page.getByLabel("Step", { exact: true })).toHaveValue("");
    await page.keyboard.type("Salt it overnight.");
    await page.getByRole("button", { name: "Done" }).press("Enter");
    expect(await stepTexts(page)).toHaveLength(5);
    expect((await stepTexts(page)).slice(0, 3)).toEqual(["Season the pork.", "Salt it overnight.", expect.stringMatching(/^Braise until tender/)]);
    await expect(preview(page).getByRole("button", { name: "Salt it overnight." })).toBeFocused();
  });
});

test.describe("ingredients, by keyboard", () => {
  const ingredientTexts = (page) => preview(page).locator("ul.ingredients > li").evaluateAll((lis) =>
    lis.map((li) => li.querySelector("input[name=item], input[name=text]")?.value ?? (li.querySelector("button") ?? li).textContent.trim()));

  test("each ingredient has an Edit button that opens it", async ({ page, baseURL }) => {
    await openEditor(page, baseURL, "pork-carnitas");
    await expect(preview(page).getByRole("button", { name: "Edit Kosher salt" })).toHaveText(/Edit/);
    await preview(page).getByRole("button", { name: "Edit Kosher salt" }).press("Enter");
    await expect(page.getByLabel("Ingredient", { exact: true })).toBeFocused();
    await expect(page.getByLabel("Ingredient", { exact: true })).toHaveValue("Kosher salt");
  });

  test("adding an ingredient after another", async ({ page, baseURL }) => {
    await openEditor(page, baseURL, "pork-carnitas");
    await preview(page).getByRole("button", { name: "Edit 1 orange" }).press("Enter");
    await page.getByRole("button", { name: "Add an ingredient after this" }).press("Enter");
    await expect(page.getByLabel("Ingredient", { exact: true })).toBeFocused();
    await expect(page.getByLabel("Ingredient", { exact: true })).toHaveValue("");
    await page.keyboard.type("Bay leaves");
    await page.getByRole("button", { name: "Done" }).press("Enter");
    expect(await ingredientTexts(page)).toEqual([expect.stringMatching(/Pork shoulder/), "1 orange", "Bay leaves", "2 tsp Kosher salt"]);
    await expect(preview(page).getByRole("heading", { name: "For the braise" })).toBeVisible();
  });

  test("tapping an ingredient's amount opens it at the amount", async ({ page, baseURL }) => {
    await openEditor(page, baseURL, "pork-carnitas");
    await preview(page).getByRole("button", { name: "2 tsp Kosher salt" }).getByText("2 tsp").click();
    await expect(page.getByLabel("Amount")).toBeFocused();
  });
});

test.describe("undo and redo", () => {
  const undo = (page) => page.getByRole("button", { name: "Undo" });
  const redo = (page) => page.getByRole("button", { name: "Redo" });
  async function editStep1(page, text) {
    await preview(page).getByRole("button", { name: "Edit step 1" }).press("Enter");
    await page.getByLabel("Step", { exact: true }).fill(text);
    await page.getByRole("button", { name: "Done" }).press("Enter");
  }

  test("Undo takes back a whole edit, and Redo puts it back, focusing the line", async ({ page, baseURL }) => {
    await openEditor(page, baseURL, "pork-carnitas");
    await expect(undo(page)).toBeDisabled();
    await expect(redo(page)).toBeDisabled();
    await editStep1(page, "Season the pork well.");
    await undo(page).press("Enter");
    expect((await stepTexts(page))[0]).toBe("Season the pork.");
    await expect(preview(page).getByRole("button", { name: "Season the pork.", exact: true })).toBeFocused();
    await expect(page.getByRole("region", { name: "Editing" }).getByRole("status")).toHaveText("Undone.");
    await redo(page).press("Enter");
    expect((await stepTexts(page))[0]).toBe("Season the pork well.");
  });

  test("each edit is one step back", async ({ page, baseURL }) => {
    await openEditor(page, baseURL, "pork-carnitas");
    await editStep1(page, "Season the pork well.");
    await editStep1(page, "Salt the pork.");
    await undo(page).press("Enter");
    expect((await stepTexts(page))[0]).toBe("Season the pork well.");
    await undo(page).press("Enter");
    expect((await stepTexts(page))[0]).toBe("Season the pork.");
    await expect(undo(page)).toBeDisabled();
  });

  test("Undo brings back a removed line", async ({ page, baseURL }) => {
    await openEditor(page, baseURL, "pork-carnitas");
    await preview(page).getByRole("button", { name: "Edit step 3" }).press("Enter");
    await page.getByRole("button", { name: "Remove" }).press("Enter");
    expect(await stepTexts(page)).toHaveLength(3);
    await undo(page).press("Enter");
    expect(await stepTexts(page)).toHaveLength(4);
    await expect(preview(page).getByRole("button", { name: "Shred the pork.", exact: true })).toBeFocused();
  });

  test("Undo with a line open takes back what's typed in it and closes it", async ({ page, baseURL }) => {
    await openEditor(page, baseURL, "pork-carnitas");
    await preview(page).getByRole("button", { name: "Edit step 1" }).press("Enter");
    await page.getByLabel("Step", { exact: true }).fill("Season the pork well.");
    await expect(undo(page)).toBeEnabled();
    await undo(page).press("Enter");
    await expect(page.getByLabel("Step", { exact: true })).toHaveCount(0);
    expect((await stepTexts(page))[0]).toBe("Season the pork.");
  });

  test("Ctrl+Z undoes and Shift+Ctrl+Z redoes, but inside a text field they're the field's own", async ({ page, baseURL }) => {
    await openEditor(page, baseURL, "pork-carnitas");
    await editStep1(page, "Season the pork well.");
    // Focus is back on the step's line, outside any text field.
    await page.keyboard.press("ControlOrMeta+z");
    expect((await stepTexts(page))[0]).toBe("Season the pork.");
    await page.keyboard.press("ControlOrMeta+Shift+z");
    expect((await stepTexts(page))[0]).toBe("Season the pork well.");
    await preview(page).getByRole("button", { name: "Edit step 2" }).press("Enter");
    await page.getByLabel("Step", { exact: true }).press("ControlOrMeta+z");
    await expect(page.getByLabel("Step", { exact: true })).toBeVisible();
    expect((await stepTexts(page))[0]).toBe("Season the pork well.");
  });
});

test.describe("the editor's bar", () => {
  const bar = (page) => page.getByRole("region", { name: "Editing" });

  test("names the recipe and its section, and says whether anything has changed", async ({ page, baseURL }) => {
    await openEditor(page, baseURL, "pork-carnitas");
    await expect(bar(page)).toContainText("Pork Carnitas");
    await expect(bar(page)).toContainText("Editing · Cooking");
    await expect(bar(page)).toContainText("No changes");
    await preview(page).getByRole("button", { name: "Edit step 1" }).press("Enter");
    await page.getByLabel("Step", { exact: true }).fill("Season the pork well.");
    await expect(bar(page)).toContainText("Unsaved changes");
  });

  test("Save is off until something changes, and says so", async ({ page, baseURL }) => {
    await openEditor(page, baseURL, "pork-carnitas");
    const save = page.getByRole("button", { name: "Save" });
    await expect(save).toBeDisabled();
    await expect(save).toHaveAccessibleDescription("No changes");
    await preview(page).getByRole("button", { name: "Edit step 1" }).press("Enter");
    await page.getByLabel("Step", { exact: true }).fill("Season the pork well.");
    await expect(save).toBeEnabled();
  });

  test("says which steps a rename or a removal also changed", async ({ page, baseURL }) => {
    await openEditor(page, baseURL, "lemon-bars");
    const said = bar(page).getByRole("status");
    await preview(page).getByRole("button", { name: "Edit Butter" }).press("Enter");
    await page.getByLabel("Ingredient", { exact: true }).fill("Ghee");
    await page.getByRole("button", { name: "Done" }).press("Enter");
    await expect(said).toHaveText("Also updated step 1, which uses it.");
    await preview(page).getByRole("button", { name: "Edit Lemon juice" }).press("Enter");
    await page.getByRole("button", { name: "Remove" }).press("Enter");
    await expect(said).toHaveText("Also updated steps 3 and 4, which used it.");
  });

  for (const [width, height] of [[390, 844], [1280, 900]]) {
    test(`stays in view under the site header as you scroll, ${width}px wide`, async ({ page, baseURL }) => {
      await page.setViewportSize({ width, height });
      await openEditor(page, baseURL, "lemon-bars");
      await page.getByRole("button", { name: "Delete this recipe" }).scrollIntoViewIfNeeded();
      const header = await page.locator(".site-header").boundingBox();
      const box = await bar(page).boundingBox();
      expect(box.y).toBeGreaterThanOrEqual(header.y + header.height - 1);
      expect(box.y).toBeLessThan(header.y + header.height + 4);
      await expect(page.getByRole("button", { name: "Save" })).toBeInViewport();
    });
  }

  test("on a phone, the site header steps aside while you type in a line, leaving the bar at the top", async ({ page, baseURL }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await openEditor(page, baseURL, "lemon-bars");
    const header = page.locator(".site-header");
    await preview(page).getByRole("button", { name: "Edit step 2" }).press("Enter");
    await expect(page.getByLabel("Step", { exact: true })).toBeFocused();
    await expect(header).toBeHidden();
    await page.getByRole("button", { name: "Done" }).press("Enter");
    await expect(header).toBeVisible();
  });

  // Pressing on Done takes focus out of the field, so the header comes back
  // and the page shifts down: the release must still land as a click.
  test("on a phone, clicking Done straight after typing closes the line", async ({ page, baseURL }) => {
    await page.setViewportSize({ width: 390, height: 900 });
    await openEditor(page, baseURL, "lemon-bars");
    await preview(page).getByRole("button", { name: "Edit step 2" }).click();
    await page.getByLabel("Wait", { exact: true }).fill("a while");
    await page.getByRole("button", { name: "Done" }).click();
    await expect(page.getByLabel("Wait", { exact: true })).toHaveCount(0);
    await expect(page.locator(".site-header")).toBeVisible();
  });

  test("on a phone, the site header comes back when you click away from the line", async ({ page, baseURL }) => {
    await page.setViewportSize({ width: 390, height: 900 });
    await openEditor(page, baseURL, "lemon-bars");
    await preview(page).getByRole("button", { name: "Edit step 2" }).click();
    await page.getByLabel("Wait", { exact: true }).fill("a while");
    await expect(page.locator(".site-header")).toBeHidden();
    await page.mouse.click(2, 890);
    await expect(page.locator(".site-header")).toBeVisible();
  });

  test.describe("with a touch screen", () => {
    test.use({ hasTouch: true });
    test("on a phone, tapping Done straight after typing closes the line", async ({ page, baseURL }) => {
      await page.setViewportSize({ width: 390, height: 844 });
      await openEditor(page, baseURL, "lemon-bars");
      await preview(page).getByRole("button", { name: "Edit step 2" }).tap();
      await page.getByLabel("Wait", { exact: true }).fill("a while");
      await page.getByRole("button", { name: "Done" }).tap();
      await expect(page.getByLabel("Wait", { exact: true })).toHaveCount(0);
      await expect(page.locator(".site-header")).toBeVisible();
    });
  });

  test("on a laptop, the site header stays while you type", async ({ page, baseURL }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await openEditor(page, baseURL, "lemon-bars");
    await preview(page).getByRole("button", { name: "Edit step 2" }).press("Enter");
    await expect(page.getByLabel("Step", { exact: true })).toBeFocused();
    await expect(page.locator(".site-header")).toBeVisible();
  });

  test("its status line stays the same line as the page changes, so it's read out", async ({ page, baseURL }) => {
    await openEditor(page, baseURL, "lemon-bars");
    await bar(page).getByRole("status").evaluate((el) => { el.dataset.seen = "yes"; });
    await preview(page).getByRole("button", { name: "Edit Butter" }).press("Enter");
    await page.getByLabel("Ingredient", { exact: true }).fill("Ghee");
    await page.getByRole("button", { name: "Done" }).press("Enter");
    await expect(bar(page).getByRole("status")).toHaveAttribute("data-seen", "yes");
  });
});

// The preview should look like the recipe page it previews. Step numbers,
// lettering and capitals are drawn by CSS, so these read what the browser draws.
test.describe("the preview looks like the recipe page", () => {
  test("step numbers carry on across groups, as on the recipe page", async ({ page, baseURL }) => {
    await openEditor(page, baseURL, "pork-carnitas");
    // "To finish" starts after the two steps before it, so its first step is 3.
    const lists = preview(page).locator("ol.steps");
    await expect(lists).toHaveCount(2);
    expect(await lists.nth(1).evaluate((ol) => getComputedStyle(ol).counterReset)).toBe("step 2");
  });

  test("group headings are in capitals, as on the recipe page", async ({ page, baseURL }) => {
    await openEditor(page, baseURL, "pork-carnitas");
    const heading = preview(page).getByRole("button", { name: "For the braise" });
    expect(await heading.evaluate((b) => getComputedStyle(b).textTransform)).toBe("uppercase");
  });

  test("ingredients keep their lettering, and an open ingredient's fields have none", async ({ page, baseURL }) => {
    await openEditor(page, baseURL, "pork-carnitas");
    const lettered = (li) => li.evaluate((el) => getComputedStyle(el, "::before").content);
    expect(await lettered(preview(page).locator("ul.ingredients > li").first())).toContain("counter(ing, lower-alpha)");
    await preview(page).getByRole("button", { name: "Edit Kosher salt" }).click();
    const labels = preview(page).locator(".edit-form label");
    for (const label of await labels.all()) expect(await lettered(label)).toBe("none");
  });

  test("every field is at least 16px, so phones don't zoom in on it", async ({ page, baseURL }) => {
    await openEditor(page, baseURL, "pork-carnitas");
    await preview(page).getByRole("button", { name: "Edit step 2" }).click();
    await page.getByText("Details", { exact: true }).click();
    const sizes = await page.locator(".edit input:not([type=checkbox]):not([type=radio]), .edit textarea, .edit select")
      .evaluateAll((fields) => fields.map((f) => parseFloat(getComputedStyle(f).fontSize)));
    expect(sizes.length).toBeGreaterThan(5);
    expect(Math.min(...sizes)).toBeGreaterThanOrEqual(16);
  });

  test("on a laptop the sheet is as wide as on the recipe page, lined up with the editor's bar", async ({ page, baseURL }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await openEditor(page, baseURL, "pork-carnitas");
    const sheet = await preview(page).boundingBox();
    const bar = await page.locator(".edit-bar").boundingBox();
    expect(sheet.width).toBeGreaterThan(1000);
    expect(Math.abs(sheet.x - bar.x)).toBeLessThan(2);
  });
});

test.describe("what you type is never lost", () => {
  test("opening another line keeps what you typed in the open one", async ({ page, baseURL }) => {
    await openEditor(page, baseURL, "pork-carnitas");
    await preview(page).getByRole("button", { name: "Edit step 1" }).press("Enter");
    await page.getByLabel("Step", { exact: true }).fill("Season the pork well.");
    await preview(page).getByRole("button", { name: "Edit step 3" }).press("Enter");
    expect((await stepTexts(page))[0]).toBe("Season the pork well.");
    await expect(page.getByLabel("Step", { exact: true })).toHaveValue("Shred the pork.");
  });

  test("Cancel puts the line back as it was", async ({ page, baseURL }) => {
    await openEditor(page, baseURL, "pork-carnitas");
    await preview(page).getByRole("button", { name: "Edit step 1" }).press("Enter");
    await page.getByLabel("Step", { exact: true }).fill("Season the pork well.");
    await page.getByRole("button", { name: "Cancel" }).press("Enter");
    expect((await stepTexts(page))[0]).toBe("Season the pork.");
    await expect(preview(page).getByRole("button", { name: "Season the pork.", exact: true })).toBeFocused();
    expect(await draftOf(page, "pork-carnitas")).toBeUndefined();
  });

  test("Escape is the same as Cancel", async ({ page, baseURL }) => {
    await openEditor(page, baseURL, "pork-carnitas");
    await preview(page).getByRole("button", { name: "Edit 1 orange" }).press("Enter");
    await page.getByLabel("Ingredient", { exact: true }).fill("2 oranges");
    await page.keyboard.press("Escape");
    await expect(preview(page).getByRole("button", { name: "1 orange", exact: true })).toBeFocused();
  });

  test("Cancel on a line you just added takes it out again", async ({ page, baseURL }) => {
    await openEditor(page, baseURL, "pork-carnitas");
    await preview(page).getByRole("button", { name: "Edit step 1" }).press("Enter");
    await page.getByRole("button", { name: "Add a step after this" }).press("Enter");
    await page.keyboard.type("Salt it");
    await page.getByRole("button", { name: "Cancel" }).press("Enter");
    expect(await stepTexts(page)).toHaveLength(4);
    await expect(preview(page).getByRole("button", { name: "Season the pork.", exact: true })).toBeFocused();

    await preview(page).getByRole("button", { name: "Add ingredient" }).press("Enter");
    await page.getByRole("button", { name: "Cancel" }).press("Enter");
    await expect(preview(page).getByText("Empty ingredient")).toHaveCount(0);
    await expect(preview(page).getByRole("button", { name: "Add ingredient" })).toBeFocused();
  });

  test("a reload brings back what was typed in an open line", async ({ page, baseURL }) => {
    await openEditor(page, baseURL, "pork-carnitas");
    await preview(page).getByRole("button", { name: "Edit step 1" }).press("Enter");
    await page.getByLabel("Step", { exact: true }).fill("Season the pork well.");
    await page.reload();
    await page.getByRole("button", { name: "Bring back my changes" }).click();
    expect((await stepTexts(page))[0]).toBe("Season the pork well.");
  });

  test("the preview's links don't leave the editor", async ({ page, baseURL }) => {
    await openEditor(page, baseURL, "pork-carnitas");
    for (const name of ["← Cooking", "Grandma"]) {
      const link = preview(page).getByRole("link", { name });
      await expect(link).toHaveAttribute("aria-disabled", "true");
      // Playwright won't click a disabled link by itself; a person still can.
      await link.click({ force: true });
    }
    await expect(page).toHaveURL(/edit\.html\?r=pork-carnitas$/);
    expect(page.context().pages()).toHaveLength(1);
  });

  test("Escape on a group's name puts focus back on the group", async ({ page, baseURL }) => {
    await openEditor(page, baseURL, "pork-carnitas");
    await preview(page).getByRole("button", { name: "For the braise" }).press("Enter");
    await page.getByLabel("Group name").fill("Braise");
    await page.keyboard.press("Escape");
    await expect(preview(page).getByRole("button", { name: "For the braise" })).toBeFocused();
    await preview(page).getByRole("button", { name: "Add a group of steps" }).press("Enter");
    await page.keyboard.press("Escape");
    await expect(preview(page).getByRole("button", { name: "Add a group of steps" })).toBeFocused();
  });
});

test("on a phone, an ingredient's Edit button keeps its name and still opens it", async ({ page, baseURL }) => {
  await page.setViewportSize({ width: 360, height: 780 });
  await openEditor(page, baseURL, "pork-carnitas");
  const edit = preview(page).getByRole("button", { name: "Edit Kosher salt" });
  await expect(edit).toBeVisible();
  await edit.click();
  await expect(page.getByLabel("Ingredient", { exact: true })).toHaveValue("Kosher salt");
});

test("on a phone, a step's Edit button keeps its name and still opens the step", async ({ page, baseURL }) => {
  await page.setViewportSize({ width: 360, height: 780 });
  await openEditor(page, baseURL, "pork-carnitas");
  const edit = preview(page).getByRole("button", { name: "Edit step 2" });
  await expect(edit).toBeVisible();
  await edit.click();
  await expect(page.getByLabel("Step", { exact: true })).toHaveValue("Braise until tender.");
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

test("a step saved as not waiting shows an empty wait that says so", async ({ page, baseURL }) => {
  await openEditor(page, baseURL, "old-fashioned");
  await preview(page).getByRole("button", { name: /^Strain over/ }).press("Enter");
  await expect(page.getByLabel("Wait", { exact: true })).toHaveValue("");
  await expect(page.getByLabel("Wait", { exact: true })).toHaveAttribute("placeholder", "Doesn't wait");
});

test.describe("lineup fields in Details", () => {
  test("typing in a field and moving on with Tab lands on the next field, and keeps what was typed", async ({ page, baseURL }) => {
    await openEditor(page, baseURL, "garlic-bread");
    const d = await details(page);
    await stepBox(d, 1).getByLabel("Hands-on time").fill("5 min");
    await page.keyboard.press("Tab");
    await expect(stepBox(d, 1).getByLabel("Prep")).toBeFocused();
    await expect(stepBox(d, 1).getByLabel("Hands-on time")).toHaveValue("5 min");

    await d.getByLabel("Source", { exact: true }).fill("Aunt May");
    await page.keyboard.press("Tab");
    await expect(d.getByLabel("Source link")).toBeFocused();
    await page.keyboard.press("ControlOrMeta+a");
    await page.keyboard.type("https://example.com/bread");
    await page.keyboard.press("Shift+Tab");
    await expect(d.getByLabel("Source", { exact: true })).toBeFocused();
    // The field saves just after focus has moved on.
    await expect.poll(async () => (await draftOf(page, "garlic-bread")).source).toEqual({ name: "Aunt May", url: "https://example.com/bread" });
  });

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

  // Veg Stir-Fry's file order: 1 slice (added prep), 2 heat the wok, 3 stir the
  // sauce (prep), 4 pat the tofu, 5 stir-fry, 6 pour. Prep first shows slice,
  // sauce, wok...; as written hides the added prep step.
  const giveBadHands = async (page, d, step) => {
    await d.getByRole("group", { name: step }).getByLabel("Hands-on time").fill("soon");
    await d.getByRole("group", { name: step }).getByLabel("Hands-on time").press("Tab");
  };

  test("messages and Details number the steps as the sheet does", async ({ page, baseURL }) => {
    await openEditor(page, baseURL, "veg-stir-fry");
    const d = await details(page);
    await expect(d.getByRole("group", { name: /^Step 3: Heat the wok/ })).toBeVisible();
    await giveBadHands(page, d, /Heat the wok/);
    await expect(page.getByRole("region", { name: "Problems to fix" })).toContainText('step 3: "hands" must be a time');
    await expect(page.getByRole("region", { name: "Problems to fix" })).not.toContainText("step 2:");

    await preview(page).getByRole("switch", { name: "Prep first" }).click();
    await expect(page.getByRole("region", { name: "Problems to fix" })).toContainText('step 1: "hands" must be a time');
  });

  test("a hidden added prep step is named by its words, with a way to show it", async ({ page, baseURL }) => {
    await openEditor(page, baseURL, "veg-stir-fry");
    const d = await details(page);
    await giveBadHands(page, d, /Slice the peppers/);
    await preview(page).getByRole("switch", { name: "Prep first" }).click();
    const problems = page.getByRole("region", { name: "Problems to fix" });
    await expect(problems).toContainText('the added prep step "Slice the peppers and mince the garlic.": "hands" must be a time');
    await problems.getByRole("button", { name: "Show prep first" }).click();
    await expect(preview(page).getByRole("switch", { name: "Prep first" })).toBeChecked();
    await expect(problems).toContainText('step 1: "hands" must be a time');
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
  // Renaming in the editor carries through to the steps, so the broken use
  // comes from a draft, as an older draft or file could have it.
  await openEditor(page, baseURL, "lemon-bars");
  const recipe = await page.evaluate(async () => (await (await fetch("/api/recipe/lemon-bars")).json()).recipe);
  recipe.ingredients[0].items.find((i) => i.item === "Butter").item = "Ghee";
  await page.evaluate((r) => localStorage.setItem("sss:draft:lemon-bars", JSON.stringify({ recipe: r, at: new Date().toISOString() })), recipe);
  await page.reload();
  await page.getByRole("button", { name: "Bring back my changes" }).click();
  const save = page.getByRole("button", { name: "Save" });
  const message = `step 1 uses "Butter", which isn't one of the ingredients`;
  await expect(page.getByRole("region", { name: "Problems to fix" })).toContainText(message);
  await expect(preview(page).locator("ol.steps > li").first()).toContainText(message);
  await expect(save).toBeDisabled();
});

test("renaming an ingredient renames it in the steps that use it", async ({ page, baseURL }) => {
  await openEditor(page, baseURL, "lemon-bars");
  await preview(page).getByRole("button", { name: "8 tbsp Butter melted" }).click();
  await page.getByLabel("Ingredient", { exact: true }).fill("Ghee");
  await page.getByRole("button", { name: "Done" }).click();
  await expect(page.getByRole("region", { name: "Problems to fix" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Save" })).toBeEnabled();
  const uses = stepBox(await details(page), 1).getByRole("group", { name: "Ingredients step 1 uses" });
  await expect(uses.getByLabel("Ghee")).toBeChecked();
});

test("removing an ingredient takes it out of the steps that use it", async ({ page, baseURL }) => {
  await openEditor(page, baseURL, "lemon-bars");
  await preview(page).getByRole("button", { name: "Edit Eggs" }).click();
  await page.getByRole("button", { name: "Remove" }).click();
  await expect(page.getByRole("region", { name: "Problems to fix" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Save" })).toBeEnabled();
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
