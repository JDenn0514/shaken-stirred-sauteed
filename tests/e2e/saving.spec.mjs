// Saving and deleting (docs/specs/recipe-editor-plan.md, slice 6): the editor's
// Save and Delete, the intake's Finish, and the recipe page's Edit link. The
// Worker's /api/ is faked here; the Worker itself is tested in worker/test.
import { test, expect, EDITOR_INDEX, signIn, versionOf } from "./fixtures.mjs";
import { ROLLS, readRecipe } from "./intake-samples.mjs";

const preview = (page) => page.getByRole("region", { name: "Recipe preview" });
const draftOf = (page, slug) => page.evaluate((s) => localStorage.getItem(`sss:draft:${s}`), slug);

// Answers POST to /api/<what> with `reply` (a status and JSON, or a function of
// the request's body), and keeps each request's body.
async function fakeWorker(page, what, reply) {
  const sent = [];
  await page.route(`**/api/${what}`, (route) => {
    const body = route.request().postDataJSON();
    sent.push({ method: route.request().method(), body });
    const { status = 200, json } = typeof reply === "function" ? reply(body, sent.length) : reply;
    return route.fulfill({ status, json });
  });
  return sent;
}

async function openEditor(page, baseURL, slug) {
  await signIn(page, baseURL);
  await page.route("**/recipes/index.json", (route) => route.fulfill({ json: EDITOR_INDEX }));
  await page.goto(`edit.html?r=${slug}`);
  await expect(preview(page).getByRole("heading", { level: 1 })).toBeVisible();
}
async function retitle(page, from, to) {
  await preview(page).getByRole("button", { name: from }).click();
  await page.getByLabel("Title").fill(to);
  await page.getByRole("button", { name: "Done" }).click();
}
const published = (slug, n = 1) => ({ json: { slug, title: "x", sha: `${n}`.repeat(40), commit: "c".repeat(40) } });

