// Cooking your menu (menu.html#cook): every dish's steps in one order, one at
// a time, with waits, timers that say what comes next, and one plate-up step.
// The clock is the test's, so waits and timers can be fast-forwarded.
import { test, expect, onMenu } from "./fixtures.mjs";

const cook = (page) => page.getByRole("region", { name: "Cook mode" });
const button = (page, name) => cook(page).getByRole("button", { name, exact: true });
const instruction = (page) => cook(page).getByTestId("instruction");
const label = (page) => cook(page).getByTestId("step-label");
const progressOf = (page, slug) => page.evaluate((s) => JSON.parse(localStorage.getItem(`sss:progress:${s}`) || "{}"), slug);

// Roast chicken (with its herb butter) and green beans. In order: the herb
// butter's two steps, the chicken's prep, heating the oven, trimming the
// beans, a wait while the oven heats, then the roast.
async function start(page, dishes = ["roast-chicken", "green-beans"]) {
  await onMenu(page, dishes);
  await page.clock.install();
  await page.goto("menu.html");
  await page.getByRole("button", { name: /^Start cooking/ }).click();
  await expect(cook(page)).toBeVisible();
}
async function next(page, times = 1) {
  for (let i = 0; i < times; i++) {
    const before = await cook(page).textContent();
    await button(page, "Next step").click();
    await expect(cook(page)).not.toHaveText(before);
  }
}
// From the start to the wait while the oven heats.
async function toOvenWait(page) {
  await start(page);
  await next(page, 6);
  await expect(cook(page)).toContainText("Wait about 15 minutes before the next step.");
}

