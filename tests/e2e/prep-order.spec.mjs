// Prep first or as written: a recipe's steps in two orders, on the recipe
// page and in its cook mode, with one saved choice shared with the menu's
// "Prep everything first". See docs/specs/meal-planner-design.md, "Prep first
// or as written".
import { test, expect, onMenu } from "./fixtures.mjs";

const PREP_FIRST = [
  "Slice the peppers and mince the garlic.", "Stir the soy sauce into a splash of water.",
  "Heat the wok until it smokes.", "Pat the tofu dry.", "Stir-fry everything.", "Pour in the sauce, toss and serve.",
];
const AS_WRITTEN = [
  "Heat the wok until it smokes.", "Stir the soy sauce into a splash of water.",
  "Pat the tofu dry.", "Stir-fry everything.", "Pour in the sauce, toss and serve.",
];
const steps = (page) => page.locator("ol.steps > li");
// The recipe page's steps, which also show their waits ("⏱ 3 min").
const starting = (texts) => texts.map((t) => new RegExp(`^${t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`));
const toggle = (page) => page.getByRole("switch", { name: "Prep first" });
const cook = (page) => page.getByRole("region", { name: "Cook mode" });
const stepLabel = (page) => cook(page).getByTestId("step-label");
const instruction = (page) => cook(page).getByTestId("instruction");
const next = (page) => cook(page).getByRole("button", { name: /^(Next step|Finish)$/ });
const back = (page) => cook(page).getByRole("button", { name: "Back", exact: true });
const asWritten = (page) => page.addInitScript(() => localStorage.setItem("sss:prep-first", "false"));
const startCooking = async (page) => {
  await page.getByRole("button", { name: "Start cooking" }).click();
  await expect(cook(page)).toBeVisible();
};

