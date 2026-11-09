// The intake's review screen logic (tools/intake/review.mjs): what to ask the
// person, what to show for them to confirm, what to check, and the recipe that
// comes out once they've answered. What to ask and confirm comes from
// docs/specs/intake-lineup-needs.md.
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { draftFromText } from "../../tools/intake/intake.mjs";
import { startReview, reviewOf, answerWait, answerServe, joinBack, splitBack, setPlanning, setHolds, setLink, updateIngredient,
  updateStep, setField, addIngredient, removeIngredient, addStep, removeStep, recipeToSave, slugOf } from "../../tools/intake/review.mjs";

const flat = (l = []) => l.flatMap((e) => (e && Array.isArray(e.items) ? e.items : [e]));

// A draft as the intake gives it: a step that rises with no time but says one
// ("about an hour" isn't read as a wait), and a bake with no time at all.
const bread = () => ({
  title: "Plain Loaf",
  category: "baking",
  serve: "keeps",
  ingredients: [{ qty: "500 g", item: "flour" }, { qty: "7 g", item: "yeast" }],
  steps: [
    { do: "Mix the flour and yeast with water.", hands: "5 min" },
    { do: "Cover and leave it somewhere warm until doubled, about 1 hour.", hands: "1 min" },
    { do: "Bake until deep golden.", oven: "220C", hands: "1 min" },
  ],
});

describe("asking for a time on every step that waits", () => {
  test("each step the planner can't time is asked about, with the time from its text filled in", () => {
    const { asks } = reviewOf(startReview(bread(), []));
    const waits = asks.filter((a) => a.kind === "wait");
    assert.deepEqual(waits.map((a) => [a.text, a.value]), [
      ["Cover and leave it somewhere warm until doubled, about 1 hour.", "1 hour"],
      ["Bake until deep golden.", ""],
    ]);
    assert.ok(waits.every((a) => !a.answered));
  });

  test("answering gives the step its wait, and the question stays, answered", () => {
    let state = startReview(bread(), []);
    const bake = reviewOf(state).asks.find((a) => a.text === "Bake until deep golden.");
    state = answerWait(state, bake.id, "35 to 40 min");
    const after = reviewOf(state).asks.find((a) => a.id === bake.id);
    assert.equal(after.answered, true);
    assert.equal(after.value, "35 to 40 min");
    assert.equal(flat(state.recipe.steps)[2].wait, "35 to 40 min");
  });

  test("a step that doesn't really wait can be answered \"no wait\", saved as `wait: false` so the lineup doesn't ask again", () => {
    let state = startReview(bread(), []);
    const rise = reviewOf(state).asks.find((a) => a.kind === "wait");
    state = answerWait(state, rise.id, null);
    const after = reviewOf(state).asks.find((a) => a.id === rise.id);
    assert.equal(after.answered, true);
    assert.equal(after.value, "");
    assert.equal(flat(state.recipe.steps)[1].wait, false);
    assert.equal(flat(recipeToSave(state).steps)[1].wait, false);
  });

  test("editing a step answered \"no wait\", with its wait left empty, keeps the answer", () => {
    let state = startReview(bread(), []);
    const rise = reviewOf(state).asks.find((a) => a.kind === "wait");
    state = updateStep(answerWait(state, rise.id, null), rise.step, { do: "Cover it.", wait: "" });
    assert.equal(flat(state.recipe.steps)[1].wait, false);
  });

  test("a \"no wait\" answer can be changed to a time", () => {
    let state = startReview(bread(), []);
    const rise = reviewOf(state).asks.find((a) => a.kind === "wait");
    state = answerWait(answerWait(state, rise.id, null), rise.id, "1 hr");
    assert.equal(flat(state.recipe.steps)[1].wait, "1 hr");
  });

  test("a time the planner can't read isn't an answer", () => {
    let state = startReview(bread(), []);
    const bake = reviewOf(state).asks.find((a) => a.text === "Bake until deep golden.");
    state = answerWait(state, bake.id, "until golden");
    assert.equal(reviewOf(state).asks.find((a) => a.id === bake.id).answered, false);
    assert.equal(reviewOf(state).asks.find((a) => a.id === bake.id).problem, "Give a time the timer can read, like \"35 min\" or \"1 to 2 hr\"");
  });
});

