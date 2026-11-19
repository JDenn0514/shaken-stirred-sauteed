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
const ingredientBox = (scope, name) => scope.getByRole("group", { name, exact: true });
const flat = (l = []) => l.flatMap((e) => (Array.isArray(e?.items) ? e.items : [e]));
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

  test("the title and description are edited in place", async ({ page, baseURL }) => {
    await openEditor(page, baseURL, "pork-carnitas");
    await preview(page).getByRole("button", { name: "Pork Carnitas" }).click();
    await page.getByLabel("Title").fill("Crispy Carnitas");
    await page.getByLabel("Description").fill("Braised, then crisped.");
    await page.getByRole("button", { name: "Done" }).click();
    await expect(preview(page).getByRole("heading", { level: 1 })).toHaveText("Crispy Carnitas");
    await expect(preview(page).getByRole("button", { name: "Braised, then crisped." })).toBeVisible();
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

test.describe("the section and the kind", () => {
  const bar = (page) => page.getByRole("region", { name: "Editing" });
  const openAbout = async (page) => {
    await preview(page).getByRole("button", { name: "Pork Carnitas" }).first().press("Enter");
    return page.getByLabel("Section", { exact: true });
  };
  // The colour the page is drawn in, and a section's own colour.
  const drawnIn = (page) => page.evaluate(() => getComputedStyle(document.querySelector(".edit-preview")).getPropertyValue("--section").trim());
  const colourOf = (page, section) => page.evaluate((c) => getComputedStyle(document.documentElement).getPropertyValue(`--${c}`).trim(), section);

  test("moving to another section lists the tags it takes off first, then moves and recolours the page", async ({ page, baseURL }) => {
    await openEditor(page, baseURL, "pork-carnitas");
    expect(await drawnIn(page)).toBe(await colourOf(page, "cooking"));
    const section = await openAbout(page);
    await expect(section).toHaveValue("cooking");
    await section.selectOption({ label: "Cocktails" });
    const ask = page.getByRole("group", { name: "Move to Cocktails?" });
    await expect(ask).toContainText("Cocktails doesn't have these tags, so they come off:");
    expect(await ask.getByRole("listitem").allInnerTexts()).toEqual(["Cuisine: Mexican", "Course: Main protein"]);
    expect(await draftOf(page, "pork-carnitas")).toBeUndefined();
    await expect(ask.getByRole("button", { name: "Move to Cocktails" })).toBeFocused();

    await page.keyboard.press("Enter");
    await expect(ask).toHaveCount(0);
    await expect(page.getByLabel("Section", { exact: true })).toBeFocused();
    await expect(bar(page)).toContainText("Editing · Cocktails");
    await expect(bar(page).getByRole("status")).toHaveText("Took off 2 tags: Cuisine: Mexican, Course: Main protein.");
    expect(await drawnIn(page)).toBe(await colourOf(page, "cocktails"));
    const moved = await draftOf(page, "pork-carnitas");
    expect([moved.category, moved.tags]).toEqual(["cocktails", { ingredients: ["pork"] }]);

    // Nothing more to take off, so the next move happens at once.
    await page.getByLabel("Section", { exact: true }).selectOption({ label: "Baking" });
    await expect(page.getByRole("group", { name: /^Move to/ })).toHaveCount(0);
    await expect(bar(page)).toContainText("Editing · Baking");

    await page.getByRole("button", { name: "Undo" }).click();
    await page.getByRole("button", { name: "Undo" }).click();
    await expect(bar(page)).toContainText("Editing · Cooking");
    expect(await drawnIn(page)).toBe(await colourOf(page, "cooking"));
    expect(await draftOf(page, "pork-carnitas")).toBeUndefined();
  });

  test("moving a drink out of Cocktails lists its details with the tags, and takes both off", async ({ page, baseURL }) => {
    await openEditor(page, baseURL, "old-fashioned");
    await preview(page).getByRole("button", { name: "Old Fashioned" }).first().press("Enter");
    await page.getByLabel("Section", { exact: true }).selectOption({ label: "Cooking" });
    const ask = page.getByRole("group", { name: "Move to Cooking?" });
    await expect(ask).toContainText("Cooking doesn't have these tags or a drink's details, so they come off:");
    await expect(ask.getByRole("listitem")).toHaveText(["Base spirit: Whiskey", "Glass: Rocks", "ABV: 32%", "Standard drinks: 1.6"]);
    await ask.getByRole("button", { name: "Move to Cooking" }).press("Enter");
    await expect(bar(page).getByRole("status")).toHaveText("Took off 1 tag and 3 drink details: Base spirit: Whiskey, Glass: Rocks, ABV: 32%, Standard drinks: 1.6.");
    const moved = await draftOf(page, "old-fashioned");
    expect([moved.category, moved.glass, moved.abv, moved.standardDrinks, moved.origin]).toEqual(["cooking", undefined, undefined, undefined, "Louisville, 1880s"]);
  });

  test("Keep leaves it where it was", async ({ page, baseURL }) => {
    await openEditor(page, baseURL, "pork-carnitas");
    const section = await openAbout(page);
    await section.selectOption({ label: "Baking" });
    await page.getByRole("group", { name: "Move to Baking?" }).getByRole("button", { name: "Keep in Cooking" }).press("Enter");
    await expect(page.getByRole("group", { name: /^Move to/ })).toHaveCount(0);
    await expect(page.getByLabel("Section", { exact: true })).toHaveValue("cooking");
    await expect(page.getByLabel("Section", { exact: true })).toBeFocused();
    expect(await draftOf(page, "pork-carnitas")).toBeUndefined();
  });

  test("Cancel puts the section and its tags back, with what was typed", async ({ page, baseURL }) => {
    await openEditor(page, baseURL, "pork-carnitas");
    const section = await openAbout(page);
    await page.getByLabel("Title").fill("Carnitas");
    await section.selectOption({ label: "Cocktails" });
    await page.getByRole("button", { name: "Move to Cocktails" }).press("Enter");
    expect((await draftOf(page, "pork-carnitas")).title).toBe("Carnitas");
    await page.getByRole("button", { name: "Cancel" }).press("Enter");
    await expect(bar(page)).toContainText("Editing · Cooking");
    expect(await draftOf(page, "pork-carnitas")).toBeUndefined();
  });

  test("a file that says it's a dish still says so after Component and back", async ({ page, baseURL }) => {
    await openEditor(page, baseURL, "old-fashioned");
    const d = await details(page);
    await d.getByLabel("Kind").selectOption({ label: "Component (used in other recipes)" });
    expect((await draftOf(page, "old-fashioned")).kind).toBe("component");
    await d.getByLabel("Kind").selectOption({ label: "Dish" });
    expect(await draftOf(page, "old-fashioned")).toBeUndefined();
  });
});

test.describe("the pickers in Details", () => {
  test("key ingredients: found by typing, picked ones first, with a counter", async ({ page, baseURL }) => {
    await openEditor(page, baseURL, "pork-carnitas");
    const d = await details(page);
    const keys = d.getByRole("group", { name: "Key ingredients" });
    const count = keys.getByText(/of 1–4 picked|picked yet|is plenty/);
    await expect(count).toHaveText("1 of 1–4 picked");
    await expect(keys.getByRole("checkbox").first()).toHaveAccessibleName("Pork");
    await expect(keys.getByRole("checkbox").first()).toBeChecked();

    await keys.getByRole("searchbox", { name: "Find an ingredient" }).fill("lim");
    await expect(keys.getByRole("checkbox")).toHaveCount(2);
    const lime = keys.getByRole("checkbox", { name: "Lime" });
    await lime.focus();
    await page.keyboard.press("Space");
    await expect(count).toHaveText("2 of 1–4 picked");
    await expect(keys.getByRole("checkbox", { name: "Lime" })).toBeFocused();
    await expect(keys.getByRole("searchbox", { name: "Find an ingredient" })).toHaveValue("lim");
    expect((await draftOf(page, "pork-carnitas")).tags.ingredients).toEqual(["pork", "lime"]);

    await keys.getByRole("searchbox", { name: "Find an ingredient" }).fill("");
    await expect(keys.getByRole("checkbox")).toHaveCount(46);
    expect(await keys.getByRole("checkbox").evaluateAll((bs) => bs.slice(0, 3).map((b) => [b.labels[0].textContent.trim(), b.checked])))
      .toEqual([["Pork", true], ["Lime", true], ["Chicken", false]]);
  });

  test("the drawing: a grid of every drawing by its plain name, Picked for you first", async ({ page, baseURL }) => {
    await openEditor(page, baseURL, "old-fashioned");
    const d = await details(page);
    const drawings = d.getByRole("group", { name: "Drawing" });
    await expect(drawings.getByRole("radio")).toHaveCount(30);
    await expect(drawings.getByRole("radio").first()).toHaveAccessibleName("Picked for you: Rocks");
    await expect(drawings.getByRole("radio").first()).toBeChecked();
    await drawings.getByRole("radio", { name: "Nick & Nora" }).focus();
    await page.keyboard.press("Space");
    await expect(drawings.getByRole("radio", { name: "Nick & Nora" })).toBeChecked();
    expect((await draftOf(page, "old-fashioned")).icon).toBe("nick-nora");
    await expect(page.getByRole("region", { name: "Recipe preview" })).toHaveAttribute("data-icon", "nick-nora");
    await expect(drawings.getByRole("radio", { name: "Nick & Nora" })).toBeFocused();
    await drawings.getByRole("radio", { name: "Picked for you: Rocks" }).check();
    expect(await draftOf(page, "old-fashioned")).toBeUndefined();
  });
});

test.describe("the facts box", () => {
  const facts = (page) => page.getByRole("form", { name: "Facts" });

  test("tapping the yield opens the facts at the yield", async ({ page, baseURL }) => {
    await openEditor(page, baseURL, "pork-carnitas");
    await preview(page).getByRole("button", { name: "6", exact: true }).press("Enter");
    await expect(facts(page).getByLabel("Yield")).toBeFocused();
    await facts(page).getByLabel("Yield").fill("Serves 8");
    await facts(page).getByRole("button", { name: "Done" }).press("Enter");
    await expect(preview(page).getByRole("button", { name: "8", exact: true })).toBeFocused();
    expect((await draftOf(page, "pork-carnitas")).yield).toBe("Serves 8");
  });

  test("the times as printed are rows to change, add, move and remove", async ({ page, baseURL }) => {
    await openEditor(page, baseURL, "garlic-soup");
    await preview(page).getByRole("button", { name: "45 min" }).press("Enter");
    const row = (n) => facts(page).getByRole("group", { name: `Time ${n}` });
    await expect(row(2).getByLabel("How long")).toBeFocused();
    await expect(row(1).getByLabel("Name")).toHaveValue("Active");
    await facts(page).getByRole("button", { name: "Add a time" }).press("Enter");
    await expect(row(3).getByLabel("Name")).toBeFocused();
    await page.keyboard.type("Rest");
    await row(3).getByLabel("How long").fill("10 min");
    await row(3).getByRole("button", { name: "Move up" }).press("Enter");
    await row(1).getByRole("button", { name: "Remove" }).press("Enter");
    await facts(page).getByRole("button", { name: "Done" }).press("Enter");
    expect((await draftOf(page, "garlic-soup")).times).toEqual([["Rest", "10 min"], ["Total", "45 min"]]);
    await expect(preview(page).locator("dl").first()).toContainText("Rest10 min");
  });

  test("the minutes for filters and the lineup are here, with a word when the total is short", async ({ page, baseURL }) => {
    await openEditor(page, baseURL, "pork-carnitas");
    await preview(page).getByRole("button", { name: "6", exact: true }).press("Enter");
    const minutes = facts(page).getByRole("group", { name: "For filters and the lineup, in minutes" });
    await expect(minutes.getByLabel("Prep")).toHaveValue("20");
    await minutes.getByLabel("Total").fill("60");
    await expect(facts(page)).toContainText("Total, 60 min, is less than prep, cook, chill and rest add up to, 180 min.");
    await facts(page).getByRole("button", { name: "Done" }).press("Enter");
    expect((await draftOf(page, "pork-carnitas")).time).toEqual({ prep: 20, cook: 160, total: 60 });
    await expect(page.locator("details.edit-details").getByRole("group", { name: "Times, in minutes" })).toHaveCount(0);
  });

  test("a baking recipe's pan and heat are set in the facts", async ({ page, baseURL }) => {
    await openEditor(page, baseURL, "lemon-bars");
    await preview(page).locator("dl").first().getByRole("button").first().press("Enter");
    const baking = facts(page).getByRole("group", { name: "Baking" });
    await baking.getByLabel("Equipment").fill("8 x 8 in, metal");
    await baking.getByLabel("Heat", { exact: true }).fill("350F");
    await baking.getByLabel("Shown as").selectOption("Oven");
    await facts(page).getByRole("button", { name: "Done" }).press("Enter");
    const draft = await draftOf(page, "lemon-bars");
    expect([draft.pan, draft.heatLabel, draft.heat]).toEqual(["8 x 8 in, metal", "Oven", "350F"]);
    await expect(preview(page).locator("dl").first()).toContainText("Oven350F");
  });

  test("a cocktail's facts: tapping the glass opens it, and what sets the drawing and the strength filter says so", async ({ page, baseURL }) => {
    await openEditor(page, baseURL, "old-fashioned");
    await preview(page).getByRole("button", { name: "Rocks" }).press("Enter");
    const drink = facts(page).getByRole("group", { name: "The drink" });
    await expect(drink.getByLabel("Glass")).toBeFocused();
    await expect(drink.getByLabel("Glass")).toHaveAccessibleDescription("Sets the drawing");
    await expect(drink.getByLabel("Standard drinks")).toHaveAccessibleDescription("Sets the strength filter");
    await drink.getByLabel("Glass").fill("Coupe");
    await drink.getByLabel("Standard drinks").fill("2.5");
    await drink.getByLabel("Garnish").fill("Orange twist");
    await facts(page).getByRole("button", { name: "Done" }).press("Enter");
    const draft = await draftOf(page, "old-fashioned");
    expect([draft.glass, draft.standardDrinks, draft.garnish]).toEqual(["Coupe", 2.5, "Orange twist"]);
  });

  test("Cancel puts the facts back as they were", async ({ page, baseURL }) => {
    await openEditor(page, baseURL, "garlic-soup");
    await preview(page).getByRole("button", { name: "45 min" }).press("Enter");
    await facts(page).getByRole("group", { name: "Time 1" }).getByLabel("How long").fill("25 min");
    await facts(page).getByRole("button", { name: "Cancel" }).press("Enter");
    await expect(page.getByRole("region", { name: "Editing" })).toContainText("No changes");
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

  test("Move up is off on the first line, and both are off on a list of one", async ({ page, baseURL }) => {
    await openEditor(page, baseURL, "pork-carnitas");
    await openStep(page, "Season the pork.");
    await expect(page.getByRole("button", { name: "Move up" })).toBeDisabled();
    await expect(page.getByRole("button", { name: "Move down" })).toBeEnabled();
    await preview(page).getByRole("button", { name: "Edit note 1" }).press("Enter");
    await expect(page.getByRole("button", { name: "Move up" })).toBeDisabled();
    await expect(page.getByRole("button", { name: "Move down" })).toBeDisabled();
  });

  test("moving down to the end leaves focus on Move up", async ({ page, baseURL }) => {
    await openEditor(page, baseURL, "salsa-verde");
    await preview(page).getByRole("button", { name: "1 lb tomatillos", exact: true }).press("Enter");
    await page.getByRole("button", { name: "Move down" }).press("Enter");
    await expect(page.getByRole("button", { name: "Move down" })).toBeDisabled();
    await expect(page.getByRole("button", { name: "Move up" })).toBeFocused();
  });

  test("Move to puts a line anywhere, listed under the group names", async ({ page, baseURL }) => {
    await openEditor(page, baseURL, "pork-carnitas");
    await openStep(page, "Season the pork.");
    const moveTo = page.getByLabel("Move to");
    await expect(moveTo).toHaveValue(/.+/);
    const groups = await moveTo.locator("optgroup").evaluateAll((gs) => gs.map((g) => g.label));
    expect(groups).toEqual(["Not in a group", "To finish"]);
    await moveTo.selectOption({ label: 'Before "Crisp it in a hot pan."' });
    await page.getByRole("button", { name: "Move", exact: true }).press("Enter");
    expect(await stepTexts(page)).toEqual(["Braise until tender.⏱ 2 1/2 hours✓ Falls apart with a fork", "Shred the pork.", "Season the pork.", "Crisp it in a hot pan."]);
    await expect(page.getByLabel("Step", { exact: true })).toHaveValue("Season the pork.");
    expect((await draftOf(page, "pork-carnitas")).steps.at(-1)).toEqual({ group: "To finish", items: ["Shred the pork.", "Season the pork.", "Crisp it in a hot pan."] });
  });

  test("in prep-first order a step can't be moved, but can switch to as written to move it", async ({ page, baseURL }) => {
    await openEditor(page, baseURL, "veg-stir-fry");
    await openStep(page, "Heat the wok until it smokes.");
    await expect(page.getByRole("button", { name: "Move up" })).toHaveCount(0);
    await expect(page.getByLabel("Move to")).toHaveCount(0);
    await page.getByRole("button", { name: "Switch to As written to reorder" }).press("Enter");
    await expect(preview(page).getByRole("switch", { name: "Prep first" })).not.toBeChecked();
    await expect(page.getByLabel("Step", { exact: true })).toHaveValue("Heat the wok until it smokes.");
    await expect(page.getByRole("button", { name: "Move up" })).toBeFocused();
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

  test("Add ml gives any ingredient a Millilitres field", async ({ page, baseURL }) => {
    await openEditor(page, baseURL, "garlic-bread");
    await preview(page).getByRole("button", { name: "Edit Garlic butter", exact: true }).press("Enter");
    await expect(page.getByLabel("Millilitres")).toHaveCount(0);
    await page.getByLabel("Amount", { exact: true }).fill("5 tbsp");
    await page.getByRole("button", { name: "Add ml" }).press("Enter");
    await expect(page.getByLabel("Millilitres")).toBeFocused();
    await expect(page.getByLabel("Amount", { exact: true })).toHaveValue("5 tbsp");
    await expect(page.getByRole("button", { name: "Add ml" })).toHaveCount(0);
    await page.keyboard.type("75");
    await page.getByRole("button", { name: "Done" }).press("Enter");
    expect((await draftOf(page, "garlic-bread")).ingredients[1]).toEqual({ qty: "5 tbsp", item: "Garlic butter", recipe: "garlic-butter", ml: 75 });
    // Once it has millilitres, the field is there when it opens again.
    await preview(page).getByRole("button", { name: "Edit Garlic butter", exact: true }).press("Enter");
    await expect(page.getByLabel("Millilitres")).toHaveValue("75");
  });

  test("Add ml left empty adds nothing, and a cocktail's ingredients have Millilitres already", async ({ page, baseURL }) => {
    await openEditor(page, baseURL, "garlic-bread");
    await preview(page).getByRole("button", { name: "Edit Baguette", exact: true }).press("Enter");
    await page.getByRole("button", { name: "Add ml" }).press("Enter");
    await page.getByRole("button", { name: "Done" }).press("Enter");
    expect(await draftOf(page, "garlic-bread")).toBeUndefined();
    await preview(page).getByRole("button", { name: "Edit Baguette", exact: true }).press("Enter");
    await expect(page.getByLabel("Millilitres")).toHaveCount(0);

    await openEditor(page, baseURL, "old-fashioned");
    await preview(page).getByRole("button", { name: "Edit Bourbon", exact: true }).press("Enter");
    await expect(page.getByLabel("Millilitres")).toBeVisible();
    await expect(page.getByRole("button", { name: "Add ml" })).toHaveCount(0);
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

  // A typed Details field lands when focus leaves it, which a click on Undo
  // does: Undo then takes back that field, not the edit before it.
  test("Undo clicked straight after typing in Details takes back the typing, and Redo puts it back", async ({ page, baseURL }) => {
    await openEditor(page, baseURL, "pork-carnitas");
    await editStep1(page, "Season the pork well.");
    const d = await details(page);
    await expect(d.getByLabel("Source", { exact: true })).toHaveValue("Grandma");
    await d.getByLabel("Source", { exact: true }).fill("Aunt May");
    await undo(page).click();
    await expect(d.getByLabel("Source", { exact: true })).toHaveValue("Grandma");
    expect((await stepTexts(page))[0]).toBe("Season the pork well.");
    await redo(page).click();
    await expect(d.getByLabel("Source", { exact: true })).toHaveValue("Aunt May");
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

// A step's lineup settings fold under it, in "For the lineup" (they were
// in Details before). Opens step n, as the sheet numbers it, and the fold.
async function lineup(page, n) {
  await preview(page).getByRole("button", { name: `Edit step ${n}` }).press("Enter");
  const fold = page.getByRole("group", { name: "For the lineup" });
  if (!(await fold.evaluate((d) => d.open))) await fold.locator("summary").click();
  return fold;
}

test.describe("a step's lineup settings", () => {
  test("fold under the open step, labelled For the lineup", async ({ page, baseURL }) => {
    await openEditor(page, baseURL, "garlic-bread");
    await preview(page).getByRole("button", { name: "Edit step 1" }).press("Enter");
    const fold = page.getByRole("group", { name: "For the lineup" });
    await expect(fold.locator("summary")).toHaveText("For the lineup");
    await expect(fold.getByLabel("Hands-on time")).toBeHidden();
    await fold.locator("summary").click();
    await expect(fold.getByLabel("Hands-on time")).toHaveValue("3 min");
  });

  test("Details no longer lists the steps", async ({ page, baseURL }) => {
    await openEditor(page, baseURL, "garlic-bread");
    const d = await details(page);
    await expect(d.getByRole("group", { name: /^Step 1:/ })).toHaveCount(0);
    await expect(d.getByRole("button", { name: "Add a prep step" })).toBeVisible();
  });

  test("typing in a field and moving on with Tab lands on the next field, and keeps what was typed", async ({ page, baseURL }) => {
    await openEditor(page, baseURL, "garlic-bread");
    const fold = await lineup(page, 1);
    await fold.getByLabel("Hands-on time").fill("5 min");
    await page.keyboard.press("Tab");
    await expect(fold.getByLabel("Prep")).toBeFocused();
    await expect(fold.getByLabel("Hands-on time")).toHaveValue("5 min");
    await expect.poll(async () => (await draftOf(page, "garlic-bread")).steps[0].hands).toBe("5 min");

    const d = await details(page);
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
    await expect((await lineup(page, 2)).getByLabel("Needs you there the whole wait")).toBeVisible();
    await expect((await lineup(page, 1)).getByLabel("Needs you there the whole wait")).toHaveCount(0);
  });

  test("It doesn't wait is offered on a step with no wait, and shows in its Wait", async ({ page, baseURL }) => {
    await openEditor(page, baseURL, "garlic-bread");
    const NO_WAIT = "It doesn't wait";
    await expect((await lineup(page, 2)).getByRole("checkbox", { name: NO_WAIT })).toHaveCount(0);
    const fold = await lineup(page, 3);
    await fold.getByRole("checkbox", { name: NO_WAIT }).focus();
    await page.keyboard.press("Space");
    await expect.poll(async () => (await draftOf(page, "garlic-bread"))?.steps[2]).toEqual({ do: "Slice and serve.", hands: "2 min", wait: false });
    expect((await draftOf(page, "garlic-bread")).steps[2]).toEqual({ do: "Slice and serve.", hands: "2 min", wait: false });
    await expect(page.getByLabel("Wait", { exact: true })).toHaveAttribute("placeholder", "Doesn't wait");
    await expect(fold.getByRole("checkbox", { name: NO_WAIT })).toBeFocused();

    await fold.getByRole("checkbox", { name: NO_WAIT }).uncheck();
    expect(await draftOf(page, "garlic-bread")).toBeUndefined();
  });

  test("typing a wait into a step that doesn't wait takes It doesn't wait away", async ({ page, baseURL }) => {
    await openEditor(page, baseURL, "old-fashioned");
    await preview(page).getByRole("button", { name: /^Strain over/ }).press("Enter");
    const fold = page.getByRole("group", { name: "For the lineup" });
    await fold.locator("summary").click();
    await expect(fold.getByRole("checkbox", { name: "It doesn't wait" })).toBeChecked();
    await page.getByLabel("Wait", { exact: true }).fill("1 min");
    await page.getByRole("button", { name: "Done" }).press("Enter");
    expect((await draftOf(page, "old-fashioned")).steps[1].wait).toBe("1 min");
    await preview(page).getByRole("button", { name: /^Strain over/ }).press("Enter");
    await expect(page.getByRole("group", { name: "For the lineup" }).getByRole("checkbox", { name: "It doesn't wait" })).toHaveCount(0);
  });

  test("a step can be done during an earlier step's wait, and the checker's rule shows when it stops fitting", async ({ page, baseURL }) => {
    await openEditor(page, baseURL, "garlic-bread");
    const DURING = "Done during an earlier step's wait";
    const first = await lineup(page, 1);
    await expect(first.getByRole("checkbox", { name: DURING })).toHaveCount(0);
    await expect(first).toContainText("Done during an earlier step's wait isn't offered: no earlier step waits.");
    const fold = await lineup(page, 3);
    await fold.getByRole("checkbox", { name: DURING }).check();
    expect((await draftOf(page, "garlic-bread")).steps[2].during).toBe(true);
    await expect(page.getByRole("region", { name: "Problems to fix" })).toHaveCount(0);

    // Step 2's wait now needs you there, so step 3 can't be done during it.
    // Go to on the problem opens step 3 at the checkbox.
    await (await lineup(page, 2)).getByRole("checkbox", { name: "Needs you there the whole wait" }).check();
    const problems = page.getByRole("region", { name: "Problems to fix" });
    await expect(problems).toContainText("Step 3 happens during a wait that needs you there the whole time, so it can't.");
    await problems.getByRole("button", { name: "Go to step 3" }).press("Enter");
    const during = page.getByRole("group", { name: "For the lineup" }).getByRole("checkbox", { name: DURING });
    await expect(during).toBeFocused();
    await expect(page.getByRole("group", { name: "For the lineup" }).locator("summary")).toHaveText("For the lineup: 1 to check");
    await expect(during).toBeChecked();
    await during.press("Space");
    await expect(page.getByRole("region", { name: "Problems to fix" })).toHaveCount(0);
    expect((await draftOf(page, "garlic-bread")).steps[2].during).toBeUndefined();
  });

  test("an oven temperature typed any common way is saved as 400F or 200C", async ({ page, baseURL }) => {
    await openEditor(page, baseURL, "garlic-bread");
    const fold = await lineup(page, 2);
    await fold.getByLabel("Oven", { exact: true }).selectOption({ label: "At a temperature" });
    await fold.getByLabel("Oven temperature").fill("425 °F");
    await fold.getByLabel("Oven temperature").press("Tab");
    await expect(fold.getByLabel("Oven temperature")).toHaveValue("425F");
    await fold.getByLabel("Heats the oven to").fill("200 degrees C");
    await fold.getByLabel("Heats the oven to").press("Tab");
    await expect(fold.getByLabel("Heats the oven to")).toHaveValue("200C");
    const step = (await draftOf(page, "garlic-bread")).steps[1];
    expect([step.oven, step.preheat]).toEqual(["425F", "200C"]);
    await expect(page.getByRole("region", { name: "Problems to fix" })).toHaveCount(0);
  });

  test("an oven temperature it can't read is kept as typed, and the checker says so", async ({ page, baseURL }) => {
    await openEditor(page, baseURL, "garlic-bread");
    const fold = await lineup(page, 2);
    await fold.getByLabel("Oven", { exact: true }).selectOption({ label: "At a temperature" });
    await fold.getByLabel("Oven temperature").fill("gas mark 6");
    await fold.getByLabel("Oven temperature").press("Tab");
    await expect(page.getByRole("group", { name: "For the lineup" }).getByLabel("Oven temperature")).toHaveValue("gas mark 6");
    await expect(page.getByRole("region", { name: "Problems to fix" })).toContainText("gas mark 6");
  });

  test("Uses are chips under the ingredient group names, ticked ones first", async ({ page, baseURL }) => {
    await openEditor(page, baseURL, "lemon-bars");
    const uses = (await lineup(page, 3)).getByRole("group", { name: "Ingredients step 3 uses" });
    const chips = (group) => uses.getByRole("group", { name: group, exact: true }).getByRole("checkbox")
      .evaluateAll((boxes) => boxes.map((b) => `${b.labels[0].textContent.trim()}${b.checked ? " ✓" : ""}`));
    // "Whisk the sugar, eggs and half the lemon juice." uses the filling's sugar, not the crust's.
    expect(await chips("Filling")).toEqual(["Sugar ✓", "Eggs ✓", "Lemon juice ✓", "Powdered sugar, for dusting"]);
    expect(await chips("Crust")).toEqual(["Sugar", "Flour", "Butter"]);
    await expect(uses.getByLabel("Amount for this step")).toHaveCount(3);

    const butter = uses.getByRole("group", { name: "Crust", exact: true }).getByRole("checkbox", { name: "Butter" });
    await butter.focus();
    await page.keyboard.press("Space");
    expect(await chips("Crust")).toEqual(["Butter ✓", "Sugar", "Flour"]);
    await expect(uses.getByRole("group", { name: "Crust", exact: true }).getByRole("checkbox", { name: "Butter" })).toBeFocused();
    expect(flat((await draftOf(page, "lemon-bars")).steps)[2].uses).toContain("Butter");
  });

  test("on a phone, the fold is compact: hands-on and prep side by side, the equipment in a grid, chips in rows", async ({ page, baseURL }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await openEditor(page, baseURL, "lemon-bars");
    const fold = await lineup(page, 1);
    // Two controls are side by side when their tops are within a few pixels
    // (an input and a select differ in height by a pixel or so).
    // Measured together, so a scroll in between can't move one of them.
    const sideBySide = async (a, b) => {
      const other = await b.elementHandle();
      const gap = await a.evaluate((x, y) => Math.abs(x.getBoundingClientRect().top - y.getBoundingClientRect().top), other);
      expect(gap).toBeLessThan(4);
    };
    await expect(fold.getByLabel("Prep", { exact: true })).toBeVisible();
    await sideBySide(fold.getByLabel("Prep", { exact: true }), fold.getByLabel("Hands-on time"));
    await sideBySide(fold.getByLabel("Burner"), fold.getByLabel("Oven", { exact: true }));
    await sideBySide(fold.getByLabel("Microwave"), fold.getByLabel("Grill"));
    // Unticked chips share a row; a ticked one has its row, for its amount.
    const filling = fold.getByRole("group", { name: "Filling", exact: true });
    await sideBySide(filling.getByRole("checkbox", { name: "Eggs" }), filling.getByRole("checkbox", { name: "Lemon juice" }));
    // Nothing spills sideways.
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  });

  // On a phone the open step drops the column its number sits in: the number
  // heads it, and the form takes the width. On a laptop it stays beside it.
  for (const [width, phone] of [[390, true], [1280, false]]) {
    test(`on a ${phone ? "phone, the step being edited takes the full width, its number above it" : "laptop, the step being edited stays beside its number"}`, async ({ page, baseURL }) => {
      await page.setViewportSize({ width, height: 900 });
      await openEditor(page, baseURL, "lemon-bars");
      await preview(page).getByRole("button", { name: "Edit step 3" }).press("Enter");
      const form = page.locator(".steps li > .edit-form");
      await expect(form).toBeVisible();
      const at = await form.evaluate((f) => {
        const li = f.parentElement.getBoundingClientRect(), box = f.getBoundingClientRect();
        return { indent: box.left - li.left, below: box.top - li.top };
      });
      if (phone) {
        expect(at.indent).toBeLessThan(20);
        expect(at.below).toBeGreaterThan(40);
        await expect(form.locator("..")).toContainText("Step 3");
      } else {
        expect(at.indent).toBeGreaterThan(50);
        expect(at.below).toBeLessThan(30);
      }
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
    });
  }

  test("keeping after one step clears it from another", async ({ page, baseURL }) => {
    await openEditor(page, baseURL, "garlic-bread");
    const keeps = "Keeps as long as you like after this step";
    await (await lineup(page, 1)).getByRole("checkbox", { name: keeps }).check();
    await (await lineup(page, 2)).getByRole("checkbox", { name: keeps }).check();
    expect((await draftOf(page, "garlic-bread")).steps.map((s) => !!s.holds)).toEqual([false, true, false]);
    await expect((await lineup(page, 1)).getByRole("checkbox", { name: keeps })).not.toBeChecked();
    await (await lineup(page, 2)).getByRole("checkbox", { name: keeps }).uncheck();
    // Back as it was: no step keeps, so there's no draft.
    expect(await draftOf(page, "garlic-bread")).toBeUndefined();
  });

  test("the fold opens by itself on a step with a lineup problem", async ({ page, baseURL }) => {
    await openEditor(page, baseURL, "garlic-bread");
    const fold = await lineup(page, 1);
    await fold.getByLabel("Hands-on time").fill("soon");
    await fold.getByLabel("Hands-on time").press("Tab");
    // The field saves just after focus moves on, and that redraws the form:
    // wait for it, so Done isn't pressed on the form being replaced.
    await expect.poll(async () => (await draftOf(page, "garlic-bread"))?.steps[0].hands).toBe("soon");
    await page.getByRole("button", { name: "Done" }).press("Enter");
    await preview(page).getByRole("button", { name: "Edit step 1" }).press("Enter");
    await expect(page.getByRole("group", { name: "For the lineup" }).getByLabel("Hands-on time")).toBeVisible();
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

  test("a step mentioning the oven is a to-do until an oven choice is made, and the to-do opens the step", async ({ page, baseURL }) => {
    await openEditor(page, baseURL, "garlic-bread");
    await page.getByText("1 thing to check").click();
    const todo = page.getByRole("region", { name: "To do" });
    await expect(todo).toContainText('Step 2 mentions "oven".');
    await todo.getByRole("button", { name: "Set step 2's equipment" }).press("Enter");
    const fold = page.getByRole("group", { name: "For the lineup" });
    await expect(fold.getByLabel("Oven", { exact: true })).toBeFocused();
    await expect(page.getByLabel("Step", { exact: true })).toHaveValue("Bake in the oven until crisp.");
    await fold.getByLabel("Oven", { exact: true }).selectOption({ label: "At a temperature" });
    await fold.getByLabel("Oven temperature").fill("220C");
    await fold.getByLabel("Oven temperature").blur();
    await expect(page.getByText(/Step 2 mentions "oven"/)).toHaveCount(0);
    expect((await draftOf(page, "garlic-bread")).steps[1].oven).toBe("220C");
  });

  test("a to-do's quick choice: the step doesn't use the oven", async ({ page, baseURL }) => {
    await openEditor(page, baseURL, "garlic-bread");
    await page.getByText("1 thing to check").click();
    const todo = page.getByRole("region", { name: "To do" });
    await todo.getByRole("button", { name: "Step 2 doesn't use the oven" }).click();
    await expect(page.getByText(/Step 2 mentions "oven"/)).toHaveCount(0);
    expect((await draftOf(page, "garlic-bread")).steps[1].oven).toBe(false);
  });

  // Veg Stir-Fry's file order: 1 slice (added prep), 2 heat the wok, 3 stir the
  // sauce (prep), 4 pat the tofu, 5 stir-fry, 6 pour. Prep first shows slice,
  // sauce, wok...; as written hides the added prep step.
  const giveBadHands = async (page, step) => {
    await preview(page).getByRole("button", { name: step }).first().press("Enter");
    const fold = page.getByRole("group", { name: "For the lineup" });
    await fold.locator("summary").click();
    await fold.getByLabel("Hands-on time").fill("soon");
    await fold.getByLabel("Hands-on time").press("Tab");
    // The field saves just after focus moves on, which redraws the form and
    // shows the problem: wait for it, so Done isn't pressed mid-redraw.
    await expect(page.getByRole("region", { name: "Problems to fix" })).toBeVisible();
    await page.getByRole("button", { name: "Done" }).press("Enter");
  };

  test("messages number the steps as the sheet does", async ({ page, baseURL }) => {
    await openEditor(page, baseURL, "veg-stir-fry");
    await giveBadHands(page, "Heat the wok until it smokes.");
    await expect(page.getByRole("region", { name: "Problems to fix" })).toContainText("Step 3's hands-on time needs to be a time");
    await expect(page.getByRole("region", { name: "Problems to fix" })).not.toContainText("Step 2");

    await preview(page).getByRole("switch", { name: "Prep first" }).click();
    await expect(page.getByRole("region", { name: "Problems to fix" })).toContainText("Step 1's hands-on time needs to be a time");
  });

  test("a hidden added prep step is named by its words, with a way to show it", async ({ page, baseURL }) => {
    await openEditor(page, baseURL, "veg-stir-fry");
    await giveBadHands(page, "Slice the peppers and mince the garlic.");
    await preview(page).getByRole("switch", { name: "Prep first" }).click();
    const problems = page.getByRole("region", { name: "Problems to fix" });
    await expect(problems).toContainText(`Hands-on time for the added prep step "Slice the peppers and mince the garlic." needs to be a time`);
    await problems.getByRole("button", { name: "Show prep first" }).click();
    await expect(preview(page).getByRole("switch", { name: "Prep first" })).toBeChecked();
    await expect(problems).toContainText("Step 1's hands-on time needs to be a time");
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

test.describe("problems and to-dos", () => {
  const problems = (page) => page.getByRole("region", { name: "Problems to fix" });
  const strip = (page) => page.getByRole("group", { name: /things? to check/ });

  test("a problem is in a cook's words, and Go to opens the line at the field that fixes it", async ({ page, baseURL }) => {
    await openEditor(page, baseURL, "lemon-bars");
    await preview(page).getByRole("button", { name: "Edit step 2" }).press("Enter");
    await page.getByLabel("Wait", { exact: true }).fill("a while");
    await page.getByRole("button", { name: "Done" }).press("Enter");
    await expect(problems(page)).toContainText("Step 2's wait needs to be a time, like 10 min. Leave it empty if the step doesn't wait.");
    await expect(preview(page).locator("ol.steps > li").nth(1)).toContainText("Step 2's wait needs to be a time");
    await problems(page).getByRole("button", { name: "Go to step 2" }).press("Enter");
    await expect(page.getByLabel("Wait", { exact: true })).toBeFocused();
    await expect(page.getByLabel("Wait", { exact: true })).toHaveValue("a while");
  });

  test("Go to on a problem with a step's lineup settings opens the step at that field", async ({ page, baseURL }) => {
    await openEditor(page, baseURL, "garlic-bread");
    const fold = await lineup(page, 1);
    await fold.getByLabel("Hands-on time").fill("soon");
    await fold.getByLabel("Hands-on time").press("Tab");
    // The field saves just after focus moves on, which redraws the form and
    // shows the problem: wait for it, so Done isn't pressed mid-redraw.
    await expect(page.getByRole("region", { name: "Problems to fix" })).toBeVisible();
    await page.getByRole("button", { name: "Done" }).press("Enter");
    await expect(problems(page)).toContainText("Step 1's hands-on time needs to be a time, like 10 min.");
    await problems(page).getByRole("button", { name: "Go to step 1" }).press("Enter");
    await expect(page.getByRole("group", { name: "For the lineup" }).getByLabel("Hands-on time")).toBeFocused();
  });

  test("to-dos fold into one strip under the bar, and problems stay in view", async ({ page, baseURL }) => {
    await openEditor(page, baseURL, "garlic-bread");
    await expect(strip(page)).toContainText("1 thing to check");
    await expect(page.getByRole("region", { name: "To do" })).toHaveCount(0);
    await strip(page).getByText("1 thing to check").click();
    await expect(page.getByRole("region", { name: "To do" })).toContainText('Step 2 mentions "oven". Say whether it uses the burner, oven, grill or microwave.');
    // It stays open as the page changes.
    await page.getByRole("region", { name: "To do" }).getByRole("button", { name: "Set step 2's equipment" }).click();
    await page.getByText("Details", { exact: true }).click();
    await expect(page.getByRole("region", { name: "To do" })).toBeVisible();
  });

  test("no total time, and no key ingredients, each have a button to where they're set", async ({ page, baseURL }) => {
    await openEditor(page, baseURL, "salsa-verde");
    await strip(page).getByText(/things? to check/).click();
    const todo = page.getByRole("region", { name: "To do" });
    await expect(todo).toContainText("There's no total time, so it won't show when someone filters by time.");
    await todo.getByRole("button", { name: "Add the total time" }).press("Enter");
    await expect(page.getByRole("form", { name: "Facts" }).getByLabel("Total")).toBeFocused();
    await page.getByRole("button", { name: "Done" }).press("Enter");
    const d = await details(page);

    await d.getByRole("group", { name: "Tags" }).getByRole("checkbox", { name: "Fresh herbs" }).uncheck();
    await expect(todo).toContainText("No key ingredients are tagged");
    await todo.getByRole("button", { name: "Tag key ingredients" }).press("Enter");
    await expect(d.getByRole("group", { name: "Key ingredients" }).getByRole("checkbox").first()).toBeFocused();
  });
});

test("a step using an ingredient that isn't there says so, on the step too, and turns Save off", async ({ page, baseURL }) => {
  // Renaming in the editor carries through to the steps, so the broken use
  // comes from a draft, as an older draft or file could have it.
  await openEditor(page, baseURL, "lemon-bars");
  const recipe = await page.evaluate(async () => (await (await fetch("/api/recipe/lemon-bars")).json()).recipe);
  recipe.ingredients[0].items.find((i) => i.item === "Butter").item = "Ghee";
  await page.evaluate((r) => localStorage.setItem("sss:draft:lemon-bars", JSON.stringify({ recipe: r, at: new Date().toISOString() })), recipe);
  await page.reload();
  await page.getByRole("button", { name: "Bring back my changes" }).click();
  const save = page.getByRole("button", { name: "Save" });
  const message = "Step 1 uses Butter, which isn't in the ingredients. Add it, or untick it on the step.";
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
  const uses = (await lineup(page, 1)).getByRole("group", { name: "Ingredients step 1 uses" });
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
  expect(offered).toEqual(["Type", "Flavor", "Uses up", "Key ingredients", "Occasion", "Season", "Diet"]);
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
  await page.getByText(/things? to check/).click();
  await expect(page.getByRole("region", { name: "To do" })).toContainText("There's no total time");
  await page.getByRole("button", { name: "Add the total time" }).click();
  const times = page.getByRole("group", { name: "For filters and the lineup, in minutes" });
  await times.getByLabel("Prep").fill("10");
  await times.getByLabel("Total").fill("15");
  await page.getByRole("button", { name: "Done" }).click();
  await expect(page.getByText("There's no total time")).toHaveCount(0);
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

test.describe("skip links and keyboard shortcuts", () => {
  const skip = (page) => page.getByRole("navigation", { name: "Skip links" });

  test("the first Tab on the page reaches the skip links, shown only once focused", async ({ page, baseURL, browserName }) => {
    // Safari's Tab skips links unless you turn that on, and Playwright's WebKit copies it.
    test.skip(browserName === "webkit", "Tab passes over links in Safari");
    await openEditor(page, baseURL, "lemon-bars");
    const first = skip(page).getByRole("link", { name: "Skip to the recipe" });
    await expect(first).not.toBeInViewport();
    await page.locator("body").focus();
    await page.keyboard.press("Tab");
    await expect(first).toBeFocused();
    await expect(first).toBeInViewport();
  });

  test("the skip links go to the recipe, the problems and Details", async ({ page, baseURL }) => {
    await openEditor(page, baseURL, "lemon-bars");
    await expect(skip(page).getByRole("link")).toHaveText(["Skip to the recipe", "Skip to Details"]);
    await skip(page).getByRole("link", { name: "Skip to the recipe" }).focus();
    await page.keyboard.press("Enter");
    await expect(preview(page)).toBeFocused();
    await skip(page).getByRole("link", { name: "Skip to Details" }).focus();
    await page.keyboard.press("Enter");
    await expect(page.locator("details.edit-details > summary")).toBeFocused();

    // A problem adds a link to it, first.
    await preview(page).getByRole("button", { name: "Edit Butter" }).press("Enter");
    await page.getByLabel("Ingredient", { exact: true }).fill("");
    await page.getByRole("button", { name: "Done" }).press("Enter");
    await expect(skip(page).getByRole("link")).toHaveText(["Skip to the problems", "Skip to the recipe", "Skip to Details"]);
    await skip(page).getByRole("link", { name: "Skip to the problems" }).focus();
    await page.keyboard.press("Enter");
    await expect(page.getByRole("region", { name: "Problems to fix" })).toBeFocused();
  });

  test("the shortcuts open from the skip links, and close back to where they were opened", async ({ page, baseURL }) => {
    await openEditor(page, baseURL, "lemon-bars");
    const open = skip(page).getByRole("button", { name: "Keyboard shortcuts" });
    await open.focus();
    await page.keyboard.press("Enter");
    const help = page.getByRole("dialog", { name: "Keyboard shortcuts" });
    await expect(help).toBeVisible();
    await expect(help.getByRole("row")).toHaveCount(6);
    await expect(help.getByRole("row", { name: /Save$/ })).toContainText(/⌘S|Ctrl\+S/);
    await help.getByRole("button", { name: "Close" }).press("Enter");
    await expect(help).toBeHidden();
    await expect(open).toBeFocused();
  });

  test("? shows the shortcuts, except while typing", async ({ page, baseURL }) => {
    await openEditor(page, baseURL, "lemon-bars");
    const step = preview(page).getByRole("button", { name: "Edit step 2" });
    await step.focus();
    await page.keyboard.press("?");
    const help = page.getByRole("dialog", { name: "Keyboard shortcuts" });
    await expect(help).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(help).toBeHidden();
    await expect(step).toBeFocused();

    await step.press("Enter");
    await page.getByLabel("Step", { exact: true }).press("End");
    await page.keyboard.type("?");
    await expect(help).toBeHidden();
    await expect(page.getByLabel("Step", { exact: true })).toHaveValue("Bake the crust.?");
  });
});

// Motion (spec section 4, "While editing a line"): the opened line fades in,
// and a line that was moved, added, split, joined or brought back by Undo
// flashes. The page is redrawn on every change, so these check each motion
// plays once, on that line only, and never with reduced motion.
test.describe("motion", () => {
  // From now on, the lines that start an animation, by their text (an open
  // line by its form's text), and what it does: "fades in" from clear, or
  // "flashes" its colour.
  const watchMotion = (page) => page.evaluate(() => {
    window.moved = [];
    document.addEventListener("animationstart", (e) => {
      const li = e.target.closest(".edit-preview li");
      if (!li) return;
      const text = li.querySelector("textarea")?.value ?? (li.querySelector("button") ?? li).textContent.trim();
      const played = e.target.getAnimations().find((a) => a.animationName === e.animationName);
      const how = played?.effect.getKeyframes().some((k) => "opacity" in k) ? "fades in" : "flashes";
      if (!window.moved.some(([t, h]) => t === text && h === how)) window.moved.push([text, how]);
    });
  });
  const moved = (page) => page.evaluate(() => window.moved);
  // What started moving in the next 400ms: longer than any of the motions takes to start.
  const movedSoon = async (page) => { await page.waitForTimeout(400); return moved(page); };

  test("opening a line fades it in, once", async ({ page, baseURL }) => {
    await openEditor(page, baseURL, "pork-carnitas");
    await watchMotion(page);
    await preview(page).getByRole("button", { name: "Edit step 2" }).click();
    await expect.poll(() => moved(page)).toEqual([["Braise until tender.", "fades in"]]);
    await page.evaluate(() => { window.moved = []; });
    await page.getByText("For the lineup", { exact: true }).click();
    await page.getByLabel("Needs you there the whole wait").check();
    expect(await movedSoon(page)).toEqual([]);
  });

  test("a moved line flashes, and only that line", async ({ page, baseURL }) => {
    await openEditor(page, baseURL, "pork-carnitas");
    await preview(page).getByRole("button", { name: "Edit step 1" }).click();
    await watchMotion(page);
    await page.getByRole("button", { name: "Move down", exact: true }).click();
    await expect.poll(() => moved(page)).toEqual([["Season the pork.", "flashes"]]);
    expect(await movedSoon(page)).toEqual([["Season the pork.", "flashes"]]);
  });

  test("an added line flashes, from the open line or the list", async ({ page, baseURL }) => {
    await openEditor(page, baseURL, "pork-carnitas");
    await preview(page).getByRole("button", { name: "Edit step 1" }).click();
    await watchMotion(page);
    await page.getByRole("button", { name: "Add a step after this" }).click();
    await expect.poll(() => moved(page)).toEqual([["", "flashes"]]);
    await page.getByRole("button", { name: "Cancel" }).click();
    await page.evaluate(() => { window.moved = []; });
    await preview(page).getByRole("button", { name: "Add step", exact: true }).click();
    await expect.poll(() => moved(page)).toEqual([["", "flashes"]]);
  });

  test("a split step flashes its first half, and a joined one flashes", async ({ page, baseURL }) => {
    await openEditor(page, baseURL, "pork-carnitas");
    await preview(page).getByRole("button", { name: "Edit step 1" }).click();
    // The step opens with the cursor at the end; step back over "the pork.".
    for (let k = 0; k < "the pork.".length; k++) await page.getByLabel("Step", { exact: true }).press("ArrowLeft");
    await watchMotion(page);
    await page.getByRole("button", { name: "Split here" }).click();
    await expect.poll(() => moved(page)).toEqual([[expect.stringMatching(/^Season/), "flashes"]]);
    await page.evaluate(() => { window.moved = []; });
    await preview(page).getByRole("button", { name: "Edit step 3" }).click();
    // Let the opened line's fade start before watching the join.
    await expect.poll(() => moved(page)).toEqual([["Braise until tender.", "fades in"]]);
    await page.evaluate(() => { window.moved = []; });
    await page.getByRole("button", { name: "Join with the next step" }).click();
    await expect.poll(() => moved(page)).toEqual([[expect.stringMatching(/^Braise until tender\..*Shred the pork\./), "flashes"]]);
  });

  test("Remove flashes the line that takes its place, and Undo the line it brings back", async ({ page, baseURL }) => {
    await openEditor(page, baseURL, "pork-carnitas");
    await preview(page).getByRole("button", { name: "Edit step 3" }).click();
    await watchMotion(page);
    await page.getByRole("button", { name: "Remove" }).click();
    await expect.poll(() => moved(page)).toEqual([["Crisp it in a hot pan.", "flashes"]]);
    await page.evaluate(() => { window.moved = []; });
    await page.getByRole("button", { name: "Undo" }).click();
    await expect.poll(() => moved(page)).toEqual([["Shred the pork.", "flashes"]]);
  });

  test.describe("with reduced motion", () => {
    test.use({ reducedMotion: "reduce" });
    test("nothing fades or flashes", async ({ page, baseURL }) => {
      await openEditor(page, baseURL, "pork-carnitas");
      await watchMotion(page);
      await preview(page).getByRole("button", { name: "Edit step 1" }).click();
      await page.getByRole("button", { name: "Move down", exact: true }).click();
      await page.getByRole("button", { name: "Remove" }).click();
      await page.getByRole("button", { name: "Undo" }).click();
      expect(await movedSoon(page)).toEqual([]);
    });
  });
});

// Build step 29: pasting several lines at once, read the way the intake reads
// them (the rules are unit tested in tests/unit/edit-model.test.mjs).
test.describe("pasting lines", () => {
  const bar = (page) => page.getByRole("region", { name: "Editing" });
  const paste = async (page, button, label, text) => {
    await preview(page).getByRole("button", { name: button }).click();
    const box = page.getByRole("dialog", { name: button });
    await box.getByLabel(label).fill(text);
    await box.getByRole("button", { name: "Add them" }).click();
    await expect(box).toBeHidden();
  };

  test("pasted ingredients are added, read into their parts, and one Undo takes them back", async ({ page, baseURL }) => {
    await openEditor(page, baseURL, "pork-carnitas");
    await paste(page, "Paste ingredients", "One ingredient per line", "• 4 cloves garlic, smashed\n1 tsp cumin");
    await expect(preview(page).getByRole("button", { name: "4 cloves Garlic smashed", exact: true })).toBeFocused();
    await expect(preview(page).getByRole("button", { name: "1 tsp Cumin", exact: true })).toBeVisible();
    await expect(bar(page).getByRole("status")).toHaveText("Added 2 ingredients.");
    await bar(page).getByRole("button", { name: "Undo" }).click();
    await expect(preview(page).getByRole("button", { name: "1 tsp Cumin", exact: true })).toHaveCount(0);
  });

  test("pasted steps lose their numbers", async ({ page, baseURL }) => {
    await openEditor(page, baseURL, "pork-carnitas");
    await paste(page, "Paste steps", "One step per line", "1. Warm the tortillas.\n2. Serve with lime.");
    expect((await stepTexts(page)).slice(-2)).toEqual(["Warm the tortillas.", "Serve with lime."]);
  });

  test("pasted notes are added after the others", async ({ page, baseURL }) => {
    await openEditor(page, baseURL, "pork-carnitas");
    await paste(page, "Paste notes", "One note per line", "Warm it through in a pan.\nAdd lime at the table.");
    const notes = page.getByRole("region", { name: "Notes" });
    await expect(notes.getByRole("button", { name: "Warm it through in a pan.", exact: true })).toBeFocused();
    await expect(notes.locator("li").last()).toContainText("Add lime at the table.");
  });

  test("Cancel adds nothing and goes back to the button", async ({ page, baseURL }) => {
    await openEditor(page, baseURL, "pork-carnitas");
    const open = preview(page).getByRole("button", { name: "Paste steps" });
    await open.focus();
    await open.press("Enter");
    await page.getByRole("dialog", { name: "Paste steps" }).getByLabel("One step per line").fill("Serve.");
    await page.keyboard.press("Escape");
    await expect(open).toBeFocused();
    expect(await stepTexts(page)).toHaveLength(4);
  });

  test("a plain-text ingredient splits into amount and name", async ({ page, baseURL }) => {
    await openEditor(page, baseURL, "pork-carnitas");
    await preview(page).getByRole("button", { name: "1 orange", exact: true }).click();
    await page.getByRole("button", { name: "Split into amount and name" }).click();
    await expect(page.getByLabel("Amount", { exact: true })).toHaveValue("1");
    await expect(page.getByLabel("Ingredient", { exact: true })).toHaveValue("Orange");
    await expect(page.getByLabel("Amount", { exact: true })).toBeFocused();
  });
});

test.describe("quick waits on a phone", () => {
  const bar = (page) => page.getByRole("region", { name: "Editing" });
  const waits = (page) => page.getByRole("group", { name: "Quick waits" });

  test("a quick wait fills the step's Wait, keeps what was typed, and one Undo takes it back", async ({ page, baseURL }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await openEditor(page, baseURL, "pork-carnitas");
    await preview(page).getByRole("button", { name: "Edit step 1" }).press("Enter");
    await page.getByLabel("Cue", { exact: true }).fill("Salt on every side");
    const chip = waits(page).getByRole("button", { name: "10 to 15 min", exact: true });
    await chip.focus();
    await chip.press("Enter");
    await expect(page.getByLabel("Wait", { exact: true })).toHaveValue("10 to 15 min");
    await expect(page.getByLabel("Cue", { exact: true })).toHaveValue("Salt on every side");
    await expect(chip).toHaveAttribute("aria-pressed", "true");
    await expect(chip).toBeFocused();
    await expect(waits(page).getByRole("button", { name: "5 min", exact: true })).toHaveAttribute("aria-pressed", "false");
    await bar(page).getByRole("button", { name: "Undo" }).click();
    await preview(page).getByRole("button", { name: "Edit step 1" }).press("Enter");
    await expect(page.getByLabel("Wait", { exact: true })).toHaveValue("");
  });

  test("on a laptop there are no quick waits", async ({ page, baseURL }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await openEditor(page, baseURL, "pork-carnitas");
    await preview(page).getByRole("button", { name: "Edit step 1" }).press("Enter");
    await expect(page.getByLabel("Wait", { exact: true })).toBeVisible();
    await expect(waits(page)).toBeHidden();
  });
});

// From 1440px, Details, the to-dos and What's changed sit in a rail beside
// the sheet (docs/specs/editor-redesign.md, build step 31, decision 5).
test.describe("the side rail on a wide laptop", () => {
  const rail = (page) => page.getByRole("complementary", { name: "Checks and details" });

  test("holds Details, the to-dos and what's changed, beside the sheet, and stays in view", async ({ page, baseURL }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await openEditor(page, baseURL, "salsa-verde");
    await expect(rail(page).getByText("Details", { exact: true })).toBeVisible();
    await expect(rail(page).getByText(/things? to check/)).toBeVisible();
    const sheet = await preview(page).boundingBox(), side = await rail(page).boundingBox();
    expect(side.x).toBeGreaterThanOrEqual(sheet.x + sheet.width);
    expect(side.width).toBe(320);
    // An edit shows in the rail as a list, not behind a button in the bar.
    await preview(page).getByRole("button", { name: "Edit step 1" }).press("Enter");
    await page.getByLabel("Step", { exact: true }).fill("Chop everything finely.");
    await page.getByRole("button", { name: "Done", exact: true }).press("Enter");
    await expect(rail(page).getByRole("region", { name: "What's changed" })).toContainText("Chop everything finely.");
    await expect(page.getByRole("region", { name: "Editing" }).getByRole("button", { name: "What's changed" })).toHaveCount(0);
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await expect(rail(page).getByText("Details", { exact: true })).toBeInViewport();
  });

  test("below 1440px there's no rail, and Details stays under the sheet", async ({ page, baseURL }) => {
    await page.setViewportSize({ width: 1439, height: 900 });
    await openEditor(page, baseURL, "salsa-verde");
    await expect(page.getByText("Details", { exact: true })).toBeVisible();
    await expect(rail(page)).toHaveCount(0);
  });

  test("widening the window to 1440px brings the rail, and an open line keeps what was typed", async ({ page, baseURL }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await openEditor(page, baseURL, "salsa-verde");
    await preview(page).getByRole("button", { name: "Edit step 1" }).press("Enter");
    await page.getByLabel("Step", { exact: true }).fill("Chop everything finely.");
    await page.setViewportSize({ width: 1440, height: 900 });
    await expect(rail(page)).toBeVisible();
    await expect(page.getByLabel("Step", { exact: true })).toHaveValue("Chop everything finely.");
    await expect(page.getByLabel("Step", { exact: true })).toBeFocused();
  });

  test("a Details field typed in, not yet left, keeps its text and lands when left after the rail comes", async ({ page, baseURL }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await openEditor(page, baseURL, "salsa-verde");
    const box = await details(page);
    const source = box.getByLabel("Source", { exact: true });
    await source.fill("Aunt May");
    await page.setViewportSize({ width: 1440, height: 900 });
    await expect(rail(page)).toBeVisible();
    await expect(rail(page).getByLabel("Source", { exact: true })).toBeFocused();
    await page.keyboard.press("Tab");
    await expect(rail(page).getByRole("region", { name: "What's changed" })).toContainText("Aunt May");
  });

  test("focus on the bar's What's changed moves to the rail's list when the window widens", async ({ page, baseURL }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await openEditor(page, baseURL, "salsa-verde");
    await preview(page).getByRole("button", { name: "Edit step 1" }).press("Enter");
    await page.getByLabel("Step", { exact: true }).fill("Chop everything finely.");
    await page.getByRole("button", { name: "Done", exact: true }).press("Enter");
    await page.getByRole("region", { name: "Editing" }).getByRole("button", { name: "What's changed" }).focus();
    await page.setViewportSize({ width: 1440, height: 900 });
    await expect(rail(page).getByRole("region", { name: "What's changed" })).toBeFocused();
  });
});
