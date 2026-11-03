// Cook mode: a recipe's steps one screen at a time, opened from the recipe page.
import { readFileSync } from "node:fs";
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

test.describe("a step's ingredients", () => {
  const box = (page, name) => cook(page).getByRole("checkbox", { name });
  // Lemon Bars: Before you start, then step 1 (crust), 2 (bake), 3 (filling), 4 (rest of the juice)...
  async function toStep(page, n) {
    await start(page, "lemon-bars");
    for (let i = 0; i < n; i++) await next(page).click();
    await expect(stepLabel(page)).toHaveText(new RegExp(`Step ${n} of 6`));
  }
  const recipeBox = async (page, name) => {
    await cook(page).getByRole("button", { name: "Close cook mode" }).click();
    return page.getByRole("checkbox", { name });
  };

  test("are listed with their amounts, grams first", async ({ page }) => {
    await toStep(page, 1);
    await expect(box(page, /^125 g 1 cup Flour$/)).toBeVisible();
    await expect(box(page, /^115 g 8 Tbsp Butter melted$/)).toBeVisible();
    await expect(cook(page).getByRole("checkbox")).toHaveCount(3);
  });

  test("show the right one when two share a name", async ({ page }) => {
    await toStep(page, 1);
    await expect(box(page, /^50 g 1\/4 cup Sugar$/)).toBeVisible();
    await next(page).click();
    await next(page).click();
    await expect(box(page, /^200 g 1 cup Sugar$/)).toBeVisible();
  });

  test("show a step's own share of a split ingredient", async ({ page }) => {
    await toStep(page, 3);
    await expect(box(page, /^1\/4 cup Lemon juice from 4 lemons$/)).toBeVisible();
    await next(page).click();
    await expect(box(page, /^the rest Lemon juice from 4 lemons$/)).toBeVisible();
  });

  test("show a plain ingredient as written", async ({ page }) => {
    await toStep(page, 6);
    await expect(box(page, "Powdered sugar, for dusting")).toBeVisible();
  });

  test("aren't listed for a step that uses none", async ({ page }) => {
    await toStep(page, 2);
    await expect(cook(page).getByRole("checkbox")).toHaveCount(0);
  });

  test("ticked here show as ticked on the recipe page", async ({ page }) => {
    await toStep(page, 1);
    await box(page, /Flour/).check();
    await expect(await recipeBox(page, /Flour/)).toBeChecked();
  });

  test("ticked on the recipe page show as ticked here", async ({ page }) => {
    await page.goto("recipe.html?r=lemon-bars");
    await page.getByRole("checkbox", { name: /Flour/ }).check();
    await toStep(page, 1);
    await expect(box(page, /Flour/)).toBeChecked();
  });

  test("split across steps are ticked once per use", async ({ page }) => {
    await toStep(page, 3);
    await box(page, /Lemon juice/).check();
    await next(page).click();
    await expect(box(page, /Lemon juice/)).not.toBeChecked();
    await cook(page).getByRole("button", { name: "Close cook mode" }).click();
    await expect(page.getByRole("checkbox", { name: /Lemon juice/ })).not.toBeChecked();
    await page.getByRole("button", { name: "Start baking" }).click();
    await box(page, /Lemon juice/).check();
    await expect(await recipeBox(page, /Lemon juice/)).toBeChecked();
  });

  test("split across steps are all ticked from the recipe page", async ({ page }) => {
    await page.goto("recipe.html?r=lemon-bars");
    await page.getByRole("checkbox", { name: /Lemon juice/ }).check();
    await toStep(page, 3);
    await expect(box(page, /Lemon juice/)).toBeChecked();
    await next(page).click();
    await expect(box(page, /Lemon juice/)).toBeChecked();
  });
});

