// Cook mode: a recipe's steps one screen at a time, opened from the recipe page.
import { test, expect } from "./fixtures.mjs";

const cook = (page) => page.getByRole("region", { name: "Cook mode" });
const stepLabel = (page) => cook(page).getByTestId("step-label");
const instruction = (page) => cook(page).getByTestId("instruction");
const next = (page) => cook(page).getByRole("button", { name: /^(Next step|Finish)$/ });
const back = (page) => cook(page).getByRole("button", { name: "Back", exact: true });

async function start(page, slug) {
  await page.goto(`recipe.html?r=${slug}`);
  await page.getByRole("button", { name: /^Start (baking|cooking|mixing)$/ }).click();
  await expect(cook(page)).toBeVisible();
}
// Pork Carnitas opens on its Before you start screen; this goes on to step 1.
async function startCarnitas(page) {
  await start(page, "pork-carnitas");
  await next(page).click();
  await expect(stepLabel(page)).toHaveText("Step 1 of 4");
}

test.describe("opening", () => {
  test("the button is worded by section", async ({ page }) => {
    for (const [slug, name] of [["lemon-bars", "Start baking"], ["pork-carnitas", "Start cooking"], ["daiquiri", "Start mixing"]]) {
      await page.goto(`recipe.html?r=${slug}`);
      await expect(page.getByRole("button", { name })).toBeVisible();
    }
  });

  test("shows one step at a time, with its group and place in the recipe", async ({ page }) => {
    await startCarnitas(page);
    await expect(instruction(page)).toHaveText("Season the pork.");
    await expect(page.getByRole("heading", { level: 1 })).toBeHidden();
  });

  test("opens on Before you start when nothing is done yet", async ({ page }) => {
    await start(page, "lemon-bars");
    await expect(cook(page).getByRole("heading", { name: "Before you start" })).toBeVisible();
    await expect(cook(page).getByText("Heat the oven to 350°F.")).toBeVisible();
    await next(page).click();
    await expect(stepLabel(page)).toHaveText("Crust · Step 1 of 6");
  });

  test("a recipe with nothing to do first opens on step 1, with no Back", async ({ page }) => {
    await start(page, "daiquiri");
    await expect(stepLabel(page)).toHaveText("Step 1 of 1");
    await expect(back(page)).toBeDisabled();
  });

  test("opens at the first unfinished step", async ({ page }) => {
    await page.goto("recipe.html?r=pork-carnitas");
    await page.locator("ol.steps li", { hasText: "Season the pork." }).click();
    await page.getByRole("button", { name: "Start cooking" }).click();
    await expect(instruction(page)).toHaveText("Braise until tender.");
  });
});

test.describe("moving through it", () => {
  test.beforeEach(async ({ page }) => startCarnitas(page));

  test("Next marks the step done and moves on", async ({ page }) => {
    await next(page).click();
    await expect(stepLabel(page)).toHaveText("Step 2 of 4");
    await expect(instruction(page)).toHaveText("Braise until tender.");
  });

  test("Back goes to the previous step and un-marks it", async ({ page }) => {
    await next(page).click();
    await next(page).click();
    await back(page).click();
    await expect(instruction(page)).toHaveText("Braise until tender.");
    await page.reload();
    await expect(instruction(page)).toHaveText("Braise until tender.");
  });

  test("Back from the first step returns to Before you start", async ({ page }) => {
    await back(page).click();
    await expect(cook(page).getByRole("heading", { name: "Before you start" })).toBeVisible();
    await expect(back(page)).toBeDisabled();
  });

  test("swiping moves forward and back", async ({ page }) => {
    const swipe = async (dx) => {
      const box = await cook(page).boundingBox();
      const y = box.y + box.height / 2, x = box.x + box.width / 2;
      await cook(page).dispatchEvent("pointerdown", { pointerType: "touch", isPrimary: true, clientX: x, clientY: y });
      await cook(page).dispatchEvent("pointerup", { pointerType: "touch", isPrimary: true, clientX: x + dx, clientY: y + 5 });
    };
    await swipe(-120);
    await expect(stepLabel(page)).toHaveText("Step 2 of 4");
    await swipe(120);
    await expect(stepLabel(page)).toHaveText("Step 1 of 4");
  });

  test("steps finished here show as done on the recipe page", async ({ page }) => {
    await next(page).click();
    await cook(page).getByRole("button", { name: "Close cook mode" }).click();
    await expect(cook(page)).toBeHidden();
    await expect(page.locator("ol.steps li", { hasText: "Season the pork." })).toHaveClass(/\bdone\b/);
  });

  test("a reload keeps you in cook mode on the same step", async ({ page }) => {
    await next(page).click();
    await page.reload();
    await expect(stepLabel(page)).toHaveText("Step 2 of 4");
  });

  test("the phone's back gesture returns to the recipe page", async ({ page }) => {
    await next(page).click();
    await page.goBack();
    await expect(cook(page)).toBeHidden();
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Pork Carnitas");
  });

  test("the wait and the cue show on their own lines", async ({ page }) => {
    await next(page).click();
    await expect(cook(page).getByTestId("wait")).toHaveText(/2 1\/2 hours/);
    await expect(cook(page).getByTestId("cue")).toHaveText(/Falls apart with a fork/);
  });
});

test.describe("up next", () => {
  const upNext = (page) => cook(page).getByRole("button", { name: /^Up next/ });

  test.beforeEach(async ({ page }) => startCarnitas(page));

  test("shows the next step, and opens and folds without moving you", async ({ page }) => {
    await expect(upNext(page)).toHaveText(/Braise until tender\./);
    await expect(upNext(page)).toHaveAttribute("aria-expanded", "false");
    await upNext(page).click();
    await expect(upNext(page)).toHaveAttribute("aria-expanded", "true");
    await expect(stepLabel(page)).toHaveText("Step 1 of 4");
    await upNext(page).click();
    await expect(upNext(page)).toHaveAttribute("aria-expanded", "false");
  });

  test("folds back when you move to another step", async ({ page }) => {
    await upNext(page).click();
    await next(page).click();
    await expect(upNext(page)).toHaveAttribute("aria-expanded", "false");
  });

  test("isn't shown on the last step, where Next reads Finish", async ({ page }) => {
    for (let i = 0; i < 3; i++) await next(page).click();
    await expect(upNext(page)).toHaveCount(0);
    await expect(next(page)).toHaveText("Finish");
  });
});

test.describe("finishing", () => {
  test("Finish shows a done screen with the notes and a way back", async ({ page }) => {
    await startCarnitas(page);
    for (let i = 0; i < 4; i++) await next(page).click();
    await expect(cook(page).getByRole("heading", { name: "All done" })).toBeVisible();
    await expect(cook(page).getByText("Freezes well.")).toBeVisible();
    await cook(page).getByRole("button", { name: "Back to the recipe" }).click();
    await expect(cook(page)).toBeHidden();
  });

  test("Back from the done screen reopens the last step", async ({ page }) => {
    await startCarnitas(page);
    for (let i = 0; i < 4; i++) await next(page).click();
    await back(page).click();
    await expect(instruction(page)).toHaveText("Crisp it in a hot pan.");
  });
});