test.describe("the editor's Save", () => {
  test("opens the recipe as it is on main, from the Worker", async ({ page, baseURL }) => {
    await signIn(page, baseURL);
    await page.route("**/api/recipe/pork-carnitas", (route) => route.fulfill({ json: {
      slug: "pork-carnitas", sha: versionOf("pork-carnitas"),
      recipe: { title: "Carnitas, as on main", category: "cooking", ingredients: ["3 lb pork"], steps: ["Braise."], tags: { ingredients: ["pork"] } },
    } }));
    await page.goto("edit.html?r=pork-carnitas");
    await expect(preview(page).getByRole("heading", { level: 1 })).toHaveText("Carnitas, as on main");
  });

  test("a recipe that isn't on main isn't found", async ({ page, baseURL }) => {
    await signIn(page, baseURL);
    await page.goto("edit.html?r=not-a-recipe");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Recipe not found");
  });

  test("publishes the recipe, says so with a link to it, and clears the draft", async ({ page, baseURL }) => {
    const sent = await fakeWorker(page, "save", (_, n) => published("pork-carnitas", n));
    await openEditor(page, baseURL, "pork-carnitas");
    await retitle(page, "Pork Carnitas", "Crispy Carnitas");
    expect(await draftOf(page, "pork-carnitas")).not.toBeNull();

    await page.getByRole("button", { name: "Save" }).click();
    const status = page.getByRole("status").filter({ hasText: "Published" });
    await expect(status).toHaveText("Published. The site updates in a minute or two. See Crispy Carnitas on the site");
    await expect(status.getByRole("link", { name: "See Crispy Carnitas on the site" })).toHaveAttribute("href", "recipe.html?r=pork-carnitas");
    expect(sent).toHaveLength(1);
    expect(sent[0].method).toBe("POST");
    expect(sent[0].body).toMatchObject({ slug: "pork-carnitas", baseSha: versionOf("pork-carnitas") });
    expect(sent[0].body.recipe.title).toBe("Crispy Carnitas");
    expect(sent[0].body.recipe.notes).toEqual(["Freezes well."]);
    expect(await draftOf(page, "pork-carnitas")).toBeNull();

    // The next save is made against the version the first one made.
    await retitle(page, "Crispy Carnitas", "Crispier Carnitas");
    await page.getByRole("button", { name: "Save" }).click();
    await expect(page.getByRole("status").filter({ hasText: "Published" })).toContainText("See Crispier Carnitas");
    expect(sent[1].body.baseSha).toBe("1".repeat(40));
  });

  test("a line still open when you press Save is saved as typed, and closed", async ({ page, baseURL }) => {
    const sent = await fakeWorker(page, "save", (_, n) => published("pork-carnitas", n));
    await openEditor(page, baseURL, "pork-carnitas");
    await preview(page).getByRole("button", { name: "Edit step 1" }).click();
    await page.getByLabel("Step", { exact: true }).fill("Season the pork well.");
    await page.getByRole("button", { name: "Save" }).click();
    await expect(page.getByRole("status").filter({ hasText: "Published" })).toBeVisible();
    expect(sent[0].body.recipe.steps[0]).toBe("Season the pork well.");
    await expect(page.getByLabel("Step", { exact: true })).toHaveCount(0);
  });

  test("Ctrl+S (Cmd+S on a Mac) saves, with a line still open, and does nothing when nothing changed", async ({ page, baseURL }) => {
    const sent = await fakeWorker(page, "save", (_, n) => published("pork-carnitas", n));
    await openEditor(page, baseURL, "pork-carnitas");
    await preview(page).getByRole("button", { name: "Edit step 1" }).press("Enter");
    await page.keyboard.press("ControlOrMeta+s");
    await page.getByLabel("Step", { exact: true }).fill("Season the pork well.");
    await page.keyboard.press("ControlOrMeta+s");
    await expect(page.getByRole("status").filter({ hasText: "Published" })).toBeVisible();
    expect(sent).toHaveLength(1);
    expect(sent[0].body.recipe.steps[0]).toBe("Season the pork well.");
  });

  test("typing in a Details field and clicking Save straight away saves what was typed", async ({ page, baseURL }) => {
    const sent = await fakeWorker(page, "save", (_, n) => published("pork-carnitas", n));
    await openEditor(page, baseURL, "pork-carnitas");
    await page.getByText("Details", { exact: true }).click();
    await page.getByLabel("Source", { exact: true }).fill("Aunt May");
    await page.getByRole("button", { name: "Save" }).click();
    await expect(page.getByRole("status").filter({ hasText: "Published" })).toBeVisible();
    expect(sent[0].body.recipe.source.name).toBe("Aunt May");
  });

  test("a sign-in that runs out while a line is open keeps what's typed in it", async ({ page, baseURL }) => {
    await fakeWorker(page, "save", { status: 401, json: { error: "Your GitHub sign-in has expired. Sign in again." } });
    await openEditor(page, baseURL, "pork-carnitas");
    await preview(page).getByRole("button", { name: "Edit step 1" }).click();
    await page.getByLabel("Step", { exact: true }).fill("Season the pork well.");
    await page.getByRole("button", { name: "Save" }).click();
    await expect(page.getByRole("alert").getByRole("link", { name: "Sign in again" })).toBeVisible();
    expect(JSON.parse(await draftOf(page, "pork-carnitas")).recipe.steps[0]).toBe("Season the pork well.");
  });

  test("a recipe changed since it was opened isn't overwritten: it says why and keeps the draft", async ({ page, baseURL }) => {
    await fakeWorker(page, "save", { status: 409, json: { error: "This recipe changed since you opened it. Your changes are kept in this browser: reload to see the new version, then bring your changes back if you still want them." } });
    await openEditor(page, baseURL, "pork-carnitas");
    await retitle(page, "Pork Carnitas", "Crispy Carnitas");
    await page.getByRole("button", { name: "Save" }).click();
    await expect(page.getByRole("alert")).toContainText("This recipe changed since you opened it.");
    expect(JSON.parse(await draftOf(page, "pork-carnitas")).recipe.title).toBe("Crispy Carnitas");
    await expect(page.getByRole("button", { name: "Save" })).toBeEnabled();
  });

  test("problems the Worker finds are listed", async ({ page, baseURL }) => {
    await fakeWorker(page, "save", { status: 422, json: { error: "This recipe has problems to fix before it can be saved.", problems: [`"Garlic butter" links to recipe "garlic-butter", which doesn't exist`] } });
    await openEditor(page, baseURL, "garlic-bread");
    await retitle(page, "Garlic Bread", "Crusty Garlic Bread");
    await page.getByRole("button", { name: "Save" }).click();
    const alert = page.getByRole("alert");
    await expect(alert).toContainText("This recipe has problems to fix before it can be saved.");
    await expect(alert.getByRole("listitem")).toHaveText([`"Garlic butter" links to recipe "garlic-butter", which doesn't exist`]);
  });

  test("a sign-in that has run out asks you to sign in again, coming back here, and keeps the draft", async ({ page, baseURL }) => {
    await fakeWorker(page, "save", { status: 401, json: { error: "Your GitHub sign-in has expired. Sign in again." } });
    await openEditor(page, baseURL, "pork-carnitas");
    await retitle(page, "Pork Carnitas", "Crispy Carnitas");
    await page.getByRole("button", { name: "Save" }).click();
    const link = page.getByRole("alert").getByRole("link", { name: "Sign in again" });
    await expect(link).toHaveAttribute("href", "/api/signin?return=%2Fedit.html%3Fr%3Dpork-carnitas");
    await expect(page.getByRole("alert")).toContainText("Your changes are kept in this browser.");
    expect(await draftOf(page, "pork-carnitas")).not.toBeNull();
  });

  test("an account that can't push is told so, not given a failed save", async ({ page, baseURL }) => {
    await fakeWorker(page, "save", { status: 403, json: { error: "This account can't edit this site." } });
    await openEditor(page, baseURL, "pork-carnitas");
    await retitle(page, "Pork Carnitas", "Crispy Carnitas");
    await page.getByRole("button", { name: "Save" }).click();
    await expect(page.getByRole("alert")).toHaveText("This account can't edit this site.");
  });

  test("no connection says so, and keeps the draft", async ({ page, baseURL }) => {
    await openEditor(page, baseURL, "pork-carnitas");
    await page.route("**/api/save", (route) => route.abort("internetdisconnected"));
    await retitle(page, "Pork Carnitas", "Crispy Carnitas");
    await page.getByRole("button", { name: "Save" }).click();
    await expect(page.getByRole("alert")).toContainText("Couldn't reach the site");
    expect(await draftOf(page, "pork-carnitas")).not.toBeNull();
  });
});