test.describe("timers", () => {
  const timer = (page, name) => cook(page).getByRole("timer", { name });
  // Lemon Bars step 2 is "Bake the crust", 15 to 18 min.
  async function toBake(page) {
    await start(page, "lemon-bars");
    await next(page).click();
    await next(page).click();
    await expect(instruction(page)).toHaveText("Bake the crust.");
  }

  test.beforeEach(async ({ page }) => {
    // The clock stands still unless a test moves it on.
    await page.clock.install({ time: new Date(2026, 10, 2, 17, 59, 0) });
    await page.clock.pauseAt(new Date(2026, 10, 2, 18, 0, 0));
  });

  test("each kind of wait gets a timer for its shortest time", async ({ page }) => {
    await start(page, "every-wait");
    for (;;) {
      const expected = await instruction(page).textContent();
      const button = cook(page).getByRole("button", { name: /^Start .* timer$/ });
      if (expected === "none") await expect(button).toHaveCount(0);
      else await expect(button).toHaveText(`Start ${expected} timer`);
      if (await next(page).textContent() === "Finish") break;
      await next(page).click();
    }
  });

  test("counts down, and stays at the top as you move on", async ({ page }) => {
    await toBake(page);
    await cook(page).getByRole("button", { name: "Start 15 min timer" }).click();
    await expect(timer(page, "Step 2")).toContainText("15:00");
    await expect(cook(page).getByRole("button", { name: /^Start .* timer$/ })).toHaveCount(0);
    await page.clock.runFor(60_000);
    await expect(timer(page, "Step 2")).toContainText("14:00");
    await next(page).click();
    await expect(timer(page, "Step 2")).toContainText("14:00");
  });

  test("rings with the step's cue, and can be given 2 more minutes or stopped", async ({ page }) => {
    await toBake(page);
    await cook(page).getByRole("button", { name: "Start 15 min timer" }).click();
    await next(page).click();
    await page.clock.runFor(15 * 60_000);
    await expect(timer(page, "Step 2")).toContainText("Pale gold at the edges");
    await timer(page, "Step 2").getByRole("button", { name: "+2 min" }).click();
    await expect(timer(page, "Step 2")).toContainText("2:00");
    await page.clock.runFor(2 * 60_000);
    await timer(page, "Step 2").getByRole("button", { name: "Stop" }).click();
    await expect(cook(page).getByRole("timer")).toHaveCount(0);
  });

  test("can be paused, resumed and cancelled", async ({ page }) => {
    await toBake(page);
    await cook(page).getByRole("button", { name: "Start 15 min timer" }).click();
    await timer(page, "Step 2").getByRole("button", { name: "Pause" }).click();
    await page.clock.runFor(60_000);
    await expect(timer(page, "Step 2")).toContainText("15:00");
    await timer(page, "Step 2").getByRole("button", { name: "Resume" }).click();
    await page.clock.runFor(60_000);
    await expect(timer(page, "Step 2")).toContainText("14:00");
    await timer(page, "Step 2").getByRole("button", { name: "Cancel timer" }).click();
    await expect(cook(page).getByRole("timer")).toHaveCount(0);
  });

  test("keeps time through a reload", async ({ page }) => {
    await toBake(page);
    await cook(page).getByRole("button", { name: "Start 15 min timer" }).click();
    await page.clock.runFor(5 * 60_000);
    await page.reload();
    await expect(timer(page, "Step 2")).toContainText("10:00");
  });

  // Counts the beeps and buzzes the page asks the phone for. Whether they
  // can be heard or felt is up to the phone, so that isn't tested.
  async function listenForAlarm(page) {
    await page.addInitScript(() => {
      window.alarm = { beeps: 0, buzzes: 0 };
      const play = OscillatorNode.prototype.start;
      OscillatorNode.prototype.start = function (...args) { window.alarm.beeps++; return play.apply(this, args); };
      navigator.vibrate = () => { window.alarm.buzzes++; return true; };
      // Safari's audio session, where "playback" rings through the silent switch.
      navigator.audioSession = { type: "auto" };
    });
  }
  const alarm = (page) => page.evaluate(() => window.alarm);
  const audioSession = (page) => page.evaluate(() => navigator.audioSession.type);

  // Ringing through the switch pauses other apps' music, so only while it rings.
  test("rings through an iPhone's silent switch, but only while it rings", async ({ page }) => {
    await listenForAlarm(page);
    await toBake(page);
    await cook(page).getByRole("button", { name: "Start 15 min timer" }).click();
    await page.clock.runFor(60_000);
    expect(await audioSession(page)).toBe("auto");
    await page.clock.runFor(14 * 60_000 + 3000);
    await expect(timer(page, "Step 2")).toContainText("Pale gold at the edges");
    expect(await audioSession(page)).toBe("playback");
    await timer(page, "Step 2").getByRole("button", { name: "Stop" }).click();
    await page.clock.runFor(2000);
    expect(await audioSession(page)).toBe("auto");
  });

  test("beeps and buzzes when it ends", async ({ page }) => {
    await listenForAlarm(page);
    await toBake(page);
    await cook(page).getByRole("button", { name: "Start 15 min timer" }).click();
    await page.clock.runFor(15 * 60_000 + 3000);
    await expect(timer(page, "Step 2")).toContainText("Pale gold at the edges");
    const { beeps, buzzes } = await alarm(page);
    expect(beeps).toBeGreaterThan(0);
    expect(buzzes).toBeGreaterThan(0);
  });

  // Browsers only let a page make sound after a tap, so a reloaded page
  // can buzz straight away but has to wait for a tap to beep.
  test("still buzzes after a reload, and beeps once you tap anything", async ({ page }) => {
    await listenForAlarm(page);
    await toBake(page);
    await cook(page).getByRole("button", { name: "Start 15 min timer" }).click();
    await page.reload();
    await page.clock.runFor(15 * 60_000 + 3000);
    await expect(timer(page, "Step 2")).toContainText("Pale gold at the edges");
    expect((await alarm(page)).buzzes).toBeGreaterThan(0);
    await next(page).click();
    await page.clock.runFor(3000);
    expect((await alarm(page)).beeps).toBeGreaterThan(0);
  });

  test("long ones say when they'll be ready", async ({ page }) => {
    await start(page, "lemon-bars");
    for (let i = 0; i < 6; i++) await next(page).click();
    await cook(page).getByRole("button", { name: "Start 2 hr timer" }).click();
    await expect(timer(page, "Step 6")).toContainText("Ready around 8:00 pm");
  });

  test("follow you into another recipe's cook mode, and link back", async ({ page }) => {
    await toBake(page);
    await cook(page).getByRole("button", { name: "Start 15 min timer" }).click();
    await start(page, "pork-carnitas");
    await expect(timer(page, "Lemon Bars, step 2")).toContainText("15:00");
    await timer(page, "Lemon Bars, step 2").getByRole("link", { name: /Lemon Bars/ }).click();
    await expect(instruction(page)).toHaveText("Bake the crust.");
  });
});