test("opens on everything to gather first, then the first step", async ({ page }) => {
  await start(page);
  await expect(page).toHaveURL(/menu\.html#cook$/);
  await expect(cook(page).getByRole("heading", { name: "Before you start" })).toBeVisible();
  await expect(cook(page).getByRole("listitem").filter({ hasText: "Roast Chicken" })).toContainText("Have a meat thermometer ready.");
  await next(page);
  await expect(label(page)).toHaveText(/^Herb Butter\s*Step 1 of 10$/);
  await expect(instruction(page)).toHaveText("Chop the parsley.");
  await expect(cook(page).getByRole("checkbox", { name: /2 tbsp\s+Parsley/ })).toBeVisible();
  await expect(cook(page).getByRole("button", { name: /^Up next/ })).toContainText("Herb Butter: Mash the parsley into the butter.");
});

test("Next step marks the step done on the recipe's own page too, and Back undoes it", async ({ page }) => {
  await start(page);
  await next(page, 2);
  await expect(instruction(page)).toHaveText("Mash the parsley into the butter.");
  expect((await progressOf(page, "herb-butter")).steps).toEqual([0]);
  await button(page, "Back").click();
  await expect(instruction(page)).toHaveText("Chop the parsley.");
  expect((await progressOf(page, "herb-butter")).steps).toEqual([]);
});

test("swiping moves forward and back, with touch but not a mouse", async ({ page }) => {
  await start(page);
  await next(page);
  const swipe = async (dx, pointerType = "touch") => {
    const box = await cook(page).boundingBox();
    const y = box.y + box.height / 2, x = box.x + box.width / 2;
    await cook(page).dispatchEvent("pointerdown", { pointerType, isPrimary: true, clientX: x, clientY: y });
    await cook(page).dispatchEvent("pointerup", { pointerType, isPrimary: true, clientX: x + dx, clientY: y + 5 });
  };
  await swipe(-120);
  await expect(instruction(page)).toHaveText("Mash the parsley into the butter.");
  await swipe(120);
  await expect(instruction(page)).toHaveText("Chop the parsley.");
  // Dragging a mouse (selecting text) never moves you.
  await swipe(-120, "mouse");
  await expect(instruction(page)).toHaveText("Chop the parsley.");
});

test("✕ goes back to the menu, which offers to carry on; reloading keeps you cooking", async ({ page }) => {
  await start(page);
  await next(page, 2);
  await cook(page).getByRole("button", { name: "Close cook mode" }).click();
  await expect(page).toHaveURL(/menu\.html$/);
  await page.getByRole("button", { name: "Back to cooking" }).click();
  await expect(instruction(page)).toHaveText("Mash the parsley into the butter.");
  await page.reload();
  await expect(instruction(page)).toHaveText("Mash the parsley into the butter.");
});

test("a wait: Start timer, a ring that empties, and an alarm that only Stop silences", async ({ page }) => {
  await toOvenWait(page);
  await expect(cook(page)).toContainText("Nothing needs you yet.");
  await expect(cook(page).getByRole("button", { name: /^Up next/ })).toContainText("Roast Chicken: Roast until golden.");
  await button(page, "Start 15 min timer").click();
  await expect(cook(page).getByRole("timer", { name: "Wait" })).toContainText("15:00");
  await page.clock.fastForward("15:01");
  await expect(button(page, "Stop")).toBeVisible();
  await expect(cook(page)).toContainText("Time's up.");
  await button(page, "Stop").click();
  await expect(cook(page)).toContainText("Time's up. Go on to the next step when you're ready.");
  await expect(button(page, "Stop")).toHaveCount(0);
  await next(page);
  await expect(instruction(page)).toHaveText("Roast until golden.");
});

test("a wait counts down by itself, even without its timer, and says when it's time", async ({ page }) => {
  await toOvenWait(page);
  await page.clock.fastForward("05:00");
  await expect(cook(page)).toContainText("Wait about 10 minutes before the next step.");
  await expect(cook(page).getByRole("timer", { name: "Wait" })).toContainText("10");
  await expect(button(page, "Start 10 min timer")).toBeVisible();
  await page.clock.fastForward("10:01");
  await expect(cook(page)).toContainText("Time's up. Go on to the next step when you're ready.");
  await expect(cook(page).getByRole("timer", { name: "Wait" })).toHaveText("time's up");
  // No alarm to stop: you didn't set one.
  await expect(button(page, "Stop")).toHaveCount(0);
  await next(page);
  await expect(instruction(page)).toHaveText("Roast until golden.");
});

test("Next step moves on from a wait early", async ({ page }) => {
  await toOvenWait(page);
  await next(page);
  await expect(instruction(page)).toHaveText("Roast until golden.");
});

// Like a marinade started before cooking: its wait is over already.
test("Already done on a step that waits skips its wait and its timer", async ({ page }) => {
  await toOvenWait(page);
  await next(page);
  await expect(instruction(page)).toHaveText("Roast until golden.");
  await button(page, "Already done").click();
  await expect(instruction(page)).toHaveText("Take it out, rest it, carve.");
  await expect(cook(page).getByRole("timer", { name: /Roast Chicken/ })).toHaveCount(0);
});

test("a step's own wait: its timer starts on Next step, at the short end, and says what comes after it", async ({ page }) => {
  await toOvenWait(page);
  await next(page);
  await expect(cook(page).getByTestId("wait")).toContainText("40 to 50 min");
  await expect(cook(page).getByTestId("wait")).toContainText("set to 40 min");
  await next(page);
  const strip = cook(page).getByRole("timer", { name: /Roast Chicken/ });
  await expect(strip).toContainText("40:00");
  await expect(strip).toContainText("then Take it out, rest it");
});

test("a timer ringing never moves you: it says what to do next, and Stop silences it", async ({ page }) => {
  await toOvenWait(page);
  await next(page, 2);
  await expect(cook(page).getByRole("heading", { level: 2 })).toHaveText("Wait about 45 minutes before the next step.");
  await page.clock.fastForward("40:01");
  const strip = cook(page).getByRole("timer", { name: /Roast Chicken/ });
  await expect(strip).toContainText("Time's up. Next: Take it out, rest it");
  // Still on the same wait (planned for the middle of 40 to 50 minutes), counted down.
  await expect(cook(page).getByRole("heading", { level: 2 })).toHaveText("Wait about 5 minutes before the next step.");
  await strip.getByRole("button", { name: "Stop" }).click();
  await expect(cook(page).getByRole("timer", { name: /Roast Chicken/ })).toHaveCount(0);
});

test("+2 min on a timer re-plans: its dish's next step follows the real timer", async ({ page }) => {
  await toOvenWait(page);
  await next(page, 2);
  await expect(cook(page).getByRole("button", { name: /^Up next/ })).toContainText("Roast Chicken: Take it out, rest it");
  // The roast's timer rings at 40 minutes, the short end of 40 to 50, while
  // the plan still counts on 45.
  await page.clock.fastForward("40:01");
  const strip = cook(page).getByRole("timer", { name: /Roast Chicken/ });
  await strip.getByRole("button", { name: "+2 min" }).click();
  // Now it's out in 2 minutes: too short for a wait screen, so the step is up,
  // with the timer counting down above it.
  await expect(instruction(page)).toHaveText("Take it out, rest it, carve.");
  await expect(cook(page).getByRole("timer", { name: /Roast Chicken/ })).toContainText(/1:5\d|2:00/);
});

test("says how far behind you are when it's 5 minutes or more", async ({ page }) => {
  await start(page);
  await next(page);
  await expect(cook(page)).not.toContainText("behind");
  await page.clock.fastForward("25:00");
  await next(page);
  await expect(cook(page)).toContainText(/About \d+ min behind\. The rest of the plan has moved to fit\./);
});

test("ends with one plate-up step, then the done screen with each dish's notes", async ({ page }) => {
  await start(page);
  for (let i = 0; i < 20 && !(await cook(page).getByRole("heading", { name: "Plate up the main" }).count()); i++) {
    if ((await instruction(page).count()) && (await instruction(page).textContent()).startsWith("Drain")) {
      await expect(instruction(page)).toHaveText("Drain and toss with butter.");
    }
    await next(page);
  }
  await expect(cook(page).getByRole("heading", { name: "Plate up the main" })).toBeVisible();
  await expect(cook(page).getByRole("listitem")).toHaveText(["Roast Chicken", "Green Beans"]);
  await button(page, "Finish").click();
  await expect(cook(page).getByRole("heading", { name: "All done" })).toBeVisible();
  await button(page, "Back to your menu").click();
  await expect(page.getByRole("button", { name: /^Start cooking · about/ })).toBeVisible();
});

test("the part made ahead is re-planned as you go: a cake that goes in late comes out late", async ({ page }) => {
  await onMenu(page, ["roast-chicken", "slow-cake"]);
  await page.clock.install();
  await page.goto("menu.html");
  await page.getByRole("button", { name: /^Start Slow Cake/ }).click();
  await next(page, 2);
  await expect(cook(page)).toContainText("Wait about 15 minutes before the next step.");
  // The oven's hot, but the cake goes in 45 minutes late: still two hours of
  // baking from then.
  await page.clock.fastForward("01:00:00");
  await next(page);
  await expect(instruction(page)).toHaveText("Bake low and slow.");
  await next(page);
  await expect(cook(page)).toContainText("Wait about 120 minutes before the next step.");
});

test("cooks the part made ahead on its own, and the menu then says it's made", async ({ page }) => {
  await onMenu(page, ["roast-chicken", "slow-cake"]);
  await page.clock.install();
  await page.goto("menu.html");
  await page.getByRole("button", { name: /^Start Slow Cake/ }).click();
  await expect(label(page)).toHaveText(/^Slow Cake\s*Ahead of time · Step 1 of 4$/);
  for (let i = 0; i < 10 && !(await cook(page).getByRole("heading", { name: "All done" }).count()); i++) {
    await button(page, (await button(page, "Finish").count()) ? "Finish" : "Next step").click();
  }
  await expect(cook(page).getByRole("heading", { name: "All done" })).toBeVisible();
  await button(page, "Back to your menu").click();
  await expect(page.getByRole("region", { name: "Ahead of time" })).toContainText("made ahead");
});