// A draft is kept in the browser. If the recipe was saved since (from another
// device or tab), bringing the draft back mustn't quietly undo that save.
test.describe("unsaved drafts and newer versions", () => {
  const draftFull = (page, slug) => page.evaluate((s) => JSON.parse(localStorage.getItem(`sss:draft:${s}`)), slug);
  // Leaves a draft (title changed) as if made on the given version, then opens the editor again.
  async function leaveDraft(page, base) {
    await page.evaluate(([b]) => {
      const kept = JSON.parse(localStorage.getItem("sss:draft:pork-carnitas"));
      localStorage.setItem("sss:draft:pork-carnitas", JSON.stringify({ ...kept, base: b }));
    }, [base]);
    await page.reload();
  }

  test("a draft remembers which version of the recipe it was made from", async ({ page, baseURL }) => {
    await openEditor(page, baseURL, "pork-carnitas");
    await retitle(page, "Pork Carnitas", "Crispy Carnitas");
    expect((await draftFull(page, "pork-carnitas")).base).toBe(versionOf("pork-carnitas"));
  });

  test("a draft from the version on the site is offered back as before", async ({ page, baseURL }) => {
    await openEditor(page, baseURL, "pork-carnitas");
    await retitle(page, "Pork Carnitas", "Crispy Carnitas");
    await leaveDraft(page, versionOf("pork-carnitas"));
    const offer = page.getByRole("region", { name: "Unsaved changes" });
    await expect(offer).toBeVisible();
    await expect(offer).not.toContainText("saved since");
  });

  test("a draft from an older version says so, and saving it doesn't overwrite the newer one", async ({ page, baseURL }) => {
    const older = "0".repeat(40);
    const sent = await fakeWorker(page, "save", { status: 409, json: { error: "This recipe changed since you opened it. Your changes are kept in this browser: reload to see the new version, then bring your changes back if you still want them." } });
    await openEditor(page, baseURL, "pork-carnitas");
    await retitle(page, "Pork Carnitas", "Crispy Carnitas");
    await leaveDraft(page, older);
    const offer = page.getByRole("region", { name: "Unsaved changes" });
    await expect(offer).toContainText("The recipe has been saved since you made these changes");
    await offer.getByRole("button", { name: "Bring back my changes" }).click();
    await page.getByRole("button", { name: "Save" }).click();
    await expect(page.getByRole("alert")).toContainText("This recipe changed since you opened it.");
    expect(sent[0].body.baseSha).toBe(older);
  });
});

