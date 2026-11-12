// Step numbers as the editor's sheet shows them (assets/edit-numbers.mjs).
// The checker counts steps in the file's order; the sheet numbers them in the
// order it shows them, and as written hides an added prep step. The order is
// given as the recipe page's stepOrder gives it: [{ i }], i the step's place
// in the file.
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { numbering } from "../../assets/edit-numbers.mjs";

// Veg stir-fry: an added prep step first in the file.
const stirFry = () => ({
  title: "Veg Stir-Fry",
  steps: [
    { do: "Slice the peppers and mince the garlic.", prepOnly: true },
    { do: "Heat the wok until it smokes.", uses: ["Oil"] },
    { do: "Stir-fry the vegetables.", uses: ["Peppers"] },
  ],
});
const asWritten = [{ i: 1 }, { i: 2 }];
const prepFirst = [{ i: 0 }, { i: 1 }, { i: 2 }];

describe("say: step numbers in a message, as the sheet shows them", () => {
  test("renumbers a step to its place on the sheet", () =>
    assert.equal(numbering(stirFry(), asWritten).say("Step 3 needs a wait."), "Step 2 needs a wait."));
  test("leaves the numbers alone when the sheet shows the file's order", () =>
    assert.equal(numbering(stirFry(), prepFirst).say("Go to step 3"), "Go to step 3"));
  test("names a hidden added prep step by its first words", () =>
    assert.equal(numbering(stirFry(), asWritten).say("Go to step 1"), 'Go to the added prep step "Slice the peppers and mince the garlic."'));
  test("a message starting with a hidden step starts with a capital", () =>
    assert.equal(numbering(stirFry(), asWritten).say("Step 1 uses nothing."), 'The added prep step "Slice the peppers and mince the garlic." uses nothing.'));
  test("cuts a long step's words short", () => {
    const r = stirFry();
    r.steps[0].do = "Slice the red, yellow and green peppers thinly, then mince all the garlic.";
    assert.equal(numbering(r, asWritten).say("Go to step 1"), 'Go to the added prep step "Slice the red, yellow and green peppers thinly, t…"');
  });

  // Decision 16: a hidden step's field leads, not "…'s hands-on time".
  test("a hidden step's field comes first, then the step", () =>
    assert.equal(numbering(stirFry(), asWritten).say("Step 1's hands-on time needs to be a time, like 10 min."),
      'Hands-on time for the added prep step "Slice the peppers and mince the garlic." needs to be a time, like 10 min.'));
  test("…and stops at a comma", () =>
    assert.equal(numbering(stirFry(), asWritten).say("Step 1's oven setting, 450, isn't one the lineup knows."),
      'Oven setting for the added prep step "Slice the peppers and mince the garlic.", 450, isn\'t one the lineup knows.'));
  test("…and works for a field that can't be read", () =>
    assert.equal(numbering(stirFry(), asWritten).say("Step 1's ingredients can't be read."),
      'Ingredients for the added prep step "Slice the peppers and mince the garlic." can\'t be read.'));
  test("a shown step keeps its possessive", () =>
    assert.equal(numbering(stirFry(), asWritten).say("Step 2's hands-on time needs to be a time."), "Step 1's hands-on time needs to be a time."));
});

describe("namesHidden: whether a message names a step the sheet isn't showing", () => {
  test("yes, for the added prep step as written", () => assert.equal(numbering(stirFry(), asWritten).namesHidden("step 1: no wait"), true));
  test("no, in prep-first order", () => assert.equal(numbering(stirFry(), prepFirst).namesHidden("step 1: no wait"), false));
  test("no, for a shown step", () => assert.equal(numbering(stirFry(), asWritten).namesHidden("Steps 2 and 3"), false));
});

describe("shown: each step's number on the sheet, by its place in the file", () => {
  test("as written", () => assert.deepEqual([...numbering(stirFry(), asWritten).shown], [[1, 1], [2, 2]]));
});

describe("stepNames: steps by their file numbers (from 1), said as on the sheet", () => {
  test("one", () => assert.equal(numbering(stirFry(), asWritten).stepNames([3]), "step 2"));
  test("several, in the sheet's order", () => assert.equal(numbering(stirFry(), asWritten).stepNames([3, 2]), "steps 1 and 2"));
  test("three", () => assert.equal(numbering(stirFry(), prepFirst).stepNames([1, 2, 3]), "steps 1, 2 and 3"));
  test("a hidden one by its words, last", () =>
    assert.equal(numbering(stirFry(), asWritten).stepNames([1, 2]), 'step 1 and the added prep step "Slice the peppers and mince the garlic."'));
});

describe("stepsTouched: the steps whose uses differ between two versions", () => {
  test("none", () => assert.equal(numbering(stirFry(), asWritten).stepsTouched(stirFry(), stirFry()), null));
  test("the ones that changed", () => {
    const after = stirFry();
    after.steps[1].uses = ["Olive oil"];
    after.steps[2].uses = ["Bell peppers"];
    assert.equal(numbering(after, asWritten).stepsTouched(stirFry(), after), "steps 1 and 2");
  });
});

describe("usesNote: after a split, what to check", () => {
  test("names the parts, and where the ingredients stayed", () => {
    const after = stirFry();
    after.steps.splice(2, 0, { do: "Stir-fry half." });
    assert.equal(numbering(after, [{ i: 1 }, { i: 2 }, { i: 3 }]).usesNote(stirFry(), 1, 2),
      "Check what steps 1 and 2 use: the ingredients all stayed with step 1.");
  });
  test("nothing when the step used nothing", () => assert.equal(numbering(stirFry(), asWritten).usesNote(stirFry(), 0, 2), null));
});
