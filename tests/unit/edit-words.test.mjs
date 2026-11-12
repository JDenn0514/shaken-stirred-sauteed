// The editor's wording table (assets/edit-words.mjs): every message the recipe
// checker gives, in a cook's words, with where to go to fix it. Every message
// is made here by the real checker, from recipes that break each rule, so a
// check added or reworded in assets/recipe-checks.js fails a test here until
// the table says it too.
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { explain, RULES } from "../../assets/edit-words.mjs";

const require = createRequire(import.meta.url);
const { checkRecipe, checkLinks } = require("../../assets/recipe-checks.js");
const vocab = JSON.parse(readFileSync(new URL("../../recipes/vocabulary.json", import.meta.url)));

const base = () => ({
  title: "Soup", category: "cooking", ingredients: [{ qty: "1", item: "Onion" }], steps: [{ do: "Cook the onion." }],
  tags: { ingredients: ["garlic"] }, time: { total: 20 },
});
const withStep = (s) => ({ ...base(), steps: [s] });
const withSteps = (steps) => ({ ...base(), steps });
const withIng = (i) => ({ ...base(), ingredients: [i] });

// Recipes that break each rule (some break more than one).
const BROKEN = [
  withStep({ do: "Cook.", uses: "Onion" }),
  withStep({ do: "Cook.", uses: [{ amount: "1" }] }),
  withStep({ do: "Cook.", uses: [{ item: "Onion", amount: 5 }] }),
  withStep({ do: "Cook.", uses: ["Leek"] }),
  { ...base(), ingredients: [{ group: "A", items: [{ item: "Onion" }] }, { group: "B", items: [{ item: "Onion" }] }], steps: [{ do: "Cook.", uses: ["Onion"] }] },
  { ...base(), serve: "cold" },
  { ...base(), sits: "a bit" },
  withStep({ do: "Cook.", hands: "soon" }),
  withStep({ do: "Cook.", wait: "soon" }),
  withStep({ do: "Bake.", oven: "hot" }),
  withStep({ do: "Bake.", preheat: "off" }),
  withStep({ do: "Cook.", watch: true }),
  withSteps([{ do: "Cook." }, { do: "Stir.", during: true }]),
  withSteps([{ do: "Cook.", wait: "10 min", watch: true }, { do: "Stir.", during: true }]),
  withStep({ do: "Chop.", prep: "yes" }),
  withStep({ do: "Cook.", burner: "yes" }),
  withStep({ do: "Heat a pan." }),
  withSteps([{ do: "Cook.", holds: true }, { do: "Rest.", holds: true }]),
  withIng({ qty: "1", item: "Onion", optional: "yes" }),
  withIng({ qty: "1", item: "Onion", alreadyMade: "yes" }),
  withIng({ qty: "1", item: "Onion", alreadyMade: true }),
  withIng({ qty: "1", item: "Onion", alreadyMade: true, recipe: "onion-jam", optional: true }),
  withIng({ qty: "1", item: "Onion", recipe: ["onion-jam", "fried-onions"] }),
  withIng({ qty: "1", item: "Onion", recipe: "onion-jam" }),
  withIng({ qty: "1", item: "Onion", note: "optional" }),
  withIng({ qty: "4 Tbsp", item: "Onion" }),
  withIng({ qty: "1", item: "onion" }),
  withIng({ qty: "100 g", item: "Onion" }),
  withIng({ qty: "100 ml", item: "Onion" }),
  withIng({ qty: "~2", item: "Onion" }),
  withIng({ qty: "½", item: "Onion" }),
  withIng({ qty: "1", item: "Onion", note: "optional", optional: true }),
  withIng({ qty: "2", item: "Onions, chopped" }),
  { ...base(), title: "" },
  { ...base(), category: "brunch" },
  { ...base(), kind: "side" },
  { ...base(), ingredients: [] },
  { ...base(), steps: [] },
  withIng({ qty: "1", item: "" }),
  withStep({ do: "" }),
  { ...base(), time: { total: "20" } },
  { ...base(), source: { url: "example.com" } },
  { ...base(), image: "photo.jpg" },
  { ...base(), added: "May 3" },
  { ...base(), icon: "spaceship" },
  { ...base(), tags: [] },
  { ...base(), tags: { mood: ["happy"] } },
  { ...base(), tags: { time: ["under-30"] } },
  { ...base(), tags: { spirit: ["gin"] } },
  { ...base(), tags: { course: "soup" } },
  { ...base(), tags: { course: ["dessert-wine"] } },
  { ...base(), tags: {} },
  { ...base(), time: {} },
];
const recipeMessages = BROKEN.flatMap((r) => {
  const { errors, warnings } = checkRecipe("soup", r, vocab);
  return [...errors, ...warnings];
});
// The editor takes the file name off the link checker's messages.
const linkMessages = checkLinks([
  { slug: "soup", links: [{ item: "Onion jam", recipe: "onion-jam" }] },
  { slug: "loop-a", links: [{ item: "Loop B", recipe: "loop-b" }] },
  { slug: "loop-b", links: [{ item: "Loop A", recipe: "loop-a" }] },
]).map((e) => e.replace(/^recipes\/[^:]+\.json: /, ""));
const MESSAGES = [...new Set([...recipeMessages, checkRecipe("Soup Pot", base(), vocab).errors[0], ...linkMessages])];

