// The menu's cook mode, the parts that are plain logic: what it shows from a
// plan (assets/menu-plan.mjs). The screen itself has browser tests.
import { test } from "node:test";
import assert from "node:assert/strict";
import { withoutServing, cookSteps, busyStretch, behind, brief } from "../../assets/menu-plan.mjs";

test("a dish's last step loses its closing 'serve', so no dish goes out alone", () => {
  assert.equal(withoutServing("Drain and toss with butter, then serve."), "Drain and toss with butter.");
  assert.equal(withoutServing("Take the potatoes out, scatter the parsley over, and serve hot."), "Take the potatoes out, scatter the parsley over.");
  assert.equal(withoutServing("Rest 5 minutes. Serve immediately."), "Rest 5 minutes.");
  assert.equal(withoutServing("Slice and serve it warm."), "Slice.");
  // Only a closing serve: anything else stays as written.
  assert.equal(withoutServing("Serve the sauce on the side, warm the plates."), "Serve the sauce on the side, warm the plates.");
  assert.equal(withoutServing("Stir in the butter."), "Stir in the butter.");
});

const plan = {
  steps: [
    { slug: "butter", step: 0, at: 0, hands: 3, idle: 0 },
    { slug: "chicken", step: "heat", at: 3, hands: 1, idle: 0, added: true },
    { slug: "chicken", step: 0, at: 4, hands: 0, idle: 0, skipped: true },
    { slug: "chicken", step: 1, at: 20, hands: 2, wait: 45, idle: 15 },
    { slug: "beans", step: 0, at: 70, hands: 1, idle: 45 },
    { slug: "chicken", step: 2, at: 71, hands: 5, idle: 0 },
    { slug: "cake", step: 0, at: 120, hands: 5, idle: 40 },
  ],
  serving: [
    { course: "Main", at: 80, dishes: ["chicken", "beans"] },
    { course: "Dessert", at: 125, dishes: ["cake"] },
  ],
};

test("cook mode's steps: the plan's, without skipped ones, with a plate-up step after each course's last", () => {
  const steps = cookSteps(plan);
  assert.deepEqual(steps.map((s) => s.plate ? `plate:${s.plate}` : `${s.slug}:${s.step}`),
    ["butter:0", "chicken:heat", "chicken:1", "beans:0", "chicken:2", "plate:Main", "cake:0", "plate:Dessert"]);
  assert.deepEqual(steps.find((s) => s.plate === "Main").dishes, ["chicken", "beans"]);
});

test("a nested recipe's steps count toward its dish's course", () => {
  const steps = cookSteps(plan, { butter: "chicken" });
  assert.equal(steps.findIndex((s) => s.plate === "Main"), 5);
});

test("a plan made ahead has no plate-up step", () => {
  assert.deepEqual(cookSteps({ steps: plan.steps.slice(0, 2) }).map((s) => s.slug), ["butter", "chicken"]);
});

test("a busy stretch: four or more steps straight after one another, for 15 minutes or more", () => {
  const steps = [
    { at: 0, hands: 2, idle: 0 },
    { at: 10, hands: 5, idle: 8 },   // the stretch starts here
    { at: 15, hands: 5, idle: 0 },
    { at: 20, hands: 4, idle: 0 },
    { at: 24, hands: 6, idle: 0 },
    { at: 40, hands: 2, idle: 10 },
  ];
  assert.deepEqual(busyStretch(steps, 1), { steps: 4, minutes: 20 });
  // Inside it, or where there's room between steps, there's nothing to say.
  assert.equal(busyStretch(steps, 2), null);
  assert.equal(busyStretch(steps, 5), null);
  // Short runs don't count.
  assert.equal(busyStretch(steps.slice(0, 3), 1), null);
});

test("how far behind: the meal's end now, against when it was first planned to end", () => {
  assert.equal(behind({ courses: { Main: 95 } }, 88), 7);
  assert.equal(behind({ courses: { Main: 80, Dessert: 125 } }, 128), 0);
  assert.equal(behind({ minutes: 60 }, 50), 10);
});

test("a timer's strip names what comes next briefly: its first sentence, cut short if long", () => {
  assert.equal(brief("Take it out, rest it, carve."), "Take it out, rest it, carve.");
  assert.equal(brief("Uncover it. Then mash to the texture you want."), "Uncover it.");
  assert.equal(brief("Set the egg bowl on a damp towel so it stays put while you temper the hot juice into the eggs"),
    "Set the egg bowl on a damp towel so it stays put while you…");
});
