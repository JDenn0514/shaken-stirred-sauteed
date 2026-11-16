// A step's "For the lineup" fold in the editor (assets/edit-fold.mjs): its
// summary line says what's set, so the fold can stay shut.
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { lineupSummary, lineupFold } from "../../assets/edit-fold.mjs";

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
  test("a step that doesn't wait, and one done during another's wait", () => {
    assert.equal(lineupSummary({ wait: false }, 0), "Doesn't wait");
    assert.equal(lineupSummary({ during: true, hands: "2 min" }, 0), "2 min hands-on · During an earlier wait");
  });
  test("a wait with a time says nothing: the step shows it", () => assert.equal(lineupSummary({ wait: "5 min" }, 0), "nothing set"));
});

// The fold's checkboxes, as [label, ticked], read from its HTML. Drawing uses
// the page's escaping (window.SSS.esc), so the test gives it a plain one.
globalThis.window ??= { SSS: { esc: (s) => String(s ?? "").replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`) } };
const boxes = (html) => [...html.matchAll(/<input type="checkbox"([^>]*)>\s*([^<]+)<\/label>/g)].map(([, attrs, label]) => [unescape(label.trim()), / checked/.test(attrs)]);
const unescape = (s) => s.replace(/&#(\d+);/g, (_, c) => String.fromCharCode(c)).replace(/&#x([\da-f]+);/gi, (_, c) => String.fromCharCode(parseInt(c, 16)))
  .replace(/&quot;/g, '"').replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&");
const fold = (steps, n, ctx = {}) => boxes(lineupFold({ ingredients: [], steps }, n, { named: `step ${n + 1}`, ...ctx }));
const has = (steps, n, label, ctx) => fold(steps, n, ctx).find(([l]) => l === label);

describe("lineupFold: waiting", () => {
  const NO_WAIT = "It doesn't wait";
  test("a step with no wait offers It doesn't wait, unticked", () => assert.deepEqual(has([{ do: "Stir." }], 0, NO_WAIT), [NO_WAIT, false]));
  test("a plain-text step offers it too", () => assert.deepEqual(has(["Stir."], 0, NO_WAIT), [NO_WAIT, false]));
  test("a step saved as not waiting has it ticked", () => assert.deepEqual(has([{ do: "Stir.", wait: false }], 0, NO_WAIT), [NO_WAIT, true]));
  test("a step with a wait time doesn't offer it", () => assert.equal(has([{ do: "Rest.", wait: "5 min" }], 0, NO_WAIT), undefined));
  test("Needs you there the whole wait is still only on a step with a wait time", () => {
    assert.equal(has([{ do: "Stir.", wait: false }], 0, "Needs you there the whole wait"), undefined);
    assert.deepEqual(has([{ do: "Rest.", wait: "5 min" }], 0, "Needs you there the whole wait"), ["Needs you there the whole wait", false]);
  });
});

describe("lineupFold: done during an earlier step's wait", () => {
  const DURING = "Done during an earlier step's wait";
  const GUESS = '<label class="import-guess"><input type="checkbox" data-act="r-during" checked> Done while an earlier step waits</label>';
  test("offered after a wait nobody watches", () => assert.deepEqual(has([{ do: "Rest.", wait: "30 min" }, "Chop."], 1, DURING), [DURING, false]));
  test("ticked on a step saved as during", () => assert.deepEqual(has([{ do: "Rest.", wait: "30 min" }, { do: "Chop.", during: true }], 1, DURING), [DURING, true]));
  test("not on the first step", () => assert.equal(has([{ do: "Rest.", wait: "30 min" }], 0, DURING), undefined));
  test("not after a watched wait", () => assert.equal(has([{ do: "Stir.", wait: "5 min", watch: true }, "Chop."], 1, DURING), undefined));
  test("still shown, ticked, where it no longer fits, so it can be taken off", () =>
    assert.deepEqual(has([{ do: "Stir.", wait: "5 min", watch: true }, { do: "Chop.", during: true }], 1, DURING), [DURING, true]));
  test("on an imported recipe, the intake's guess stands in for it, so it shows once", () => {
    const got = fold([{ do: "Rest.", wait: "30 min" }, "Chop."], 1, { duringGuess: GUESS });
    assert.equal(got.find(([l]) => l === DURING), undefined);
    assert.deepEqual(got.find(([l]) => l === "Done while an earlier step waits"), ["Done while an earlier step waits", true]);
  });
});
