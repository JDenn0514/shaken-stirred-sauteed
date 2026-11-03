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
        ["Chill", { wait: "About 1 hr in the fridge" }],
        ["Set overnight", { wait: "1 1/2 to 2 1/2 hr" }],
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
