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

  test("times are read as recipes write them, and a range plans from its middle", () => {
    const recipes = {
      curd: recipe("Curd", [
        ["Cook, whisking often", { hands: "About 6 min" }],
        ["Ice bath", { hands: "45 sec", wait: "7 to 8 min" }],
        ["Chill", { hands: "0 min", wait: "About 1 hr in the fridge" }],
        ["Set overnight", { hands: "0 min", wait: "1 1/2 to 2 1/2 hr" }],
      ]),
    };
    const plan = planLineup({ dishes: [{ slug: "curd" }] }, recipes);
    // 6 + 0.75 + 7.5 + 60 + 120
    assert.equal(plan.minutes, 194.25);
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

  test("a dish that's taken out in a step of its own holds the oven until that step", () => {
    const recipes = {
      potatoes: recipe("Potatoes", [
        ["Bake the potatoes", { hands: "2 min", wait: "40 min", oven: "200C" }],
        ["Take them out of the oven and scatter with parsley", { hands: "1 min", oven: false }],
      ], { serve: "hot", sits: "10 min" }),
      asparagus: recipe("Asparagus", [
        ["Switch the oven to broil", { hands: "0.5 min", preheat: "broil" }],
        ["Broil the asparagus", { hands: "1 min", wait: "3 min", watch: true, oven: "broil" }],
      ], { serve: "hot", sits: "5 min" }),
    };
    const plan = planLineup({ dishes: [{ slug: "potatoes" }, { slug: "asparagus" }] }, recipes);
    const out = at(plan, "Take them out of the oven and scatter with parsley");
    assert.ok(at(plan, "Switch the oven to broil") >= out + 1,
      `switched to broil at ${at(plan, "Switch the oven to broil")}, with the potatoes taken out at ${out}`);
    assert.ok(plan.minutes - plan.ready.potatoes <= 10, `the potatoes sat ${plan.minutes - plan.ready.potatoes} min`);
  });

  test("when no order gets every hot dish there in time, it serves as soon as it reasonably can", () => {
    const recipes = {
      roast: recipe("Roast", [["Roast it", { hands: "2 min", wait: "30 min", oven: "200C" }]], { serve: "hot", sits: "2 min" }),
      meringue: recipe("Meringue", [["Bake the meringue", { hands: "2 min", wait: "30 min", oven: "120C" }]], { serve: "hot", sits: "2 min" }),
    };
    const plan = planLineup({ dishes: [{ slug: "roast" }, { slug: "meringue" }] }, recipes);
    assert.ok(plan.minutes <= 90, `served at ${plan.minutes} min`);
  });

  test("when not every hot dish can be fresh, everything is still ready by serving, with no gap mid-cook", () => {
    const recipes = {
      steak: recipe("Steak", [["Sear and baste the steak", { hands: "20 min", burner: true }]], { serve: "hot", sits: "2 min" }),
      chicken: recipe("Chicken", [["Fry the chicken", { hands: "20 min", burner: true }]], { serve: "hot", sits: "2 min" }),
    };
    const plan = planLineup({ dishes: [{ slug: "steak" }, { slug: "chicken" }] }, recipes);
    for (const [slug, ready] of Object.entries(plan.ready)) assert.ok(ready <= plan.courses.Main, `${slug} ready at ${ready}, served at ${plan.courses.Main}`);
    assert.ok(plan.minutes <= 45, `served at ${plan.minutes} min`);
  });

  test("two dishes that both change the oven's setting don't share it, so neither waits on the other forever", () => {
    const recipes = {
      bars: recipe("Lime Bars", [
        ["Heat the oven to 350F", { hands: "1 min", preheat: "350F" }],
        ["Bake the crust", { hands: "2 min", wait: "25 min", oven: "350F" }],
        ["Lower the oven and bake the curd", { hands: "2 min", wait: "30 min", oven: "300F" }],
      ], { category: "baking" }),
      pavlova: recipe("Pavlova", [
        ["Heat the oven to 350F for the pavlova", { hands: "1 min", preheat: "350F" }],
        ["Bake the meringue at 200F", { hands: "1 min", wait: "90 min", oven: "200F" }],
        ["Cool it in the oven, off", { hands: "1 min", wait: "120 min", oven: "off" }],
      ], { category: "baking" }),
    };
    const plan = planLineup({ dishes: [{ slug: "bars" }, { slug: "pavlova" }] }, recipes);
    const all = [...(plan.aheadOfTime?.steps || []), ...plan.steps].filter((s) => !s.skipped);
    assert.equal(all.length, 6);
    // And an oven turned down or off has to heat up again.
    const when = (text) => all.find((s) => s.text === text).at;
    if (when("Bake the crust") > when("Cool it in the oven, off")) assert.ok(when("Bake the crust") >= when("Heat the oven to 350F") + 15, `the crust went in at ${when("Bake the crust")}, the oven heated from ${when("Heat the oven to 350F")}`);
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

  test("a heating step is added for a setting the recipe doesn't heat, even if it heats another", () => {
    const roastThenBroil = recipe("Asparagus", [
      ["Roast the asparagus", { hands: "1 min", wait: "9 min", oven: "200C" }],
      ["Switch the oven to broil", { hands: "0.5 min", preheat: "broil" }],
      ["Broil the asparagus", { hands: "0.5 min", wait: "2.5 min", watch: true, oven: "broil" }],
    ]);
    const plan = planLineup({ dishes: [{ slug: "asparagus" }] }, { asparagus: roastThenBroil });
    assert.equal(plan.steps[0].text, "Heat the oven to 200°C / 400°F");
  });

  test("a dish that needs the oven hotter partway through gets a heating step there too", () => {
    const roastThenBroil = recipe("Asparagus", [
      ["Roast the asparagus", { hands: "1 min", wait: "9 min", oven: "200C" }],
      ["Broil the asparagus", { hands: "0.5 min", wait: "2.5 min", watch: true, oven: "broil" }],
    ]);
    const plan = planLineup({ dishes: [{ slug: "asparagus" }] }, { asparagus: roastThenBroil });
    assert.deepEqual(texts(plan), ["Heat the oven to 200°C / 400°F", "Roast the asparagus", "Switch the oven to broil", "Broil the asparagus"]);
    assert.equal(plan.steps[2].added, true);
    // Hot at 16, roasted by 26, then a minute to switch and 3 for the broiler.
    assert.equal(at(plan, "Broil the asparagus"), 30);
    assert.equal(plan.minutes, 33);
  });

  test("turning the oven down or off needs no heating", () => {
    const meringue = recipe("Meringue", [
      ["Heat the oven to 350F", { hands: "0.5 min", preheat: "350F" }],
      ["Shape the meringue", { hands: "4 min" }],
      ["Bake it at 200F", { hands: "0.5 min", wait: "90 min", oven: "200F" }],
      ["Cool it in the oven, turned off", { hands: "0.5 min", wait: "60 min", oven: "off" }],
    ], { category: "baking" });
    const plan = planLineup({ dishes: [{ slug: "meringue" }] }, { meringue });
    assert.deepEqual(plan.steps.filter((s) => s.added).map((s) => s.text), []);
    assert.equal(at(plan, "Bake it at 200F"), 15.5);
    assert.equal(at(plan, "Cool it in the oven, turned off"), 106);
  });

  test("a recipe's own heating step is skipped when the oven is already at that setting", () => {
    const recipes = {
      potatoes: recipe("Potatoes", [["Heat the oven for the potatoes", { hands: "1 min", preheat: "200C" }], ["Bake the potatoes", { hands: "2 min", wait: "40 min", oven: "200C" }]]),
      asparagus: recipe("Asparagus", [["Heat the oven for the asparagus", { hands: "1 min", preheat: "400F" }], ["Roast the asparagus", { hands: "1 min", wait: "9 min", oven: "400F" }]], { sits: "5 min" }),
    };
    const plan = planLineup({ dishes: [{ slug: "potatoes" }, { slug: "asparagus" }] }, recipes);
    const second = plan.steps.find((s) => s.text === "Heat the oven for the asparagus");
    assert.equal(second.skipped, true);
    assert.equal(at(plan, "Bake the potatoes"), 16);
  });

  test("a dish using an oven another dish heated keeps it, so nobody turns it down first", () => {
    // Found by the oven law in planner-laws.test.mjs.
    const recipes = {
      peppers: recipe("Peppers", [["Roast the peppers", { hands: "0 min", wait: "1 min", oven: "200C" }]]),
      squash: recipe("Squash", [["Roast the squash", { hands: "0 min", wait: "1 min", oven: "350F" }]]),
      tomatoes: recipe("Tomatoes", [["Roast the tomatoes", { hands: "0 min", wait: "1 min", oven: "200C" }], ["Simmer the sauce", { hands: "0 min", wait: "10 min", burner: true }]]),
    };
    const plan = planLineup({ dishes: [{ slug: "peppers" }, { slug: "squash" }, { slug: "tomatoes" }], prepFirst: false }, recipes);
    assert.ok(at(plan, "Roast the peppers") < at(plan, "Heat the oven to 180°C / 350°F"),
      `the peppers roast at 200C at ${at(plan, "Roast the peppers")}, after the oven was turned down to 350F at ${at(plan, "Heat the oven to 180°C / 350°F")}`);
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

describe("courses", () => {
  const at = (plan, text) => plan.steps.find((s) => s.text === text)?.at;
  const recipes = {
    steak: recipe("Steak", [["Cook the steak", { hands: "10 min" }]], { serve: "hot", sits: "5 min" }),
    cream: recipe("Cream", [["Whip the cream", { hands: "5 min" }]], { category: "baking", serve: "soon", sits: "15 min" }),
    curd: recipe("Curd", [["Make the curd", { hands: "20 min" }]], { category: "baking", serve: "keeps" }),
  };
  const lineup = { dishes: [{ slug: "steak", course: "Main" }, { slug: "cream", course: "Dessert" }, { slug: "curd", course: "Dessert" }] };

  test("dessert is served 45 minutes after the main", () => {
    const plan = planLineup(lineup, recipes);
    assert.deepEqual(plan.courses, { Main: plan.minutes, Dessert: plan.minutes + 45 });
    const creamReady = at(plan, "Whip the cream") + 5;
    assert.ok(creamReady <= plan.courses.Dessert && plan.courses.Dessert - creamReady <= 15, `the cream was ready at ${creamReady}, dessert at ${plan.courses.Dessert}`);
  });

  test("between the courses, only a dessert's finishing touches are hands-on", () => {
    const plan = planLineup(lineup, recipes);
    assert.ok(at(plan, "Make the curd") + 20 <= plan.minutes, `the curd was still being made at ${at(plan, "Make the curd") + 20}, after the main was served at ${plan.minutes}`);
  });
});

describe("a dish that keeps part-way", () => {
  const at = (plan, text) => plan.steps.find((s) => s.text === text)?.at;
  const recipes = {
    potatoes: recipe("Potatoes", [
      ["Heat the oven to 200C", { hands: "1 min", preheat: "200C" }],
      ["Brush the potatoes and bake", { hands: "3 min", wait: "40 min", oven: "200C" }],
      ["Baste and bake until crisp", { hands: "2 min", wait: "17.5 min", oven: "200C" }],
    ], { serve: "hot", sits: "10 min" }),
    pavlova: recipe("Pavlova", [
      ["Heat the oven to 200F", { hands: "0.5 min", preheat: "200F" }],
      ["Whip and shape the meringue", { hands: "15 min" }],
      ["Bake the meringue", { hands: "0.5 min", wait: "90 min", oven: "200F" }],
      ["Cool it in the oven with the door shut", { hands: "0.5 min", wait: "120 min", oven: "off", holds: true }],
      ["Pile on the cream and fruit", { hands: "4 min" }],
    ], { category: "baking", serve: "soon", sits: "15 min" }),
  };

  test("prep for the part after it keeps is done on the day, not ahead", () => {
    const pavlova = recipe("Pavlova", [
      ["Whip and shape the meringue", { hands: "15 min" }],
      ["Bake the meringue", { hands: "0.5 min", wait: "90 min", oven: "200F" }],
      ["Cool it in the oven with the door shut", { hands: "0.5 min", wait: "120 min", oven: "off", holds: true }],
      ["Rinse the fruit", { hands: "5 min", prep: true, prepOnly: true }],
      ["Pile on the cream and fruit", { hands: "4 min" }],
    ], { category: "baking", serve: "soon", sits: "15 min" });
    const plan = planLineup({ dishes: [{ slug: "potatoes" }, { slug: "pavlova" }] }, { ...recipes, pavlova });
    assert.ok(plan.aheadOfTime, "the meringue is made ahead");
    assert.ok(!plan.aheadOfTime.steps.some((s) => s.text === "Rinse the fruit"), "the fruit was rinsed the day before");
    assert.ok(plan.steps.some((s) => s.text === "Rinse the fruit"));
  });

  test("once a cooled meringue keeps, only putting it together is tied to dessert", () => {
    // All on the same day, rather than the meringue made ahead.
    const plan = planLineup({ dishes: [{ slug: "potatoes" }, { slug: "pavlova" }], ahead: { pavlova: false } }, recipes);
    assert.ok(plan.minutes < 6 * 60, `planned to serve after ${plan.minutes} min`);
    const assembled = at(plan, "Pile on the cream and fruit") + 4;
    assert.ok(assembled <= plan.courses.Dessert && plan.courses.Dessert - assembled <= 15, `put together at ${assembled}, dessert at ${plan.courses.Dessert}`);
    assert.ok(at(plan, "Brush the potatoes and bake") >= at(plan, "Cool it in the oven with the door shut") + 120.5, "the potatoes went in while the meringue was cooling");
  });

  describe("making it ahead", () => {
    const meringue = ["Heat the oven to 200F", "Whip and shape the meringue", "Bake the meringue", "Cool it in the oven with the door shut"];

    test("is asked about when it would make the day more than 30 minutes shorter, and starts as ahead", () => {
      const plan = planLineup({ dishes: [{ slug: "potatoes" }, { slug: "pavlova" }] }, recipes);
      const q = plan.makeAhead.find((x) => x.slug === "pavlova");
      assert.ok(q, "no make-ahead question for the pavlova");
      assert.ok(q.saves > 30, `saves only ${q.saves} min`);
      assert.equal(q.ahead, true);
    });

    test("made ahead, the meringue is its own plan and the day starts after it", () => {
      const plan = planLineup({ dishes: [{ slug: "potatoes" }, { slug: "pavlova" }] }, recipes);
      assert.deepEqual(plan.aheadOfTime.steps.map((s) => s.text), meringue);
      assert.ok(texts(plan).every((t) => !meringue.includes(t)), "the meringue is still in the day's plan");
      assert.ok(texts(plan).includes("Pile on the cream and fruit"));
      assert.ok(plan.minutes < 90, `the day takes ${plan.minutes} min`);
    });

    test("all today, everything stays in one plan", () => {
      const plan = planLineup({ dishes: [{ slug: "potatoes" }, { slug: "pavlova" }], ahead: { pavlova: false } }, recipes);
      assert.equal(plan.aheadOfTime, null);
      assert.ok(meringue.every((t) => texts(plan).includes(t)));
      assert.equal(plan.makeAhead.find((x) => x.slug === "pavlova").ahead, false);
    });

    test("isn't asked about for a dish that keeps and is the whole lineup", () => {
      const cookies = recipe("Cookies", [["Mix and bake", { hands: "10 min", wait: "60 min" }]], { category: "baking" });
      const plan = planLineup({ dishes: [{ slug: "cookies" }] }, { cookies });
      assert.deepEqual(plan.makeAhead, []);
      assert.deepEqual(texts(plan), ["Mix and bake"]);
    });

    test("once the choice is settled (while cooking), the plan is the same without asking again", () => {
      const lineup = { dishes: [{ slug: "potatoes" }, { slug: "pavlova" }] };
      const asked = planLineup(lineup, recipes);
      const settled = planLineup(lineup, recipes, {}, { madeAhead: ["pavlova"] });
      assert.deepEqual(settled.steps, asked.steps);
      assert.deepEqual(settled.aheadOfTime, asked.aheadOfTime);
      assert.deepEqual(settled.makeAhead, [{ slug: "pavlova", ahead: true }]);
      const today = planLineup(lineup, recipes, {}, { madeAhead: [] });
      assert.equal(today.aheadOfTime, null);
      assert.deepEqual(today.steps, planLineup({ ...lineup, ahead: { pavlova: false } }, recipes).steps);
    });

    test("cooking the part made ahead, it's re-planned from what's done and when, like the day", () => {
      const lineup = { dishes: [{ slug: "potatoes" }, { slug: "pavlova" }] };
      const options = { madeAhead: ["pavlova"], part: "ahead" };
      const first = planLineup(lineup, recipes, {}, options);
      assert.deepEqual(first.steps.map((s) => s.text), meringue);
      assert.deepEqual(first.steps, planLineup(lineup, recipes).aheadOfTime.steps);
      assert.equal(first.upNow.text, "Heat the oven to 200F");
      // The oven on at 1 minute, but shaping the meringue ran long, to 40.
      const done = [{ slug: "pavlova", step: 0, at: 1 }, { slug: "pavlova", step: 1, at: 40 }];
      const late = planLineup(lineup, recipes, { now: 40, done }, options);
      assert.ok(late.steps[1].done);
      assert.equal(late.upNow.text, "Bake the meringue");
      assert.equal(late.upNow.at, 40);
      assert.equal(late.wait, 0);
      assert.ok(late.minutes > first.minutes + 20, `still done after ${late.minutes} min (first ${first.minutes})`);
      // In the oven at 40.5, and given 5 more minutes when its timer rang.
      const longer = planLineup(lineup, recipes, { now: 130.5, done: [...done, { slug: "pavlova", step: 2, at: 40.5, waitUntil: 135.5 }] }, options);
      assert.equal(longer.upNow.text, "Cool it in the oven with the door shut");
      assert.equal(longer.upNow.at, 135.5);
      assert.equal(longer.wait, 5);
    });

    test("isn't asked about when it wouldn't save much", () => {
      assert.deepEqual(planLineup(dinner, DINNER).makeAhead, []);
    });
  });
});

describe("prep", () => {
  test("a dish's prep comes before its first step that isn't prep, and just-before prep stays put", () => {
    const recipes = {
      steak: recipe("Steak", [
        ["Heat the skillet", { hands: "1 min", wait: "3 min", burner: true }],
        ["Season the steak", { hands: "1 min", prep: "just before" }],
        ["Sear it", { hands: "8 min", burner: true }],
        ["Chop the herbs", { hands: "3 min", prep: true }],
        ["Scatter the herbs over", { hands: "1 min" }],
      ]),
    };
    const plan = planLineup({ dishes: [{ slug: "steak" }] }, recipes);
    assert.deepEqual(texts(plan), ["Chop the herbs", "Heat the skillet", "Season the steak", "Sear it", "Scatter the herbs over"]);
  });

  const at = (plan, text) => plan.steps.find((s) => s.text === text).at;
  const recipes = {
    potatoes: recipe("Potatoes", [["Slice the potatoes", { hands: "3 min", prep: true }], ["Boil the potatoes", { hands: "1 min", wait: "20 min", burner: true }]]),
    applesauce: recipe("Applesauce", [["Cut the apples", { hands: "8 min", prep: true }], ["Microwave the apples", { hands: "1 min", wait: "15 min", microwave: true }]], { serve: "keeps" }),
  };
  const dishes = [{ slug: "potatoes" }, { slug: "applesauce" }];

  test("by default all the meal's prep is done before anything else starts", () => {
    const plan = planLineup({ dishes }, recipes);
    assert.ok(at(plan, "Boil the potatoes") >= at(plan, "Cut the apples") + 8, `the potatoes went on at ${at(plan, "Boil the potatoes")}, before the apples were cut`);
  });

  test("a hot dish's prep is done with the rest of the prep, not held back with its cooking", () => {
    const plan = planLineup({ dishes: [{ slug: "potatoes" }, { slug: "steak" }] }, {
      potatoes: recipe("Potatoes", [["Slice the potatoes", { hands: "3 min", prep: true }], ["Bake the potatoes", { hands: "2 min", wait: "60 min" }]]),
      steak: recipe("Steak", [["Trim the steak", { hands: "2 min", prep: true }], ["Cook the steak", { hands: "10 min" }]], { serve: "hot", sits: "5 min" }),
    });
    assert.ok(at(plan, "Trim the steak") < at(plan, "Bake the potatoes"), `the steak was trimmed at ${at(plan, "Trim the steak")}`);
    // 5 minutes of prep, then 62 of baking.
    assert.equal(plan.minutes, 67);
  });

  test("a dish whose oven the planner heats still has its prep done with the rest", () => {
    // The added heating step goes after the asparagus' prep, so the prep isn't
    // held back with the roasting while the steak waits for it.
    const plan = planLineup({ dishes: [{ slug: "steak" }, { slug: "asparagus" }] }, {
      steak: recipe("Steak", [
        ["Take the steak out to sit", { hands: "30 sec", wait: "30 min", prep: "just before" }],
        ["Cook the steak", { hands: "10 min", burner: true }],
      ], { serve: "hot", sits: "5 min" }),
      asparagus: recipe("Asparagus", [
        ["Trim the asparagus", { hands: "5 min", prep: true }],
        ["Roast the asparagus", { hands: "1 min", wait: "9 min", oven: "400F" }],
      ], { serve: "hot", sits: "5 min" }),
    });
    assert.ok(at(plan, "Trim the asparagus") < at(plan, "Heat the oven to 200°C / 400°F"), "the oven was heated before the asparagus was trimmed");
    // 5 minutes of prep, then the steak's 30 minutes out of the fridge and 10 in the pan.
    assert.ok(plan.minutes <= 46, `planned ${plan.minutes} minutes`);
  });

  test("a recipe that a prep step uses is made during the prep", () => {
    // The garlic butter is prep, and it needs the garlic paste, whose last step
    // isn't prep: the paste is made during the prep, not after it.
    const plan = planLineup({ dishes: [{ slug: "potatoes" }] }, {
      potatoes: recipe("Potatoes", [
        ["Mix the garlic butter", { hands: "3 min", prep: true, uses: ["Garlic paste"] }],
        ["Brush and bake", { hands: "3 min", wait: "40 min" }],
      ], { ingredients: [{ item: "Garlic paste", recipe: "garlic-paste" }] }),
      "garlic-paste": recipe("Garlic Paste", [["Chop the garlic", { hands: "4 min", prep: true }], ["Jar the paste", { hands: "1 min" }]], { kind: "component" }),
    });
    assert.deepEqual(texts(plan), ["Chop the garlic", "Jar the paste", "Mix the garlic butter", "Brush and bake"]);
    assert.equal(plan.minutes, 51);
  });

  test("planned fastest, prep fills the waits instead", () => {
    const plan = planLineup({ dishes, prepFirst: false }, recipes);
    assert.ok(at(plan, "Cut the apples") > at(plan, "Boil the potatoes"), "the apples were cut before the potatoes went on");
    assert.ok(plan.minutes < planLineup({ dishes }, recipes).minutes, "fastest wasn't faster");
  });
});

describe("re-planning as you cook", () => {
  const recipes = {
    potatoes: recipe("Potatoes", [["Slice the potatoes", { hands: "10 min", prep: true }], ["Bake the potatoes", { hands: "2 min", wait: "40 min" }], ["Scatter with parsley", { hands: "1 min" }]]),
    applesauce: recipe("Applesauce", [["Cut the apples", { hands: "8 min" }], ["Mash them", { hands: "2 min" }]], { serve: "keeps" }),
  };
  const lineup = { dishes: [{ slug: "potatoes" }, { slug: "applesauce" }], prepFirst: false };

  test("each step says which recipe step it is", () => {
    const plan = planLineup(lineup, recipes);
    assert.deepEqual(plan.steps.map((s) => [s.slug, s.step]), [["potatoes", 0], ["potatoes", 1], ["applesauce", 0], ["applesauce", 1], ["potatoes", 2]]);
  });

  test("a step that ran long moves the meal later, and the rest is planned from now", () => {
    const before = planLineup(lineup, recipes);
    // Slicing was planned to be done at 10, but was done at 20.
    const plan = planLineup(lineup, recipes, { now: 20, done: [{ slug: "potatoes", step: 0, at: 20 }] });
    assert.equal(plan.steps[0].text, "Slice the potatoes");
    assert.equal(plan.steps[0].done, true);
    assert.ok(plan.steps.slice(1).every((s) => !s.done && s.at >= 20), "a step was planned before now");
    assert.equal(plan.minutes, before.minutes + 10);
  });

  test("the step to do now, and how long to wait first when nothing needs you yet", () => {
    const fresh = planLineup(lineup, recipes);
    assert.equal(fresh.upNow.text, "Slice the potatoes");
    assert.equal(fresh.wait, 0);
    // Everything else done, the potatoes in the oven until 52.
    const plan = planLineup(lineup, recipes, { now: 22, done: [{ slug: "potatoes", step: 0, at: 10 }, { slug: "potatoes", step: 1, at: 12 }, { slug: "applesauce", step: 0, at: 20 }, { slug: "applesauce", step: 1, at: 22 }] });
    assert.equal(plan.upNow.text, "Scatter with parsley");
    assert.equal(plan.wait, 30);
    const finished = planLineup(lineup, recipes, { now: 53, done: [...[0, 1, 2].map((step) => ({ slug: "potatoes", step, at: [10, 12, 53][step] })), { slug: "applesauce", step: 0, at: 20 }, { slug: "applesauce", step: 1, at: 22 }] });
    assert.equal(finished.upNow, null);
  });

  const bakeDone = { slug: "potatoes", step: 1, at: 12 };   // into the oven at 12, out at 52
  const next = (plan) => plan.steps.find((s) => !s.done);

  test("a timer given 2 more minutes moves its dish's next step later", () => {
    const plan = planLineup(lineup, recipes, { now: 52, done: [{ slug: "potatoes", step: 0, at: 10 }, { ...bakeDone, waitUntil: 54 }, { slug: "applesauce", step: 0, at: 20 }, { slug: "applesauce", step: 1, at: 22 }] });
    assert.equal(next(plan).text, "Scatter with parsley");
    assert.equal(next(plan).at, 54);
  });

  test("a timer stopped early makes its dish's next step the one to do now", () => {
    const plan = planLineup(lineup, recipes, { now: 30, done: [{ slug: "potatoes", step: 0, at: 10 }, { ...bakeDone, waitUntil: 30 }, { slug: "applesauce", step: 0, at: 20 }, { slug: "applesauce", step: 1, at: 22 }] });
    assert.equal(next(plan).text, "Scatter with parsley");
    assert.equal(next(plan).at, 30);
  });
});

describe("a timer ringing in the middle of a step", () => {
  test("keeps you on your step, and makes its follow-up the next one", () => {
    const recipes = {
      potatoes: recipe("Potatoes", [["Bake the potatoes", { hands: "2 min", wait: "40 min" }], ["Baste the potatoes", { hands: "2 min", wait: "15 min" }]]),
      steak: recipe("Steak", [["Sear without moving it", { hands: "1 min", wait: "4 min", watch: true }], ["Rest the steak", { wait: "10 min" }]], { serve: "hot", sits: "5 min" }),
      asparagus: recipe("Asparagus", [["Trim the asparagus", { hands: "3 min" }], ["Plate it", { hands: "1 min" }]]),
    };
    // The potatoes went in at 0 and ring at 42, while the steak is searing (since 41).
    const plan = planLineup({ dishes: [{ slug: "potatoes" }, { slug: "steak" }, { slug: "asparagus" }] }, recipes,
      { now: 42, done: [{ slug: "potatoes", step: 0, at: 2 }], current: { slug: "steak", step: 0, at: 41 } });
    const ahead = plan.steps.filter((s) => !s.done).map((s) => s.text);
    assert.deepEqual(ahead.slice(0, 2), ["Sear without moving it", "Baste the potatoes"]);
    assert.equal(plan.steps.find((s) => s.text === "Sear without moving it").at, 41);
  });
});

describe("recipes without planning data", () => {
  const at = (plan, text) => plan.steps.find((s) => s.text === text).at;
  const potatoes = recipe("Potatoes", [["Bake the potatoes", { hands: "2 min", wait: "60 min" }]], { serve: "hot", sits: "10 min" });
  const withPotatoes = (slug, r) => planLineup({ dishes: [{ slug: "potatoes" }, { slug, course: "Main" }] }, { potatoes, [slug]: r });

  test("components and baking keep, so they fill the gaps", () => {
    const paste = recipe("Garlic Paste", [["Make the garlic paste", { hands: "10 min" }]], { kind: "component" });
    const cookies = recipe("Cookies", [["Bake the cookies", { hands: "10 min" }]], { category: "baking" });
    assert.equal(at(withPotatoes("garlic-paste", paste), "Make the garlic paste"), 2);
    assert.equal(at(withPotatoes("cookies", cookies), "Bake the cookies"), 2);
  });

  test("without hands-on times, the recipe's active time is spread over its steps", () => {
    const r = recipe("Curd", [["Zest and juice"], ["Cook, whisking"], ["Chill", { wait: "10 min" }]], { times: [["Active", "12 min"], ["Total", "About 2 hr"]] });
    assert.equal(planLineup({ dishes: [{ slug: "curd" }] }, { curd: r }).minutes, 22);
  });

  test("or its prep time, and failing that each step counts as 2 minutes", () => {
    const steps = [["Mix"], ["Shape"], ["Bake", { wait: "20 min" }]];
    assert.equal(planLineup({ dishes: [{ slug: "a" }] }, { a: recipe("A", steps, { time: { prep: 15, cook: 20 } }) }).minutes, 35);
    assert.equal(planLineup({ dishes: [{ slug: "b" }] }, { b: recipe("B", steps) }).minutes, 26);
  });

  test("a cocktail is mixed within 5 minutes of serving", () => {
    const plan = withPotatoes("painkiller", recipe("Painkiller", [["Shake and pour", { hands: "2 min" }]], { category: "cocktails" }));
    assert.ok(at(plan, "Shake and pour") + 2 >= plan.minutes - 5, `mixed by ${at(plan, "Shake and pour") + 2}, served at ${plan.minutes}`);
  });
});

describe("what the plan doesn't know", () => {
  const potatoes = recipe("Potatoes", [["Bake the potatoes", { hands: "2 min", wait: "60 min" }]], { serve: "hot", sits: "10 min" });

  test("a step that waits with no time is reported, so the page can ask how long", () => {
    const loaf = recipe("Loaf", [
      ["Knead the dough", { hands: "10 min" }],
      ["Cover and let it rise until doubled", { hands: "1 min" }],
      ["Bake until deeply browned", { hands: "1 min", wait: "40 min" }],
      ["Let it cool completely on a rack", { hands: "1 min" }],
    ], { category: "baking" });
    const plan = planLineup({ dishes: [{ slug: "loaf" }] }, { loaf });
    assert.deepEqual(plan.unknown.map((u) => [u.kind, u.slug, u.step]), [["wait", "loaf", 1], ["wait", "loaf", 3]]);
    assert.equal(plan.unknown[0].text, "Cover and let it rise until doubled");
  });

  test("not a step that's done while something else waits", () => {
    const pie = recipe("Pie", [
      ["Chill the dough", { hands: "1 min", wait: "1 hr" }],
      ["While the dough chills, make the filling", { hands: "10 min" }],
    ], { category: "baking" });
    assert.deepEqual(planLineup({ dishes: [{ slug: "pie" }] }, { pie }).unknown, []);
  });

  test("a step in the oven with no time is reported, and so is a rise worded another way", () => {
    const r = recipe("Pavlova", [
      ["Put it in the oven and turn the heat down to 200F.", { hands: "1 min", oven: "200F" }],
      ["Stir the garlic over medium heat until fragrant.", { hands: "1 min", burner: true }],
      ["Set aside in a warm spot until it's expanded.", { hands: "1 min" }],
      ["Cover with plastic. Leave in a warm spot; how long it takes depends on the room.", { hands: "1 min" }],
      ["Lay the steak in the hot pan.", { hands: "1 min", burner: true }],
    ], { category: "baking" });
    assert.deepEqual(planLineup({ dishes: [{ slug: "a" }] }, { a: r }).unknown.map((u) => u.step), [0, 2, 3]);
  });

  test("words that only look like waits aren't reported", () => {
    const steps = [
      "Whisk the flour, baking soda and baking powder.", "Line a rimmed baking sheet with parchment.",
      "Slice the cucumbers on a steep bias.", "Don't let them soak: they drink butter fast.",
      "Use right away, or cover tightly and refrigerate up to 24 hours.", "Refrigerate until serving.",
      "Lower the oven and let the crust cool while you make the curd.", "Chill the coupe and squeeze the lemon.",
      "During the second rise, heat the oven to 350F.",
    ].map((t) => [t, { hands: "1 min" }]);
    steps.push(["Soften the butter and let it cool", { hands: "1 min", prep: true }]);
    steps.push(["Poke holes in the warm crust. Leave the oven on.", { hands: "1 min", oven: "350F" }]);
    assert.deepEqual(planLineup({ dishes: [{ slug: "a" }] }, { a: recipe("A", steps, { category: "baking" }) }).unknown, []);
  });

  test("a time in the step's text, but not in its wait, is reported with that time to suggest", () => {
    const pie = recipe("Pie", [["Bake for 45 minutes, until golden", { hands: "1 min" }]], { category: "baking" });
    assert.deepEqual(planLineup({ dishes: [{ slug: "pie" }] }, { pie }).unknown,
      [{ kind: "wait", slug: "pie", step: 0, text: "Bake for 45 minutes, until golden", suggest: "45 minutes" }]);
  });

  test("a step whose wait is one thing (cooling) that also bakes with no time is reported, with the sentence that bakes", () => {
    const text = "Bake until deep golden. Then let them cool on a rack, at least 15 minutes.";
    const buns = recipe("Buns", [[text, { hands: "1 min", wait: "At least 15 min", oven: "350F" }]], { category: "baking" });
    assert.deepEqual(planLineup({ dishes: [{ slug: "buns" }] }, { buns }).unknown,
      [{ kind: "wait", slug: "buns", step: 0, text, sentence: "Bake until deep golden." }]);
  });

  test("a second sentence that waits, with a time the step's wait doesn't count, is reported with that time to suggest", () => {
    const text = "Bake 25 minutes. Let them cool 15 minutes.";
    const buns = recipe("Buns", [[text, { hands: "1 min", wait: "15 min", oven: "350F" }]], { category: "baking" });
    assert.deepEqual(planLineup({ dishes: [{ slug: "buns" }] }, { buns }).unknown,
      [{ kind: "wait", slug: "buns", step: 0, text, sentence: "Bake 25 minutes.", suggest: "25 minutes" }]);
  });

  test("a step that waits isn't reported when its other sentences only look like waits, or say the same wait again", () => {
    const steps = [
      ["Brush half the mixture over the potatoes, and keep the rest for basting. Bake 40 minutes.", { hands: "1 min", wait: "40 min", oven: "400F" }],
      ["Turn the oven off and let the pavlova cool completely inside it. The slow cool keeps cracking down.", { hands: "1 min", wait: "About 2 hr" }],
      ["Press plastic wrap onto the surface. Chill until set. For tarts, pour into them first and chill there.", { hands: "1 min", wait: "4 hr" }],
    ];
    assert.deepEqual(planLineup({ dishes: [{ slug: "a" }] }, { a: recipe("A", steps, { category: "baking" }) }).unknown, []);
  });

  test("a step saved as not waiting (`wait: false`) isn't reported, and takes only its hands-on time", () => {
    const loaf = recipe("Loaf", [
      ["Knead the dough", { hands: "10 min" }],
      ["Turn it out and let it rest on the floured counter", { hands: "1 min", wait: false }],
    ], { category: "baking" });
    const plan = planLineup({ dishes: [{ slug: "loaf" }] }, { loaf });
    assert.deepEqual(plan.unknown, []);
    assert.equal(plan.minutes, 11);
  });

  test("a dish with no serving time is reported, with what the plan assumed", () => {
    const stew = recipe("Stew", [["Simmer the stew", { hands: "2 min", wait: "60 min", burner: true }]]);
    const plan = planLineup({ dishes: [{ slug: "potatoes" }, { slug: "stew" }] }, { potatoes, stew });
    assert.deepEqual(plan.unknown, [{ kind: "serve", slug: "stew", assumed: "hot, sitting up to 10 min" }]);
  });

  test("a component, baking or a cocktail with no serving time isn't reported: those defaults are safe", () => {
    const paste = recipe("Garlic Paste", [["Make the garlic paste", { hands: "10 min" }]], { kind: "component" });
    assert.deepEqual(planLineup({ dishes: [{ slug: "potatoes" }, { slug: "paste" }] }, { potatoes, paste }).unknown, []);
  });

  test("dishes made ahead are included", () => {
    const meringue = recipe("Meringue", [
      ["Whip and shape", { hands: "15 min" }],
      ["Bake", { hands: "1 min", wait: "90 min" }],
      ["Let it cool in the oven", { hands: "1 min", holds: true }],
      ["Top and serve", { hands: "4 min" }],
    ], { category: "baking", serve: "soon", sits: "15 min" });
    const plan = planLineup({ dishes: [{ slug: "potatoes" }, { slug: "meringue" }] }, { potatoes, meringue });
    assert.ok(plan.aheadOfTime, "the meringue is made ahead");
    assert.deepEqual(plan.unknown.map((u) => u.text), ["Let it cool in the oven"]);
  });
});

describe("what the page gets", () => {
  const recipes = {
    potatoes: recipe("Potatoes", [
      ["Slice the potatoes", { hands: "10 min" }],
      ["Bake the potatoes", { hands: "2 min", wait: "35 to 45 min" }],
      ["Scatter with parsley", { hands: "1 min" }],
    ], { serve: "hot", sits: "10 min" }),
    steak: recipe("Steak", [
      ["Sear the steak", { hands: "1 min", wait: "4 min", watch: true, burner: true }],
      ["Rest the steak", { hands: "0.5 min", wait: "5 min" }],
    ], { serve: "hot", sits: "5 min" }),
  };
  const plan = planLineup({ dishes: [{ slug: "potatoes" }, { slug: "steak" }] }, recipes);
  const step = (text) => plan.steps.find((s) => s.text === text);

  test("each step's hands-on time, wait, and whether it needs you there", () => {
    assert.deepEqual([step("Bake the potatoes").hands, step("Bake the potatoes").wait, step("Bake the potatoes").watch], [2, 40, false]);
    assert.equal(step("Sear the steak").watch, true);
  });

  test("a step with a wait has a timer: when it starts and ends, at the short end of the range too, and what comes next", () => {
    const bake = step("Bake the potatoes");
    assert.deepEqual(bake.timer, { from: bake.at + 2, short: bake.at + 2 + 35, ends: bake.at + 2 + 40 });
    assert.equal(plan.steps[bake.followUp].text, "Scatter with parsley");
    assert.equal(step("Slice the potatoes").timer, undefined);
  });

  test("how long nothing needs you before each step", () => {
    const parsley = step("Scatter with parsley");
    const free = Math.max(...plan.steps.filter((s) => s.at < parsley.at).map((s) => s.at + s.hands + (s.watch ? s.wait : 0)));
    assert.equal(parsley.idle, Math.max(0, parsley.at - free));
    assert.equal(plan.steps[0].idle, 0);
  });

  test("what's served when, and how long each dish waits for it", () => {
    assert.deepEqual(plan.serving.map((c) => [c.course, c.at, c.dishes.sort()]), [["Main", plan.courses.Main, ["potatoes", "steak"]]]);
    const steak = plan.serving[0].sitting.steak;
    assert.equal(steak.limit, 5);
    assert.equal(steak.waits, plan.courses.Main - plan.ready.steak);
    assert.equal(steak.over, Math.max(0, steak.waits - 5));
  });
});

describe("nested recipes", () => {
  const at = (plan, text) => plan.steps.find((s) => s.text === text)?.at;
  const recipes = {
    potatoes: recipe("Potatoes", [
      ["Scrub the potatoes", { hands: "3 min" }],
      ["Mix the garlic butter", { hands: "3 min", uses: ["Garlic paste"] }],
      ["Brush and bake", { hands: "3 min", wait: "40 min" }],
    ], { ingredients: [{ item: "Potatoes" }, { item: "Garlic paste", recipe: "garlic-paste" }] }),
    "garlic-paste": recipe("Garlic Paste", [["Chop the garlic", { hands: "4 min" }], ["Muddle to a paste", { hands: "5 min" }]], { kind: "component" }),
  };

  test("a required ingredient with its own recipe is made before the step that uses it", () => {
    const plan = planLineup({ dishes: [{ slug: "potatoes" }] }, recipes);
    assert.ok(at(plan, "Muddle to a paste") + 5 <= at(plan, "Mix the garlic butter"),
      `the paste was done at ${at(plan, "Muddle to a paste") + 5}, the butter mixed at ${at(plan, "Mix the garlic butter")}`);
    assert.equal(plan.minutes, 58);
  });

  test("one that's also in the lineup is made once, before the step that uses it", () => {
    for (const order of [["potatoes", "garlic-paste"], ["garlic-paste", "potatoes"]]) {
      const plan = planLineup({ dishes: order.map((slug) => ({ slug })) }, recipes);
      assert.equal(plan.steps.filter((s) => s.text === "Chop the garlic").length, 1, `made twice, listed as ${order.join(", ")}`);
      assert.ok(at(plan, "Muddle to a paste") + 5 <= at(plan, "Mix the garlic butter"));
    }
  });

  test("one that's also in the lineup can be made ahead, and then isn't made on the day", () => {
    const soup = {
      soup: recipe("Soup", [["Simmer the broth", { hands: "2 min", wait: "20 min", burner: true }], ["Add the pasta and cook", { hands: "1 min", wait: "8 min", burner: true, uses: ["Pasta"] }]],
        { serve: "hot", ingredients: [{ item: "Pasta", recipe: "pasta" }] }),
      pasta: recipe("Pasta", [["Knead the dough", { hands: "10 min" }], ["Cut and dry the beads", { hands: "20 min", wait: "8 hr" }]], { kind: "component", serve: "keeps" }),
    };
    const plan = planLineup({ dishes: [{ slug: "soup" }, { slug: "pasta" }] }, soup);
    assert.deepEqual(plan.makeAhead.map((m) => m.slug), ["pasta"]);
    assert.equal(plan.steps.filter((s) => s.slug === "pasta").length, 0, "the pasta was made on the day too");
    assert.ok(plan.minutes < 60, `the day takes ${plan.minutes} min`);
  });

  test("one marked already made isn't made, and its dish uses it as usual", () => {
    const plan = planLineup({ dishes: [{ slug: "potatoes", made: ["garlic-paste"] }] }, recipes);
    assert.equal(at(plan, "Chop the garlic"), undefined);
    assert.deepEqual(texts(plan), ["Scrub the potatoes", "Mix the garlic butter", "Brush and bake"]);
    assert.equal(plan.minutes, 49);
  });
});

describe("connected recipes", () => {
  const at = (plan, text) => plan.steps.find((s) => s.text === text)?.at;
  const recipes = {
    pavlova: recipe("Pavlova", [
      ["Bake the meringue", { hands: "5 min", wait: "90 min" }],
      ["Pile on the cream and curd", { hands: "4 min", uses: ["Lemon curd"] }],
    ], { category: "baking", serve: "soon", sits: "15 min", ingredients: [{ item: "Egg whites" }, { item: "Lemon curd", recipe: "lemon-curd", optional: true }] }),
    "lemon-curd": recipe("Lemon Curd", [["Cook the curd", { hands: "12 min" }], ["Chill it", { hands: "1 min", wait: "90 min" }]], { category: "baking", kind: "component", serve: "keeps" }),
  };

  test("an optional ingredient's recipe isn't added by itself", () => {
    const plan = planLineup({ dishes: [{ slug: "pavlova" }] }, recipes);
    assert.deepEqual(texts(plan), ["Bake the meringue", "Pile on the cream and curd"]);
  });

  test("when it's in the lineup too, it's ready before the step that uses it", () => {
    // The curd takes longer than the meringue, so left to itself it would be
    // finished at serving, after the pavlova had been put together.
    const plan = planLineup({ dishes: [{ slug: "pavlova" }, { slug: "lemon-curd" }] }, recipes);
    assert.ok(at(plan, "Chill it") + 91 <= at(plan, "Pile on the cream and curd"),
      `the curd was ready at ${at(plan, "Chill it") + 91}, the pavlova put together at ${at(plan, "Pile on the cream and curd")}`);
  });
});

describe("steps that run during another's wait", () => {
  const at = (plan, text) => plan.steps.find((s) => s.text === text).at;
  const congee = (simmer, more = {}) => ({
    congee: recipe("Congee", [
      ["Simmer the congee", { hands: "1 min", wait: simmer, ...more }],
      ["Fry the pork", { hands: "5 min", during: true }],
      ["Glaze the pork", { hands: "2 min", during: true }],
      ["Ladle into bowls", { hands: "2 min" }],
    ]),
  });

  test("they start once the step before is under way, and the next step waits for both", () => {
    const plan = planLineup({ dishes: [{ slug: "congee" }] }, congee("25 min"));
    assert.equal(at(plan, "Fry the pork"), 1);
    assert.equal(at(plan, "Glaze the pork"), 6);
    assert.equal(at(plan, "Ladle into bowls"), 26);
    assert.equal(plan.minutes, 28);
  });

  test("when they take longer than the wait, the next step waits for them", () => {
    const plan = planLineup({ dishes: [{ slug: "congee" }] }, congee("5 min"));
    assert.equal(at(plan, "Ladle into bowls"), 8);
    assert.equal(plan.minutes, 10);
  });

  test("a wait that needs you there can't be overlapped", () => {
    const plan = planLineup({ dishes: [{ slug: "congee" }] }, congee("25 min", { watch: true }));
    assert.equal(at(plan, "Fry the pork"), 26);
  });

  test("a hot dish that overlaps its steps is still ready on time", () => {
    const recipes = { ...congee("25 min"), applesauce: recipe("Applesauce", [["Make the applesauce", { hands: "15 min" }]], { serve: "keeps" }) };
    recipes.congee.serve = "hot";
    recipes.congee.sits = "5 min";
    const plan = planLineup({ dishes: [{ slug: "congee" }, { slug: "applesauce" }] }, recipes);
    assert.ok(at(plan, "Ladle into bowls") + 2 >= plan.minutes - 5, `the congee was done at ${at(plan, "Ladle into bowls") + 2}, serving at ${plan.minutes}`);
    // The applesauce and the pork both fit inside the simmer.
    assert.equal(plan.minutes, 28);
  });
});

describe("food that's cooking isn't left waiting", () => {
  const at = (plan, text) => plan.steps.find((s) => s.text === text).at;

  test("a hot dish isn't cooked early only to wait for the oven partway through", () => {
    // The asparagus roasts while the potatoes bake, then needs the oven for the
    // broiler: it should finish roasting about when the potatoes come out, not
    // roast early and sit in the oven.
    const plan = planLineup({ dishes: [{ slug: "potatoes" }, { slug: "asparagus" }] }, {
      potatoes: recipe("Potatoes", [
        ["Heat the oven for the potatoes", { hands: "1 min", preheat: "200C" }],
        ["Bake the potatoes", { hands: "2 min", wait: "40 min", oven: "200C" }],
        ["Serve the potatoes", { hands: "1 min" }],
      ], { serve: "hot", sits: "10 min" }),
      asparagus: recipe("Asparagus", [
        ["Roast the asparagus", { hands: "1 min", wait: "10 min", oven: "200C" }],
        ["Pull the asparagus and switch to broil", { hands: "30 sec", preheat: "broil" }],
        ["Broil the parmesan", { hands: "30 sec", wait: "3 min", watch: true, oven: "broil" }],
      ], { serve: "hot", sits: "5 min" }),
    });
    const roasted = at(plan, "Roast the asparagus") + 1 + 10;
    assert.ok(at(plan, "Pull the asparagus and switch to broil") - roasted <= 5,
      `the asparagus finished roasting at ${roasted} and waited until ${at(plan, "Pull the asparagus and switch to broil")}`);
  });

  test("when something on the stove is about to be ready, nothing long starts in the way", () => {
    // The juice simmers 3 minutes, then the eggs are tempered with it at once.
    // Straining the syrup (4 minutes) mustn't start in between and leave the
    // juice boiling down.
    const plan = planLineup({ dishes: [{ slug: "curd" }, { slug: "syrup" }] }, {
      curd: recipe("Curd", [
        ["Simmer the juice", { hands: "30 sec", wait: "3 min", burner: true }],
        ["Temper the eggs with the hot juice", { hands: "2 min" }],
      ], { serve: "keeps" }),
      syrup: recipe("Syrup", [["Strain the syrup", { hands: "4 min" }]], { serve: "keeps" }),
    });
    const simmered = at(plan, "Simmer the juice") + 0.5 + 3;
    assert.ok(at(plan, "Temper the eggs with the hot juice") - simmered <= 0.5,
      `the juice was ready at ${simmered} but tempered at ${at(plan, "Temper the eggs with the hot juice")}`);
  });
});

describe("food on the heat with no timer", () => {
  test("a pot kept at a simmer until something happens comes off before other work", () => {
    const plan = planLineup({ dishes: [{ slug: "syrup" }, { slug: "curd" }], ahead: { curd: false } }, {
      syrup: recipe("Syrup", [
        ["Bring the berries to a simmer", { hands: "3 min", burner: true }],
        ["Keep it at a simmer until the sugar dissolves", { hands: "8 min", burner: true }],
        ["Strain the syrup", { hands: "3 min" }],
        ["Chill the syrup", { hands: "1 min", wait: "20 min" }],
      ], { serve: "keeps" }),
      curd: recipe("Curd", [
        ["Rub the zest into the sugar and leave it", { hands: "1 min", wait: "10 min" }],
        ["Simmer the juice", { hands: "30 sec", wait: "3 min", burner: true }],
        ["Temper the eggs with the hot juice", { hands: "2 min" }],
        ["Cook the curd, whisking", { hands: "0.5 min", wait: "6 min", watch: true, burner: true }],
        ["Chill the curd", { hands: "1 min", wait: "120 min" }],
      ], { serve: "keeps" }),
    });
    const at = (text) => plan.steps.find((s) => s.text === text).at;
    const off = at("Keep it at a simmer until the sugar dissolves") + 8;
    assert.equal(at("Strain the syrup"), off, `the syrup was done at ${off} but strained at ${at("Strain the syrup")}, after the juice went on at ${at("Simmer the juice")}`);
  });
});

describe("food in the oven with a step that takes it out", () => {
  test("it comes out when its timer ends, before other work", () => {
    const plan = planLineup({ dishes: [{ slug: "asparagus" }, { slug: "salad" }] }, {
      asparagus: recipe("Asparagus", [
        ["Roast the asparagus", { hands: "0.5 min", wait: "10 min", oven: "200C" }],
        ["Take the pan out of the oven", { hands: "0.5 min", oven: false }],
        ["Squeeze lemon over it", { hands: "1 min" }],
      ], { serve: "keeps" }),
      salad: recipe("Salad", [
        ["Wash the greens", { hands: "8 min" }],
        ["Dry the greens", { hands: "8 min" }],
        ["Chop the vegetables", { hands: "8 min" }],
        ["Slice the radishes", { hands: "8 min" }],
        ["Dress the salad", { hands: "1 min" }],
      ], { serve: "keeps" }),
    });
    const at = (text) => plan.steps.find((s) => s.text === text).at;
    const done = at("Roast the asparagus") + 10.5;
    assert.ok(at("Take the pan out of the oven") - done <= 0.5, `the asparagus was done at ${done} but came out at ${at("Take the pan out of the oven")}`);
  });
});

describe("two dishes with food on the heat", () => {
  test("one's next step doesn't run past the moment the other is ready", () => {
    const plan = planLineup({ dishes: [{ slug: "pork" }, { slug: "curd" }], ahead: { curd: false } }, {
      pork: recipe("Pork", [
        ["Blanch the pork", { hands: "2 min", wait: "1 min", burner: true }],
        ["Stir-fry the aromatics in the wok", { hands: "5 min", burner: true }],
        ["Simmer the pork", { hands: "30 sec", wait: "90 min", burner: true }],
      ], { serve: "hot", sits: "30 min" }),
      curd: recipe("Curd", [
        ["Simmer the juice", { hands: "30 sec", wait: "3 min", burner: true }],
        ["While it heats, whisk the eggs", { hands: "2 min", during: true }],
        ["Temper the eggs with the hot juice", { hands: "2 min" }],
        ["Chill the curd", { hands: "1 min", wait: "60 min" }],
      ], { serve: "keeps" }),
    });
    const at = (text) => plan.steps.find((s) => s.text === text).at;
    const ready = at("Simmer the juice") + 3.5;
    assert.ok(at("Temper the eggs with the hot juice") - ready <= 0.5, `the juice was ready at ${ready}, tempered at ${at("Temper the eggs with the hot juice")}`);
  });
});

describe("food on the heat, with a step done during its wait", () => {
  test("the step after both still comes as soon as the food is ready", () => {
    const plan = planLineup({ dishes: [{ slug: "curd" }, { slug: "syrup" }] }, {
      curd: recipe("Curd", [
        ["Simmer the juice", { hands: "30 sec", wait: "3 min", burner: true }],
        ["Whisk the eggs while it heats", { hands: "2 min", during: true }],
        ["Temper the eggs with the hot juice", { hands: "2 min" }],
      ], { serve: "keeps" }),
      syrup: recipe("Syrup", [["Strain the syrup", { hands: "3 min" }]], { serve: "keeps" }),
    });
    const at = (text) => plan.steps.find((s) => s.text === text).at;
    assert.ok(at("Temper the eggs with the hot juice") - (at("Simmer the juice") + 3.5) <= 0.5,
      `the juice was ready at ${at("Simmer the juice") + 3.5} but tempered at ${at("Temper the eggs with the hot juice")}`);
  });
});

describe("other equipment", () => {
  const at = (plan, text) => plan.steps.find((s) => s.text === text).at;

  test("the microwave runs one thing at a time", () => {
    const recipes = {
      applesauce: recipe("Applesauce", [["Microwave the apples", { hands: "1 min", wait: "8 min", microwave: true }]], { serve: "keeps" }),
      butter: recipe("Butter", [["Melt the butter", { hands: "1 min", wait: "1 min", microwave: true }]], { serve: "keeps" }),
    };
    const plan = planLineup({ dishes: [{ slug: "applesauce" }, { slug: "butter" }] }, recipes);
    assert.ok(at(plan, "Melt the butter") >= at(plan, "Microwave the apples") + 9, `the butter went in at ${at(plan, "Melt the butter")}, with the apples still in`);
  });

  test("there are four burners, so a fifth pot waits for one to come free", () => {
    const pots = ["Rice", "Beans", "Soup", "Sauce", "Stock"];
    const recipes = Object.fromEntries(pots.map((p) => [p.toLowerCase(), recipe(p, [[`Simmer the ${p.toLowerCase()}`, { hands: "1 min", wait: "20 min", burner: true }]], { serve: "keeps" })]));
    const plan = planLineup({ dishes: pots.map((p) => ({ slug: p.toLowerCase() })) }, recipes);
    const starts = pots.map((p) => at(plan, `Simmer the ${p.toLowerCase()}`)).sort((a, b) => a - b);
    assert.ok(starts[4] >= starts[0] + 21, `the fifth pot went on at ${starts[4]}, with four still simmering`);
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
