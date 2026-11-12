// Undo and Redo in the editor (assets/edit-history.mjs). Each change that
// lands is a step back; what's typed between changes becomes one step when
// it's committed, or when Undo is pressed. The state is { recipe, review }.
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { createHistory, changedLine } from "../../assets/edit-history.mjs";

const at = (title, review = null) => ({ recipe: { title, steps: [] }, review });

describe("Undo and Redo", () => {
  test("nothing to undo or redo at the start", () => {
    const h = createHistory();
    h.reset(at("A"));
    assert.equal(h.canUndo(at("A")), false);
    assert.equal(h.canRedo(), false);
    assert.equal(h.undo(at("A")), null);
  });

  test("undo goes back a change, redo comes forward again", () => {
    const h = createHistory();
    h.reset(at("A"));
    h.commit(at("B"));
    h.commit(at("C"));
    assert.deepEqual(h.undo(at("C")), at("B"));
    assert.deepEqual(h.undo(at("B")), at("A"));
    assert.equal(h.canUndo(at("A")), false);
    assert.deepEqual(h.redo(at("A")), at("B"));
    assert.deepEqual(h.redo(at("B")), at("C"));
    assert.equal(h.canRedo(), false);
  });

  test("a commit with nothing changed isn't a step", () => {
    const h = createHistory();
    h.reset(at("A"));
    h.commit(at("A"));
    assert.equal(h.canUndo(at("A")), false);
  });

  test("what's typed since the last step can be undone, as one step", () => {
    const h = createHistory();
    h.reset(at("A"));
    assert.equal(h.typedSince(at("Ab")), true);
    assert.equal(h.canUndo(at("Ab")), true);
    assert.deepEqual(h.undo(at("Ab")), at("A"));
    assert.deepEqual(h.redo(at("A")), at("Ab"));
  });

  test("a new change after an undo drops what could be redone", () => {
    const h = createHistory();
    h.reset(at("A"));
    h.commit(at("B"));
    h.undo(at("B"));
    h.commit(at("X"));
    assert.equal(h.canRedo(), false);
  });

  test("keeps the last 50", () => {
    const h = createHistory();
    h.reset(at("0"));
    for (let k = 1; k <= 60; k++) h.commit(at(String(k)));
    let now = at("60"), n = 0;
    for (let back; (back = h.undo(now)); n++) now = back;
    assert.equal(n, 50);
    assert.deepEqual(now, at("10"));
  });

  test("a new recipe's review is part of each step", () => {
    const h = createHistory();
    h.reset(at("A", { checked: [] }));
    h.commit(at("A", { checked: ["1 cup flour"] }));
    assert.deepEqual(h.undo(at("A", { checked: ["1 cup flour"] })), at("A", { checked: [] }));
  });

  test("steps are copies: changing what was committed later doesn't change them", () => {
    const h = createHistory();
    const a = at("A");
    h.reset(a);
    h.commit(at("B"));
    a.recipe.title = "changed";
    assert.equal(h.undo(at("B")).recipe.title, "A");
  });

  test("reset forgets every step", () => {
    const h = createHistory();
    h.reset(at("A"));
    h.commit(at("B"));
    h.reset(at("B"));
    assert.equal(h.canUndo(at("B")), false);
    assert.equal(h.canRedo(), false);
  });
});

describe("changedLine: what to focus after Undo", () => {
  const r = () => ({ title: "Soup", ingredients: ["Salt", "Pepper"], steps: [{ group: "Soup", items: ["Boil.", "Stir."] }], notes: [] });
  test("the title", () => assert.equal(changedLine(r(), { ...r(), yield: "Serves 4" }), "part-title"));
  test("the first line that differs, counted across groups", () => {
    const b = r();
    b.steps[0].items[1] = "Stir well.";
    assert.equal(changedLine(r(), b), "part-step-1");
  });
  test("a removed last line focuses the line before it", () => assert.equal(changedLine(r(), { ...r(), ingredients: ["Salt"] }), "part-ing-0"));
  test("a list left empty focuses its Add button", () => assert.equal(changedLine(r(), { ...r(), ingredients: [] }), "add-ingredients"));
  test("anything else focuses Undo", () => assert.equal(changedLine(r(), { ...r(), tags: { diet: ["vegan"] } }), "undo"));
});
