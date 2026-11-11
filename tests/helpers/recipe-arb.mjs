// Random recipes that pass the recipe checker, for the laws in
// tests/e2e/recipe-laws.spec.mjs: every shape the README describes (plain and
// object entries, groups, waits and cues, "uses", prep-first steps, before you
// start), with text that needs escaping in HTML. Only the ones checkRecipe
// accepts come out.
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import fc from "fast-check";

const { checkRecipe } = createRequire(import.meta.url)("../../assets/recipe-checks.js");
const vocab = JSON.parse(readFileSync(new URL("../../recipes/vocabulary.json", import.meta.url), "utf8"));

// Text a person might type, including characters that need escaping in HTML.
const word = fc.constantFrom("Stir", "the", "rice", "lemon", "salt", "until", "golden", "café", "½", "it's", `"good"`, "<b>bold</b>", "&", "🍋");
const text = fc.array(word, { minLength: 1, maxLength: 5 }).map((ws) => ws.join(" "));
const time = fc.constantFrom("10 min", "45 sec", "1 1/2 hr", "7 to 8 min");

const ingredientArb = fc.oneof(
  text,
  fc.record({
    item: text,
    qty: fc.constantFrom("1 cup", "2", "1/2 tsp", "3 lb"),
    grams: fc.integer({ min: 1, max: 2000 }),
    ml: fc.integer({ min: 1, max: 500 }),
    note: text,
    optional: fc.boolean(),
  }, { requiredKeys: ["item"] }),
);
// A list of entries, some of them in named groups.
const listOf = (entry, max) => fc.array(
  fc.oneof({ weight: 3, arbitrary: entry }, { weight: 1, arbitrary: fc.record({ group: text, items: fc.array(entry, { minLength: 1, maxLength: 3 }) }) }),
  { minLength: 1, maxLength: max },
);
export const flat = (list = []) => list.flatMap((e) => (Array.isArray(e?.items) ? e.items : [e]));
export const nameOf = (i) => (typeof i === "string" ? i : i.item);

// Steps, given the recipe's ingredients so "uses" can name them.
const stepArb = (names) => fc.oneof(
  { weight: 1, arbitrary: text },
  { weight: 3, arbitrary: fc.record({
    do: text,
    wait: time,
    cue: text,
    hands: time,
    watch: fc.boolean(),
    prep: fc.constantFrom(true, "just before"),
    during: fc.constant(true),
    uses: fc.subarray(names).chain((picked) => fc.tuple(...picked.map((item) =>
      fc.oneof(fc.constant(item), fc.record({ item: fc.constant(item), amount: fc.constantFrom("half", "the rest", "100 g") }))))),
  }, { requiredKeys: ["do"] }) },
);

export const recipeArb = listOf(ingredientArb, 5).chain((ingredients) => fc.record({
  title: text,
  category: fc.constantFrom("cooking", "baking", "cocktails"),
  kind: fc.constantFrom("dish", "component"),
  description: text,
  yield: fc.constantFrom("Serves 4", "Makes 12"),
  time: fc.oneof(fc.record({ total: fc.integer({ min: 1, max: 600 }) }), fc.record({ prep: fc.integer({ min: 1, max: 60 }), cook: fc.integer({ min: 1, max: 300 }) })),
  beforeYouStart: fc.array(text, { minLength: 1, maxLength: 2 }),
  ingredients: fc.constant(ingredients),
  steps: listOf(stepArb(flat(ingredients).map(nameOf)), 8),
  notes: fc.array(text, { minLength: 1, maxLength: 2 }),
  source: fc.record({ name: text, url: fc.constant("https://example.com/recipe") }),
  tags: fc.constant({}),
}, { requiredKeys: ["title", "category", "ingredients", "steps", "tags"] }))
  .filter((r) => checkRecipe("law", r, vocab).errors.length === 0);
