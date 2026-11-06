// The recipe intake's other ways in (intake.html): a recipe website's address,
// fetched by the Worker (/api/fetch, faked here with saved pages from
// tests/samples/), and a PDF, read in the browser.
import { readFileSync } from "node:fs";
import { test, expect, signIn } from "./fixtures.mjs";

const sample = (name) => new URL(`../samples/${name}`, import.meta.url);
const preview = (page) => page.getByRole("region", { name: "Preview" });
const problem = (page) => page.getByRole("form", { name: "Add a recipe" }).getByRole("alert");

// /api/fetch answers with a saved page, as if fetched from `url`.
async function siteServes(page, file, url) {
  const asked = [];
  await page.route("**/api/fetch", async (route) => {
    asked.push(route.request().postDataJSON());
    await route.fulfill({ json: { html: readFileSync(sample(file), "utf8"), url } });
  });
  return asked;
}

async function getPage(page, url, section = "Baking") {
  await page.goto("intake.html");
  await page.getByRole("radio", { name: section }).check();
  await page.getByLabel("Recipe's web address").fill(url);
  await page.getByRole("button", { name: "Get the recipe" }).click();
}

test.describe("a recipe website", () => {
  test.beforeEach(({ page, baseURL }) => signIn(page, baseURL));

  test("a page with recipe data gives a preview, with the site as its source", async ({ page }) => {
    const asked = await siteServes(page, "recipe-page.html", "https://kitchen.example/honey-oat-bars");
    await getPage(page, "https://kitchen.example/honey-oat-bars");
    expect(asked).toEqual([{ url: "https://kitchen.example/honey-oat-bars" }]);
    await expect(preview(page).getByRole("button", { name: "Honey Oat Bars" })).toBeVisible();
    await expect(preview(page).getByRole("button", { name: /rolled oats/ })).toBeVisible();
    const source = preview(page).getByRole("link", { name: "Sam Example, Example Kitchen" });
    await expect(source).toHaveAttribute("href", "https://kitchen.example/honey-oat-bars");
  });

  test("a recipe card's ingredient groups and notes are kept, and shown in the preview", async ({ page }) => {
    await siteServes(page, "recipe-card-page.html", "https://noodles.example/sesame");
    await getPage(page, "https://noodles.example/sesame", "Cooking");
    await expect(preview(page).getByRole("heading", { name: "Sesame Sauce (Note 2)" })).toBeVisible();
    const notes = preview(page).getByRole("region", { name: "Notes" });
    await expect(notes.getByRole("listitem")).toHaveText([
      "1. Any thin wheat noodles work. Ramen noodles are fine. Don't use rice noodles.",
      "2. Adjust the sauce to your liking.",
    ]);
    await page.getByRole("region", { name: "Questions" }).getByRole("radio", { name: /^Hot/ }).check();
    await page.getByRole("button", { name: "Copy instead" }).click();
    const saved = JSON.parse(await page.getByLabel("Recipe file").inputValue());
    expect(saved.ingredients.find((e) => e.group === "Sesame Sauce (Note 2)").items.map((i) => i.item)).toEqual(["soy sauce", "sugar"]);
    expect(saved.notes).toHaveLength(2);
  });

  test("pressing Enter in the address gets the page too", async ({ page }) => {
    await siteServes(page, "recipe-page.html", "https://kitchen.example/honey-oat-bars");
    await page.goto("intake.html");
    await page.getByRole("radio", { name: "Baking" }).check();
    await page.getByLabel("Recipe's web address").fill("https://kitchen.example/honey-oat-bars");
    await page.getByLabel("Recipe's web address").press("Enter");
    await expect(preview(page).getByRole("button", { name: "Honey Oat Bars" })).toBeVisible();
  });

  test("a page without recipe data is read from its text", async ({ page }) => {
    await siteServes(page, "plain-page.html", "https://pickles.example/onions");
    await getPage(page, "https://pickles.example/onions", "Cooking");
    await expect(preview(page).getByRole("button", { name: "Quick Pickled Onions" })).toBeVisible();
    await expect(preview(page).getByRole("button", { name: /cider vinegar/ })).toBeVisible();
    await expect(preview(page).getByRole("link", { name: "Pickle Notes" })).toHaveAttribute("href", "https://pickles.example/onions");
    await expect(page.getByRole("region", { name: "Things to check" })).toContainText("no recipe data");
  });

  test("a site that refuses says so, and suggests copying the text", async ({ page }) => {
    await page.route("**/api/fetch", (route) => route.fulfill({
      status: 502, json: { error: "www.allrecipes.com won't share its pages with other sites. Open the recipe on that site, copy its text, and paste it below.", refused: true },
    }));
    await getPage(page, "https://www.allrecipes.com/recipe/1/x/");
    await expect(problem(page)).toContainText("won't share its pages");
    await expect(problem(page)).toContainText("copy its text");
    await expect(preview(page)).toHaveCount(0);
  });

  test("the section is chosen first", async ({ page }) => {
    const asked = await siteServes(page, "recipe-page.html", "https://kitchen.example/honey-oat-bars");
    await page.goto("intake.html");
    await page.getByLabel("Recipe's web address").fill("https://kitchen.example/honey-oat-bars");
    await page.getByRole("button", { name: "Get the recipe" }).click();
    await expect(problem(page)).toHaveText("Choose Baking, Cooking or Cocktails first.");
    expect(asked).toEqual([]);
  });
});

test("signed out, a website asks you to sign in", async ({ page }) => {
  await getPage(page, "https://kitchen.example/honey-oat-bars");
  await expect(problem(page)).toContainText("Sign in");
  await expect(problem(page)).toContainText("paste");
});

test.describe("a PDF", () => {
  test("a PDF with text gives the recipe in it", async ({ page }) => {
    await page.goto("intake.html");
    await page.getByRole("radio", { name: "Baking" }).check();
    await page.getByLabel("Choose a PDF").setInputFiles(sample("recipe.pdf").pathname);
    await expect(preview(page).getByRole("button", { name: "Brown Butter Shortbread" })).toBeVisible();
    for (const item of ["1 cup unsalted butter", "1/2 cup powdered sugar", "2 cups all-purpose flour", "1/2 teaspoon salt"]) {
      await expect(preview(page).getByRole("button", { name: item })).toBeVisible();
    }
    await expect(preview(page).locator("ol.steps > li").filter({ hasText: "bake until pale golden" })).toBeVisible();
  });

  test("a scanned PDF, with no text, says so and suggests Live Text", async ({ page }) => {
    await page.goto("intake.html");
    await page.getByRole("radio", { name: "Baking" }).check();
    await page.getByLabel("Choose a PDF").setInputFiles(sample("scanned.pdf").pathname);
    await expect(problem(page)).toContainText("no text");
    await expect(problem(page)).toContainText("Live Text");
    await expect(preview(page)).toHaveCount(0);
  });

  test("a file that isn't a PDF says so", async ({ page }) => {
    await page.goto("intake.html");
    await page.getByRole("radio", { name: "Baking" }).check();
    await page.getByLabel("Choose a PDF").setInputFiles({ name: "notes.pdf", mimeType: "application/pdf", buffer: Buffer.from("just some notes") });
    await expect(problem(page)).toContainText("Couldn't open");
  });
});
