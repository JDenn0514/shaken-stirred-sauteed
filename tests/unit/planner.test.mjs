// The lineup planner (assets/planner.mjs): the order one cook makes several
// recipes in. Tests go through planLineup() only and check what a cook would
// see: which step comes when, and how long until serving.
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { planLineup } from "../../assets/planner.mjs";

// A test recipe in the site's JSON format. Steps are [text, fields] pairs.
function recipe(title, steps, extra = {}) {
  return { title, category: "cooking", ingredients: [], steps: steps.map(([text, f = {}]) => ({ do: text, ...f })), ...extra };
}
const texts = (plan) => plan.steps.map((s) => s.text);

describe("one recipe", () => {
  test("its steps come in order, and it takes their total time", () => {
    const recipes = {
      toast: recipe("Toast", [
        ["Slice the bread", { hands: "2 min" }],
        ["Toast it", { hands: "1 min", wait: "3 min" }],
        ["Butter it", { hands: "1 min" }],
      ]),
    };
    const plan = planLineup({ dishes: [{ slug: "toast" }] }, recipes);
    assert.deepEqual(texts(plan), ["Slice the bread", "Toast it", "Butter it"]);
    assert.equal(plan.minutes, 7);
  });
});

describe("one cook, several recipes", () => {
  test("a dish's wait is filled with another dish's hands-on steps", () => {
    const recipes = {
      applesauce: recipe("Applesauce", [["Cut the apples", { hands: "8 min" }], ["Mash them", { hands: "2 min" }]]),
      potatoes: recipe("Potatoes", [["Brush the potatoes and bake", { hands: "3 min", wait: "40 min" }], ["Scatter with parsley", { hands: "1 min" }]]),
    };
    const plan = planLineup({ dishes: [{ slug: "applesauce" }, { slug: "potatoes" }] }, recipes);
    assert.deepEqual(texts(plan), ["Brush the potatoes and bake", "Cut the apples", "Mash them", "Scatter with parsley"]);
    assert.equal(plan.minutes, 44);
  });

  test("a wait that needs you there isn't filled with anything else", () => {
    const recipes = {
      steak: recipe("Steak", [["Sear without moving it", { hands: "1 min", wait: "4 min", watch: true }], ["Rest the steak", { wait: "10 min" }]]),
      asparagus: recipe("Asparagus", [["Trim the asparagus", { hands: "3 min" }], ["Plate it", { hands: "1 min" }]]),
    };
    const plan = planLineup({ dishes: [{ slug: "steak" }, { slug: "asparagus" }] }, recipes);
    const at = (text) => plan.steps.find((s) => s.text === text).at;
    assert.equal(at("Sear without moving it"), 0);
    assert.ok(at("Trim the asparagus") >= 5, `trimming started at ${at("Trim the asparagus")}, during the sear`);
  });

  test("a hot dish is held back so it doesn't sit, and something that keeps fills the gap", () => {
    const recipes = {
      potatoes: recipe("Potatoes", [["Bake the potatoes", { hands: "2 min", wait: "60 min" }]], { serve: "hot", sits: "10 min" }),
      steak: recipe("Steak", [["Cook the steak", { hands: "10 min" }]], { serve: "hot", sits: "5 min" }),
      applesauce: recipe("Applesauce", [["Make the applesauce", { hands: "15 min" }]], { serve: "keeps" }),
    };
    const plan = planLineup({ dishes: [{ slug: "potatoes" }, { slug: "steak" }, { slug: "applesauce" }] }, recipes);
    const at = (text) => plan.steps.find((s) => s.text === text).at;
    assert.equal(at("Make the applesauce"), 2);
    // The steak is done 5 minutes before serving at the earliest.
    assert.ok(at("Cook the steak") + 10 >= plan.minutes - 5, `the steak was done at ${at("Cook the steak") + 10}, serving at ${plan.minutes}`);
    assert.equal(plan.minutes, 62);
  });
});