test("text in a recipe is shown as text in cook mode, never run as page code", async ({ page }) => {
  await start(page, "sneaky-recipe");
  await expect(instruction(page)).toHaveText(`<i class="injected">Stir</i>`);
  await expect(cook(page).getByTestId("cue")).toContainText(`<u class="injected">done</u>`);
  await expect(page.locator(".injected")).toHaveCount(0);
});

// Every real recipe, walked through from start to finish, so a recipe the
// checker allows but cook mode can't show gets caught here rather than mid-cook.
test.describe("every real recipe in cook mode", () => {
  test.use({ testRecipes: false });
  const file = (p) => JSON.parse(readFileSync(new URL(`../../recipes/${p}`, import.meta.url), "utf8"));
  const steps = (r) => r.steps.flatMap((e) => (Array.isArray(e.items) ? e.items : [e]));

  for (const { slug, title } of file("index.json")) {
    test(`${slug} walks through every step, with each step's ingredients`, async ({ page }) => {
      const errors = [];
      page.on("pageerror", (e) => errors.push(e.message));
      page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
      const r = file(`${slug}.json`);
      await start(page, slug);
      if (r.beforeYouStart?.length) await next(page).click();
      for (const [n, s] of steps(r).entries()) {
        await expect(stepLabel(page)).toHaveText(new RegExp(`Step ${n + 1} of ${steps(r).length}$`));
        await expect(cook(page).getByRole("checkbox"), `${title}, step ${n + 1}`).toHaveCount(s.uses?.length ?? 0);
        await next(page).click();
      }
      await expect(cook(page).getByRole("heading", { name: "All done" })).toBeVisible();
      expect(errors).toEqual([]);
    });
  }
});