// A cooking dish, as the intake reads it: its serving is a guess.
const steak = () => ({
  title: "Seared Steak",
  category: "cooking",
  serve: "hot", sits: "10 min",
  ingredients: [{ qty: "1", item: "ribeye" }],
  steps: [{ do: "Sear the steak 3 minutes a side.", wait: "6 min", watch: true, burner: true, hands: "1 min" }],
});

describe("asking how the dish is served", () => {
  test("a cooking dish is asked, with nothing chosen, and the reader's guess as a hint", () => {
    const serve = reviewOf(startReview(steak(), [])).asks.find((a) => a.kind === "serve");
    assert.deepEqual(serve, { kind: "serve", id: "serve", answered: false, guess: { serve: "hot", sits: "10 min" }, value: null });
  });

  test("answering sets how it's served and how long it can sit", () => {
    const state = answerServe(startReview(steak(), []), "hot", "5 min");
    assert.deepEqual(reviewOf(state).asks.find((a) => a.kind === "serve").value, { serve: "hot", sits: "5 min" });
    assert.equal(state.recipe.serve, "hot");
    assert.equal(state.recipe.sits, "5 min");
  });

  test("a dish that keeps has no sitting time", () => {
    const state = answerServe(startReview(steak(), []), "keeps", "10 min");
    assert.equal(state.recipe.serve, "keeps");
    assert.equal(state.recipe.sits, undefined);
    assert.equal(reviewOf(state).asks.find((a) => a.kind === "serve").answered, true);
  });

  test("a hot or soon dish needs a sitting time the planner can read", () => {
    const state = answerServe(startReview(steak(), []), "soon", "a while");
    assert.equal(reviewOf(state).asks.find((a) => a.kind === "serve").answered, false);
  });

  test("baking, cocktails and components aren't asked: their defaults are safe, so they're shown to confirm", () => {
    for (const r of [bread(), { ...steak(), kind: "component", serve: "keeps", sits: undefined }, { ...steak(), category: "cocktails", serve: "soon", sits: "5 min" }]) {
      const review = reviewOf(startReview(r, []));
      assert.equal(review.asks.find((a) => a.kind === "serve"), undefined, r.title);
      assert.deepEqual(review.confirms.find((c) => c.kind === "serve")?.value, { serve: r.serve, sits: r.sits });
    }
  });
});

describe("a step with two waits, one without a time", () => {
  // The intake flags "Bake until deep golden." (kind "time"); the planner can't
  // see it, since the step already waits (for cooling).
  const knots = () => ({
    title: "Knots", category: "baking", serve: "keeps",
    ingredients: [{ qty: "1", item: "dough" }],
    steps: [{ do: "Sprinkle with pearl sugar. Bake until deep golden. Then let them cool on a rack, at least 15 minutes.", wait: "At least 15 minutes", hands: "5 min" }],
  });
  const flags = [{ kind: "time", text: "Bake until deep golden.", why: "no time given" }];

  test("is asked about once, naming the part with no time", () => {
    const asks = reviewOf(startReview(knots(), flags)).asks.filter((a) => a.kind === "wait");
    assert.deepEqual(asks.map((a) => [a.text, a.value]), [["Bake until deep golden.", ""]]);
  });

  test("is asked about from the planner too, without the intake's flag, and answering splits the step", () => {
    let state = startReview(knots(), []);
    const asks = reviewOf(state).asks.filter((a) => a.kind === "wait");
    assert.deepEqual(asks.map((a) => a.text), ["Bake until deep golden."]);
    state = answerWait(state, asks[0].id, "25 min");
    assert.deepEqual(flat(state.recipe.steps).map((s) => [s.do, s.wait]), [
      ["Sprinkle with pearl sugar. Bake until deep golden.", "25 min"],
      ["Then let them cool on a rack, at least 15 minutes.", "At least 15 minutes"],
    ]);
  });

  test("answering splits the step there, each part with its own wait", () => {
    let state = startReview(knots(), flags);
    const ask = reviewOf(state).asks.find((a) => a.kind === "wait");
    state = answerWait(state, ask.id, "25 min");
    assert.deepEqual(flat(state.recipe.steps).map((s) => [s.do, s.wait]), [
      ["Sprinkle with pearl sugar. Bake until deep golden.", "25 min"],
      ["Then let them cool on a rack, at least 15 minutes.", "At least 15 minutes"],
    ]);
    assert.equal(reviewOf(state).asks.find((a) => a.id === ask.id).answered, true);
  });
});