describe("every checker message in a cook's words", () => {
  test("each message matches exactly one rule", () => {
    for (const m of MESSAGES) {
      const rules = RULES.filter((r) => r.match.test(m));
      assert.equal(rules.length, 1, `${rules.length} rules match: ${m}`);
    }
  });

  test("no message keeps the recipe file's field names", () => {
    const FIELDS = /"(do|item|uses|amount|qty|grams|ml|note|wait|hands|watch|during|prep|prepOnly|holds|preheat|oven|burner|grill|microwave|optional|alreadyMade|recipe|serve|sits|tags|kind|category|title|added|icon|image|time\.total|source\.url|group)"|\b(true|false)\b|vocabulary\.json/;
    for (const m of MESSAGES) {
      const { text } = explain(m);
      assert.doesNotMatch(text, FIELDS, `${m}\n→ ${text}`);
      assert.match(text, /^[A-Z"“]/, `starts like a sentence: ${text}`);
    }
  });

  test("a step keeps its number as \"step N\", for the editor to number as the sheet does", () => {
    for (const m of MESSAGES.filter((x) => /^step \d+/.test(x))) {
      const n = /^step (\d+)/.exec(m)[1];
      assert.match(explain(m).text, new RegExp(`\\b[Ss]tep ${n}\\b`), m);
    }
  });

  test("every rule is for a message the checker gives, and every message the checker can give has a rule", () => {
    for (const r of RULES) assert.ok(MESSAGES.some((m) => r.match.test(m)), `no message for the rule ${r.match}`);
    // One rule for each message the checker's source can give.
    const source = readFileSync(new URL("../../assets/recipe-checks.js", import.meta.url), "utf8");
    assert.equal(RULES.length, source.match(/\.push\(`/g).length);
  });

  test("a message the table doesn't know is left as it is", () => assert.equal(explain("Something new"), null));
});

describe("what a message says, and where its fix is", () => {
  test("a step's wait", () => assert.deepEqual(explain('step 2: "wait" must be a time, like "10 min", or false'),
    { text: "Step 2's wait needs to be a time, like 10 min. Leave it empty if the step doesn't wait.", go: { open: "step", n: 1, field: "edit-wait" } }));

  test("a step's hands-on time is fixed in the step, under For the lineup", () => assert.deepEqual(explain('step 3: "hands" must be a time, like "10 min"'),
    { text: "Step 3's hands-on time needs to be a time, like 10 min.", go: { open: "step", n: 2, field: "d-hands-2" } }));

  test("an ingredient's amount", () => assert.deepEqual(explain('"Butter": write "8 Tbsp" in lowercase, "8 tbsp"'),
    { text: 'Butter: write the amount in lowercase, "8 tbsp".', go: { open: "ing", name: "Butter", field: "edit-qty" } }));

  test("a step using an ingredient that isn't there", () => assert.deepEqual(explain('step 1 uses "Leek", which isn\'t one of the ingredients'),
    { text: "Step 1 uses Leek, which isn't in the ingredients. Add it, or untick it on the step.", go: { open: "step", n: 0, field: "d-use-drop-0-Leek", or: "d-use-0-*" } }));

  test("no key ingredients, and no total time, go to where they're set", () => {
    assert.deepEqual(explain("no key ingredients tagged").go, { field: "d-tag-ingredients-*", label: "Tag key ingredients" });
    assert.deepEqual(explain("no total time, so it can't be filtered by time").go, { open: "facts", field: "edit-time-total", label: "Add the total time" });
  });

  test("an empty ingredient goes to the first one without a name", () =>
    assert.deepEqual(explain('every ingredient needs text or an "item"').go, { empty: "ing" }));
});
