// The Facts form in the editor (assets/edit-facts.mjs): its word when Total
// is less than the parts it should add up to.
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { hintText } from "../../assets/edit-facts.mjs";

describe("hintText", () => {
  test("says so when Total is short", () =>
    assert.equal(hintText({ prep: 10, cook: 30, total: 20 }), "Total, 20 min, is less than prep, cook, chill and rest add up to, 40 min."));
  test("nothing when it adds up", () => assert.equal(hintText({ prep: 10, cook: 30, total: 40 }), ""));
  test("nothing with no Total", () => assert.equal(hintText({ prep: 10 }), ""));
  test("nothing with no times", () => assert.equal(hintText(undefined), ""));
});