describe("steps the reader split or joined", () => {
  const milk = () => ({
    title: "Rolls", category: "baking", serve: "keeps",
    ingredients: [{ qty: "1 cup", item: "milk" }],
    steps: [
      { do: "Warm the milk on the stove.", burner: true, hands: "1 min", review: "split" },
      { do: "Pour it into a bowl and add the yeast; let it sit until foamy, 5 to 10 minutes.", wait: "5 to 10 minutes", hands: "3 min", review: "split" },
      { do: "Shake it. No shaker? Stir it hard.", hands: "1 min", review: "joined" },
    ],
  });
  const flags = [
    { kind: "split", text: "Warm the milk on the stove. Pour it into a bowl and add the yeast; let it sit until foamy, 5 to 10 minutes.",
      parts: ["Warm the milk on the stove.", "Pour it into a bowl and add the yeast; let it sit until foamy, 5 to 10 minutes."], why: "split" },
    { kind: "joined", text: "Shake it. No shaker? Stir it hard.", parts: ["Shake it.", "No shaker? Stir it hard."], why: "joined" },
  ];

  test("each is shown to confirm, with the steps it made and the text as written", () => {
    const { confirms } = reviewOf(startReview(milk(), flags));
    assert.deepEqual(confirms.filter((c) => c.kind === "split" || c.kind === "joined").map((c) => [c.kind, c.steps, c.parts.length]),
      [["split", ["s1", "s2"], 2], ["joined", ["s3"], 2]]);
  });

  test("joining back makes one step of the written text, keeping its wait and stove", () => {
    let state = startReview(milk(), flags);
    state = joinBack(state, reviewOf(state).confirms.find((c) => c.kind === "split").id);
    const steps = flat(state.recipe.steps);
    assert.equal(steps.length, 2);
    assert.equal(steps[0].do, flags[0].text);
    assert.equal(steps[0].wait, "5 to 10 minutes");
    assert.equal(steps[0].burner, true);
    assert.equal(reviewOf(state).confirms.find((c) => c.kind === "split"), undefined);
  });

  test("splitting back out makes a step of each part as written", () => {
    let state = startReview(milk(), flags);
    state = splitBack(state, reviewOf(state).confirms.find((c) => c.kind === "joined").id);
    assert.deepEqual(flat(state.recipe.steps).slice(2).map((s) => s.do), ["Shake it.", "No shaker? Stir it hard."]);
    assert.equal(reviewOf(state).confirms.find((c) => c.kind === "joined"), undefined);
  });
});

