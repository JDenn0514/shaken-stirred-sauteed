// A recipe started from scratch (edit.html?new=cooking, baking or cocktails):
// a blank sheet in its section, kept under its own draft key, and saved
// without what was left empty (docs/specs/editor-redesign.md, build step 24).
import { test, expect, EDITOR_INDEX, signIn } from "./fixtures.mjs";

const preview = (page) => page.getByRole("region", { name: "Recipe preview" });
const bar = (page) => page.getByRole("region", { name: "Editing" });
const kept = (page, key) => page.evaluate((k) => localStorage.getItem(k), key);

async function startIn(page, baseURL, section) {
  await signIn(page, baseURL);
  await page.route("**/recipes/index.json", (route) => route.fulfill({ json: EDITOR_INDEX }));
  await page.goto(`edit.html?new=${section}`);
  await expect(preview(page).getByRole("button", { name: "Add a title" })).toBeVisible();
}
async function write(page) {
  await preview(page).getByRole("button", { name: "Add a title" }).press("Enter");
  await page.getByLabel("Title").fill("Shortbread");
  await page.getByRole("button", { name: "Done" }).press("Enter");
  await preview(page).getByRole("button", { name: "Add ingredient" }).press("Enter");
  await page.getByLabel("Amount", { exact: true }).fill("2 cups");
  await page.getByLabel("Ingredient", { exact: true }).fill("Flour");
  await page.getByRole("button", { name: "Done" }).press("Enter");
  await preview(page).getByRole("button", { name: "Add step" }).press("Enter");
  await page.getByLabel("Step", { exact: true }).fill("Mix and bake.");
  await page.getByRole("button", { name: "Done" }).press("Enter");
}

test("a blank sheet in its section, which can't be saved until it has a title, ingredients and steps", async ({ page, baseURL }) => {
  await startIn(page, baseURL, "baking");
  await expect(bar(page)).toContainText("New recipe");
  await expect(preview(page).getByRole("link", { name: /Baking/ })).toBeVisible();
  await expect(page.getByRole("button", { name: "Save" })).toBeDisabled();
  await expect(page.getByRole("region", { name: "Problems to fix" })).toContainText("The recipe needs a title.");
});

test("written and saved: the file has only what was filled in, dated today, and the editor carries on with it", async ({ page, baseURL }) => {
  const sent = [];
  await page.route("**/api/save", (route) => {
    sent.push(route.request().postDataJSON());
    return route.fulfill({ json: { slug: "shortbread", title: "Shortbread", sha: "1".repeat(40), commit: "c".repeat(40) } });
  });
  await startIn(page, baseURL, "baking");
  await write(page);
  await expect(bar(page)).toContainText("recipes/shortbread.json");
  expect(await kept(page, "sss:new:baking")).not.toBeNull();

  await page.getByRole("button", { name: "Save" }).press("Enter");
  await expect(page.getByRole("status").filter({ hasText: "Published" })).toBeVisible();
  const today = await page.evaluate(() => new Date().toLocaleDateString("en-CA"));
  expect(sent).toEqual([{ slug: "shortbread", recipe: {
    title: "Shortbread", category: "baking", ingredients: [{ qty: "2 cups", item: "Flour" }], steps: ["Mix and bake."], added: today,
  } }]);
  await expect(page).toHaveURL(/edit\.html\?r=shortbread$/);
  expect(await kept(page, "sss:new:baking")).toBeNull();
  await expect(bar(page)).toContainText("Editing · Baking");
});

test("its draft is its own: a reload offers it back, and an import in progress is left alone", async ({ page, baseURL }) => {
  await signIn(page, baseURL);
  await page.goto("edit.html?new");
  await page.evaluate(() => localStorage.setItem("sss:intake", '{"an":"import in progress"}'));
  await startIn(page, baseURL, "cocktails");
  await preview(page).getByRole("button", { name: "Add a title" }).press("Enter");
  await page.getByLabel("Title").fill("Gimlet");
  await page.getByRole("button", { name: "Done" }).press("Enter");
  await page.reload();
  const offer = page.getByRole("region", { name: "Unsaved changes" });
  await expect(offer).toContainText("You started this recipe");
  await offer.getByRole("button", { name: "Bring back my changes" }).press("Enter");
  await expect(preview(page).getByRole("heading", { level: 1 })).toContainText("Gimlet");
  expect(await kept(page, "sss:intake")).toBe('{"an":"import in progress"}');

  // Each section keeps its own: a new cooking recipe starts blank.
  await page.goto("edit.html?new=cooking");
  await expect(preview(page).getByRole("button", { name: "Add a title" })).toBeVisible();
  await expect(page.getByRole("region", { name: "Unsaved changes" })).toHaveCount(0);
});