test.describe("the recipe page", () => {
  test("starts with the prep, under its own heading, then the cooking", async ({ page }) => {
    await page.goto("recipe.html?r=veg-stir-fry");
    await expect(toggle(page)).toBeChecked();
    await expect(steps(page)).toHaveText(starting(PREP_FIRST));
    await expect(page.getByRole("heading", { name: "Prep", level: 3 })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Cooking", level: 3 })).toBeVisible();
  });

  test("as written: the recipe's own steps in its own order, without the added prep step", async ({ page }) => {
    await page.goto("recipe.html?r=veg-stir-fry");
    await toggle(page).click();
    await expect(toggle(page)).not.toBeChecked();
    await expect(steps(page)).toHaveText(starting(AS_WRITTEN));
    await expect(page.getByRole("heading", { name: "Prep", level: 3 })).toHaveCount(0);
  });

  // Checked with the keyboard, not a click: Safari on a Mac doesn't focus a
  // checkbox you click, so after a click there's no focus to keep.
  test("works from the keyboard, and the switch keeps focus as the steps change", async ({ page }) => {
    await page.goto("recipe.html?r=veg-stir-fry");
    await toggle(page).focus();
    await page.keyboard.press("Space");
    await expect(toggle(page)).not.toBeChecked();
    await expect(steps(page)).toHaveText(starting(AS_WRITTEN));
    await expect(toggle(page)).toBeFocused();
    await page.keyboard.press("Space");
    await expect(toggle(page)).toBeChecked();
    await expect(steps(page)).toHaveText(starting(PREP_FIRST));
    await expect(toggle(page)).toBeFocused();
  });

  test("the choice is remembered, and is the same one as the menu's Prep everything first", async ({ page }) => {
    await onMenu(page, ["veg-stir-fry"]);
    await page.goto("recipe.html?r=veg-stir-fry");
    await toggle(page).click();
    await page.reload();
    await expect(steps(page)).toHaveText(starting(AS_WRITTEN));
    await page.goto("menu.html");
    await expect(page.getByRole("switch", { name: "Prep everything first" })).not.toBeChecked();
    await page.getByRole("switch", { name: "Prep everything first" }).click();
    await page.goto("recipe.html?r=veg-stir-fry");
    await expect(toggle(page)).toBeChecked();
    await expect(steps(page)).toHaveText(starting(PREP_FIRST));
  });

  test("a step done in one order is still done in the other, and you're at the first step not done", async ({ page }) => {
    await page.goto("recipe.html?r=veg-stir-fry");
    await steps(page).filter({ hasText: "Slice the peppers" }).click();
    await steps(page).filter({ hasText: "Stir the soy sauce" }).click();
    await expect(page.locator("[aria-current=step]")).toHaveText("Heat the wok until it smokes.");
    await toggle(page).click();
    await expect(steps(page).filter({ hasText: "Stir the soy sauce" })).toHaveClass(/\bdone\b/);
    await expect(page.locator("[aria-current=step]")).toHaveText("Heat the wok until it smokes.");
    await steps(page).filter({ hasText: "Heat the wok" }).click();
    await expect(page.locator("[aria-current=step]")).toHaveText("Pat the tofu dry.");
  });

  test("has no switch when the recipe's order is the same both ways", async ({ page }) => {
    // Its only prep is already its first step.
    await page.goto("recipe.html?r=roast-chicken");
    await expect(steps(page)).toHaveCount(3);
    await expect(toggle(page)).toHaveCount(0);
    await page.goto("recipe.html?r=lemon-bars");
    await expect(steps(page).first()).toBeVisible();
    await expect(toggle(page)).toHaveCount(0);
  });
});

test.describe("cook mode", () => {
  test("goes through the prep first, labelled Prep, then the cooking", async ({ page }) => {
    await page.goto("recipe.html?r=veg-stir-fry");
    await startCooking(page);
    await expect(stepLabel(page)).toHaveText("Prep · Step 1 of 6");
    await expect(instruction(page)).toHaveText(PREP_FIRST[0]);
    await expect(cook(page).getByRole("button", { name: /^Up next/ })).toContainText(PREP_FIRST[1]);
    await next(page).click();
    await expect(stepLabel(page)).toHaveText("Prep · Step 2 of 6");
    await expect(instruction(page)).toHaveText(PREP_FIRST[1]);
    await next(page).click();
    await expect(stepLabel(page)).toHaveText("Cooking · Step 3 of 6");
    await expect(instruction(page)).toHaveText(PREP_FIRST[2]);
    await back(page).click();
    await expect(instruction(page)).toHaveText(PREP_FIRST[1]);
  });

  test("as written, it leaves out the added prep step, and finishing those is all done", async ({ page }) => {
    await asWritten(page);
    await page.goto("recipe.html?r=veg-stir-fry");
    await startCooking(page);
    await expect(stepLabel(page)).toHaveText("Step 1 of 5");
    for (const [n, text] of AS_WRITTEN.entries()) {
      await expect(instruction(page)).toHaveText(text);
      await expect(stepLabel(page)).toHaveText(`Step ${n + 1} of 5`);
      await next(page).click();
    }
    await expect(cook(page).getByRole("heading", { name: "All done" })).toBeVisible();
    await back(page).click();
    await expect(instruction(page)).toHaveText(AS_WRITTEN[4]);
  });

  test("a timer is named by the step's number in the order shown", async ({ page }) => {
    await asWritten(page);
    await page.clock.install();
    await page.goto("recipe.html?r=veg-stir-fry");
    await startCooking(page);
    for (let i = 0; i < 3; i++) await next(page).click();
    await expect(instruction(page)).toHaveText("Stir-fry everything.");
    await cook(page).getByRole("button", { name: "Start 3 min timer" }).click();
    await expect(cook(page).getByRole("timer", { name: "Step 4" })).toBeVisible();
  });

  test("steps done here are done on the recipe page, in either order", async ({ page }) => {
    await page.goto("recipe.html?r=veg-stir-fry");
    await startCooking(page);
    await next(page).click();
    await next(page).click();
    await cook(page).getByRole("button", { name: "Close cook mode" }).click();
    await expect(page.locator("[aria-current=step]")).toHaveText("Heat the wok until it smokes.");
    await toggle(page).click();
    await expect(steps(page).filter({ hasText: "Stir the soy sauce" })).toHaveClass(/\bdone\b/);
    await expect(page.locator("[aria-current=step]")).toHaveText("Heat the wok until it smokes.");
  });
});