describe("the planning guesses, to confirm", () => {
  const pavlova = () => ({
    title: "Pavlova", category: "baking", serve: "keeps",
    ingredients: [
      { qty: "4", item: "egg whites" },
      { qty: "1 cup", item: "lemon curd", recipe: "lemon-curd", optional: true },
      { qty: "1 tsp", item: "garlic paste", recipe: "garlic-paste" },
    ],
    steps: [
      { do: "Separate the eggs.", prep: true, hands: "3 min" },
      { do: "Whip the whites to stiff peaks, 5 minutes.", wait: "5 min", watch: true, hands: "1 min" },
      { do: "Bake 90 minutes, then cool in the oven.", wait: "90 min", oven: "120C", holds: true, hands: "1 min" },
      { do: "Meanwhile, make the curd.", during: true, hands: "10 min" },
    ],
  });
  const kinds = (review, kind) => review.confirms.filter((c) => c.kind === kind);

  test("each guess is shown on its step", () => {
    const review = reviewOf(startReview(pavlova(), []));
    assert.deepEqual(kinds(review, "watch").map((c) => [c.step, c.value]), [["s2", true], ["s3", false]]);
    assert.deepEqual(kinds(review, "prep").map((c) => [c.step, c.value]), [["s1", true]]);
    assert.deepEqual(kinds(review, "during").map((c) => [c.step, c.value]), [["s4", true]]);
    assert.deepEqual(kinds(review, "holds").map((c) => c.value), ["s3"]);
  });

  test("changing one changes the recipe, and it stays shown", () => {
    let state = startReview(pavlova(), []);
    state = setPlanning(state, "s1", "prep", "just before");
    state = setPlanning(state, "s2", "watch", false);
    state = setPlanning(state, "s4", "during", false);
    const steps = flat(state.recipe.steps);
    assert.equal(steps[0].prep, "just before");
    assert.equal(steps[1].watch, undefined);
    assert.equal(steps[3].during, undefined);
    state = setPlanning(state, "s1", "prep", false);
    assert.equal(flat(state.recipe.steps)[0].prep, undefined);
    assert.deepEqual(kinds(reviewOf(state), "prep").map((c) => [c.step, c.value]), [["s1", false]]);
  });

  test("the make-ahead point is one step, or none", () => {
    let state = setHolds(startReview(pavlova(), []), "s2");
    assert.deepEqual(flat(state.recipe.steps).map((s) => !!s.holds), [false, true, false, false]);
    state = setHolds(state, null);
    assert.ok(flat(state.recipe.steps).every((s) => !s.holds));
    assert.deepEqual(kinds(reviewOf(state), "holds").map((c) => c.value), [null]);
  });

  test("linked recipes are shown, and a required one asks whether it's usually already made", () => {
    let state = startReview(pavlova(), []);
    assert.deepEqual(kinds(reviewOf(state), "link").map((c) => [c.ingredient, c.recipe, c.required, c.alreadyMade]),
      [["i2", "lemon-curd", false, false], ["i3", "garlic-paste", true, false]]);
    state = setLink(state, "i3", { alreadyMade: true });
    assert.equal(flat(state.recipe.ingredients)[2].alreadyMade, true);
    state = setLink(state, "i3", { recipe: null });
    assert.equal(flat(state.recipe.ingredients)[2].recipe, undefined);
    assert.equal(flat(state.recipe.ingredients)[2].alreadyMade, undefined);
  });
});

describe("things to check", () => {
  const draft = () => ({
    title: "Curd", category: "baking", serve: "keeps",
    ingredients: [{ qty: "½ cup", item: "sugar" }, { item: "Fresh berries" }],
    steps: [{ do: "Cook the curd, saving the whites for meringue.", wait: "10 min", hands: "10 min" }],
  });
  const flags = [
    { kind: "amount", text: "½ cup sugar", why: "check every amount" },
    { kind: "no-amount", text: "Fresh berries", why: "no amount" },
    { kind: "storage", text: "Cook the curd, saving the whites for meringue.", why: "say how to keep it" },
    { kind: "total-time", text: "20 min", why: "the steps add up to more" },
    { kind: "planning", text: "step 1: wait read from the text", why: "check it" },
  ];

  test("each flag is a check, on the ingredient or step it's about where there is one", () => {
    const { checks } = reviewOf(startReview(draft(), flags));
    assert.deepEqual(checks.map((c) => [c.kind, c.ingredient || c.step || null]), [
      ["amounts", null], ["no-amount", "i2"], ["storage", "s1"], ["total-time", null], ["planning", null],
    ]);
  });

  test("giving an ingredient an amount clears its \"no amount\" check", () => {
    const state = updateIngredient(startReview(draft(), flags), "i2", { qty: "2 cups" });
    assert.equal(reviewOf(state).checks.find((c) => c.kind === "no-amount"), undefined);
  });
});

