// The restructuring (tools/restructure/restructure.mjs): a recipe as written,
// with each step split so it has at most one wait and one place on the stove
// or in the oven. Tests check the steps that come out, as text and wait.
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { restructure } from "../../tools/restructure/restructure.mjs";

const stepsOf = (...steps) => restructure({ title: "T", category: "cooking", ingredients: [{ qty: "1", item: "rice" }], steps }, {}, "t")
  .recipe.steps.map((s) => [s.do, s.wait]);

describe("a step with two timed actions is split", () => {
  test("cooking until it's done, then resting off the heat", () => {
    assert.deepEqual(stepsOf("Bring the rice and water to a boil, then cover and simmer until tender. Let it rest off the heat, covered."), [
      ["Bring the rice and water to a boil, then cover and simmer until tender.", undefined],
      ["Let it rest off the heat, covered.", undefined],
    ]);
  });

  test("baking until it's done, then cooling", () => {
    assert.deepEqual(stepsOf("Bake until deep golden. Then let them cool on a rack, at least 15 minutes."), [
      ["Bake until deep golden.", undefined],
      ["Then let them cool on a rack, at least 15 minutes.", "At least 15 minutes"],
    ]);
  });

  test("not cooking with a cue, then a sentence about it", () => {
    assert.deepEqual(stepsOf("Stir until the sugar dissolves. Let it cool."), [["Stir until the sugar dissolves. Let it cool.", undefined]]);
  });
});

describe("a time for each side becomes a step per side", () => {
  for (const each of ["per side", "a side", "each side"]) {
    test(`"5 minutes ${each}"`, () => {
      assert.deepEqual(stepsOf(`Brown the chicken in a hot skillet over medium-high heat, 5 minutes ${each}.`), [
        ["Brown the chicken in a hot skillet over medium-high heat, 5 minutes on the first side.", "5 minutes"],
        ["Flip and cook the second side 5 minutes.", "5 minutes"],
      ]);
    });
  }
});
