// A step's "For the lineup" fold in the editor (assets/edit-fold.mjs): its
// summary line says what's set, so the fold can stay shut.
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { lineupSummary } from "../../assets/edit-fold.mjs";

describe("lineupSummary", () => {
  test("nothing set", () => assert.equal(lineupSummary({ do: "Stir." }, 0), "nothing set"));
  test("the oven at a temperature, and preheating", () =>
    assert.equal(lineupSummary({ oven: "200C", preheat: "220C" }, 0), "Oven 200C · Heats the oven to 220C"));
  test("the oven off, and broil", () => {
    assert.equal(lineupSummary({ oven: "off" }, 0), "Oven off");
    assert.equal(lineupSummary({ oven: "broil" }, 0), "Broil");
  });
  test("a step that doesn't use the oven says nothing about it", () => assert.equal(lineupSummary({ oven: false }, 0), "nothing set"));
  test("the other equipment, only when used", () =>
    assert.equal(lineupSummary({ burner: true, grill: false, microwave: true }, 0), "Burner · Microwave"));
  test("hands-on time, prep, needing you, keeping, and uses, in that order", () =>
    assert.equal(lineupSummary({ uses: ["Salt"], holds: true, watch: true, prep: true, hands: "5 min" }, 2),
      "5 min hands-on · Prep, ahead · Needs you · Keeps after this · uses 2"));
  test("prep just before", () => assert.equal(lineupSummary({ prep: "just before" }, 0), "Prep, just before"));
});
