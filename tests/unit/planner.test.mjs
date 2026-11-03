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

describe("the oven", () => {
  const at = (plan, text) => plan.steps.find((s) => s.text === text).at;

  test("a dish waits for the oven while another uses it at a different setting", () => {
    const recipes = {
      potatoes: recipe("Potatoes", [["Bake the potatoes", { hands: "2 min", wait: "40 min", oven: "200C" }], ["Scatter with parsley", { hands: "1 min" }]]),
      asparagus: recipe("Asparagus", [["Broil the asparagus", { hands: "1 min", wait: "3 min", watch: true, oven: "broil" }]], { sits: "5 min" }),
    };
    const plan = planLineup({ dishes: [{ slug: "potatoes" }, { slug: "asparagus" }] }, recipes);
    assert.ok(at(plan, "Broil the asparagus") >= at(plan, "Bake the potatoes") + 42,
      `broiled at ${at(plan, "Broil the asparagus")}, with the potatoes in the oven until ${at(plan, "Bake the potatoes") + 42}`);
  });

  test("dishes share the oven at the same setting, 200C and 400F included", () => {
    const recipes = {
      potatoes: recipe("Potatoes", [
        ["Heat the oven to 200C", { hands: "1 min", preheat: "200C" }],
        ["Bake the potatoes", { hands: "2 min", wait: "40 min", oven: "200C" }],
        ["Scatter with parsley", { hands: "1 min" }],
      ]),
      asparagus: recipe("Asparagus", [["Roast the asparagus", { hands: "1 min", wait: "9 min", oven: "400F" }]], { sits: "5 min" }),
    };
    const plan = planLineup({ dishes: [{ slug: "potatoes" }, { slug: "asparagus" }] }, recipes);
    assert.ok(at(plan, "Roast the asparagus") < at(plan, "Bake the potatoes") + 42, "the asparagus waited for the potatoes to come out");
    // Heating 15 min, baking 42, parsley 1: the asparagus fits inside the bake.
    assert.equal(plan.minutes, 59);
  });

  test("the oven heats in the background, and baking waits until it's hot", () => {
    const recipes = {
      potatoes: recipe("Potatoes", [
        ["Heat the oven to 200C", { hands: "1 min", preheat: "200C" }],
        ["Slice the potatoes", { hands: "10 min" }],
        ["Bake the potatoes", { hands: "2 min", wait: "40 min", oven: "200C" }],
      ]),
    };
    const plan = planLineup({ dishes: [{ slug: "potatoes" }] }, recipes);
    assert.equal(at(plan, "Slice the potatoes"), 1);
    assert.equal(at(plan, "Bake the potatoes"), 16);
    assert.equal(plan.minutes, 58);
  });

  const asparagus = recipe("Asparagus", [
    ["Lay out the asparagus", { hands: "4 min" }],
    ["Roast the asparagus", { hands: "1 min", wait: "9 min", oven: "400F" }],
  ], { sits: "5 min" });

  test("a heating step is added at the start of a dish whose recipe doesn't heat the oven", () => {
    const plan = planLineup({ dishes: [{ slug: "asparagus" }] }, { asparagus });
    assert.equal(plan.steps[0].text, "Heat the oven to 200°C / 400°F");
    assert.equal(plan.steps[0].added, true);
    assert.equal(at(plan, "Lay out the asparagus"), 1);
    assert.ok(at(plan, "Roast the asparagus") >= 16, `roasted at ${at(plan, "Roast the asparagus")}, before the oven was hot`);
  });

  test("no heating step is added when another dish has heated the oven to that setting", () => {
    const recipes = {
      asparagus,
      potatoes: recipe("Potatoes", [
        ["Heat the oven to 200C", { hands: "1 min", preheat: "200C" }],
        ["Bake the potatoes", { hands: "2 min", wait: "40 min", oven: "200C" }],
      ]),
    };
    const plan = planLineup({ dishes: [{ slug: "potatoes" }, { slug: "asparagus" }] }, recipes);
    assert.deepEqual(plan.steps.filter((s) => s.added).map((s) => s.text), []);
  });
});