test.describe("the editor's Delete", () => {
  const dialog = (page) => page.getByRole("dialog", { name: "Delete Pork Carnitas?" });

  test("asks you to type the recipe's name; the wrong name keeps Delete off; the right one deletes", async ({ page, baseURL }) => {
    const sent = await fakeWorker(page, "delete", { json: { slug: "pork-carnitas", title: "Pork Carnitas", commit: "c".repeat(40) } });
    await openEditor(page, baseURL, "pork-carnitas");
    await retitle(page, "Pork Carnitas", "Edited, not saved");
    await page.getByRole("button", { name: "Delete this recipe" }).click();
    await expect(dialog(page)).toBeVisible();
    await expect(dialog(page).getByLabel("Recipe name")).toBeFocused();
    const del = dialog(page).getByRole("button", { name: "Delete", exact: true });
    await expect(del).toBeDisabled();
    await dialog(page).getByLabel("Recipe name").fill("Pork");
    await expect(del).toBeDisabled();
    await dialog(page).getByLabel("Recipe name").fill("Pork Carnitas");
    await expect(del).toBeEnabled();
    await del.click();

    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Deleted Pork Carnitas");
    await expect(page.getByText("The site updates in a minute or two.")).toBeVisible();
    await expect(page.getByRole("link", { name: "All recipes" })).toBeVisible();
    expect(sent).toEqual([{ method: "POST", body: { slug: "pork-carnitas", baseSha: versionOf("pork-carnitas") } }]);
    expect(await draftOf(page, "pork-carnitas")).toBeNull();
  });

  test("Cancel closes it without deleting, back on the Delete button", async ({ page, baseURL }) => {
    const sent = await fakeWorker(page, "delete", { json: {} });
    await openEditor(page, baseURL, "pork-carnitas");
    await page.getByRole("button", { name: "Delete this recipe" }).focus();
    await page.keyboard.press("Enter");
    await dialog(page).getByLabel("Recipe name").fill("Pork Carnitas");
    await dialog(page).getByRole("button", { name: "Cancel" }).press("Enter");
    await expect(dialog(page)).toBeHidden();
    await expect(page.getByRole("button", { name: "Delete this recipe" })).toBeFocused();
    expect(sent).toEqual([]);
  });

  test("a refusal from the Worker is shown in the dialog", async ({ page, baseURL }) => {
    await fakeWorker(page, "delete", { status: 409, json: { error: "This recipe changed since you opened it." } });
    await openEditor(page, baseURL, "pork-carnitas");
    await page.getByRole("button", { name: "Delete this recipe" }).click();
    await dialog(page).getByLabel("Recipe name").fill("pork carnitas");
    await dialog(page).getByRole("button", { name: "Delete", exact: true }).click();
    await expect(dialog(page).getByRole("alert")).toHaveText("This recipe changed since you opened it.");
  });

  test("a recipe another recipe uses can't be deleted, and says which", async ({ page, baseURL }) => {
    await openEditor(page, baseURL, "garlic-butter");
    const del = page.getByRole("button", { name: "Delete this recipe" });
    await expect(del).toBeDisabled();
    await expect(del).toHaveAccessibleDescription(`Garlic Bread uses this recipe for its "Garlic butter". Take that link out to delete it.`);
  });
});

// The intake's Save moved to the editor: see tests/e2e/intake-to-editor.spec.mjs.
test.describe("the intake's Finish", () => {
  const finish = (page) => page.getByRole("region", { name: "Finish" });
  async function ready(page) {
    await readRecipe(page, ROLLS, "Baking");
    await page.getByRole("button", { name: "Use this time" }).click();
  }

  test("signed in, it continues in the editor, where it's saved", async ({ page, baseURL }) => {
    await signIn(page, baseURL);
    await ready(page);
    await expect(finish(page).getByRole("link", { name: "Continue in the editor" })).toHaveAttribute("href", "edit.html?new");
    await expect(finish(page).getByRole("button", { name: "Save" })).toHaveCount(0);
  });

  test("signed in, the recipe can still be copied instead", async ({ page, baseURL }) => {
    await signIn(page, baseURL);
    await ready(page);
    await finish(page).getByRole("button", { name: "Copy instead" }).click();
    expect(JSON.parse(await page.getByLabel("Recipe file").inputValue()).title).toBe("Milk Rolls");
  });

  test("signed in to an account that can't edit, there's no editor, only Copy", async ({ page, baseURL }) => {
    await signIn(page, baseURL);
    await page.route("**/api/me", (route) => route.fulfill({ json: { name: "A Friend", canEdit: false } }));
    await ready(page);
    await expect(finish(page)).toContainText("This account can't edit this site, so it can't save here.");
    await expect(finish(page).getByRole("link", { name: "Continue in the editor" })).toHaveCount(0);
    await expect(finish(page).getByRole("button", { name: "Copy recipe" })).toBeEnabled();
  });

  test("signed out, there's no editor, only Copy", async ({ page }) => {
    await ready(page);
    await expect(finish(page).getByRole("link", { name: "Continue in the editor" })).toHaveCount(0);
    await expect(finish(page).getByRole("button", { name: "Copy recipe" })).toBeEnabled();
  });
});

test.describe("the recipe page's Edit link", () => {
  test("signed in, it opens the recipe in the editor", async ({ page, baseURL }) => {
    await signIn(page, baseURL);
    await page.goto("recipe.html?r=pork-carnitas");
    await expect(page.getByRole("link", { name: "Edit", exact: true })).toHaveAttribute("href", "edit.html?r=pork-carnitas");
  });

  test("signed out, there's none", async ({ page }) => {
    await page.goto("recipe.html?r=pork-carnitas");
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await expect(page.getByRole("link", { name: "Edit", exact: true })).toHaveCount(0);
  });
});
