// The editor's pickers in Details (assets/edit-pickers.mjs): tags filtered by
// what's typed, picked ones first, with a counter for the ones the README
// gives a range ("ingredients": 1–4 key ingredients); and the drawings by
// their plain names, "Picked for you" first.
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import fc from "fast-check";
import { tagChoices, pickedSays, TAG_RANGES, drawingName, drawingChoices } from "../../assets/edit-pickers.mjs";

const VOCAB = JSON.parse(readFileSync(new URL("../../recipes/vocabulary.json", import.meta.url), "utf8"));
const { KEYS } = createRequire(import.meta.url)("../../assets/recipe-icons.js");
const INGREDIENTS = VOCAB.dimensions.find((d) => d.key === "ingredients").groups.flatMap((g) => g.values);
const labels = (list) => list.map((c) => `${c.label}${c.picked ? " ✓" : ""}`);

describe("tagChoices", () => {
  const few = [{ key: "chicken", label: "Chicken" }, { key: "pork", label: "Pork" }, { key: "lemon", label: "Lemon" }, { key: "lime", label: "Lime" }];
  test("in the vocabulary's order, picked first", () =>
    assert.deepEqual(labels(tagChoices(few, ["lime", "pork"])), ["Pork ✓", "Lime ✓", "Chicken", "Lemon"]));
  test("what's typed narrows the rest, by any part of the name, ignoring capitals", () =>
    assert.deepEqual(labels(tagChoices(few, [], "LI")), ["Lime"]));
  test("picked ones stay, whatever's typed", () =>
    assert.deepEqual(labels(tagChoices(few, ["pork"], "lem")), ["Pork ✓", "Lemon"]));
  test("accents don't matter either way", () => {
    const accented = [{ key: "jalapeno", label: "Jalapeño" }, { key: "creme", label: "Crème fraîche" }];
    assert.deepEqual(labels(tagChoices(accented, [], "jalapeno")), ["Jalapeño"]);
    assert.deepEqual(labels(tagChoices(accented, [], "crème")), ["Crème fraîche"]);
  });
  test("spaces around what's typed are ignored, and nothing typed shows everything", () => {
    assert.deepEqual(labels(tagChoices(few, [], "  pork ")), ["Pork"]);
    assert.equal(tagChoices(few, [], "   ").length, 4);
  });
  test("a picked tag the vocabulary doesn't have is still shown, so it can be taken off", () =>
    assert.deepEqual(labels(tagChoices(few, ["dragonfruit"])), ["dragonfruit ✓", "Chicken", "Pork", "Lemon", "Lime"]));

  const seed = Number(process.env.PICKERS_SEED) || Date.now() % 2 ** 31;
  test(`laws (seed ${seed}): every picked one shows, nothing shows twice, and every one shown matches or is picked`, () =>
    fc.assert(fc.property(fc.subarray(INGREDIENTS.map((v) => v.key)), fc.string({ maxLength: 4 }), (picked, query) => {
      const shown = tagChoices(INGREDIENTS, picked, query);
      const keys = shown.map((c) => c.key);
      assert.equal(new Set(keys).size, keys.length);
      for (const p of picked) assert.ok(keys.includes(p));
      const firstUnpicked = shown.findIndex((c) => !c.picked);
      if (firstUnpicked >= 0) assert.ok(shown.slice(firstUnpicked).every((c) => !c.picked));
      const q = query.trim().toLowerCase();
      for (const c of shown) if (!c.picked) assert.ok(c.label.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().includes(q.normalize("NFD").replace(/[̀-ͯ]/g, "")));
    }), { seed, numRuns: 300 }));
});

describe("pickedSays", () => {
  test("the README's range for key ingredients", () => assert.deepEqual(TAG_RANGES.ingredients, [1, 4]));
  test("none, some, all and too many", () => {
    assert.equal(pickedSays(0, [1, 4]), "None picked yet: pick 1–4");
    assert.equal(pickedSays(2, [1, 4]), "2 of 1–4 picked");
    assert.equal(pickedSays(4, [1, 4]), "4 of 1–4 picked");
    assert.equal(pickedSays(5, [1, 4]), "5 picked: 1–4 is plenty");
  });
});

describe("drawings", () => {
  test("plain names", () => {
    assert.equal(drawingName("nick-nora"), "Nick & Nora");
    assert.equal(drawingName("tiki-mug"), "Tiki mug");
    assert.equal(drawingName("rice-bowl"), "Rice bowl");
    assert.equal(drawingName("coupe"), "Coupe");
  });
  test("every drawing has a name of its own", () => {
    const names = KEYS.map(drawingName);
    assert.equal(new Set(names).size, KEYS.length);
    assert.ok(names.every((n) => /^[A-Z]/.test(n) && !n.includes("-")));
  });
  test("Picked for you first, naming the one it picks, then every drawing", () => {
    const list = drawingChoices(KEYS, "coupe", "");
    assert.deepEqual(list[0], { key: "", name: "Picked for you: Coupe", icon: "coupe", picked: true });
    assert.deepEqual(list.slice(1).map((d) => d.key), KEYS);
    assert.equal(list.filter((d) => d.picked).length, 1);
  });
  test("a drawing chosen is the one picked", () => {
    const list = drawingChoices(KEYS, "coupe", "martini");
    assert.deepEqual(list.filter((d) => d.picked).map((d) => d.key), ["martini"]);
  });
  test("with nothing to pick for you, it says so", () => assert.equal(drawingChoices(KEYS, null, "")[0].name, "Picked for you: none"));
});