// Jacob's steak dinner, with the planning data from the prototype.
const DINNER = {
  steak: recipe("Pan-Seared Ribeye", [
    ["Take the steak out of the fridge to sit", { hands: "0.5 min", wait: "30 min" }],
    ["Heat the oil in the skillet until it just smokes", { hands: "1 min", wait: "3 min", burner: true }],
    ["Pat the steak dry and season the top", { hands: "1 min", burner: true }],
    ["Sear without moving it", { hands: "0.5 min", wait: "4 min", watch: true, burner: true }],
    ["Turn it, add the butter and baste", { hands: "4 min", burner: true }],
    ["Rest the steak", { hands: "0.5 min", wait: "7.5 min" }],
  ], { serve: "hot", sits: "5 min" }),
  asparagus: recipe("Parmesan Asparagus", [
    ["Lay the asparagus on a sheet", { hands: "4 min" }],
    ["Lemon and butter over the top", { hands: "3 min" }],
    ["Roast until just fork-tender", { hands: "0.5 min", wait: "9 min", oven: "200C" }],
    ["Switch the oven to broil", { hands: "0.5 min", preheat: "broil" }],
    ["Scatter the parmesan and broil", { hands: "0.5 min", wait: "2.5 min", watch: true, oven: "broil" }],
  ], { serve: "hot", sits: "5 min" }),
  applesauce: recipe("Applesauce", [
    ["Peel, core and cut the apples", { hands: "8 min" }],
    ["Stir everything in the dish", { hands: "2 min" }],
    ["Microwave on high", { hands: "0.5 min", wait: "7.5 min", microwave: true }],
    ["Stir, then microwave again", { hands: "1 min", wait: "7.5 min", microwave: true }],
    ["Mash to the texture you want", { hands: "2 min" }],
  ], { serve: "keeps" }),
  potatoes: recipe("Hasselback Potatoes", [
    ["Heat the oven to 200C and line a tray", { hands: "1 min", preheat: "200C" }],
    ["Scrub and dry the potatoes", { hands: "3 min" }],
    ["Slice each potato thinly", { hands: "10 min" }],
    ["Set them on the tray", { hands: "1 min" }],
    ["Mix the garlic butter", { hands: "3 min" }],
    ["Brush the potatoes and bake", { hands: "3 min", wait: "40 min", oven: "200C" }],
    ["Baste and bake until crisp", { hands: "2 min", wait: "17.5 min", oven: "200C" }],
    ["Scatter with parsley", { hands: "1 min" }],
  ], { serve: "hot", sits: "10 min" }),
};
const dinner = { dishes: ["steak", "asparagus", "applesauce", "potatoes"].map((slug) => ({ slug })) };

describe("Jacob's steak dinner", () => {
  const plan = planLineup(dinner, DINNER);
  const at = (text) => plan.steps.find((s) => s.text === text).at;

  test("every hot dish is ready within its sitting time of serving, and nothing is late", () => {
    for (const [slug, limit] of [["steak", 5], ["asparagus", 5], ["potatoes", 10]]) {
      const ready = plan.ready[slug];
      assert.ok(ready <= plan.minutes, `${slug} ready at ${ready}, after serving at ${plan.minutes}`);
      assert.ok(plan.minutes - ready <= limit, `${slug} ready at ${ready}, sitting ${plan.minutes - ready} min before serving at ${plan.minutes}`);
    }
    assert.ok(plan.ready.applesauce <= plan.minutes);
  });

  test("it takes about an hour and a half", () => {
    assert.ok(plan.minutes >= 80 && plan.minutes <= 95, `takes ${plan.minutes} min`);
  });

  test("the asparagus is broiled only after the potatoes are out", () => {
    assert.ok(at("Scatter the parmesan and broil") >= at("Baste and bake until crisp") + 19.5);
  });
});