describe("editing the draft", () => {
  test("a step's text and wait can be changed, and a new wait-less bake is then asked about", () => {
    let state = startReview(steak(), []);
    state = updateStep(state, "s1", { do: "Sear the steak 3 minutes a side, then roast until done." });
    assert.equal(flat(state.recipe.steps)[0].do, "Sear the steak 3 minutes a side, then roast until done.");
    state = addStep(state);
    const added = flat(state.recipe.steps).at(-1).reviewId;
    state = updateStep(state, added, { do: "Bake until bubbling." });
    assert.ok(reviewOf(state).asks.some((a) => a.kind === "wait" && a.step === added));
    state = removeStep(state, added);
    assert.equal(flat(state.recipe.steps).length, 1);
    assert.ok(!reviewOf(state).asks.some((a) => a.kind === "wait" && a.step === added));
  });

  test("ingredients can be added and removed, and the title and yield changed", () => {
    let state = addIngredient(startReview(steak(), []));
    const id = flat(state.recipe.ingredients).at(-1).reviewId;
    state = updateIngredient(state, id, { qty: "1 tsp", item: "salt" });
    assert.deepEqual(flat(state.recipe.ingredients).map((i) => i.item), ["ribeye", "salt"]);
    state = removeIngredient(state, "i1");
    assert.deepEqual(flat(state.recipe.ingredients).map((i) => i.item), ["salt"]);
    state = setField(setField(state, "title", "  Steak for Two "), "yield", "Serves 2");
    assert.equal(state.recipe.title, "Steak for Two");
    assert.equal(state.recipe.yield, "Serves 2");
  });
});

describe("the recipe that comes out", () => {
  test("isn't ready until every question is answered, and says what's left", () => {
    let state = startReview(bread(), []);
    assert.equal(reviewOf(state).ready, false);
    assert.deepEqual(reviewOf(state).missing, ["2 questions to answer"]);
    for (const a of reviewOf(state).asks) state = answerWait(state, a.id, "1 hr");
    assert.equal(reviewOf(state).ready, true);
    state = setField(state, "title", "");
    assert.deepEqual(reviewOf(state).missing, ["a title"]);
  });

  test("is the recipe without the review's marks, dated today, with a file name from its title", () => {
    const draft = { ...bread(), steps: [{ do: "Bake.", wait: "40 min", oven: "220C", review: "split", hands: "1 min" }], equipment: ["Loaf pan"] };
    const out = recipeToSave(startReview(draft, []), { today: "2026-11-05" });
    assert.deepEqual(out.steps, [{ do: "Bake.", wait: "40 min", oven: "220C", hands: "1 min" }]);
    assert.deepEqual(out.ingredients, [{ qty: "500 g", item: "flour" }, { qty: "7 g", item: "yeast" }]);
    assert.equal(out.added, "2026-11-05");
    assert.deepEqual(out.equipment, ["Loaf pan"]);
    assert.equal(slugOf("Brown-Butter Cookies (Chewy!)"), "brown-butter-cookies-chewy");
    assert.equal(slugOf("Crème Brûlée"), "creme-brulee");
  });

  test("passes the site's recipe checker", async () => {
    const { buildIndex } = await import("../helpers/build-index.mjs");
    let state = startReview(steak(), []);
    state = answerServe(state, "hot", "5 min");
    const out = recipeToSave(state, { today: "2026-11-05" });
    const built = buildIndex({ "seared-steak": { ...out, tags: { ingredients: ["beef"] } } });
    assert.ok(built.ok, built.output);
  });
});

describe("from pasted text", () => {
  const text = `Lemon Rice
Serves 4
INGREDIENTS
1 cup long-grain rice
2 cups water
1 lemon
METHOD
1. Rinse the rice. Bring the rice and water to a boil, then cover and simmer until tender. Let it rest off the heat, covered.
2. Stir in the lemon zest and juice and serve right away.`;

  test("the draft's open questions are asked: the waits it couldn't time, and how it's served", () => {
    const { recipe, flags } = draftFromText([text], { category: "cooking" });
    const review = reviewOf(startReview(recipe, flags));
    assert.ok(review.asks.some((a) => a.kind === "serve"), JSON.stringify(review.asks));
    assert.ok(review.asks.some((a) => a.kind === "wait" && /rest/i.test(a.text)), JSON.stringify(review.asks));
    assert.equal(review.ready, false);
  });
});
